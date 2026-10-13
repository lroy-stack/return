# RETURN — build plan (single source of truth for progress)

Phases follow the brief (A–I). Each task lists owner and verify step. Tick boxes as work lands.

## A · Reconnaissance
- [x] Repo inspected (empty), tooling detected (Node 24 via fnm, pnpm 12, no global wrangler, not logged in)
- [x] Cloudflare / Hostinger / QR-NFC-GDPR research → `docs/decisions.md`

## B · Infrastructure connections (read-only first)
- [ ] Cloudflare: install official plugin (`/plugin marketplace add cloudflare/skills`, `/plugin install cloudflare@cloudflare`) or `wrangler login` — **needs the user** (OAuth)
- [ ] Hostinger: authorize the installed `hostinger` plugin MCP (hosted OAuth) — **needs the user**
- [ ] Read-only inventory: zones, registrar, nameservers, DNS records, existing Workers/D1/R2/Access apps

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
- [ ] Create D1 `return-db`, R2 `return-files`; apply migrations remotely
- [ ] Zone on Cloudflare; Custom Domains `DOMAIN` + `app.DOMAIN`; Access app on `app.DOMAIN`; Turnstile widget; Email sender
- [ ] Secrets: `TURNSTILE_SECRET_KEY`, `IP_HMAC_SECRET`; vars: hosts, Access team/AUD, owner email, sender, fallback email
- [ ] Deploy and verify (curl headers, Access redirect, finder flow on a phone)

## I · Final audit
- [ ] E2E (Playwright, mobile + desktop), security review, accessibility pass, backup/restore drill
