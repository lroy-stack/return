# RETURN — operations runbook

Everything below that touches a Cloudflare or Hostinger account is **done only with the owner's explicit approval**.

**Current production (2026-10-13):** finder pages `https://return.lr0y.dev`, panel `https://app.return.lr0y.dev`
(Access app "RETURN panel", team `myteam`), Worker `return-app`, D1 `return-db` (EU), R2 `return-files` (EU),
Turnstile widget "RETURN finder pages", zone `lr0y.dev` on Cloudflare (registrar: Hostinger, renew before 2027-05-14).
Deploy updates with `pnpm run release` (guarded script, see section 3).
Commands use the project-local Wrangler (`pnpm exec wrangler …`).

## 0. Choose the domain (one-time, irreversible in practice)
Tag URLs are printed and must live for years: `https://DOMAIN/t/<token>`. Pick a short domain you will renew for a
long time (enable auto-renew). Simplest path: **register it with Cloudflare Registrar** (at-cost, the zone is on
Cloudflare from day one, no nameserver move). If it is registered at Hostinger instead:
1. Add the zone to Cloudflare (Free plan, full setup). Compare the imported records with Hostinger's DNS export;
   copy MX/TXT (SPF, DKIM, DMARC) manually if missing.
2. Disable DNSSEC at Hostinger and wait ≥ 24 h.
3. Change nameservers at Hostinger to the two Cloudflare nameservers (hPanel, or the Hostinger MCP with approval).
4. Wait until the zone is *Active* in Cloudflare; re-enable DNSSEC in Cloudflare.

## 1. Create resources (Workers Free plan is enough)
```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create return-db          # copy database_id into wrangler.jsonc
pnpm exec wrangler r2 bucket create return-files
pnpm exec wrangler d1 migrations apply DB --remote
```
Rate-limit namespaces (`52001`, `52002`) are declared in `wrangler.jsonc`; pick other ids if they clash with an
existing Worker in the account.

## 2. Configure
`wrangler.jsonc` → `vars`:
| Var | Example | Notes |
|---|---|---|
| `PUBLIC_HOST` | `example.com` | finder pages |
| `APP_HOST` | `app.example.com` | panel + API, protected by Access |
| `ACCESS_TEAM_DOMAIN` | `myteam.cloudflareaccess.com` | Zero Trust team domain |
| `ACCESS_AUD` | `abc123…` | Access application AUD tag |
| `OWNER_EMAILS` | `me@example.org` | comma-separated allowlist |
| `NOTIFY_FROM` | `return@example.com` | sender on the onboarded domain |
| `FALLBACK_CONTACT_EMAIL` | `me@example.org` | shown if the database is down; also print it on cards |
| `TURNSTILE_SITE_KEY` | `0x4AAA…` | public |

Add the custom domains to `wrangler.jsonc`:
```jsonc
"routes": [
  { "pattern": "example.com", "custom_domain": true },
  { "pattern": "app.example.com", "custom_domain": true }
]
```
Secrets (never in git):
```bash
pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
openssl rand -base64 32 | pnpm exec wrangler secret put IP_HMAC_SECRET
```
Dashboard steps:
- **Access**: Zero Trust → Access → Applications → Self-hosted → `app.example.com` (whole host), policy *Allow* →
  emails = owner (+ one-time PIN login). Copy the AUD tag into `ACCESS_AUD`. Do **not** add the apex host.
- **Turnstile**: add a widget for `example.com` (Managed mode) → site key var + secret.
- **Email**: Email Routing/Email Service → verify the owner's destination address (and trusted contacts that should
  get alerts); onboard `example.com` as sender for `NOTIFY_FROM`.

