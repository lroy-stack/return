# RETURN — build plan (single source of truth for progress)

Phases follow the brief (A–I). Each task lists owner and verify step. Tick boxes as work lands.

## A · Reconnaissance
- [x] Repo inspected (empty), tooling detected (Node 24 via fnm, pnpm 12, no global wrangler, not logged in)
- [x] Cloudflare / Hostinger / QR-NFC-GDPR research → `docs/decisions.md`

## B · Infrastructure connections (read-only first)
- [x] Cloudflare official plugin + MCP (OAuth, custom permissions on the single account)
- [x] Hostinger MCP (hosted OAuth)
- [x] Read-only inventory (no conflicts with apuntao/numae/skapara resources)
- [x] `lr0y.dev` DNS moved to Cloudflare, verified (`docs/infra/lr0y.dev-before-migration.md`)

## C · Foundations
- [x] Scaffold, configs, gates (lint · typecheck · test) — verify: `pnpm lint && pnpm typecheck && pnpm test`
- [x] D1 schema `migrations/0001_initial.sql`
- [x] Access JWT auth + CSRF origin check + host routing (tests: `test/auth.test.ts`, `test/routing.test.ts`)
- [x] Inventory API (tests: `test/items.test.ts`)

## D–G · Modules (parallel, disjoint file ownership)
| Track | Owner agent | Owns | Verify |
|---|---|---|---|
| Owner API: files, tags, trackers, recoveries, contacts, settings, overview, activity, export/import, system, maintenance cron | implementer | `src/worker/api/{files,tags,trackers,recoveries,contacts,settings,overview,activity,data,system}.ts`, `src/worker/db/*` except `conversations.ts`, `src/worker/services/maintenance.ts`, matching tests | `pnpm vitest run test/<area>.test.ts` |
| Finder surface + conversations (both sides), Turnstile, rate limits, i18n EN/DE/ES, degraded mode | implementer | `src/worker/public/**`, `src/worker/domain/**`, `src/worker/db/conversations.ts`, `src/worker/api/conversations.ts`, `src/worker/services/turnstile.ts`, `src/worker/lib/ratelimit.ts`, `public/p/**`, matching tests | `pnpm vitest run test/public*.test.ts test/conversations*.test.ts` |
| Owner panel SPA | frontend-engineer | `index.html`, `src/app/**` except `src/app/pages/print/**` | `pnpm typecheck && pnpm build` + browser check |
| Cards (QR/NFC print files) + print studio page | design-engineer | `src/shared/card/**`, `src/app/pages/print/**`, `test/card*.test.ts` | `pnpm vitest run test/card*.test.ts` |

Shared contracts (`src/shared/schemas.ts`, `settings.ts`, `maps.ts`, `qr.ts`, `brand.ts`) and core (`src/worker/index.ts`,
`api/index.ts`, `auth/*`, `lib/{http,ids,time,urls}.ts`, `services/notify.ts`, `migrations/0001`) belong to the lead;
agents request changes instead of editing them.

## H · Deployment (needs authorization)
- [x] D1 `return-db` (EU jurisdiction) and R2 `return-files` (EU) created; migration 0001 applied remotely
- [x] Zone lr0y.dev active; Custom Domains `return.lr0y.dev` + `app.return.lr0y.dev`; Access app "RETURN panel" (owner only, OTP); Turnstile widget
- [ ] Email Sending onboarding of `return.lr0y.dev` (dashboard)
- [x] Secrets `TURNSTILE_SECRET_KEY`, `IP_HMAC_SECRET` set (never printed); vars in `wrangler.jsonc`
- [x] Deployed version 3e102cb8; public host verified (routes, 404s, headers, no /api)
- [ ] Panel host verified behind Access (certificate pending) · finder flow on a real phone

## I · Final audit
- [ ] E2E (Playwright, mobile + desktop), security review, accessibility pass, backup/restore drill
