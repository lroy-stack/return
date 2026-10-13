# 0005. Build the native owner app with Expo in a pnpm workspace and authenticate it by device pairing on a separate API host

- Status: accepted (2026-10-13, owner)
- Date: 2026-10-13
- Deciders: owner (lr0y); proposed by the architect agent

Markers: **[verified]** = read in official docs on 2026-10-13 · **[unverified]** = secondary source or needs a test.

## Context
- The owner wants an iOS + Android app with an iOS look (Liquid Glass) for tag management, NFC writing, QR scanning,
  push, an offline cache and the E2EE chat (ADR 0004). The owner is one person; finders never install anything.
- The API contract lives in `src/shared/*` (zod schemas and response types) and is shared by the Worker and the SPA.
  The repo is a single pnpm package; `pnpm-workspace.yaml` holds only build settings. Web uses React 19.3 and
  TypeScript 7.
- Owner auth today is Cloudflare Access (email OTP) on the whole app host; the Worker verifies the Access JWT
  (`auth/access.ts`). Access is a browser-cookie product: service tokens are static machine credentials, not per user;
  non-browser clients can send an application token in `cf-access-token`, obtained via `cloudflared access login`, valid
  for the session duration (≤ 1 month). Access for SaaS can act as an OIDC provider: PKCE is optional, the docs list a
  client secret as required, refresh tokens are supported except for hybrid/implicit flows; public clients and custom
  URL-scheme redirects are not documented **[verified]**.
- Finder access already uses the pattern "256-bit random token, only SHA-256 stored" (`newSecretToken`, `sha256Hex`).
- Expo: SDK 57 (2026-06-30, React Native 0.86, React 19.2); apps built with the iOS 27 SDK need the scene-based life
  cycle (opt-in on SDK 57, default on SDK 58) **[verified]**. Monorepos are first-class; pnpm isolated installs are
  supported from SDK 54; duplicate React versions inside one app break at runtime **[verified]**. Expo UI's SwiftUI and
  Compose APIs are stable since SDK 56 **[verified]**; `expo-glass-effect` (GlassView) exists since SDK 54
  **[verified]**; Expo Router native tabs give liquid-glass tabs on iOS **[verified]**.
- `react-native-nfc-manager` v4: New Architecture only (RN 0.76+), Expo config plugin, not loadable in Expo Go
  **[verified]**; NDEF writing on iOS uses Core NFC (iOS 13+) with the NFC Tag Reading capability **[unverified detail]**.
  `expo-camera` scans QR codes, and `launchScanner()` uses `DataScannerViewController` on iOS 16+ and Google's code
  scanner on Android **[verified]**.
- Apple: free Personal Teams get 7-day provisioning profiles, 3 devices, 10 App IDs **[verified]**; push is not
  available to Personal Teams and Core NFC fails with a sandbox restriction there **[unverified; Apple forums]**.
  Apple Developer Program USD 99/year **[unverified; secondary]**; ad hoc distribution allows 100 devices per product
  family per membership year **[verified]**, profiles last about a year **[unverified]**; TestFlight builds expire after
  90 days **[unverified]**.
- Android: apps installed with ADB need no developer verification; a free "limited distribution" account covers up to
  20 devices **[verified, Google FAQ]**.
- EAS Free: 15 iOS + 15 Android builds, low-priority queue, 45-min timeout; EAS Update code signing only on paid plans
  **[verified]**.

## Options considered
### Client technology
1. **No native app (PWA only, ADR 0002)** — zero new platform. Cons: no NFC writing on iPhone (Safari cannot write NFC;
   today a third-party app does it), iOS push depends on the standalone-login spike. Reversal: n/a.
2. **Expo (React Native) app in a pnpm workspace** — one language, shares the zod contract and `packages/e2ee`, native
   controls (system Liquid Glass), NFC/QR/push modules exist. Cons: Apple fee, yearly re-signing, SDK upgrades
   (roughly three a year). Reversal: cheap (stop shipping; the API host can be removed).
3. **Capacitor wrapper around the SPA** — reuses the web UI. Cons: web-rendered glass, not the system look; same
   code-delivery trust as the web for E2EE. Reversal: cheap.
4. **Swift + Kotlin** — best fidelity. Cons: two codebases, no shared contract. Rejected for a one-person project.

### Native authentication
- a. **Access service token** — one static secret in the app binary, not per user. Rejected.
- b. **Access cookie captured from a WebView, sent as `cf-access-token`** — fragile, expires with the session,
  login inside a WebView. Rejected.
- c. **Access for SaaS (OIDC + PKCE) in the system browser** — keeps identity in Access. Cons: public-client support and
  custom-scheme redirects are undocumented; still needs a host outside the self-hosted Access app; refresh logic and IdP
  configuration to maintain. Keep as the upgrade path.
