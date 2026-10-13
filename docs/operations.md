# RETURN — operations runbook

Everything below that touches a Cloudflare or Hostinger account is **done only with the owner's explicit approval**.

**Current production (2026-10-13):** finder pages `https://return.lr0y.dev`, panel `https://app.return.lr0y.dev`
(Access app "RETURN panel", team `myteam`), Worker `return-app`, D1 `return-db` (EU), R2 `return-files` (EU),
Turnstile widget "RETURN finder pages", zone `lr0y.dev` on Cloudflare (registrar: Hostinger, renew before 2027-05-14).
Deploy updates with `pnpm run release` after the gates are green.
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
```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm exec wrangler deploy
curl -sI https://example.com/t/0000000000000000000000000   # 404, X-Robots-Tag noindex
curl -sI https://app.example.com/                           # 302 to Access login
curl -s https://example.com/api/me                          # never 200
```
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
Restore drill (do it once after deploy): export → create a scratch D1 → `wrangler d1 execute <scratch> --remote --file=…`
→ point a preview at it → check items and a tag page.

## 5. Degraded behaviour
| Failure | What still works |
|---|---|
| Email delivery | Messages are stored first; the panel inbox shows them; failures appear in Settings → System |
| D1 unreachable | Tag pages render a fallback with `FALLBACK_CONTACT_EMAIL`; static `/p/emergency.html` needs no Worker logic |
| Panel/SPA broken | Finder pages are server-rendered and independent of the SPA bundle |
| Map links | The agreed place is always shown as text; links are optional |
| Cloudflare/DNS/domain outage | Nothing online works — the email printed on the card is the last resort |
