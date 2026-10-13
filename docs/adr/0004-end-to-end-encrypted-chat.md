# 0004. Seal conversations with a per-conversation key carried in the finder's private link

- Status: accepted (2026-10-13, owner)
- Date: 2026-10-13
- Deciders: owner (lr0y); proposed by the architect agent

Markers: **[verified]** = read in official docs on 2026-10-13 · **[unverified]** = secondary source or needs a test.

## Context
- Today messages, shared locations and return plans are plaintext rows in D1 (`messages`, `shared_locations`,
  `proposals`). The Worker renders them into finder pages, puts message excerpts into owner emails, reverse-geocodes
  coordinates through Nominatim and caches results keyed by coordinates (`geocode_cache`), and writes nightly JSON
  backups to R2; D1 Time Travel keeps 7 days. `docs/security.md` lists "Cloudflare account compromise bypasses
  everything" as an accepted residual risk.
- Parties: one owner with several devices (laptop browser, phone PWA, later the native app); an anonymous finder whose
  only credential is the capability link `/c/<256-bit token>` (only its SHA-256 is stored). Finders may use a borrowed
  phone or open the link on two devices.
- First contact already requires JavaScript: the Turnstile widget produces the token the form must carry. A JS-only
  crypto path therefore does not reduce reachability.
- Web clients download their code from the server we want to be blind. Any web E2EE is only as trustworthy as the
  JavaScript served at the moment of use; the native app (ADR 0005) removes that for the owner side only.
- Libraries: `@noble/curves` (Trail of Bits audit of v2.3.0, Aug 2026; Cure53 audit of v1.6.0, 2024),
  `@noble/ciphers` (Cure53 audit of v1.0.0, 2024), both pure TypeScript, need only `crypto.getRandomValues`
  (polyfill on React Native) **[verified]**. `hpke-js` passes the RFC 9180 test vectors but is not audited and its core
  relies on WebCrypto **[verified]**; Hermes (React Native) has no `crypto.subtle`. WebCrypto X25519 shipped in
  Firefox 130, Safari (2025) and Chrome 133 **[unverified]**. libsignal is AGPLv3, has no browser build and "use outside
  of Signal is unsupported" **[verified]**. `ts-mls` (RFC 9420) exists, no audit found **[unverified]**.
- Nominatim usage policy: max 1 request/s, identify with Referer or User-Agent, cache results, no client-side
  autocomplete, prefer a proxy, apps must be able to switch the service at the OSMF's request **[verified]**.

### Threat model
| Adversary | Today | With sealed conversations |
|---|---|---|
| Someone holding a D1/R2 export or backup (leak, mis-scoped API token, stolen laptop with an off-account backup) | reads every conversation | sees metadata only |
| Cloudflare as operator, or a legal request for stored data | reads everything | metadata only (sealed conversations) |
| Passive compromise of the Worker (logs, read access) | reads everything | metadata only |
| Active compromise (malicious deploy, modified JS, operator injecting code) | everything | can steal keys from **web** clients on their next visit; the native owner app resists; the finder side never can |
| Holder of the full finder link | one conversation | same (the link now also carries the key) |
| Thief with an unlocked owner device | everything | everything on that device; revoke + rotate limit the future |

Quality attributes, ranked: (1) a stranger reaches the owner as fast as today, with no new step; (2) the server stores
no readable conversation content; (3) the owner reads on several devices and can recover after losing all of them;
(4) one person can maintain it for years.

## Options considered
1. **Sealed conversation key (HPKE key wrap + XChaCha20-Poly1305 per entry).** The finder's browser creates a random
   conversation key, keeps it in the link fragment and wraps it to the owner's public key. Pros: static key material
   fits a static link; one key per conversation; every runtime runs the same audited pure-TS primitives. Cons: no
   forward secrecy. Reversal: future conversations can go back to plaintext; sealed history stays sealed (by design).
2. **Static ECDH per conversation with WebCrypto (X25519 + HKDF + AES-GCM).** Same security shape as 1. Cons: needs a
   native crypto module on React Native (no `subtle` in Hermes), browser X25519 support is recent. Reversal: as 1.
3. **libsodium sealed boxes + secretbox.** Same shape, well-known API. Cons: WASM bundle on finder pages (bad networks)
   and a different native binding on React Native. Reversal: as 1.