## 3. Deploy and verify
Releases go through the guarded script (`scripts/release.mjs`, `pnpm run release`):
```bash
pnpm run release --dry-run   # everything except migrate/deploy; reports what would be refused
pnpm run release             # real release
pnpm run release --migrate   # also applies pending remote migrations after an explicit y/N prompt (TTY only)
```
It refuses when: the tree is dirty, the branch is not `main`, local `main` differs from `origin/main` (it fetches
first), or `wrangler d1 migrations list DB --remote` shows unapplied migrations (it prints
`pnpm exec wrangler d1 migrations apply DB --remote`; `--migrate` is refused in CI / non-interactive shells). Then it
runs `pnpm lint`, `typecheck`, `test`, `build`, deploys with `--tag <short sha> --message "<commit subject>"`, prints
the newest deployments and checks `https://PUBLIC_HOST/p/emergency` = 200, an unknown tag = 404, the panel = 302.
Order is always **migrate, then deploy**; migrations must stay backward-compatible with the previous Worker version.
Manual equivalent and extra checks:
```bash
curl -sI https://example.com/t/0000000000000000000000000   # 404, X-Robots-Tag noindex
curl -sI https://app.example.com/                           # 302 to Access login
curl -s https://example.com/api/me                          # never 200
```
**Rollback** (reversible, Worker code only; D1 data is not rolled back): `pnpm exec wrangler deployments list`, then
`pnpm exec wrangler rollback <version-id> --message "why"`. Data problems: D1 Time Travel (section 4). Because
migrations are backward-compatible, the previous Worker keeps working against the migrated schema.
Then: in the panel set Identity/Contact/Notifications, send a test email, create a tag, scan it with a phone on
mobile data, send a message, reply from the panel.

## 4. Backups and restore
Three independent layers:
1. **D1 Time Travel** (automatic; 7 days Free / 30 days Paid):
   `pnpm exec wrangler d1 time-travel info return-db` · `pnpm exec wrangler d1 time-travel restore return-db --timestamp=2026-10-13T08:00:00Z`
2. **Nightly JSON export to R2** (cron `17 3 * * *`, keeps 30): `backups/<ownerId>/<date>.json`. Restore into an empty
   inventory from the panel (Settings → System → Restore) — tag tokens and finder links are preserved.
3. **Monthly off-account copy** (protects against account loss):
   `pnpm exec wrangler d1 export return-db --remote --output=backups/return-$(date +%F).sql` and sync files with
   rclone using a read-only R2 API token (`rclone sync r2:return-files ./backups/files`). Keep `backups/` outside git.
Tooling: `pnpm run backup:offsite` (`scripts/backup-offsite.sh`) writes `backups/return-db-<UTC date>.sql`
(git-ignored, mode 600). With `RCLONE_REMOTE=r2ro pnpm run backup:offsite` it also mirrors `return-files` to
`backups/files`.

**R2 read-only token (owner action, one-time).** Cloudflare dashboard -> R2 -> Manage API tokens -> Create API token ->
permission *Object Read only*, scope = bucket `return-files` only, no TTL or a 1-year TTL. Copy the Access Key ID,
Secret and the jurisdiction endpoint (EU buckets use `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`). Then
`rclone config` -> new remote `r2ro`, type `s3`, provider `Cloudflare`, paste the keys and the EU endpoint. Test with
`rclone lsd r2ro:` and `rclone ls r2ro:return-files | head`. Store the keys in the password manager, never in the repo.
Run monthly (calendar reminder) and copy `backups/` to a place outside this laptop and outside Cloudflare.

**Restore drill (never touches production):** `pnpm run restore:drill [export.sql]` exports remote D1 (read-only),
applies it to a throwaway local D1 (`wrangler d1 execute DB --local --persist-to <tmp dir>`, deleted afterwards) and
prints row counts and foreign-key violations. Repeat after every schema change and at least quarterly.

| Date (UTC) | Source | Duration | Result |
|---|---|---|---|
| 2026-10-13 | `d1 export --remote` (27,867 bytes) into a scratch local D1 | 12 s | owners 1, items 7, tags 3 (3 with token), conversations 1, messages 1, applied migrations 2, FK violations 0. Counts match production queried with `d1 execute --remote`. PASS |

Not yet covered: R2 file restore (the bucket was empty at drill time; add a file-restore line once files exist) and
the first nightly JSON backup (cron `17 3 * * *`, first run 2026-10-14 03:17Z: confirm `backups/<ownerId>/…json` exists).