- d. **Device pairing from the Access-protected panel** — the panel (already authenticated by Access) issues a one-time
  pairing QR; the app redeems it for a per-device bearer token (hash stored), revocable in the panel, used only on a
  dedicated API host. Pros: Access stays the only root of identity, reuses the hashed-token pattern, the same QR can carry
  the E2EE owner key. Cons: we own a small, security-critical flow.

## Decision
Client: **Option 2, Expo**. Auth: **option d, device pairing on `api.return.lr0y.dev`**. **Deciding factor for auth:**
Access has no documented way to give a native public client a per-user, revocable credential, while pairing roots every
device in an Access session and reuses a pattern this codebase already tests. What would change it: Cloudflare
documenting public-client PKCE with custom-scheme redirects and refresh tokens for Access for SaaS.

The native app is **gated**: build it only after the PWA and push have been used for some weeks and at least one of
these holds — iOS web push or standalone login proved unreliable, NFC writing through a third-party app is too
painful, or the owner wants the native experience enough to pay the yearly costs.

### Repository shape
```
/                      web: Worker + SPA (unchanged root package)
/packages/contract     zod schemas + types moved from src/shared/{schemas,settings}.ts (no React, no DOM)
/packages/e2ee         sealed-conversation crypto (ADR 0004)
/apps/mobile           Expo app (SDK 57+, own React 19.2 and TypeScript pin)
pnpm-workspace.yaml    packages: ["packages/*", "apps/*"] (root included implicitly)
```
Rules: shared packages are platform-neutral TypeScript with no React dependency; the mobile app never imports from the
root package. `src/shared/card` stays in the root until the app needs card export.

### Hosts and auth
| Host | Accepts | Rejects |
|---|---|---|
| `app.return.lr0y.dev` | Access JWT only (as today) | bearer tokens |
| `api.return.lr0y.dev` (new Custom Domain on the same Worker, **not** covered by any Access application) | `Authorization: Bearer <device token>` on `/api/*`; `POST /api/device/pair` unauthenticated | Access JWT/cookies, every other path |

The auth mechanism is chosen by host in `src/worker/index.ts` (`hostKind` gains `api`), never by which header is
present. Both mechanisms resolve to the same `ownerId`, so the owner API router and every `owner_id` filter are reused.
No CORS headers on the API host (native clients do not need them; browsers cannot read responses), unless ADR 0002's
iOS fallback (b) is activated, which allows exactly the app origin. Operations must never add a wildcard Access
application over `*.return.lr0y.dev`.

### Pairing protocol
1. Panel (Access): the browser generates a 256-bit secret `S` locally, computes `proof = HKDF(S, "return/v1/pair-auth")`
   and `wrap = HKDF(S, "return/v1/pair-wrap")`, and posts `POST /api/devices/pairings { verifier: SHA-256(proof),
   wrappedOwnerKey?: XChaCha20-Poly1305(wrap, ownerPrivateKey) }` → `{ pairingId, expiresAt }` (5 minutes, single use).
   It shows a QR `return-pair:1:<pairingId>:<base64url S>`; `S` never reaches the server.
2. App: scans the QR (`expo-camera` scanner), posts `POST https://api.return.lr0y.dev/api/device/pair { pairingId,
   proof, name, platform }`.
3. Worker: one conditional `UPDATE … SET redeemed_at = ? WHERE id = ? AND redeemed_at IS NULL AND expires_at > ?`,
   compares `SHA-256(proof)` with `verifier`, creates the device with a new `newSecretToken()` (stores only its hash),
   returns `{ deviceId, token, wrappedOwnerKey }`. Per-IP rate limit on this endpoint; failures are identical 404s.
4. App: stores the token and, after unwrapping with `wrap`, the owner private key in `expo-secure-store`
   (Keychain/Keystore, this-device-only, not backed up **[option names unverified]**).
5. Requests: `Authorization: Bearer <token>`; the Worker looks up `devices` by token hash, rejects revoked devices,
   updates `last_seen_at` at most hourly. Idle devices expire after 180 days.
6. Panel: `GET /api/devices`, `DELETE /api/devices/:id` (immediate revocation). On `401 device_revoked` the app wipes
   its token, keys and cache.

```sql
-- migrations/0005_devices.sql (sketch)
CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  platform     TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  token_hash   TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at   TEXT
);
CREATE TABLE device_pairings (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  verifier          TEXT NOT NULL,
  wrapped_owner_key TEXT,
  expires_at        TEXT NOT NULL,
  redeemed_at       TEXT,
  created_at        TEXT NOT NULL
);
```
`push_subscriptions` (ADR 0003) gains `device_id REFERENCES devices(id) ON DELETE CASCADE` for `expo` rows, so
revoking a device also stops its notifications.

