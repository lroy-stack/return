# RETURN — next phases: PWA, push, end-to-end encrypted chat, native app

Status: **proposed** (2026-10-13, architect agent). Decisions: [ADR 0002](../adr/0002-pwa-strategy.md) PWA ·
[ADR 0003](../adr/0003-push-notifications.md) push · [ADR 0004](../adr/0004-end-to-end-encrypted-chat.md) E2EE chat ·
[ADR 0005](../adr/0005-native-client-expo-and-device-auth.md) native client + auth. Facts and citations live in the
ADRs; **[unverified]** marks claims that still need a device test or an official source.

## 1. Recommendations at a glance
| Requirement | Recommendation | Effort |
|---|---|---|
| PWA for owner and finder | Two PWAs, one per origin. Hand-written service workers whose routing is a pure, unit-tested function: `/api/*` and finder conversation data are never stored in Cache Storage. Owner: offline shell + "update ready" prompt. Finder: installable only from `/c/*`, reopens the exact private link, offline page only, nothing private kept on a possibly borrowed phone. | M + S |
| Push | Web Push sent by the Worker with an in-house RFC 8291/8292 module on WebCrypto (verified against the RFC examples), Declarative Web Push payload format, **no content in any payload**. Owner first, then finders who opt in (the free substitute for finder emails, which need Workers Paid). Native push later through Expo Push Service. | M + M |
| End-to-end encrypted chat | "Sealed conversations": the finder's browser creates a per-conversation key, keeps it in the link fragment (`/c/<token>#k=…`) and wraps it to the owner's public key (HPKE, RFC 9180); entries use XChaCha20-Poly1305. One owner key shared by enrolled devices, a 128-bit recovery key, explicit rotation. Not Signal, not MLS: their state cannot live in a static capability link. Locations and return plans are sealed too; place names are resolved on the owner's device. | L |
| Native app | Expo (SDK 57+) in a pnpm workspace sharing `packages/contract` and `packages/e2ee`. Auth by **device pairing** from the Access-protected panel (QR, single use, 5 min) on a separate `api.return.lr0y.dev` host; per-device revocable tokens, hashed at rest. NFC write + read-back, QR scanner, Expo push, read-only offline cache. Ad hoc iOS install, sideloaded Android APK, no OTA updates. **Gated** on real need after the PWA phases. | M + L + M |
| Sequencing | Field-prove what exists → owner PWA → owner push → finder PWA + push → sealed conversations → (gate) → native foundations → native app → native sealed chat. | — |

Effort scale for phases (not the hour-based task sizes in the studio workflow): **S** ≤ 2 focused days, **M** 3–5 days,
**L** > 1 week and always split into M slices.

## 2. What does not change
- The finder never needs an account or an app; a tag URL only shows the public card and starts a conversation.
- Capability URLs stay as they are; printed tags keep working for years.
- Cloudflare Access (email OTP) stays the single root of owner identity; native devices are paired from an Access
  session.
- One Worker, D1 and R2 in the EU jurisdiction, Workers Free (unless the push CPU measurement says otherwise).
- Notifications stay secondary: data is stored first, delivery never blocks or throws.
- No analytics, no third-party scripts beyond Turnstile, no new cookies on finder pages.

## 3. Target shape
```
Finder phone (browser or Home Screen app, scope /c/)        Owner devices
  return.lr0y.dev                                            app.return.lr0y.dev  (Access)      api.return.lr0y.dev (device token)
  /t/<tag>        SSR + /p/ seal script                      SPA + /sw.js (PWA, Web Push)       Expo app (NFC, QR, Expo push)
  /c/<token>#k=…  SSR shell + decrypt script                         |                                   |
        |                                                            |                                   |
        +------------------------------ one Worker (Hono) -----------+-----------------------------------+
                    D1 (EU): items, tags, conversation metadata, sealed envelopes, wrapped keys,
                             push subscriptions, devices          R2 (EU): files, nightly backups
                    send_email → owner inbox
                    Web Push (VAPID, aes128gcm) → Apple / Google / Mozilla push services → owner PWA, finder app
                    Expo Push → APNs / FCM → native app
Owner devices → Nominatim directly (place names for sealed coordinates, explicit action only)
```
Ranked quality attributes for every phase: (1) a stranger reaches the owner quickly; (2) nobody, including the
server, reads private data that does not need to be read; (3) the owner can recover from losing devices; (4) the
smallest system one person can run for years.