## 5. Degraded behaviour
| Failure | What still works |
|---|---|
| Email delivery | Messages are stored first; the panel inbox shows them; failures appear in Settings → System |
| D1 unreachable | Tag pages render a fallback with `FALLBACK_CONTACT_EMAIL`; static `/p/emergency.html` needs no Worker logic |
| Panel/SPA broken | Finder pages are server-rendered and independent of the SPA bundle |
| Map links | The agreed place is always shown as text; links are optional |
| Cloudflare/DNS/domain outage | Nothing online works — the email printed on the card is the last resort |

## 6. Alerting (free options only)
- **Cron heartbeat in the app.** The nightly job records a `maintenance.ran` activity event; the panel Settings ->
  System shows the last run. Check it after any deploy; a missing night means the cron failed.
- **External uptime / heartbeat (owner action, free tier).** Create an account at UptimeRobot (free: 50 monitors,
  5-minute interval, email alerts) or healthchecks.io (free tier). Add HTTPS monitors expecting 200 for:
  1. `https://return.lr0y.dev/p/emergency` (static, proves DNS + Cloudflare + assets; `.html` redirects with 307)
  2. `https://return.lr0y.dev/` (Worker path)
  3. a canary tag page `https://return.lr0y.dev/t/<token>` of a dedicated revoked-or-test tag you create for this
     (proves Worker + D1; use a tag whose page returns 200 and holds no private data).
  Alert contact: an email address other than the one that depends on this system. Verify by pausing a monitor once.
- **Cloudflare notifications on the Free plan.** The notification catalogue
  (https://developers.cloudflare.com/notifications/notification-available/) lists no Workers-error, D1 or cron
  notification for Free; Health Checks notifications need a Professional plan; Incident and Maintenance alerts, Universal
  SSL alerts and Custom Alerts with webhook destinations are on all plans. Workers errors are therefore only visible in
  Workers Logs (observability is enabled in `wrangler.jsonc`): dashboard -> Workers -> return-app -> Logs, filter
  `level:"error"`. Enable the Incident Alerts and Universal SSL notifications (dashboard -> Notifications) as owner action.
  Not verified: whether Custom Alerts (beta) can target Workers metrics on Free; check the dashboard before relying on it.

## 7. Domain and access hygiene
- **DNSSEC (owner action).** Cloudflare dashboard -> `lr0y.dev` -> DNS -> Settings -> DNSSEC -> Enable DNSSEC; copy the
  DS record (key tag, algorithm, digest type, digest). Hostinger hPanel -> Domains -> `lr0y.dev` -> DNS / Nameservers ->
  DNSSEC -> add the DS record with exactly those values. Wait for Cloudflare to show DNSSEC *Active* (up to ~24 h) and
  confirm with `dig +dnssec lr0y.dev DS` and https://dnsviz.net. Never enable it with a mismatched DS (the domain
  stops resolving for validating resolvers); to disable, remove the DS at Hostinger first, wait, then disable in Cloudflare.
- **Auto-renew (owner action).** Hostinger hPanel -> Domains -> `lr0y.dev` -> auto-renewal ON, valid payment method.
  Calendar reminder 2027-04 (expiry 2027-05-14). Consider transferring to Cloudflare Registrar when eligible.
- **Wrangler credentials.** Prefer a scoped API token over the broad OAuth login: Cloudflare dashboard -> My Profile ->
  API Tokens -> Create from template *Edit Cloudflare Workers*, restricted to this account, plus D1 Edit and R2 Edit for
  the account; export it only for the release (`CLOUDFLARE_API_TOKEN=… pnpm run release`). Otherwise run
  `pnpm exec wrangler logout` after each release session and `wrangler login` when needed.
- **Secrets on disk.** `.dev.vars` is git-ignored and holds test values only. Suggested (not applied) deny entries for
  `.claude/settings.json`: `Read(./.dev.vars)`, `Read(./.env)`, `Read(./.env.*)`, `Read(./backups/**)`.
  The owner decides whether to add them.

## 8. CI
`.github/workflows/ci.yml` runs on push/PR to `main`: Node from `.node-version`, pnpm from `packageManager`, cached store,
`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (same commands as the local gates; no
secrets). A nightly / manual job runs `pnpm test:e2e` with Chromium, creating `.dev.vars` from `.dev.vars.example`
(test values only). Third-party actions are pinned by commit SHA with a version comment; update them deliberately.