4. **Signal Double Ratchet (X3DH/PQXDH).** Forward secrecy and post-compromise security. Cons: ratchet state changes
   with every message and cannot live in a static capability link; a finder using two devices breaks it; owner
   multi-device needs per-device sessions; libsignal is AGPLv3 with no browser build and unsupported outside Signal.
   Rejected.
5. **MLS (RFC 9420).** Group key agreement with devices as members. Cons: same mutable-state problem for an anonymous
   link holder, heavy, TS implementation unaudited. Rejected.

## Decision
Option 1, "sealed conversations v1". **Deciding factor:** the finder's only credential is a static link, so the key
material must be static too; a per-conversation key in the link fragment is the simplest construction that keeps the
server blind without adding any step for the finder. Forward secrecy is traded away explicitly and mitigated by
retention and key rotation.

The UI calls it "end-to-end encrypted" with a one-line honest explainer: "RETURN's server stores only encrypted
messages. Like any website, it relies on the code your browser downloads from RETURN."

### Construction
| Element | Choice |
|---|---|
| Owner key (OK) | One active X25519 key pair per owner. The private key lives only on enrolled devices, plus one server copy wrapped by the recovery key. |
| Recovery key (RK) | 128 random bits shown once as 26 Crockford base32 characters (same alphabet and look-alike normalisation as tag tokens). KEK = HKDF-SHA256(RK, salt = owner key id, info `return/v1/recovery`); private key wrapped with XChaCha20-Poly1305. RK is never stored by RETURN. |
| Conversation key (CK) | 32 random bytes generated by the finder's browser at first contact. |
| Key wrap | HPKE base mode (RFC 9180), suite DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 / ChaCha20Poly1305, `info` = `return/v1/ck` ‖ owner key id; one wrap per active owner key. |
| Entries | XChaCha20-Poly1305 under CK, random 24-byte nonce, AAD = `return/v1` ‖ entry id ‖ author ‖ type. Plaintext = JSON padded to a multiple of 256 bytes. Envelope = base64url(`0x01` ‖ nonce ‖ ciphertext). Entry ids (UUIDv4) are generated by the client, so AAD is fixed before upload and retries are idempotent. |
| Finder key storage | URL fragment `#k=<base64url CK>` (fragments are never sent in requests or Referer headers) plus `localStorage` on the public origin. The link is the credential, as today. |
| Owner key storage | Web: IndexedDB of that origin/app (the installed PWA has its own storage on iOS, so it is enrolled separately). Native: Keychain/Keystore via `expo-secure-store`, this-device-only (ADR 0005). |
| Code | New workspace package `packages/e2ee`: pure functions over `@noble/curves`, `@noble/hashes`, `@noble/ciphers`; HPKE single-shot Seal/Open implemented there and pinned to the RFC 9180 test vectors for this suite. Same code in browsers, workerd (tests) and Hermes. Finder pages load it as one bundled same-origin module from `/p/` (CSP unchanged). |

### Data model (`migrations/0004_sealed_conversations.sql`, sketch; the implementer verifies each `ALTER` on D1)
```sql
ALTER TABLE conversations ADD COLUMN encryption TEXT NOT NULL DEFAULT 'none'
  CHECK (encryption IN ('none', 'sealed-v1'));
ALTER TABLE messages         ADD COLUMN sealed TEXT;
ALTER TABLE shared_locations ADD COLUMN sealed TEXT;
ALTER TABLE proposals        ADD COLUMN sealed TEXT;

CREATE TABLE owner_keys (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  public_key      TEXT NOT NULL,          -- base64url X25519
  wrapped_private TEXT NOT NULL,          -- XChaCha20-Poly1305 under the recovery KEK
  suite           TEXT NOT NULL DEFAULT 'sealed-v1',
  status          TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  created_at      TEXT NOT NULL,
  retired_at      TEXT
);
CREATE UNIQUE INDEX owner_keys_one_active ON owner_keys(owner_id) WHERE status = 'active';

CREATE TABLE conversation_keys (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  owner_key_id    TEXT NOT NULL REFERENCES owner_keys(id) ON DELETE CASCADE,
  wrapped_key     TEXT NOT NULL,          -- HPKE enc ‖ ciphertext, base64url
  created_at      TEXT NOT NULL,
  PRIMARY KEY (conversation_id, owner_key_id)
);
```
Sealed rows keep neutral values in the plaintext columns (`messages.body = ''`, `proposals.kind = 'other'`,
`proposals.place = ''`, `shared_locations.source = 'manual'`, all other content columns NULL,
`conversations.finder_name` NULL — the name travels inside the first sealed message). This keeps the existing state
machine, daily caps, cascades, retention and export working unchanged. Domain rule: a `sealed-v1` conversation
accepts only sealed input and a `none` conversation only plaintext input (422 otherwise).

