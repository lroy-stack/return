# RETURN — engineering audit (phase 2, 2026-10-13)

Scope: whole repo, emphasis on `git diff 0283295..HEAD` (geocoding, quick card / paper renderers, Sheet/Shell/glass CSS,
finder templates, migration 0002). Read-only; no production writes.

**Verdict: REQUEST CHANGES.** The code is sound and no exploitable security defect was found in phase 2. Operations are
not: the core promise ("a stranger can reach the owner quickly") fails silently in production today, and disaster
recovery exists only on paper.

## Evidence
| Check | Result |
|---|---|
| `pnpm lint` / `typecheck` | green |
| `pnpm test` | 23 files, 348 passed, 29 s |
| `pnpm build` | worker 543 KB / 139 KB gz; SPA main 434 KB / 125 KB gz; lazy `pdf-draw` 177 KB gz; `GalleryPage` 12 KB gz |
| `pnpm audit` | no known vulnerabilities |
| Prod `backup.created` events | 0 rows (cron has not fired since the owner row was created) |
| Prod `notifications` | 3/3 failed: `could not find domain config of sending domain` |
| R2 `return-files` (eu) | 0 objects |
| Deployments | latest `41d6c2e5` (docs named older versions) |
| D1 Time Travel | active |
| Public probes | correct 404s, CSP, `no-store`, `X-Robots-Tag`, `Referrer-Policy: same-origin`; `/api` 404 on public host; `app.` → 302 Access |
| Domain (RDAP) | expires 2027-05-14; transfer lock on; DNSSEC off; NS Cloudflare |
| Git | no remote configured |
| Wrangler login | OAuth token with broad write scopes on the laptop |

## Findings

### Critical
**C1 — Owner email alerts fail in production while the panel says email is "configured".**
`wrangler.jsonc` (`NOTIFY_FROM`), `services/notify.ts` (`emailConfigured` = `NOTIFY_FROM && EMAIL`), `api/system.ts`.
A finder writes, the message is stored, the owner is never told. Fix: (a) owner onboards `return.lr0y.dev` in Email
Sending and sends a test email — blocks printing physical cards; (b) derive email status from the last delivery outcome
and show a persistent banner in Inbox/Shell when the last owner email failed.

### High
- **H1 — Source code has a single copy (no git remote).** Push to a private remote and add CI running lint · typecheck · test.
- **H2 — Backups / DR unverified.** 0 backups, empty bucket (first cron 2026-10-14 03:17Z); no off-account copy; no restore
  drill. Verify on 2026-10-14, do the off-account `d1 export` + R2 sync, run the drill and record it.
- **H3 — No alerting.** Errors only reach `console.error`. Add a dead-man's-switch ping at the end of `runMaintenance`,
  an external uptime check on `/p/emergency` and a canary tag page, and an alert on `level:"error"` logs.

### Medium
- **M1 — Picked search result is reverse-geocoded again** (`ProposalSheet.tsx` sends name + lat/lng; `api/conversations.ts`
  re-resolves) → contradictory names and a repeated Nominatim request. Fix: cache search results under their reverse key,
  or accept the picked place and skip the lookup.
- **M2 — Geocode cache outlives retention/deletion** (rounded coordinates + `created_at` for 90 days; nightly backups keep
  deleted conversations 30 days; privacy notice silent). Fix: day-precision timestamps, TTL ≤ shortest retention or delete
  a conversation's keys on delete, one sentence about backups/place cache in EN/DE/ES.
- **M3 — Geocoder tests timing-dependent, some pass vacuously** (never assert the call happened; real 1 s throttle).
  Fix: assert call counts, injectable interval (0 in tests), `vitest --repeat 5` to pin the one-off flake.
- **M4 — E2E not hermetic: hits real Nominatim** with the production UA. Fix: `NOMINATIM_URL` var pointing to a stub in
  dev/E2E, or geocoding off in development unless opted in.
- **M5 — Release does not guard migrations or tag versions.** Make `release` refuse a dirty tree and pending migrations,
  deploy with `--tag <git sha> --message <subject>`; document "migrate before deploy".
- **M6 — Domain hygiene.** Enable DNSSEC (Cloudflare + DS at Hostinger); confirm auto-renew; reminder for 2027-04;
  consider Cloudflare Registrar.

