# RETURN

## What this is
Private, long-lived tool for one traveller: an inventory of belongings plus QR/NFC tags that let a finder
contact the owner and agree a return without accounts or apps. Most important quality: **a stranger can
reach the owner quickly, and nobody can see private data** (inventory, other conversations, documents).

## Stack
TypeScript · Hono 4 on Cloudflare Workers (one Worker) · Workers Static Assets (React 19 + Vite 8 SPA,
Tailwind 4) · D1 (SQLite) · R2 (private files) · Cloudflare Access (panel auth) · Turnstile · Workers
Rate Limiting binding · `send_email` binding · zod 4 · Vitest 4 + `@cloudflare/vitest-plugin` · Playwright.
Node 24 via fnm, pnpm. Versions pinned in `package.json`; decisions in `docs/decisions.md`.

## Commands
| Task | Command |
|---|---|
| Install | `pnpm install` |
| Dev server (worker + SPA, local D1/R2) | `pnpm db:migrate:local && pnpm dev` |
| Lint / format | `pnpm lint` / `pnpm format` |
| Typecheck | `pnpm typecheck` |
| Test (all / one) | `pnpm test` / `pnpm vitest run test/items.test.ts` |
| E2E | `pnpm test:e2e` |
| Build / deploy | `pnpm build` / `pnpm run release` (needs approval; `pnpm deploy` is a different pnpm built-in) |
| Regenerate binding types | `pnpm cf-typegen` after editing `wrangler.example.jsonc` (the template) |

## Architecture
- `src/worker/index.ts` — host routing: `PUBLIC_HOST` serves finder pages (`/t/:token`, `/c/:token`),
  `APP_HOST` serves the SPA and `/api`. Locally both share one origin (paths never overlap).
- `src/worker/api/*` — owner API. Auth middleware in `api/index.ts` verifies the Access JWT (`auth/access.ts`).
- `src/worker/public/*` — server-rendered finder pages (Hono JSX, no React bundle), i18n EN/DE/ES.
- `src/worker/db/*` — SQL + row mappers. Every query filters by `owner_id`.
- `src/worker/services/*` — notifications (secondary, never throw; email in `notify.ts`, Web Push in `services/push/*`),
  maintenance cron (retention, backups).
- `src/shared/*` — zod contracts (`schemas.ts`, `settings.ts`), QR, maps links, card layouts. Used by worker and SPA.
- `src/sw/*` + `vite/sw-plugin.ts` — owner-panel service worker, emitted as `/sw.js` at build (`SW_KILL=1` emits the
  kill switch). Routing rules are the pure `src/shared/sw-routing.ts`. `src/app/*` — owner panel SPA. `public/p/*` — static assets for finder pages (skip the Worker).
- `migrations/` — D1 migrations. Never edit an applied migration; add `NNNN_*.sql`.

## Conventions
- Validate every request body/query with zod at the boundary (`parseJson`/`parseWith` in `lib/http.ts`).
- Owned resources that do not exist *or belong to someone else* return **404**, never 403.
- Throw `AppError(status, code, message)`; API errors are `{ error: { code, message, details? } }`.
- Ids: `newId()` (UUID). Tag tokens: `newTagToken()` (128-bit, base32). Finder access tokens: `newSecretToken()`,
  store only `sha256Hex(token)`.
- State-changing requests require a same-origin `Origin` header (CSRF). Tests must send it (helpers do).
- Branch policy: `trunk` · Conventional Commits (enforced by hook).
- Specs `docs/specs/`, decisions `docs/decisions.md` + `docs/adr/`, operations `docs/operations.md`.

## Gotchas
- Vitest must stay on 4.x: `@cloudflare/vitest-plugin` 1.4 breaks on Vitest 5.
- `wrangler types --strict-vars=false` (via `pnpm cf-typegen`), otherwise empty vars type as `""`.
- `.dev.vars` (git-ignored) sets `ENVIRONMENT=development` + `DEV_OWNER_EMAIL`; the dev auth bypass only
  works on loopback hosts. Copy `.dev.vars.example`.
- Asset responses have immutable headers: copy them (`new Response(res.body, res)`) before adding headers.
- Public pages use a strict CSP (`style-src 'self'`): no inline `style=` attributes or inline scripts there.
- E2E runs on a fresh local database in `.wrangler/e2e` (wiped each run via `LOCAL_STATE_DIR`, read by
  `vite.config.ts`); `pnpm dev` keeps using `.wrangler/state`. The Nominatim stub has no reverse result in the
  open South Atlantic, mirroring the real service.
- `wrangler.jsonc` is git-ignored (real hosts, IDs, emails); `wrangler.example.jsonc` is the committed template.
  Vitest, E2E (`WRANGLER_CONFIG`) and typegen use the template; `pnpm dev` and releases use the real file. Add new
  bindings/vars to both.
- Tests use the `worker` export from `test/helpers/auth.ts` (the generated `Exports` type lacks `default`).

- The service worker exists only in production builds: `vite dev` never registers one. Test it with the `pwa`
  Playwright project (`pnpm exec playwright test --project=pwa`: builds, then serves with `vite preview` on :5198).
- Anything a service worker may store must pass `isStorable()` in `src/shared/sw-routing.ts`; never add `/api/` or
  `/cdn-cgi/` paths there. Any change to the panel changes `sw.js` (build id), which is how updates roll out.
- Regenerate PWA icons with `pnpm icons:pwa` (needs Playwright's Chromium); the manifest is `public/manifest.webmanifest`.

## Definition of Done
- Acceptance criteria met and demonstrated (test, screenshot or command output).
- `pnpm lint && pnpm typecheck && pnpm test` green; no placeholders, no skipped tests.
- Docs touched when behaviour or setup changed (README, decisions, operations, CLAUDE.md).
