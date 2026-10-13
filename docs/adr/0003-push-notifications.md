# 0003. Send content-free Web Push from the Worker with an in-house RFC 8291/8292 module; use Expo Push for native

- Status: accepted (2026-10-13, owner)
- Date: 2026-10-13
- Deciders: owner (lr0y); proposed by the architect agent

Markers: **[verified]** = read in official docs on 2026-10-13 · **[unverified]** = secondary source or needs a test.

## Context
- Today the only channel is email via the `send_email` binding (`services/notify.ts`): owner-only on Workers Free;
  emails to finders need Cloudflare Email Service on Workers Paid and are off. Notifications are strictly secondary
  (stored first, never throw), with caps: 30/h follow-ups, 45/h priority, one follow-up email per conversation per
  10 min. The owner email currently contains a message excerpt.
- Web Push on iOS/iPadOS 16.4+ works only for Home Screen web apps, permission must come from a user gesture, Apple
  Developer Program membership is not needed, and servers must allow `*.push.apple.com` **[verified]**. Declarative
  Web Push (iOS/iPadOS 18.4+): a JSON payload with `"web_push": 8030` and a `notification` dictionary (`title`,
  `navigate` required) is displayed without a service worker; an existing SW may rewrite it; every push must show a
  notification (`userVisibleOnly: true`); older browsers handle the same payload in their SW **[verified]**.
- Any Web Push payload must be encrypted for the browser (RFC 8291, `aes128gcm`) and requests are authenticated with
  VAPID (RFC 8292). Both need only ECDH/ECDSA P-256, HKDF and AES-GCM, all available in WebCrypto in Workers.
- Workers Free: 10 ms CPU and 50 subrequests per invocation **[verified]**. Push sending runs after the response in
  `waitUntil` (existing `defer`).
- Edge-compatible libraries exist: PushForge (MIT, zero deps, claims Workers support; ~66 GitHub stars, one
  maintainer, no audit) **[verified page]**; web-push-neo (depends on `jose`); `@negrel/webpush` (author warns it is
  not reviewed). The classic `web-push` package relies on Node APIs **[unverified]**.
- Expo Push Service: `POST https://exp.host/--/api/v2/push/send`, up to 100 messages per request, 600 notifications/s
  per project, optional "enhanced security" access token, receipts kept 24 h; Expo relays to APNs/FCM; pricing is not
  stated in the docs **[verified]**. Direct APNs needs HTTP/2 with an ES256 provider token; whether Workers' outbound
  fetch speaks HTTP/2 to APNs is **[unverified]**.
- ADR 0004 removes message content from the server's reach; notifications must therefore never depend on content.

## Options considered
1. **Email only (status quo)** — no work; slow, spam folders, finder email needs Workers Paid. Reversal: n/a.
2. **Web Push with an in-house module on WebCrypto** — no dependency, RFCs are frozen, official test vectors exist.
   Cons: ~150 lines of crypto glue to own and review. Reversal: cheap (drop subscriptions).
3. **Web Push via PushForge** — less code. Cons: low adoption, single maintainer, no review; we would still need the
   same RFC test vectors to trust it. Reversal: cheap.
4. **Third-party provider (OneSignal, Firebase web SDK)** — another account, a third-party script under our CSP, a
   provider that sees metadata and sometimes content. Rejected.
5. **Payload-less "tickle" push, SW fetches details** — avoids RFC 8291, but the fetch needs the Access cookie (fails
   when the session expired), every push must still show a notification, and Declarative Web Push needs a payload.
   Rejected.
6. **Native: Expo Push Service vs direct APNs + FCM** — Expo: one HTTPS JSON API and one token; direct: two credentials
   (APNs `.p8`, FCM service account), HTTP/2 from Workers unverified. Expo first; direct later behind the same adapter.

## Decision
Option 2 for the web, Expo Push Service for the native app (ADR 0005). **Deciding factor:** VAPID and `aes128gcm` are
small, frozen specs fully supported by WebCrypto in the Worker; owning them avoids a low-adoption dependency on the
path that tells the owner "someone found your bag", and RFC 8291's published example gives the same assurance a
library would. PushForge stays a reference implementation for review.