## 4. Roadmap

### Phase 0 — Prove the current product in the field (S)
- **Goal:** the deployed system works end to end on real phones before anything is built on top of it.
- **Scope:** owner tasks still open in `docs/plan.md` (first login, Email Sending onboarding, a real tag scanned on
  mobile data, restore drill); record baseline Worker CPU time (p50/p99) for `GET /t/:token`, `POST /t/:token/contact`
  and `GET /api/conversations`; record `SELECT COUNT(*) FROM conversations` (input for the Phase 4 migration).
- **Acceptance:** the plan's H/I owner boxes are ticked; a finder message reaches the owner's inbox and the reply reaches
  the finder page; baseline numbers are written into `docs/operations.md`.
- **Risks:** none new. **Reversal:** n/a.

### Phase 1 — Owner PWA (M) · ADR 0002
- **Goal:** the panel installs on iPhone and Android, opens standalone and logged in, survives offline, updates safely.
- **Scope:** spike S1 first; manifest and icons from the brand mark; `/sw.js` emitted by a small Vite plugin; update
  toast; offline state; sign-out; Access session 30 days (+ path bypass apps only if S1 needs them); kill-switch SW in
  the runbook.
- **Acceptance:** S1 outcome recorded with the chosen fallback; iOS 26 Add to Home Screen → standalone → Access login
  persists after a relaunch the next day; Android Chrome reports installable; in airplane mode the app shows the shell
  and an offline message; unit test: every `/api/*`, `/cdn-cgi/*` and non-GET request is passthrough; Playwright: after
  browsing, Cache Storage holds no `/api/` URL; a new deploy shows "Update ready" and reloads into the new build id.
- **Risks:** Access login in iOS standalone mode (fallback ladder in ADR 0002); Access blocking manifest/SW (bypass
  paths). **Reversal:** cheap (kill-switch SW).
- **Owners:** frontend-engineer (SW, UI), devops-engineer (Access changes, with approval), ui-qa (devices).

### Phase 2 — Owner push (M) · ADR 0003
- **Goal:** the owner's phone shows "someone found your item" within seconds.
- **Scope:** spike S3; VAPID keys; `services/push/webpush.ts`; migration `0003_push`; owner subscription endpoints;
  SW `push`/`notificationclick`; Settings: "notifications on this device", device list, "show item name" (off);
  caps; privacy texts; CPU measurement.
- **Acceptance:** a unit test reproduces RFC 8291's example values; on an installed iPhone (iOS 18.4+) and Android
  Chrome a finder message produces a notification within 10 s in 5 of 5 trials and the tap opens the conversation; a
  410 from a fake push service deletes the subscription; a payload snapshot test contains no message text and, by
  default, no item name; p99 CPU of invocations that send up to 3 pushes stays under 10 ms, or a recorded decision moves
  the Worker to Paid.
- **Risks:** CPU on Workers Free; iOS delivery quirks; Safari's handling of the extra payload member.
  **Reversal:** cheap (delete subscriptions, remove the module).
- **Owners:** implementer (Worker), frontend-engineer (SW, settings), test-engineer (vectors), code-reviewer.

### Phase 3 — Finder PWA and finder push (M) · ADR 0002, 0003
- **Goal:** a finder can keep the conversation on the phone and be told when the owner replies, without email or
  Workers Paid.
- **Scope:** spike S2; `/p/finder.webmanifest`, `/p/finder-sw.js`, `Service-Worker-Allowed` header, install card,
  offline page, `/c/` resume handler, `POST /c/:token/push`, finder push on owner replies and plans, endpoint
  allowlist, deletion on close/block/delete, privacy notice EN/DE/ES.
- **Acceptance:** S2 outcome recorded (fragment kept, or the per-conversation manifest fallback chosen); on Android
  Chrome and on an installed iPhone app a finder enables notifications and receives "The owner replied" within 10 s;
  closing, blocking or deleting a conversation removes its subscriptions (test); a non-allowlisted endpoint gets 422
  and a fourth subscription 429 (tests); tag pages link no manifest (test).
- **Risks:** few strangers will install (acceptable: copying the link stays primary); SSRF via endpoints (allowlist).
  **Reversal:** cheap.