### Contracts (zod in the shared contract package)
- Envelope: `z.string().regex(/^[A-Za-z0-9_-]+$/).max(12_000)`; entry `{ id: uuid, type: 'message' | 'location' |
  'proposal', sealed }`.
- Decrypted payloads, parsed with zod **after** decryption (it is untrusted input): message `{ body ≤ 4000, name? ≤ 80 }`;
  location `{ source, label?, lat?, lng?, accuracyM?, place? }`; proposal `{ kind, place, lat?, lng?, meetAt?,
  instructions?, resolvedPlace? }`.
- Owner API (Access or device auth): `GET /api/e2ee/keys`; `POST /api/e2ee/keys` (setup or rotation, one atomic batch:
  new active key, retire the old one, re-wrapped conversation keys); `POST /api/conversations/:id/entries` (idempotent
  on `id`); `ConversationDetail` and list summaries gain `encryption`, `wrappedKeys[]` and per-entry `sealed`.
  Proposal responses (`accept/decline/cancel`) are unchanged.
- Finder (public host; existing CSRF, size, rate-limit and Turnstile guards; url-encoded): `POST /t/:token/contact`
  adds `sealed_message`, `sealed_location?`, `wrapped_key`, `owner_key_id`, entry ids and answers JSON
  `{ url: "/c/<token>" }` to the script (errors as JSON with localized messages; the typed text stays in the form);
  `GET /c/:token/entries.json?after=`; `POST /c/:token/entries`.

### Flows
1. **Setup** (panel, once): the browser generates OK and RK, shows RK with "save it in your password manager or print
   it", asks the owner to retype the last group, uploads `{ publicKey, wrappedPrivate }`. From then on tag pages embed
   the active public key and its id.
2. **Add a device**: type or paste RK → download the wrapped private key → unwrap locally. Native devices receive it
   through the pairing QR instead (ADR 0005).
3. **First contact**: the tag page script creates CK, seals the message (and optional location), wraps CK to the owner
   key, posts; then navigates to `/c/<token>#k=<CK>` and stores CK in `localStorage`. The `__Host-rc` cookie still
   finds the conversation from the tag page; the script appends the stored key.
4. **Finder conversation page**: server-rendered shell plus sealed entries in a JSON data block (non-executable, allowed
   by the CSP); the script decrypts and renders with `textContent`. Without the key it explains: "Open this
   conversation with your full private link". Polling stays (`state.json`), fetching only new entries.
5. **Owner read/write**: unwrap CK with OK (cached in memory for the session), decrypt, validate, render; inbox
   previews are decrypted on the device. Writes are encrypted on the device.
6. **Place names**: the owner's device resolves names directly from Nominatim on an explicit action (button, never on
   load, never autocomplete), at most 1 request/s, caches locally, shows "© OpenStreetMap contributors". The owner's
   place search runs on the device too (a server-side search would reveal the meeting place). Owner return plans carry
   the chosen place name inside the envelope, so finders never geocode. The geocoder base URL comes from
   `/api/system`, so the service can be switched without an app update.
7. **Rotation / lost device**: from a device that holds the current key: create OK2 (and a new RK if the old one may be
   exposed), re-wrap every conversation key, retire OK1 — one atomic request. Native devices are revoked first
   (ADR 0005). Data already on the lost device cannot be recalled.
8. **Total key loss** (all devices and RK lost): sealed history is unreadable for the owner. The panel offers "Close and
   ask the finder to write again", which closes the conversation with a server-written notice; the finder can start a
   new conversation from the tag. Finders are never asked to re-wrap automatically (a database-level attacker could
   abuse that to obtain keys).
9. **Detection**: each owner device compares the server's active public key with its own on start and alarms on a
   mismatch or on any conversation key it cannot unwrap (a swapped public key would show up as unreadable new
   conversations).