### Module boundaries
- `services/notify.ts` stays the single orchestrator: event → recipients → channels, caps, `notifications` log. It
  never throws (existing rule).
- `services/push/webpush.ts`: `buildPushRequest(subscription, payloadBytes, vapid, now) → Request` (encryption +
  VAPID) and `sendWebPush(...) → { ok } | { gone } | { error }`. Pure apart from WebCrypto and `fetch`.
- `services/push/expo.ts`: same result type for `ExponentPushToken[...]` targets.
- `db/push.ts`: subscription queries; every owner query filters by `owner_id`.

### Data model (`migrations/0003_push.sql`, sketch)
```sql
CREATE TABLE push_subscriptions (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  audience        TEXT NOT NULL CHECK (audience IN ('owner', 'finder')),
  conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,  -- finder subscriptions only
  channel         TEXT NOT NULL CHECK (channel IN ('webpush', 'expo')),
  endpoint        TEXT NOT NULL UNIQUE,  -- Web Push endpoint URL or Expo push token
  p256dh          TEXT,                  -- Web Push only
  auth            TEXT,                  -- Web Push only
  label           TEXT,                  -- "iPhone (Home Screen)", set by the client, owner only
  failures        INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT,
  created_at      TEXT NOT NULL,
  CHECK ((audience = 'finder') = (conversation_id IS NOT NULL))
);
CREATE INDEX push_subscriptions_owner ON push_subscriptions(owner_id, audience);
CREATE INDEX push_subscriptions_conversation ON push_subscriptions(conversation_id);
```
The existing `notifications` table logs pushes with `channel = 'push'` and `recipient` = subscription id (never the
endpoint URL, which identifies a device to its push service).

### Contracts
| Surface | Endpoint | Body / result |
|---|---|---|
| Owner (app host, Access) | `GET /api/push/config` | `{ vapidPublicKey }` |
| | `POST /api/push/subscriptions` | `{ endpoint, keys: { p256dh, auth }, label }` → `201 { id }`; upsert on `endpoint` (idempotent) |
| | `GET /api/push/subscriptions`, `DELETE /api/push/subscriptions/:id`, `POST /api/push/test` | list / remove / send a test |
| Finder (public host, existing CSRF, size and rate-limit guards, url-encoded) | `POST /c/:token/push` | `endpoint, p256dh, auth` → `204`; at most 3 per conversation |
| | `POST /c/:token/push/delete` | `endpoint` → `204` |
| Native (API host, ADR 0005) | `POST /api/push/subscriptions` | `{ channel: 'expo', endpoint: 'ExponentPushToken[…]', label }` |

Validation (zod at the boundary): endpoint `https:` only, ≤ 1024 chars, host in an allowlist (`fcm.googleapis.com`,
`updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`) **[allowlist to confirm in the
spike]** — the Worker must never POST to an arbitrary URL supplied by an anonymous finder; `p256dh` = 65-byte
uncompressed P-256 point (base64url); `auth` = 16 bytes.

### Payload (zod schema in the shared contract; ≤ 1 KB before encryption)
```json
{
  "web_push": 8030,
  "notification": {
    "title": "RETURN",
    "body": "New message about an item",
    "navigate": "https://app.return.lr0y.dev/conversations/<conversationId>",
    "lang": "en",
    "tag": "c-<conversationId>"
  },
  "return": { "v": 1, "kind": "new_message", "conversationId": "<conversationId>" }
}
```
- Content rule (all conversations, sealed or not): **never** message text, names, locations, place names or return
  plan details. The item name appears only if the owner turns on `notifications.push.showItemName` (default off: lock
  screens are public).