### Phase 4 — Sealed conversations on the web (L = 4a + 4b + 4c) · ADR 0004
- **Goal:** the server stores no readable conversation content, with no extra step for the finder.
- **4a Keys and package (M):** spike S4; pnpm workspace with `packages/contract` (mechanical move of
  `src/shared/{schemas,settings}.ts`) and `packages/e2ee`; owner key setup with recovery key and printable recovery
  sheet; recovery on a fresh browser; key fingerprint check. *Acceptance:* RFC 9180 vectors for the chosen suite pass in
  workerd; round-trip and tamper tests; setup → wipe browser → recover with the recovery key → same fingerprint.
- **4b First contact and messages (M):** migration `0004_sealed_conversations`; tag-page seal script; finder
  conversation page decrypts and sends; panel decrypts and encrypts; notification content rules; export v2; "Not
  end-to-end encrypted" badge on legacy conversations. *Acceptance:* a canary string written by finder and owner appears
  in no D1 column and no export (test); Playwright finder → owner on two devices → finder; reopening the link with the
  fragment in a new browser works, without it the page asks for the full link; Turnstile, caps and the degraded path
  (database down → typed text + printed email) still behave as today.
- **4c Locations, return plans, rotation (M):** sealed locations and plans with the server-side plan state machine
  unchanged; on-device geocoding (explicit, 1 request/s, cached, attribution, endpoint from `/api/system`); key rotation
  and total-loss flows; runbook; independent `code-reviewer` and `/security-review`. *Acceptance:* accepting a sealed plan
  still moves the recovery to `returning` (test); no request body to the Worker contains sealed coordinates or place
  queries (test); rotation re-wraps every conversation key in one batch (test); review findings fixed.
- **Risks:** our HPKE glue (vectors, review); finder script size (target ≤ 40 KB gzipped); recovery-key custody;
  Safari evicting the finder's stored key (the link with fragment is the credential) [unverified eviction rules].
  **Reversal:** turning it off affects only new conversations; sealed history stays sealed by design.

### Gate G1 — build the native app?
After at least four weeks of Phases 1–3 in real use, build the native app only if one of these holds: iOS web push or
standalone login proved unreliable; NFC writing through a third-party app is too painful; the owner wants the native
experience enough to pay USD 99/year and keep up with Expo/iOS upgrades. Otherwise stop here: the PWA already covers
inventory, inbox, push and printing.

### Phase 5 — Native foundations (M) · ADR 0005
- **Goal:** a native client can authenticate as the owner without weakening Access.
- **Scope:** spike S5; Custom Domain `api.return.lr0y.dev`; `hostKind` `api`; device-token middleware; pairing endpoints
  and panel UI (QR via the existing `uqr`); device list and revocation; `GET /api/tags/lookup`; `device_id` on push
  subscriptions.
- **Acceptance:** host-based auth matrix tests (Access JWT on the API host → 401, bearer on the app host → 401, revoked
  → 401, expired or reused pairing → 404); a paired token reads `/api/me` on the API host; revocation takes effect on
  the next request; the API host answers 404 outside `/api/*`.
- **Risks:** a public host whose only gate is a device token (256-bit, hashed, rate-limited); a future wildcard Access
  app breaking it (documented). **Reversal:** moderate (remove host, tables, UI).

### Phase 6 — Native app v1 (L = 6a + 6b + 6c) · ADR 0005
- **6a (M):** Expo shell with native tabs, pairing, inventory/items/tags/recoveries with core actions.
- **6b (M):** QR scanner, NFC write + read-back + `nfcStatus: 'verified'`, Expo push.
- **6c (S–M):** read-only offline cache, offline states, ad hoc iOS build and Android APK, build calendar in operations.
- **Acceptance:** on the owner's iPhone: pairing from the panel in under a minute; scanning a printed card opens its
  tag; an NTAG213 is written and verified; a new conversation produces a push within 10 s; in airplane mode the
  inventory is readable with an offline banner; revoking the device in the panel wipes the app back to pairing.
- **Risks:** Expo/RN upgrades, the iOS 27 scene life cycle, NFC entitlement on the paid account, signing expiry.
  **Reversal:** cheap (stop shipping).

