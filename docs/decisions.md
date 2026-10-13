# RETURN — decision matrix

Researched 2026-10-13. ✅ = verified in official docs that day; ⚠️ = not verified, treat as hypothesis.

| Area | Choice | Why | Operating cost | Risks | Rejected alternative |
|---|---|---|---|---|---|
| Runtime | One Cloudflare Worker (Hono) serving API, finder pages and SPA assets | One deployable, no servers; Static Assets + `run_worker_first` patterns ✅ | Workers Free: 100k req/day, 10 ms CPU/req ✅ | 10 ms CPU cap on Free (JWT verify, QR SVG are well under) | Pages + Functions (legacy path); separate API/SPA Workers (two deploys) |
| Hosts | `DOMAIN/t/:token` public, `app.DOMAIN` panel, two Custom Domains on the same Worker | Custom Domains can be attached many-per-Worker ✅; host switch in code | Free | Zone must be active on Cloudflare (nameservers) ✅ | Path-based split under one host (Access would need path rules; easier to misconfigure) |
| Panel auth | Cloudflare Access (email OTP) + JWT verified in the Worker with `jose` (iss, aud, RS256) | Official validation method ✅; no passwords to store | Zero Trust Free ⚠️ (seat limit not stated in docs) | Misconfigured AUD → 401 (fail closed) | Own login/passkeys (more code, more attack surface) |
| Database | D1, one DB, SQL migrations | Relational integrity, Time Travel 7 d Free / 30 d Paid ✅ | Free 5 GB, 5M reads/day ✅ | Limits far above personal use | KV (no relations), external Postgres (another provider) |
| Files | R2 private bucket via binding; served only through authenticated `/api/files/:id` (public photo through tag page) | No public bucket for invoices ✅ | Free 10 GB-month ✅ | R2 object versioning not found ⚠️ → own backups | Public R2 bucket / signed URLs |
| Anti-abuse | Workers Rate Limiting binding (per IP) + D1 caps per tag/conversation + Turnstile on first contact | Binding config `ratelimits` ✅ (period 10/60 s); Turnstile free ✅ | Free | Rate-limit binding is per-location, approximate ⚠️ | CAPTCHA on every page (hurts legit finders) |
| Notifications | `send_email` binding → owner's verified address (any plan ✅); finder emails opt-in (Email Service on Workers Paid ✅, 3,000/mo incl.) | No third-party mail account | Free for owner-only | Sender domain must be onboarded on Cloudflare ✅; Email Service GA status ⚠️ | Resend/Postmark (extra account + API key) ; Telegram (v2) |
| Finder access | Capability URL `/c/:token` (256-bit), only SHA-256 stored; optional HttpOnly cookie | No accounts; token theft limited to one conversation | Free | URL can be shared/copied — accepted, documented | Finder accounts / magic links (friction) |
| Tag tokens | 128-bit random, Crockford base32 lowercase (26 chars), case-insensitive lookup | Non-enumerable; short enough for NTAG213 (144 B user memory ✅) | — | QR can be photographed (cannot prove physical scan) | Sequential ids / short codes |
| QR | `uqr` (MIT, zero deps) → SVG path; ECC M; quiet zone 4 | Pure ESM, runs in Worker + browser | — | — | `qrcode` (Node deps), server PNG rendering |
| Card export | SVG layout model → SVG, PNG (canvas, in browser), PDF (`pdf-lib` in browser) | No server rendering; vector PDF for printers | — | `pdf-lib` last release 2021 ⚠️ (stable, browser-only use) | Server-side PDF (CPU limits), headless Chrome |
| Public pages | Hono JSX SSR + one small vanilla JS file; strict CSP | No React bundle for finders; fast on bad networks | — | — | SPA for finders |
| Panel | React 19 + Vite 8 + Tailwind 4, tiny in-house router | Few deps for multi-year maintenance | — | — | React Router 8 / TanStack (API churn) |
| Tests | Vitest 4 + `@cloudflare/vitest-plugin` (runs in workerd) ✅, Playwright E2E | Real runtime, real D1 | — | Plugin incompatible with Vitest 5 (observed) | Mocked bindings |
| Backups | D1 Time Travel ✅ + nightly JSON export to R2 (cron) + `wrangler d1 export` runbook ✅ | Two independent restore paths | Free | R2 and D1 share an account (account loss) → periodic local copy in runbook | Third-party backup service |
| Domain/DNS | Domain at Hostinger, nameservers moved to Cloudflare (full setup) | Partial/CNAME setup needs Business plan ✅ | Free | Must copy MX/TXT first; disable DNSSEC first ✅ | Keep Hostinger DNS (no Custom Domains/Access) |
| Hostinger MCP | Official hosted server `https://mcp.hostinger.com` (OAuth) ✅ — read-only use, Domains/DNS only | No API token stored locally | — | Hosted server exposes all products; restrict via hPanel toggles ⚠️ | Global npm install (studio rule) |