### What changes or breaks
| Feature | Today | Sealed |
|---|---|---|
| Owner email / push text | message excerpt | no content: "New message about your <item>" (email), generic push (ADR 0003) |
| Finder email (Workers Paid only) | private link + reply notices | reply notices only; the link cannot be emailed (the server would learn the key); finders keep the link, install, or enable push |
| Finder page without JavaScript | readable | needs JavaScript (first contact already does); shows the printed-email fallback |
| Server-side abuse checks | none on content; caps, Turnstile, IP-HMAC blocks | unchanged; envelope size limits; the owner still blocks |
| Owner search / previews | previews from SQL | previews and any future search on the device |
| Export / backups | plaintext JSON | envelopes, wrapped keys and `owner_keys` (`EXPORT_VERSION` 2); readable only with RK; restore unchanged |
| Place names | server reverse-geocodes, caches by coordinates | owner device geocodes on request; server never sees sealed coordinates |
| Return plans | plaintext | content sealed; status and the recovery move to `returning` stay server-side |
| Activity log | `proposal.created { kind }` | no `kind` for sealed plans |
| Legacy conversations | — | stay plaintext, labelled "Not end-to-end encrypted", removed by retention; the plaintext render path is deleted when none remain |

### What the server still sees (metadata)
That a conversation exists and for which tag and item; the time, author side (finder/owner), type
(message/location/plan) and 256-byte size bucket of every entry; plan status changes; read markers; the finder's email
address if given, language, IP at request time (stored only as an HMAC) and scan country; Turnstile outcomes;
notification events; push endpoints; owner public keys and the number of enrolled native devices. Cloudflare
additionally sees IP addresses and timing of all traffic.

### What this cannot protect
1. A compromised server or operator that serves modified JavaScript can take keys from web clients: always on the
   finder side, on the owner side unless the owner uses the native app.
2. Anyone with the full finder link reads and writes that conversation.
3. Compromised endpoints: an unlocked phone, malware, an XSS bug in the panel.
4. Metadata and traffic analysis (list above).
5. No forward secrecy or post-compromise security: the owner private key plus stored ciphertext opens every
   conversation wrapped to it. Retention deletes ciphertext; rotation limits the window.
6. The server can drop, delay or replay entries (it cannot forge or alter them).
7. History that was plaintext before enabling, including copies in D1 Time Travel (7 days), nightly R2 backups
   (30 days) and off-account backups (until the owner deletes them).
8. A leaked recovery key.
9. The finder remains anonymous and unverified, as today.

### Migration
Production may hold zero or very few real conversations (the first real tag scan is still pending in `docs/plan.md`);
count them before enabling. No retroactive sealing: those finders' links have no key fragment and the server already
saw the text. After enabling, new conversations are always sealed; delete off-account plaintext backups if desired.

## Consequences
- Easier to defend: a database or backup leak no longer exposes what finders wrote, where they were or where the
  hand-over happens.
- Harder: finder pages become script-driven for conversations; key setup, recovery-key custody and device enrollment are
  new owner duties; email previews and server geocoding go away; debugging content issues requires the owner's device.
- Watch: decrypt failures per device (alarm), finder "missing key" page views, envelope sizes, bundle size of the
  finder module (target ≤ 40 KB gzipped).
- Tests: RFC 9180 vectors for the chosen suite; round-trip and tamper tests (flipped AAD fields, swapped entries between
  conversations fail); a canary test that writes a known string through the finder and owner paths and asserts it
  appears in no D1 column and no export; RK recovery on a fresh browser; Playwright journey finder → owner → finder on
  two owner devices.
- Review: independent `code-reviewer` and `/security-review` passes on `packages/e2ee` and the key flows before
  enabling in production.

## Sources
- RFC 9180 Hybrid Public Key Encryption — https://www.rfc-editor.org/rfc/rfc9180
- RFC 7748 (X25519) — https://www.rfc-editor.org/rfc/rfc7748 · RFC 5869 (HKDF) — https://www.rfc-editor.org/rfc/rfc5869
- XChaCha20-Poly1305 (CFRG draft) — https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha
- noble-curves (audits) — https://github.com/paulmillr/noble-curves
- noble-ciphers (audit, managed nonces) — https://github.com/paulmillr/noble-ciphers
- hpke-js — https://github.com/dajiaji/hpke-js
- libsignal — https://github.com/signalapp/libsignal
- ts-mls README — https://cdn.jsdelivr.net/npm/ts-mls@1.6.2/README.md
- WebCrypto secure curves status (Igalia) — https://blogs.igalia.com/jfernandez/?p=1913 · Chrome X25519 in M133 (WebKit bug note) — https://bugs.webkit.org/show_bug.cgi?id=284368
- react-native-quick-crypto WebCrypto coverage — https://crypto.margelo.com/docs/api/subtle
- Nominatim usage policy — https://operations.osmfoundation.org/policies/nominatim/