### Phase 7 — Native sealed chat (M) · ADR 0004, 0005
- **Goal:** the owner reads and writes sealed conversations natively, without server-delivered code.
- **Scope:** chat screens on `packages/e2ee`; owner key delivered through pairing; on-device geocoding with an
  identifying User-Agent.
- **Acceptance:** the same conversation is readable and writable from the finder page, the web panel and the app;
  the owner key never leaves secure storage except wrapped inside a pairing.

## 5. Spikes, in order (each answers one question before code is written)
| # | Question | How | Time | Unblocks |
|---|---|---|---|---|
| S1 | Does Access OTP login work and persist inside an installed iOS 26 panel; do the manifest and `sw.js` load under Access? | Throwaway manifest + empty SW on a preview, real iPhone, relaunch after 24 h | 1–2 h | Phase 1–2 approach (**riskiest assumption**) |
| S2 | Does installing `/c/<token>#k=…` with a `start_url`-less manifest relaunch with the fragment (iOS 26, Android Chrome)? | Static test page on the public host | 1 h | Phase 3 manifest choice, Phase 4 reopen |
| S3 | CPU cost of `aes128gcm` + VAPID per push in workerd | Local benchmark, then production observability on the test push | 1 h | Free vs Paid |
| S4 | HPKE single-shot over noble passes the RFC 9180 vectors in workerd and in Hermes | Vitest + an Expo dev build | 2–3 h | Phase 4a |
| S5 | Expo SDK 57 app inside the pnpm workspace (isolated installs, React 19.2 next to 19.3, TS 7 at the root) and NFC write on a real iPhone | Template app importing `@return/contract`, dev build | ½ day | Phases 5–6 |

## 6. Risk register
| Risk | Impact | Mitigation |
|---|---|---|
| Access login does not work in iOS standalone mode | No iPhone push through the PWA | S1 first; fallback ladder (log in in Safari before installing; device pairing for the PWA); native app |
| Push crypto exceeds the 10 ms CPU limit on Workers Free | Pushes dropped | S3; cached VAPID JWT; Workers Paid (USD 5/month) instead of weaker crypto |
| iOS changes PWA or push behaviour in an update | Silent loss of notifications | Re-run S1/S2 after major iOS releases; email stays on as backstop |
| Bugs in our crypto glue (RFC 8291, HPKE) | Broken or weak encryption | Audited primitives, official test vectors, small modules, two independent reviews |
| Owner loses all devices and the recovery key | Sealed history unreadable | Recovery sheet + password manager; ≥ 2 enrolled devices; System status warns until the recovery key is confirmed |
| Finder loses the key (cleared storage, link without fragment) | Finder cannot read history | Link with fragment is the credential (copy and install prompts); a new conversation from the tag always works |
| Anonymous finders register arbitrary push endpoints | Worker used to POST to arbitrary hosts | Endpoint host allowlist, 3 per conversation, rate limits |
| Expo/iOS churn and Apple signing | Maintenance burden, app stops launching | Gate G1; no OTA; expiry reminders in operations; the PWA remains a full fallback |
| Nominatim policy prefers a proxy for apps | Service blocked for RETURN | Explicit, low-volume calls, local cache, switchable endpoint; coordinates and map links already work without names |
| API host misconfigured (wildcard Access app, bearer accepted on app host) | Native broken or auth bypass | Host-based auth tests; operations note |
| Metadata stays visible to the server and Cloudflare | Partial privacy | Documented in ADR 0004 and the threat model; accepted |

## 7. Cost
Workers Free stays sufficient unless S3 says otherwise (Paid: USD 5/month). Web Push, Expo Push, EAS Build Free and
Android sideloading cost nothing. The native app adds the Apple Developer Program (USD 99/year [unverified price]).
No other new accounts.

## 8. When the ADRs are accepted, update
`docs/decisions.md` (new rows), `docs/security.md` (threat rows and the "cannot protect" list from ADR 0004),
`docs/operations.md` (Access session and bypass paths, VAPID secrets and rotation, SW kill switch, API host, device
revocation, key rotation and recovery, Expo/APNs/FCM credentials, signing calendar), `CLAUDE.md` (API host,
`packages/*`, service worker files), the finder privacy notice EN/DE/ES (push services, end-to-end encryption, place
names resolved by the owner's device), `docs/design/system.md` (install card, offline states, encryption badges) and
`docs/plan.md` (phase checkboxes).