## Facts that shape the product
- iPhone reads NDEF URI tags in the background (newer models) ⚠️; **Safari cannot write NFC**; Web NFC is Chrome/Android only. Tags are programmed with a native app (e.g. NFC Tools) using the exported URL list. Never lock chips automatically.
- Apple Find My has no third-party API. RETURN only stores a manual AirTag association and links to Apple's own flows (Lost Mode; *Share Item Location*, iOS 18.2+, link expires after 7 days or when found ✅).
- GDPR likely applies (public intake of third-party messages is not a purely household activity ⚠️). Hence: minimal fields, explicit consent for location, retention limits, privacy notice on finder pages, no analytics, no cookies except the strictly necessary conversation cookie (TDDDG §25(2)).
- A QR/URL can be copied. Possession of a tag URL grants only: see the public card, start a conversation. Never: inventory, other conversations, documents.

## Decisions taken during implementation (2026-10-13)
- **Hosts:** finder pages on `return.lr0y.dev`, panel on `app.return.lr0y.dev` (the Custom Domain issues a certificate
  for the second-level name ✅). `lr0y.dev` DNS moved from Hostinger to Cloudflare (records replicated DNS-only; log in
  `docs/infra/`). Domain stays registered at Hostinger — **auto-renew must stay on** (expires 2027-05-14).
- **CSRF on finder forms:** finder pages send `Referrer-Policy: same-origin`, so browsers send a real `Origin` on
  same-origin form posts (the capability URL still never leaves the origin). `Origin: null` is accepted only with
  `Sec-Fetch-Site: same-origin`; any other Origin must equal the page origin. Finder POSTs must be small url-encoded
  bodies with `Content-Length`.
- **Finder cookie:** only `__Host-rc` (HttpOnly, Secure, SameSite=Lax, 30 days) to reopen your own conversation; `lang` is read
  but never set — keeps the one strictly-necessary-cookie statement true.
- **Abuse limits:** IPs are keyed per /32 (IPv4) or /64 (IPv6). Writes 10/min, reads 60/min per IP; new conversations
  3/day per source and 5 distinct sources/day per tag (atomic); per conversation 50 messages, 20 proposals, 10
  locations a day. Hitting any limit re-renders the tag page with the typed text, the contact links and the fallback
  email (429), so a spammer cannot leave a real finder without a way to reach the owner. Production without
  `CF-Connecting-IP` uses a shared bucket.
- **First contact does not change recovery state** (an anonymous message could be a prank); accepting a return
  proposal moves the recovery to `returning`.
- **Notifications:** caps are enforced per email: 30/h for follow-ups, 45/h reserved ceiling for first contact and
  lost-item alerts; one follow-up email per conversation per 10 min. Trusted contacts are told *that* contact happened,
  never the finder's text.
- **Cards:** CR80 85.6×54 mm, r 3.18, bleed 2, safe 3; Ø5 hole at 6 mm from the short edge in a 12 mm "stub" band;
  QR 30 mm incl. quiet zone, ECC M, module ≥ 0.5 mm (layout grows the QR or fails `url_too_long`); PDF one page per
  side with TrimBox/BleedBox, vector QR, Helvetica/Courier standard fonts (WinAnsi); exports are watermarked
  "PROOF — NOT FOR PRINT" while the tag URL is not a public https host. The PDF renderer lives in `src/shared/card/`
  (tested in workerd) but is only loaded by the browser via dynamic import.
- **Restore:** import validates every row and reference against the document and the current owner (review finding);
  file bytes are not part of the JSON export (R2 backup is separate, see operations).