- Finder pushes say only "The owner replied" (finder's language) and navigate to `https://return.lr0y.dev/c/#s=<subscriptionId>`;
  a small static handler at `/c/` maps the subscription id to the private link stored on that device. The capability
  token and the E2EE key never leave the device and never enter a payload (the server only stores the token hash).
- Whether Safari tolerates the extra top-level `return` member is **[unverified]**; if not, move it into the
  notification `data` member or derive it from `navigate`.

### Sending semantics
- Trigger: after the row is committed, inside `waitUntil`; each push has `AbortSignal.timeout(5000)`.
- Headers: `TTL` 86400 (owner) / 43200 (finder); `Urgency: high` for `new_conversation` and `lost_item_scanned`,
  `normal` otherwise; `Topic: c<short id>` so a newer pending push for the same conversation replaces the older one.
- VAPID: ES256 JWT, `aud` = endpoint origin, `exp` = now + 12 h, `sub` = `mailto:` the notify address; cached per
  `aud` in isolate memory until 1 h before expiry. `VAPID_PUBLIC_KEY` (var), `VAPID_PRIVATE_KEY` (secret, PKCS#8).
  Never rotated except on compromise (rotation invalidates every subscription; runbook in operations).
- Results: 201/202 → `last_success_at`, `failures = 0`; 404/410 → delete the subscription; 400/413 → log as a bug;
  429/5xx/timeout → log failed, `failures + 1`, no inline retry (the next event notifies again); delete after 5
  consecutive failures spanning ≥ 24 h. Duplicate notifications are harmless (the `tag` collapses them), so no
  idempotency key is needed.
- Expo: same content rules; `Authorization: Bearer EXPO_ACCESS_TOKEN` (enhanced security on); a
  `DeviceNotRegistered` ticket deletes the subscription; receipts are not polled in v1.

### Caps and preferences
- Owner: the existing per-event toggles apply to every channel; new `notifications.push = { enabled, showItemName }`.
  Follow-up cooldown per conversation 2 min for push (email keeps 10 min); 60 pushes/hour per owner; first contact and
  lost-item scans bypass the cooldown but count toward the hourly cap; `mutedUntil` applies.
- Finder: ≤ 3 subscriptions per conversation (subscribe counts against `PUBLIC_WRITE_LIMIT`); one push per
  conversation per 5 min; only for owner replies, owner return plans and owner responses; subscriptions are deleted
  when the conversation is closed, blocked or deleted, and by retention.
- Email and push are independent channels; email stays on by default as the backstop.
- Badge: the owner SW sets `navigator.setAppBadge(unread)` where supported.

### Observability
`notifications` rows (channel, kind, status, error), the existing "recent notification failures" counter in System
status, structured logs with the conversation id and subscription id (never endpoints or payloads).

## Consequences
- Easier: the owner hears about a finder within seconds on the phone; finder push is a free substitute for paid finder
  emails; notifications already comply with ADR 0004 before E2EE ships.
- Harder: a new secret pair (VAPID), a new table with personal data (endpoints), and device-dependent behaviour.
  Finder privacy notices (EN/DE/ES) must say that the browser's push service (Apple, Google, Mozilla, Microsoft)
  delivers notifications and sees that one was sent, not its content.
- Watch: Worker CPU time for invocations that send pushes (measure with Workers observability; if the 10 ms Free limit
  is hit, move to Workers Paid at USD 5/month rather than weakening encryption); subscription churn (410s); iOS
  delivery after OS updates.
- Tests: RFC 8291's worked example as a deterministic unit test (fixed keys and salt injected); VAPID JWT verifies with
  the public key; endpoint allowlist rejects arbitrary hosts; a fake push service in vitest checks 410 cleanup, caps
  and that no payload contains message text.

## Sources
- WebKit, Web Push for Web Apps on iOS and iPadOS — https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
- WebKit, Meet Declarative Web Push — https://webkit.org/blog/16535/meet-declarative-web-push/
- RFC 8030 Generic Event Delivery Using HTTP Push — https://www.rfc-editor.org/rfc/rfc8030
- RFC 8291 Message Encryption for Web Push — https://www.rfc-editor.org/rfc/rfc8291
- RFC 8292 VAPID — https://www.rfc-editor.org/rfc/rfc8292
- Cloudflare Workers limits — https://developers.cloudflare.com/workers/platform/limits/
- PushForge — https://github.com/draphy/pushforge
- Expo, Send notifications with the Expo Push Service — https://docs.expo.dev/push-notifications/sending-notifications/