### App scope (v1)
| Area | Decision |
|---|---|
| Navigation and look | Expo Router native tabs (system tab bar, Liquid Glass when built with the iOS 26+ SDK), `expo-glass-effect` only for floating chrome, Expo UI where a SwiftUI control is needed; semantic colours mirror `docs/design/system.md` tokens; follow the same rule: glass on chrome, never on content. Enable the scene-based life cycle before moving to the iOS 27 SDK. |
| Inventory, items, recoveries, tags | Existing owner API through `packages/contract`; responses validated with zod at the client boundary. |
| QR | `expo-camera` `launchScanner()`: scan a printed card → new owner endpoint `GET /api/tags/lookup?url=` (normalises the token, owner-scoped, 404 for foreign or unknown) → open that tag. Also scans pairing QRs. |
| NFC | `react-native-nfc-manager`: write one NDEF URI record with the tag URL, read it back, compare, then `PATCH /api/tags/:id { nfcStatus: 'verified' }` (the column exists). Never lock a chip (existing product rule). |
| Push | `expo-notifications` → Expo push token → `POST /api/push/subscriptions { channel: 'expo' }`; taps open the conversation in-app from `return.conversationId`; no universal links in v1. |
| Offline | `expo-sqlite` keeps the last response per resource (inventory, tags, conversation entries as ciphertext); read-only offline with a visible "offline" state; writes need the network. |
| Chat | `packages/e2ee`; the owner key arrives through pairing (or RK entry). |
| Updates | New binaries only; **no EAS Update (OTA)**: unsigned remote JS would re-open the code-delivery hole that the native app closes for E2EE, and update code signing needs a paid EAS plan. |

### Build and distribution
| Item | Decision |
|---|---|
| Builds | EAS Build Free for signed release builds (15 iOS + 15 Android per month is ample); local `npx expo run:ios` / `run:android` dev builds on the owner's Mac. Credentials managed by EAS, with an exported local copy kept with the off-account backups. |
| iOS | Apple Developer Program (needed for push and NFC). Ad hoc "internal distribution" to the owner's registered iPhone(s); rebuild before the profile expires (about yearly). TestFlight internal testing if more people ever need it (builds expire after 90 days). No App Store listing. |
| Android | Release APK installed with ADB (exempt from developer verification) or via the free limited-distribution account. No Play Console. |
| Push credentials | APNs key and FCM v1 service account uploaded to EAS for Expo Push; `EXPO_ACCESS_TOKEN` as a Worker secret. |
| Yearly cost | Apple USD 99; Android, EAS Free, Expo Push: USD 0 (Expo Push pricing not stated in its docs). |

## Consequences
- Easier: NFC writing and verification from the owner's phone, reliable native push, owner-side E2EE without
  server-delivered code, offline reading.
- Harder: a second deployable with its own release cadence; Expo SDK upgrades to keep pace with iOS (the iOS 27 scene
  requirement is the next one); a yearly Apple fee and re-signing; a new public host whose only gate is the device
  token (256-bit, hashed, revocable, rate-limited).
- Watch: pairing failures and redemptions (activity events `device.paired`, `device.revoked`), devices idle > 90 days,
  the build calendar (profile and certificate expiry reminders in operations).
- Tests: host-based auth matrix (Access JWT on the API host → 401; bearer on the app host → 401; revoked → 401;
  expired or reused pairing → 404); pairing proof never equals the wrap key; contract package compiles under the root
  TypeScript and the app's TypeScript.
- Spike before Phase 5: create `apps/mobile` from the Expo SDK 57 template inside the workspace, import
  `@return/contract`, build a dev client on a real iPhone, scan a QR, write and read back an NTAG213.

## Sources
- Cloudflare Access service tokens — https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- Cloudflare Access for SaaS, generic OIDC — https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/saas-apps/generic-oidc-saas/
- Cloudflare Access session management — https://developers.cloudflare.com/cloudflare-one/identity/users/session-management/
- Expo SDK 57 — https://expo.dev/changelog/sdk-57 · SDK 56 — https://expo.dev/changelog/sdk-56
- Expo monorepos — https://docs.expo.dev/guides/monorepos/
- Expo Router native tabs — https://docs.expo.dev/router/advanced/native-tabs/
- expo-glass-effect — https://docs.expo.dev/versions/v54.0.0/sdk/glass-effect/
- expo-camera — https://docs.expo.dev/versions/latest/sdk/camera/
- EAS pricing — https://expo.dev/pricing · EAS Update code signing — https://docs.expo.dev/eas-update/code-signing/
- react-native-nfc-manager — https://github.com/revtel/react-native-nfc-manager
- Apple membership comparison — https://developer.apple.com/support/compare-memberships/
- Apple device registration limits — https://developer.apple.com/help/account/devices/devices-overview
- Core NFC on a Personal Team (forum) — https://developer.apple.com/forums/thread/824273
- Android developer verification FAQ — https://developer.android.com/developer-verification/guides/faq