### Low
- L1 `QuickCardFlow.tsx`: placeholder tag uses the app origin → preview URL/QR version differ from export.
- L2 `api/geocode.ts`: search budget consumed on cache hits.
- L3 `public/conversation-routes.tsx`: dead geocoding path for finder proposals (no coordinates).
- L4 `public/conversation-view.tsx`: duplicated coordinate markup.
- L5 No global daily reverse-geocoding budget; per-isolate throttle can exceed 1 req/s. Add a daily counter.
- L6 Turnstile dev shortcut checks only `ENVIRONMENT`; also require a loopback host.
- L7 `ui/Sheet.tsx`: Escape handled in keydown and native cancel; rely on `onCancel` only.
- L8 `gallery/QuickCardMock.tsx` duplicates paper geometry/colours; render the real renderer and delete the mock.
- L9 `pages/print/strings.ts` is a second dictionary; merge into `lib/dict.ts`.
- L10 `APP_VERSION` "0.1.0" vs Nominatim UA "0.2"; single source.
- L11 axe E2E only on the tag page; add conversation page and 2–3 panel screens.
- L12 Privacy notice lists Nominatim as a processor; OSMF is an independent recipient (UK). Wording review.
- L13 Place names use the owner's panel language; document in system.md.
- L14 Wrangler OAuth token broad on laptop; `wrangler logout` between releases or scoped API token; deny-read `.dev.vars`.
- L15 `QuickCardFlow.tsx` (596 lines) and `PrintStudio.tsx` (591) oversized; split before PWA work.

### Positive checks
Fixed-host geocoder with timeouts and no logging of coordinates/queries; proof watermark across pages; no inline
style/script on finder pages; i18n completeness compiler-enforced; geocode cache pruned by cron; export/import consistent
after 0002 (place data intentionally excluded); pdf-lib only in a lazy client chunk; axe-core dev-only.

## Docs drift
1. `docs/plan.md`: stale version, test counts, axe note, migrations.
2. `docs/specs/002-ux-polish/plan.md`: stale version and E2E status.
3. `docs/specs/002-ux-polish/spec.md`: missing `status:` front-matter.
4. `CLAUDE.md`: architecture misses `geocode.ts`, `src/app/ui/*`, `/gallery`, `docs/design/system.md`; gotcha about the
   Nominatim stub and throttle.
5. `README.md`: docs list misses design, specs, infra.
6. `docs/security.md`: no geocoding row; residual risks omit backups/place cache.
7. `docs/operations.md`: no "Nominatim down" row; "migrate before deploy" + `deployments list`; restores drop place names;
   DNSSEC step not done.
8. `docs/printing.md`: quick-card paper path missing.
9. `docs/decisions.md`: card export row misses the paper sheet; "never repeated for the same point" contradicted by M1.

## Ops checklist (2026-10-13 ~17:00Z)
| Item | Status |
|---|---|
| Worker, custom domains, Access redirect | ✅ |
| Migrations 0001 + 0002 remote | ✅ |
| Cron `17 3 * * *` | ⚠️ configured, not fired yet |
| Nightly R2 backup | ❌ none yet |
| D1 Time Travel | ✅ |
| Off-account monthly copy | ❌ |
| Restore drill | ❌ |
| Email Sending onboarding | ❌ every send fails |
| Monitoring / alerting | ❌ |
| Domain renewal | ⚠️ 2027-05-14, auto-renew unverified |
| Registrar lock | ✅ |
| DNSSEC | ❌ |
| Cloudflare account 2FA / hardware key | ❓ |
| Wrangler token scope | ⚠️ broad |
| Source code off-machine | ❌ no git remote |
| Real-phone scan over mobile data | ❌ owner action |

## Tech debt before PWA / native / E2EE
1. Git remote + CI gates.
2. Release script with migration guard and version tagging; single `APP_VERSION`.
3. Hermetic seams for external services (Nominatim URL, throttle, clock) — same pattern for push/APNs/FCM.
4. Alerting and a working notification channel; one delivery-status model reused by push.
5. Retention model covering derived data and backups (prerequisite for E2EE decisions).
6. Split oversized panel flows, delete the gallery mock, set a bundle budget.
