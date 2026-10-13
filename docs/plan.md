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
- [x] Deployed (current version 10aec1fe); public host verified (routes, 404s, headers, no /api); panel host 302 → Access login
- [ ] Owner: first login, settings, a real tag scanned on a phone over mobile data

## I · Final audit
- [x] Unit/integration: 299 tests in workerd (lint · typecheck · test green)
- [x] E2E Playwright: 52 passed on mobile + desktop, stable on two consecutive runs (axe scenario skipped: axe-core not installed)
- [x] Independent security reviews (owner API, finder surface) → all findings fixed with tests
- [x] Browser QA (375/768/1440, light/dark, keyboard, axe) → findings fixed
- [x] D1 Time Travel active on production; export→restore roundtrip covered by tests
- [ ] Owner: onboard Email Sending for `return.lr0y.dev`, then Settings → send test email
- [ ] Owner: monthly off-account backup (docs/operations.md §4) and one restore drill on a scratch DB
- [ ] Physical cards: order samples after real-phone scan test (docs/printing.md)

## J · Everything still open (consolidated 2026-10-14)
Sources: docs/audit/mobile-audit.md (M-xx), docs/audit/final-audit.md (F-xx, L-xx), docs/specs/003-completion,
docs/specs/004-mobile-ux, docs/architecture/next-phases.md, ADRs 0002–0006, code reviews. Status: ▶ in progress ·
☐ to do · ? verify whether already done. Production today = commit 152aa11 (PWA + owner push, migrations 0001–0005).

### J1 · Mobile UX — spec 004 (▶ agents running)
- ▶ 4M.1 Finder location: apply on first tap (no silent drop, M-01), single consent, two-stage geolocation, iOS/Android
  re-enable guidance, retry, webview hint, error styling (M-07).
- ▶ 4M.2 Finder conversation as a chat: one timeline, anchored composer with safe areas, autogrow, send without jump,
  live refresh in place, smart scroll, aria-live; remove floating bar on /t (M-08); 320 px Turnstile overflow (M-09);
  native share of the private link; footer tap targets (M-06).
- ▶ 4M.3 Owner chat: full-height layout, compact autogrow composer, no gap above the tab bar, hide tab bar while typing,
  "New messages" pill, finder name as title, read receipts (M-05).
- ▶ 4M.4 Owner location (owner decision: build it all): server API + accuracy rules ▶; panel "Use my location" in
  return plans and item location, "Share my location" in the thread ☐ (after the API contract) (M-02).
- ▶ 4M.5 Install: Android install button, iOS Add-to-Home-Screen guide, one-time hint (M-03); theme-color follows the
  choice, no flash on load, theme controls in sync (M-12); landscape shell (M-10).
- ▶ 4M.6 No focus zoom (fields ≥ 16 px on touch, M-04) + regression test; settings apply instantly / save bar never
  covers navigation (M-11).
- ▶ 4M.7 P2: place search "unavailable"; tag QR as PNG + share; share keeps user activation; offline keeps language;
  formatted note timestamps; confirm "Add tag"; 404 for unknown slugs; duplicate requests; Trackers link relabel.
- ☐ Panel P2s not yet assigned: NFC is text only (Web NFC on Android — decide); finder webview hint is in 4M.1.
- ☐ 4M.9 Verification: real iOS Safari in the Simulator (runtime download failed on a network timeout — retry),
  ui-qa re-audit at 320/375/393/landscape, code review, deploy.

### J2 · Visual identity (▶)
- ▶ Custom icon set (grammar, outline + filled tab icons, categories, states) as a shared sprite.
- ▶ Dimensional luggage illustrations per category as no-photo placeholders, tintable.
- ☐ Adopt the sprite on finder pages (follow-up from the design agent).
- ☐ Decide: per-item colour field (migration) so illustrations match the real item.

### J3 · Proof photos and sharing with the finder (▶ ADR 0006 being written)
- ✓ ADR 0006 accepted with the owner's decisions (guided, never blocking; label photo in person only; 24 h / 7 d).
- ☐ Implement ADR 0006 (≈ 3–4 days, 7 tasks; first a short spike: watermark rendering speed/legibility on iPhone).
- ☐ Owner-controlled, revocable, time-limited sharing of selected photos into one conversation, served only through
  the finder's capability (no standalone URLs), watermark, view log, auto-revoke on close/block; later sealed end to
  end (ADR 0004). Owner decisions listed in the ADR.

### J4 · PWA + push (phase 4–5, deployed; verification open)
- ☐ S1 on a real iPhone: install, Access login persists after a relaunch the next day (owner).
- ☐ Real push 5/5 within 10 s on iPhone (Home Screen) and Android; tap opens the conversation (owner + lead).
- ☐ Safari accepts the payload's extra `return` member; `pushsubscriptionchange` on a real device.
- ☐ Record S1/push outcomes in ADR 0002/0003; app badge (`setAppBadge`) not implemented.

### J5 · Roadmap (after J1–J4)
- ☐ Phase 6: finder PWA (install from /c/ only, offline page, nothing private stored) + finder push (opt-in).
- ☐ Phase 7: sealed conversations on the web (ADR 0004: HPKE, key in the link fragment, owner key + recovery).
- ☐ Gate G1 (native app needed?) → phases 8–10 Expo (ADR 0005: device pairing, NFC writing, push, sealed chat).

### J6 · Older audit leftovers
- ? F-19 future `acquiredOn` dates still accepted (schema has no upper bound).
- ? F-27 long item descriptions not clamped; F-22 typed delete confirmation vs collapsed spaces.
- ☐ L-11 axe E2E covers only the finder tag page — add panel routes and the conversation page.
- ☐ Expired temporary blocks close up to ~24 h late (nightly job); derive at read time if it matters.
- ☐ 3.12 docs drift sweep (README, operations, security, decisions, printing) after J1–J3 land.

### J7 · Operations and repository (lead)
- ☐ Push pending local commits to GitHub (last push failed on a network timeout).
- ☐ CI: nightly E2E job green on the public repo; consider Dependabot security updates.
- ☐ Flaky E2E: `pwa-push.spec.ts` "content-free notification" (CDP synthetic push) fails occasionally in the full run
  under load; passes 3/3 alone. Stabilise (e.g. wait for the SW to be idle before deliverPushMessage).
- ☐ Record the D1 Time Travel bookmark before each migration (done for 0003–0005; keep the habit).

### J8 · Owner actions (only you can do these)
- ☐ Delete `lroy-stack/return-exposed-history` (`gh auth refresh -s delete_repo`, then `gh repo delete …`); decide
  whether to keep or delete the private archive `lroy-stack/return-app`.
- ☐ Keep a copy of the real `wrangler.jsonc` outside the repo (password manager) — it is git-ignored now.
- ☐ Enable DNSSEC and domain auto-renew for lr0y.dev (expires 2027-05-14).
- ☐ R2 read-only token + rclone for the monthly off-account backup; one restore drill on a scratch DB (operations §4).
- ☐ Uptime monitors / heartbeat (operations: UptimeRobot or healthchecks.io) and Cloudflare notifications.
- ☐ Real-phone checks: scan a printed tag over mobile data; S1 + push (J4); then order physical card samples.
