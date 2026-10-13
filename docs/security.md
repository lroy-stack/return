# RETURN — threat model

Assets: owner's inventory (serials, values, invoices), finder messages and shared locations, owner contact data,
the ability to impersonate the owner or the finder, the printed tag URLs (must keep working for years).

Actors: finder (anonymous, honest), opportunist with a photo of a tag, spammer/bot, thief holding the item,
attacker on the internet without any tag, someone with a copied finder link.

| Threat | Mitigation | Verified by |
|---|---|---|
| Enumerating items/tags | 128-bit random tag tokens; identical 404 for unknown/revoked/malformed; no listings, sitemaps or cross-links; `robots.txt` disallow; `X-Robots-Tag` | `test/public*.test.ts` |
| Copied/photographed QR | Accepted: a URL only shows the public card and lets you start a conversation. Revoke/replace a tag at any time | tag revoke/replace tests |
| Spam / floods | Turnstile (server-validated) on first contact; per-IP rate-limit binding; per-tag (5/day) and per-IP (3/day) conversation caps; owner can block (HMAC of IP, never raw IP); email hourly cap and per-conversation cooldown | conversation tests, `services/notify.ts` |
| Impersonating the owner | Owner surface only behind Cloudflare Access; Worker verifies the Access JWT signature, issuer, audience, expiry and owner allowlist — client headers alone are never trusted | `test/auth.test.ts` |
| Reading other conversations | Finder access = 256-bit token, only SHA-256 stored; every lookup scoped to that conversation; proposal/location ids checked against it | conversation isolation tests |
| Stolen finder link | Grants one conversation only; owner can close/block/delete it; retention deletes closed threads | owner conversation tests |
| Private documents/photos | Private R2 bucket, served only via authenticated `/api/files/:id` scoped by owner; only the explicitly chosen public photo is reachable from a tag page; uploads re-encoded client-side (EXIF/GPS stripped) and type-checked by magic bytes server-side | `test/files.test.ts` |
| Location exposure | GPS requested only after an explicit tap; preview + confirm before sending; never silent; owner location never collected; map links carry the destination only | public tests, `shared/maps.ts` |
| XSS | Hono JSX escapes by default; strict CSP on finder pages (no inline script/style); React escapes in the panel; SVG/CSV generators escape user text | XSS tests |
| CSRF | All state-changing requests require a same-origin `Origin`; Access cookie is SameSite; JSON API | `test/auth.test.ts` |
| SQL injection | Only prepared statements with bound parameters; dynamic SQL limited to whitelisted column names | code review |
| IDOR | Every owner query filters by `owner_id`; foreign ids return 404 | IDOR tests per resource |
| Secret exposure | Secrets via `wrangler secret`; `.dev.vars` git-ignored; system status reports booleans only; no Cloudflare/Hostinger tokens in the Worker | system test |
| Notification abuse | Owner-only recipients by default; finder email opt-in (Paid); caps and cooldowns; failures logged, never block storage | notify tests |
| State tampering | Server-side state machines for recoveries and proposals; actor checks (only the other party accepts) | recovery/proposal tests |
| Accidental destruction | Delete requires archive + typed name; restore only into an empty inventory; tags never deleted, only revoked; nightly backups | items/data tests |

Residual risks (accepted): someone holding the physical item can always read the public card; Cloudflare account
compromise bypasses everything (protect it with a hardware key); D1 and R2 live in the same account (keep the
periodic local backup from `docs/operations.md`).
