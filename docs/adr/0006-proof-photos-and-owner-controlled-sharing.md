# 0006. Guide a proof photo set per item and share watermarked copies with one finder only through revocable, conversation-scoped grants

- Status: accepted (2026-10-14)
- Date: 2026-10-14
- Deciders: owner (lr0y); proposed by the architect agent

Markers: **[verified]** = read in official docs or primary sources on 2026-10-14 · **[unverified]** = secondary source,
inference, or needs a test.

## Context

### The request
The owner wants (1) at least four mandatory photos per item of luggage, to compare against a found object, and (2) a way
to show those photos to the person who found the item, only when the owner decides, as proof that it is the same
object, "securely and impenetrably".

### What is true today (code, 2026-10-14)
- Photos are `item_files` rows with `kind = 'photo'` (`migrations/0001_initial.sql`), bytes in the private R2 bucket under
  `owners/<ownerId>/items/<itemId>/<fileId>` (`db/files.ts`). Upload: `POST /api/files` (`api/files.ts`), 8 MB limit, type
  decided by magic bytes, JPEG/PNG/WebP only for photos, and `lib/strip-metadata.ts` keeps only image-defining
  segments/chunks (EXIF/GPS, XMP, IPTC, MPF, text and trailing data never reach storage). The panel also re-encodes
  before upload (`src/app/lib/image.ts`: max 1600 px, JPEG 0.85, canvas drops metadata).
- Photos are served only to the owner via `GET /api/files/:id` (Access JWT + `owner_id` filter, prefix check on the R2
  key, `Cache-Control: private, max-age=3600`). The one public photo is `items.public_photo_id`, served by
  `GET /t/:token/photo` (`public/tag-routes.tsx`) with `private, max-age=300` and `default-src 'none'`.
- Finders have no account. Their credential is `/c/<43-char base64url, 256-bit token>`; only `sha256Hex(token)` is
  stored (`conversations.finder_token_hash`), plus the `__Host-rc` cookie to reopen the conversation from the tag page.
  Finder routes use `capabilityHeaders` (noindex, `Referrer-Policy: same-origin`, default `no-store`, strict CSP with
  `img-src 'self' data: blob:`) and the per-IP `readBudget` (60/min) and write budget (10/min) (`lib/http.ts`,
  `lib/ratelimit.ts`, `public/support.tsx`).
- Conversations are `open | closed | blocked`; `closeConversation`, `blockConversation`, `deleteConversation` live in
  `domain/conversations.ts`. Retention deletes closed conversations (`services/maintenance.ts`). `ON DELETE CASCADE`
  removes rows but never R2 objects.
- The finder conversation page is becoming one chronological timeline (`public/timeline.tsx` and the
  `/c/:token/timeline` polling endpoint, in progress in the working tree). Entry kinds today: message, place, plan.
- Backups: nightly JSON export to R2 without file bytes (`db/export.ts`); the off-site runbook mirrors the whole bucket
  with rclone (`docs/operations.md`).
- ADR 0004 (sealed conversations, per-conversation key `CK` in the finder link fragment) is accepted but not built.
  ADR 0002's finder service worker (scope `/c/`) is not built yet.
- Migrations: `0001`–`0005` are applied; `migrations/0006_owner_locations.sql` exists in the working tree (parallel
  change). **This ADR therefore uses `0007_proof_photos.sql`.** The sketches in ADR 0004 (`0004_sealed_conversations`)
  and ADR 0005 (`0005_devices`) name numbers that are already taken and must be renumbered when implemented.
- Product constraint (owner direction): the quick card must work at an airport in a few taps
  (`src/app/components/QuickCardFlow.tsx`).

### External facts
- **R2 presigned URLs:** served only from the S3 endpoint `<ACCOUNT_ID>.r2.cloudflarestorage.com`, "cannot be used with
  custom domains", expiry 1 s to 7 days, "Treat presigned URLs as bearer tokens", "Anyone with the URL can perform the
  specified operation until it expires" (no per-URL revocation is documented), signing needs an R2 Access Key ID +
  Secret **[verified]**. The EU-jurisdiction S3 hostname (`<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`) is
  **[unverified]**.
- **R2 public access:** "By default, buckets are never publicly accessible" **[verified]**; Wrangler 4.150 has
  `r2 bucket dev-url get`, `r2 bucket domain list` and `r2 bucket lifecycle add <bucket> <name> <prefix> --expire-days N`
  **[verified locally with `wrangler --help`]**.
- **Cloudflare Images binding:** `.input()` (≤ 20 MB), `.transform()`, `.draw()` overlays, `.text()`, `.output()`;
  billed per unique transformation; under the Vitest integration the offline mode "supports only `width`, `height`,
  `rotate`, and `format`", so overlays cannot be tested locally **[verified]**.
- **Workers Paid:** 30 s default CPU per request (max 5 min), 128 MB memory per isolate **[verified]**.
- **Browser detection APIs:** BarcodeDetector is "Limited availability" / experimental and disabled by default in
  Safari **[verified: MDN, caniuse]**; Chrome lists FaceDetector and TextDetector as not launched **[verified]**. No
  cross-browser, third-party-free automatic face/text detection exists on the web today.
- **Pixelation and blur are reversible for text:** Bishop Fox's Unredacter (2022) recovered pixelated text; later ports
  handle Gaussian blur; the recommended practice is opaque boxes **[unverified: news coverage of the primary post]**.
- **Hotlinking and indexing controls:** `Cross-Origin-Resource-Policy: same-origin` makes browsers block `no-cors`
  cross-origin loads such as `<img>` **[verified: MDN]**; `X-Robots-Tag: noimageindex` is honoured by Google and works on
  image responses **[verified]**; Fetch Metadata resource isolation (reject `Sec-Fetch-Site: cross-site`, allow missing
  headers) **[verified: web.dev]**.
- **Capability URLs (W3C TAG):** ≥ 120 bits, HTTPS, "should expire", owners can revoke, rate-limit the URL space, no
  third-party scripts, expired → 404 or 410 **[verified]**. OWASP Authorization: deny by default, "Permission should be
  validated correctly on every request" **[verified]**. OWASP IDOR: random ids are defence in depth, never a substitute
  for per-object checks **[verified]**. NIST SP 800-63B-4 bounds every authenticated session with both an overall and
  an inactivity timeout and leaves the values to the risk of the application **[verified: structure; exact values per
  AAL not checked]**; by analogy, a grant needs a hard expiry even while it is being used. OWASP File Upload: allowlist, signature check, "decode and re-encode ...
  explicitly removing unnecessary metadata", generated names, size limits, handler-mapped downloads **[verified]**.
- **Proof-of-ownership practice:** lost-property desks release items only against a description of details only the
  owner knows, serials or receipts, and treat discrepancies as red flags **[unverified: airport pages and guides]**. The
  FBI (El Paso field office, via local news) advises asking a self-declared finder for "a detail ... that wasn't
  included in the photo or flyer", and flags scammers re-using the owner's own posted photo; the BBB advises leaving
  unique features out of public posts so they can be used to verify a claim **[unverified: secondary reports]**.
  Upfront "reward" or "shipping" fees are the common scam **[unverified]**.
- **Possession proofs in marketplaces:** trading communities require a photo with a handwritten username and date, at
  most 7 days old, so stolen or stale photos cannot pass **[unverified: mirror of r/hardwareswap rules]**.
- **Watermarking shared copies:** the French state's Filigrane Facile and the Dutch government's KopieID app watermark
  copies with recipient, purpose and date (KopieID also lets you black out fields); both state that a watermark deters
  and traces misuse but is not a protection **[unverified: France Travail page, app listings]**.
- **What photos leak:** boarding pass barcodes carry name, record locator and frequent-flyer number, enough to take over
  bookings (Krebs, 2015) **[unverified URL; content via secondary coverage]**; house keys can be duplicated from
  photographs (Laxton, Wang, Savage, CCS 2008) **[verified: paper]**; EXIF GPS has exposed people's locations (McAfee,
  2012) **[secondary]**. Apple's Share Item Location links expire after 7 days or when the item is found (already in
  `docs/decisions.md`) **[verified 2026-10-13]**.

### Quality attributes, ranked
1. **Nothing private leaves without an explicit owner action, and nothing shared outlives the owner's intent**:
   scoped to one conversation, expiring, revocable, audited.
2. **A stranger still reaches the owner as fast as today**: no new step for finders; item creation and the quick card
   keep their speed.
3. **The proof is useful**: the owner can compare what a finder describes or shows; a holder can recognise the item.
4. **The same design survives sealed conversations (ADR 0004)** without a second rebuild.
5. **One person can maintain it**: no new dependency, no new secret, no new Cloudflare product.

## Owner decisions (2026-10-14)
1. Proof photos are guided, never blocking: slots + "proof set incomplete" badge + inventory filter; item creation,
   the quick card and "mark as lost" are never blocked. Per-category minimums as proposed (luggage: 4).
2. The label/serial photo is never shared through the chat; it is shown only in the "Show in person" mode.
3. Detail, inside and label photos can never become the tag's public photo.
4. A verification question for the finder is a suggestion with a risk reminder, not a gate.
5. Grants default to 24 h, maximum 7 days; the watermark does not include the finder's name; finder-to-owner photos
   wait for sealed conversations (ADR 0004).
6. Migration `0007_proof_photos.sql` (0006 is taken by owner locations).

## Options considered

### A. The proof photo set
1. **Hard rule at creation** (an item cannot be saved with fewer than four photos). Pros: guarantees photos. Cons:
   breaks the airport quick card, restore/import and API scripts; invites four throwaway photos; makes no sense for keys
   or a wallet. Reversal: cheap, but the friction lands on day one. **Rejected.**
2. **Hard gate before "mark lost" or before tag export.** Cons: once an item is lost it can no longer be photographed,
   so blocking the lost report punishes the owner at the worst moment; a gate on tag export is the airport flow again.
   **Rejected.**
3. **Guided slots with a server-computed completeness status and soft gates** (slots: overall, other side, distinctive
   detail, interior; private label slot; extras). Pros: the rule "four for luggage" becomes visible and measurable
   without blocking any urgent flow; slots make photos comparable; category-aware. Cons: the owner can ignore the
   badge. Reversal: cheap (nullable columns). **Chosen.**

### B. Sharing photos with a finder
1. **(a) Per-conversation share grant served through the Worker.** The owner's device renders downscaled, redacted,
   watermarked copies; the Worker stores them in R2 and serves each byte only to a request that carries the finder's
   existing conversation capability while the grant is active. Pros: every request is checked (expiry, revocation,
   conversation state); first view and view counts are observable; no new credential; headers fully controlled
   (no-store, CORP, noindex); works without JavaScript on the finder page. Cons: the server and backups see the
   watermarked copies in plaintext until sealed conversations ship. Reversal: cheap.
2. **(b) R2 presigned URLs.** Pros: no Worker bandwidth. Cons: bearer URLs that work alone, from any device, until
   expiry, with no documented per-URL revocation; need an S3 key pair as a Worker secret that can sign reads for every
   object in the bucket (invoices, backups); expose the account id and a third hostname that the finder CSP must allow;
   cannot set CORP, `X-Robots-Tag` or `Referrer-Policy`; no per-view audit. Reversal: cheap, but the signing secret is a
   standing liability. **Rejected.**
3. **(c) Sealed proof photos (ADR 0004).** The owner's device encrypts each rendition under the conversation key `CK`;
   the finder page decrypts with the fragment key and shows a `blob:` URL (already allowed by the CSP). Pros: the server,
   D1/R2 exports and backups see only ciphertext. Cons: needs ADR 0004 first; needs JavaScript on the finder page;
   revocation stops further fetches only (true for every option). Note: it does **not** hide the photos from the
   server, which already stores the originals in plaintext as inventory; it hides which photos were shown to whom.
   Reversal: same as ADR 0004. **Chosen as stage 2**, not available now.
4. **(d) In-person presentation mode** (full-screen viewer of the proof set in the panel). Zero data leaves the device;
   matches how lost-property desks verify claimants. A complement, not an alternative. **Chosen in addition.**

Sub-decisions inside (a):
- *Where the shared copy is made.* **Owner device (canvas)** vs **Cloudflare Images binding** (`draw`/`text`) vs **WASM
  image library in the Worker**. The Images binding cannot run under sealed conversations (the server must not see the
  plaintext), its overlays cannot be tested locally, and it adds a product and billing line; a WASM codec adds a
  dependency and memory pressure (128 MB). The owner device already re-encodes every upload and is the trusted
  principal, so a server cannot add assurance against it. **Owner device.**
- *Credential in the image URL.* **Conversation token** vs **a new per-share token** (`/s/<shareToken>/...`). A per-share
  token would be a second bearer URL that works alone; the finder already holds the conversation capability. **Conversation
  token**, no new secret.
- *Binding views to the first device* (cookie). Defeats link forwarding after the first view but breaks finders who use
  two devices (ADR 0004 already accepts this) and does nothing against the main threat (a dishonest finder). **Rejected.**

### C. Direction of proof
1. **Owner → finder only.** What was asked. Risk: a "finder" who only photographed the QR (accepted risk in
   `docs/decisions.md`) receives exactly the details needed to fake possession or to claim the bag elsewhere.
2. **Finder → owner only** (possession check). Matches the advice to ask a claimed finder for an unseen detail. Does not
   help when a holder (hotel desk, airline, police lost property) wants the owner to prove ownership.
3. **Both, possession first.** **Chosen**, see Decision.

## Decision

**Proof set: option A3. Sharing: option (a) now, built so that (c) replaces only the byte format when sealed
conversations ship, plus the in-person mode (d). Direction: both, possession first.**

**Deciding factor:** revocation, expiry and audit only exist if the Worker is on every read, and rendering the shared
copy on the owner's device is the only pipeline that stays unchanged when the server must become blind (ADR 0004).
Presigned URLs fail the first condition; server-side image processing fails the second.

What would change it: sealed conversations shipping before this work starts (then build (c) directly and never ship
the plaintext path); a spike showing canvas rendering is unreliable on iOS Safari (then Images binding for plaintext
conversations only); evidence that finders cannot load the photos within the read budget (then a dedicated limiter).

### Why both directions, and in this order
- The tag already binds the channel to the owner: only the owner could have registered it. A finder rarely needs proof
  that they are talking to the owner. The owner, however, needs proof that the other person holds the item, because a
  QR can be photographed at a check-in queue. Lost-property practice is that the side being verified never reveals the
  details first.
- So RETURN recommends **possession first**: the owner asks the finder for a detail only someone holding the item can
  see (v1: a localized question template sent as a normal message; stage 3: a photo reply, see below), compares the
  answer with the private proof set, and only then, if a holder asks for it, shares proof photos.
- **Owner → finder** sharing remains available at any time (the owner decides). It covers the legitimate case where an
  institution or a careful finder asks the owner to prove ownership. The share sheet shows a one-line nudge when the
  finder has not answered a check yet; it never blocks.
- **Finder photo replies are gated on sealed conversations.** A finder's photo can show their face, home or workplace;
  building a plaintext anonymous upload path now would store exactly the content ADR 0004 is meant to keep from the
  server, and would then need a migration. Until then the finder answers in text, or uses the printed fallback email.

### Proof set model
| Slot | Purpose | Required for | Can be the public tag photo | Can be shared with a finder |
|---|---|---|---|---|
| `overall` | Front / whole item | every category | yes | yes |
| `reverse` | Other side / back | luggage, electronics, clothing, other | yes | yes |
| `detail` | Distinctive mark, damage, sticker, repair | every category except keys | **no** | yes, with a caution |
| `interior` | Lining, organiser, inside pocket (never documents) | backpack, suitcase, bag | **no** | yes |
| `label` | Serial / model label | never required (recommended for electronics) | **no** | **never** (show in person only) |
| `extra` | Up to 4 more | — | yes | yes |

- Required slots per category live in one pure function `requiredSlots(category)` in `src/shared/proof.ts`, used by
  the panel and the Worker. Defaults: backpack/suitcase/bag → `overall, reverse, detail, interior` (the owner's "four
  for luggage"); laptop/tablet/phone/camera/headphones → `overall, reverse, detail`; clothing/other →
  `overall, reverse, detail`; wallet/documents → `overall, detail`; keys → `overall` only, with a warning to keep the
  blade out of frame.
- **Completeness is computed, never stored**: `proofStatus(category, files) → { required, filled, missing, complete }`.
- **Enforcement (soft everywhere, hard nowhere):** completeness badge on the item card and item page ("Proof photos
  2/4"); inventory filter `proof=incomplete`; overview card "N tagged items without a complete proof set"; an optional
  step after the quick card is exported ("Add proof photos now, about one minute" / "Later"); the mark-lost sheet shows
  "Add any photos you already have (camera roll, purchase listing)" when incomplete. Item creation, tag export, mark
  lost and every finder path never wait for photos.
- **Capture:** each slot opens the camera (`<input type="file" accept="image/*" capture="environment">`) with a
  one-line tip. Proof slots keep detail: the client resizes to max **2560 px** (gallery photos stay at 1600), JPEG 0.85.
- **Server validation** (in addition to the existing 8 MB, magic-byte and metadata-stripping rules): a slot accepts
  only `kind = 'photo'` of the same item; dimensions read from the header (JPEG SOFn, PNG IHDR, WebP VP8/VP8L/VP8X) by
  a pure `imageDimensions(bytes)` in `lib/image-info.ts`; long side ≥ **1024 px** and short side ≥ **480 px**, else
  `422 photo_too_small`. Assigning a photo to an occupied slot moves the previous photo out of the slot (it stays in the
  gallery), atomically. Setting a `detail`/`interior`/`label` photo as the public photo, or moving the current public
  photo into one of those slots, fails with `422 photo_not_public`: a verification detail that is public is worthless
  (BBB, FBI advice above).
- **Never in proof photos** (per-slot tips, plus a checklist the first time the owner shares): address labels and
  luggage name tags, airline bag tags and boarding passes (barcodes carry name and booking reference), passport/ID
  pages, payment cards, people's faces, house key blades, unlocked screens or notifications, and the RETURN tag or QR
  itself (it is a capability and proves nothing).
- **No automatic blur in v1.** The web has no cross-browser, on-device face or text detector, and sending photos to a
  detection service would add a processor. Instead the share sheet offers **manual opaque boxes**, burned into the
  shared copy only (originals stay intact and private); never blur or pixelation, which can be reversed for text. The
  native app (ADR 0005) may later *suggest* boxes from on-device detection (Apple Vision / ML Kit) **[unverified for
  Expo]**, never apply them silently.
- **Storage and retention:** proof photos are ordinary `item_files` (same key layout, same backups, same deletion with
  the item). Export rows gain `proof_slot`, `width`, `height`, optional on import (the existing "added after the first
  exports shipped" pattern), so `EXPORT_VERSION` does not change.

### Share grant model (stage 1, plaintext conversations)
**Lifecycle:** `active → revoked | expired`. A grant is effective only while `status = 'active'`, `expires_at > now`, the
conversation is `open` and the item is not archived. All four are checked on every request; the nightly job only
cleans up.

**Rendition pipeline (owner device, `src/app/lib/proof-render.ts`):**
1. Download the original through `/api/files/:id`; decode with `createImageBitmap(..., { imageOrientation: "from-image" })`.
2. Downscale to **1280 px** long side.
3. Paint the owner's redaction boxes as opaque fills.
4. Paint the watermark (layout from the pure `watermarkLayout()` in `src/shared/proof.ts`):
   - a solid footer band (≥ 7 % of the height, min 48 px) with two lines in the finder's language:
     "RETURN · Shared with the finder only · 2026-10-14" and "Ref 7KQ2-M9XH · Not valid as proof of ownership for anyone
     else";
   - the same short text tiled diagonally across the image at low opacity, so cropping the band is not enough.
   - Never in the watermark: finder name, owner name, item name, conversation id or token. The **ref code** (8 random
     Crockford characters, unique per owner, not a credential) lets the owner match a leaked copy to one share.
5. Encode JPEG 0.8 with `toBlob` (drops all metadata). Target ≤ 400 KB, hard limit 1.5 MB.
6. Show this exact blob as the preview: "This is what the finder will see."

**Serving (`GET /c/:token/proof/:photoId`, `src/worker/public/proof-route.ts`, mounted outside `capabilityHeaders` like
the existing `photoRoute`):**
- Validate the token shape and that `photoId` is a UUID, then one query:
  ```sql
  SELECT p.r2_key, p.position, s.id AS share_id, s.owner_id
    FROM proof_share_photos p
    JOIN proof_shares s  ON s.id = p.share_id
    JOIN conversations c ON c.id = s.conversation_id
    JOIN items i         ON i.id = s.item_id AND i.archived_at IS NULL
   WHERE p.id = ? AND c.finder_token_hash = ? AND c.status = 'open'
     AND s.status = 'active' AND s.expires_at > ? AND p.r2_key IS NOT NULL
  ```
  plus a prefix check (`r2_key` starts with `shares/<owner_id>/<share_id>/`) before `FILES.get`.
- Reject `Sec-Fetch-Site: cross-site` and `same-site` (nothing on the app host loads finder images); allow
  `same-origin`, `none` and a missing header.
- Every failure (malformed, unknown, foreign conversation, expired, revoked, closed, blocked, archived, Fetch-Metadata
  rejection, missing object) returns the **same 404** (status, body, headers). 404, not 410, so "existed and ended"
  is indistinguishable from "never existed".
- Headers: `Content-Type: image/jpeg`, `Content-Length`, `Content-Disposition: inline; filename="photo-<n>.jpg"`,
  `Cache-Control: no-store, private`, `X-Content-Type-Options: nosniff`,
  `X-Robots-Tag: noindex, nofollow, noarchive, noimageindex`, `Referrer-Policy: no-referrer`,
  `Cross-Origin-Resource-Policy: same-origin`, `Content-Security-Policy: default-src 'none'; sandbox`. No `ETag` or
  `Last-Modified` (R2 metadata is not forwarded).
- Counts against the existing per-IP `readBudget`. A page with six photos plus polling stays well inside 60/min.

**Expiry and revocation:**
- Durations: 1 h, **24 h (default)**, 3 days, 7 days (maximum, the same ceiling Apple uses for shared item locations).
- Revocation is immediate for new requests. An image already on the finder's screen stays until the timeline's next
  poll replaces the entry with its ended state. Screenshots and saved copies cannot be recalled; the UI says so.
- **Automatic revocation** in the same D1 batch as the triggering change: conversation closed (`conversation_closed`),
  blocked (`conversation_blocked`), item archived (`item_archived`), a source photo deleted (`file_deleted`). Deleting a
  conversation or item cascades the rows. Reopening or unblocking never restores a grant; the owner shares again.
- R2 bytes are deleted right after revocation (`waitUntil`); the nightly job marks expired grants `expired` and deletes
  every object under `shares/<ownerId>/` whose grant is not active or no longer exists (covers cascades and failures);
  an **R2 lifecycle rule** on prefix `shares/` with `--expire-days 8` is the last backstop, so no copy can outlive the
  7-day maximum by more than a day even if the job stops running.
- Shared copies are excluded from the off-site mirror (`rclone ... --exclude "shares/**"`) and never enter the JSON
  export. Share metadata (no bytes) lives and dies with its conversation.

**Audit and notifications:**
- Per grant: `first_viewed_at`, `last_viewed_at`, `view_count` (one conditional `UPDATE` per fetch, in `waitUntil`).
- The transition of `first_viewed_at` from NULL (a conditional `UPDATE ... WHERE first_viewed_at IS NULL`) fires one
  `notifyOwner({ kind: "proof_viewed" })`, content-free like every push (ADR 0003), counted as a follow-up, and one
  `proof.viewed` activity event (with the scan country only if `privacy.recordScanCountry` is on).
- Activity events: `proof.shared`, `proof.revoked`, `proof.viewed`, `proof.expired`. Logs are structured and never
  contain the token, the ref code or R2 keys.
- The finder privacy notice (EN/DE/ES) gains one line: if the owner shares photos, RETURN records when they are first
  opened and how often, and tells the owner.

**What the finder sees:** a timeline entry of kind `proof` at the time of sharing, "Photos from the owner": the
owner's optional note (≤ 300 characters), a grid of the photos (tap opens the full image), each captioned with the
localized slot name (never a filename), and the line "Shared only with you until Thu 15 Oct, 18:40. Please don't
forward them." After expiry or revocation the same entry reads "The owner shared photos here. They are no longer
available." and contains no image URLs. Works without JavaScript (plain `<img>`).

**Owner UX (panel):**
- *Item page:* "Proof photos" section with the slot grid, tips, completeness, and **Show in person** (full-screen,
  swipe, nothing sent).
- *Conversation:* a "Proof" menu with **Ask for proof** (inserts a localized question template in the finder's
  language into the reply box, with suggestions derived from the item's filled slots: "What colour is the lining?",
  "What is on the sticker on the bottom?", "Could you send a photo next to a paper with today's date and the code 4821?")
  and **Share proof photos**.
- *Share sheet:* (1) pick photos of this conversation's item (the `label` slot is shown disabled, "Private: show it in
  person"); the `detail` slot carries "Your best check. Consider asking the finder to describe it first."; (2) optional
  opaque boxes per photo; (3) duration; (4) note; (5) watermark preview of every photo; (6) confirm with the honest
  line "The finder can save or screenshot what you share. Stopping the share prevents new views; it can't delete
  copies." After sharing, the thread shows the grant: photos, ref code, "Not opened yet" / "Opened, first at 14:03, 5
  views", and **Stop sharing**.
- *Compare:* while a conversation is open, the item's proof slots are one tap away next to the thread, to compare with
  what the finder describes.

### Stage 2: sealed proof photos (when ADR 0004 ships)
- For conversations with `encryption = 'sealed-v1'`, step 5 is followed by encryption on the owner's device:
  envelope `0x02 ‖ nonce(24) ‖ XChaCha20-Poly1305(CK, jpeg padded to a multiple of 64 KiB)`, AAD
  `return/v1/proof ‖ share id ‖ photo id ‖ position`. The owner's note moves inside a sealed entry; `note` stays NULL.
- The same endpoint returns `application/octet-stream`; the finder page script fetches, decrypts with the fragment key,
  checks the JPEG SOI marker, and renders `URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }))`. The grant
  table, checks, expiry, revocation, audit and cleanup are unchanged. The server can no longer strip or measure the
  sealed copy; the owner's device is the trusted producer (the server never could check the watermark anyway).
- Plaintext grants remain only for `none` conversations, and that path is deleted when none remain (ADR 0004 migration
  rule).

### Stage 3: finder photo replies (sealed conversations only; amend this ADR before building)
The owner opens a photo request in a conversation (instruction text, optional code to write on paper). Only while that
request is open (24 h) may the finder page upload up to 3 photos: re-encoded in the finder's browser (canvas, max
1600 px, drops metadata), sealed under `CK`, ≤ 2 MB each, finder write budget plus a per-conversation daily cap. The
owner's device decrypts, decodes and shows them side by side with the matching proof slot. No unsolicited finder
uploads, ever.

### Data model (`migrations/0007_proof_photos.sql`, sketch; the implementer verifies each `ALTER` on D1)
```sql
-- Proof slots on existing photos. NULL = an ordinary gallery photo.
ALTER TABLE item_files ADD COLUMN proof_slot TEXT
  CHECK (proof_slot IN ('overall', 'reverse', 'detail', 'interior', 'label', 'extra'));
ALTER TABLE item_files ADD COLUMN width INTEGER;   -- read from the image header on upload; NULL for older rows
ALTER TABLE item_files ADD COLUMN height INTEGER;
CREATE UNIQUE INDEX item_files_proof_slot ON item_files(item_id, proof_slot)
  WHERE proof_slot IS NOT NULL AND proof_slot <> 'extra';

-- One row per decision to show photos to one finder.
CREATE TABLE proof_shares (
  id               TEXT PRIMARY KEY,                 -- UUID generated by the owner's device (idempotency key)
  owner_id         TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  item_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  ref_code         TEXT NOT NULL,                    -- printed in the watermark; not a credential
  note             TEXT,                             -- NULL for sealed shares
  encryption       TEXT NOT NULL DEFAULT 'none' CHECK (encryption IN ('none', 'sealed-v1')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at       TEXT NOT NULL,
  revoked_at       TEXT,
  revoke_reason    TEXT CHECK (revoke_reason IN
                     ('owner', 'conversation_closed', 'conversation_blocked', 'item_archived', 'file_deleted')),
  first_viewed_at  TEXT,
  last_viewed_at   TEXT,
  view_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  UNIQUE (owner_id, ref_code)
);
CREATE INDEX proof_shares_conversation ON proof_shares(conversation_id, status);
CREATE INDEX proof_shares_item ON proof_shares(item_id, status);
CREATE INDEX proof_shares_expiry ON proof_shares(status, expires_at);

-- The watermarked copies. Bytes in R2 under shares/<owner_id>/<share_id>/<id>.
CREATE TABLE proof_share_photos (
  id              TEXT PRIMARY KEY,                  -- UUID, the only id a finder ever sees
  share_id        TEXT NOT NULL REFERENCES proof_shares(id) ON DELETE CASCADE,
  owner_id        TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  source_file_id  TEXT REFERENCES item_files(id) ON DELETE SET NULL,
  slot            TEXT,                              -- copied from the source at share time (caption)
  position        INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
  r2_key          TEXT UNIQUE,                       -- NULL once the bytes are deleted
  content_type    TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'application/octet-stream')),
  size_bytes      INTEGER NOT NULL,
  width           INTEGER,                           -- NULL for sealed copies
  height          INTEGER,
  created_at      TEXT NOT NULL,
  UNIQUE (share_id, position)
);
CREATE INDEX proof_share_photos_source ON proof_share_photos(source_file_id);
```
`shares/` is a top-level R2 prefix on purpose: lifecycle rules match literal prefixes, and nothing under it can be
reached through `/api/files/:id` (which only serves `item_files` rows under `owners/<id>/`).

### Contracts (zod in `src/shared/`)
```ts
// src/shared/proof.ts (pure; Worker + panel)
export const PROOF_SLOTS = ["overall", "reverse", "detail", "interior", "label", "extra"] as const;
export type ProofSlot = (typeof PROOF_SLOTS)[number];
export const NEVER_SHARED: readonly ProofSlot[] = ["label"];
export const NEVER_PUBLIC: readonly ProofSlot[] = ["detail", "interior", "label"];
export const PROOF_LIMITS = {
  minLongSide: 1024, minShortSide: 480, captureMaxSide: 2560,
  share: { maxPhotos: 6, maxActivePerConversation: 3, maxBytes: 1_500_000,
           minLongSide: 480, maxLongSide: 1600, ttlHours: [1, 24, 72, 168], defaultTtlHours: 24 },
} as const;
export function requiredSlots(category: ItemCategory): readonly ProofSlot[];
export function proofStatus(category: ItemCategory, files: Pick<FileMeta, "proofSlot">[]): ProofStatus;
export function watermarkLayout(input: { width: number; height: number; refCode: string;
  date: string; lang: Language }): WatermarkLayout; // band rect, lines, tiles, font size; no canvas

// src/shared/schemas.ts additions
FileMeta += { proofSlot: ProofSlot | null; width: number | null; height: number | null };
ItemDetail += { proof: ProofStatus };            // { required, filled, missing, complete }
ItemSummary += { proofComplete: boolean };      // itemListQuerySchema += proof?: "incomplete"
export const filePatchSchema = z.object({ proofSlot: z.enum(PROOF_SLOTS).nullable() });
export const proofShareCreateSchema = z.object({
  id: z.uuid(),
  refCode: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/),
  itemId: z.string().max(64),
  ttlHours: z.union([z.literal(1), z.literal(24), z.literal(72), z.literal(168)]),
  note: nullableStr(300),
  photos: z.array(z.object({ id: z.uuid(), sourceFileId: z.string().max(64),
                               position: z.number().int().min(1).max(6) })).min(1).max(6),
});
export interface ProofShare {
  id: string; conversationId: string; itemId: string; refCode: string; note: string | null;
  status: "active" | "revoked" | "expired";      // "expired" computed when expires_at <= now
  expiresAt: string; createdAt: string; revokedAt: string | null; revokeReason: ProofRevokeReason | null;
  firstViewedAt: string | null; lastViewedAt: string | null; viewCount: number;
  photos: { id: string; position: number; slot: ProofSlot | null; sourceFileId: string | null;
            width: number | null; height: number | null; url: string | null }[]; // owner preview URL
}
ConversationDetail += { proofShares: ProofShare[] }; // owner API; the finder read model selects public fields only
```

| Endpoint | Auth | Behaviour |
|---|---|---|
| `POST /api/files` (+ field `proofSlot?`) | Access + Origin | as today, plus slot rules and stored `width`/`height` |
| `PATCH /api/files/:id` `{ proofSlot }` | Access + Origin | move into/out of a slot (atomic swap); `422 photo_too_small`, `422 photo_not_public` |
| `PUT /api/items/:id/public-photo` | Access + Origin | additionally `422 photo_not_public` for `NEVER_PUBLIC` slots |
| `POST /api/conversations/:id/proof-shares` | Access + Origin | multipart: `meta` (JSON, `proofShareCreateSchema`) + one part `photo.<photoId>` per photo; `Content-Length` ≤ 10 MB declared up front; 201 `ProofShare`; replay of the same `id` and payload → 200 with the same share; same `id`, different payload → `409 idempotency_conflict` |
| `GET /api/proof-shares/:id/photos/:photoId` | Access | owner preview of the exact copy, `no-store` |
| `POST /api/proof-shares/:id/revoke` | Access + Origin | idempotent; 200 `ProofShare` |
| `GET /c/:token/proof/:photoId` | finder capability | image bytes (stage 2: ciphertext) or the uniform 404 |
| `/c/:token` and `/c/:token/timeline` | finder capability | timeline gains entry kind `proof` |

Create-share validation order: owned conversation (else 404) → `status = 'open'` (else `409 conversation_closed`) →
conversation has an item and `itemId` equals it (else `409 item_mismatch`) → every `sourceFileId` is an owned photo of
that item and not in `NEVER_SHARED` (else `422 photo_private` / 404) → fewer than 3 active shares (atomic
`INSERT ... SELECT ... WHERE (SELECT COUNT(*) ...) < 3`, else `409 share_limit`) → each part: JPEG magic bytes (else
415), `stripJpegMetadata` (else `422 invalid_image`), dimensions within 480–1600 px (else 422), ≤ 1.5 MB (else 413) →
`UNIQUE(owner_id, ref_code)` (else `409 ref_code_taken`; the client draws a new code and re-renders). Writes: R2 objects
first, then one D1 batch (share, photos, `conversations.last_message_at`, activity event); on batch failure the
objects are deleted (the pattern in `api/files.ts`). Revoke writes the status first, then deletes objects.

### Module boundaries
- `src/shared/proof.ts` — pure rules (slots, required sets, completeness, limits, watermark layout). Unit-tested.
- `src/worker/lib/image-info.ts` — pure header parsing for dimensions, next to `strip-metadata.ts`.
- `src/worker/db/proof.ts` — SQL and row mappers; every owner query filters by `owner_id`.
- `src/worker/domain/proof-shares.ts` — create, revoke, `revokeForConversationStatements(conv, reason)`,
  `revokeForItemStatements`, `recordView`; called by the owner API, the finder route, `closeConversation`,
  `blockConversation`, item archive and file delete (statements join their existing batches).
- `src/worker/api/proof-shares.ts`, `src/worker/public/proof-route.ts`, the `proof` entry in `public/timeline.tsx`,
  a `proof_shares` step in `services/maintenance.ts`, `proof_viewed` in `services/notify.ts`.
- Panel: `src/app/lib/proof-render.ts` (canvas only), `pages/item/ProofSet.tsx`, `pages/inbox/ProofShareSheet.tsx`,
  presentation mode, quick-card step.

### Threat model (sharing)
| Threat | Mitigation | Residual |
|---|---|---|
| Fake finder (photographed QR) harvests photos to fake possession, claim the bag at a desk, or social-engineer the owner | Possession first (ask for a detail; nudge in the share sheet); `label` never shareable; `detail` shared only by explicit choice; 1280 px copies; watermark "not valid as proof of ownership for anyone else" + ref code + date; short TTL | A dishonest viewer can still show the watermarked copy to someone |
| Leaked or forwarded conversation link | Grant expiry (default 24 h), one-tap revocation, auto-revoke on close/block, first-view notification and view counts; no new bearer URL created | Inside the TTL, a link holder sees what the finder sees (same as the conversation) |
| Enumeration / IDOR | 256-bit conversation token + UUIDv4 photo ids; one query that joins photo → share → conversation by token hash; uniform 404; read budget; owner routes filter by `owner_id` | — |
| Hotlinking, embedding, indexing | CORP `same-origin`, Fetch-Metadata rejection, `Referrer-Policy: no-referrer`, `noindex, noimageindex`, `robots.txt` already disallows the whole public host (`public/static-routes.tsx`) | Direct opening of a leaked image URL works while the grant is active (it carries the conversation token) |
| Caches (browser, SW, edge) | `no-store, private`; Worker responses are not edge-cached; the future finder SW passes `/c/*/proof/*` through (rule added to its routing test) | Pixels already decoded on screen |
| Metadata leaks | Canvas re-encode on the owner device + server `stripJpegMetadata` on every copy; generic filename; no ETag/Last-Modified; URL contains no owner, item or file id | — |
| Screenshots, second camera | Not preventable; stated in the UI; the visible watermark travels into screenshots | Accepted |
| Server, Cloudflare, backups (ADR 0004 adversaries) | Stage 1: copies short-lived, excluded from off-site mirror and export, lifecycle backstop. Stage 2: copies sealed under `CK` | Originals are plaintext inventory in R2 in every stage; only encrypting the inventory itself would change that (not decided here) |
| Owner mistake (wrong conversation, wrong item, visible address label) | Item must equal the conversation's item; preview of the exact copy; first-share checklist; opaque boxes; one-tap revoke | Something the owner did not notice |
| Abuse of the feature as a lure ("send your passport to prove it") | Documents and the `label` slot can never be shared; template copy: "RETURN never needs your ID or any code sent to your phone" | Out-of-band requests |

### Tests that prove the properties (Vitest in workerd unless noted)
`test/proof-share.test.ts`, using the existing helpers (`test/helpers/public.ts`, `test/helpers/files.ts`):
1. Conversation B's token cannot fetch conversation A's photo: 404, byte-identical (status, body, headers) to an
   unknown photo id and to a malformed token.
2. Expired grant → 404 (expiry set in the past); the timeline entry renders the ended state with no image URL.
3. Revoked grant → 404; `FILES.head` of its keys is null after `waitUntil`.
4. Closed conversation → 404 and the grant reads `revoked/conversation_closed`; blocked → same with
   `conversation_blocked`; reopen or unblock → still 404; deleted conversation → rows gone and the next maintenance run
   removes the objects.
5. Archived item and deleted source photo → 404.
6. Owner IDOR: another owner's `POST .../proof-shares`, `GET /api/proof-shares/:id/photos/:pid`, `POST .../revoke` → 404.
7. No direct R2 access: owner JSON, finder HTML and timeline markup never contain an `r2_key`, `shares/`,
   `r2.cloudflarestorage.com` or `r2.dev`; `GET /api/files/<share photo id>` → 404; the system status test asserts no
   S3 credential secrets are configured. Operations check: `wrangler r2 bucket dev-url get return-files` reports
   disabled and `wrangler r2 bucket domain list return-files` is empty.
8. EXIF absent: a copy built with `jpegWithMetadata` (contains `GPS_MARKER`) is stored and served without it; PNG/WebP
   → 415; truncated JPEG → 422.
9. Response headers exactly as specified (no-store, inline, CORP, noindex+noimageindex, no-referrer, CSP, nosniff, no
   ETag/Last-Modified); `Sec-Fetch-Site: cross-site` → the uniform 404.
10. Create rules: `label` photo → 422; photo of another item → 422; conversation without item → 409; closed → 409; 7
    photos → 422; 1.6 MB part → 413; 2000 px long side → 422; fourth active share → 409; missing `Origin` → 403.
11. Idempotency: same `id` and payload twice → one share and one set of objects; same `id`, different payload → 409.
12. First view: three fetches → `view_count = 3`, one `proof.viewed` event, exactly one `notifyOwner` call.
13. Read budget applied (limiter stub returns false → 429).
14. Maintenance: active-but-expired grant becomes `expired` and loses its objects; an orphan
    `shares/<owner>/<unknown>/x` is deleted; other owners' prefixes are untouched.

`test/proof.test.ts`: `requiredSlots`/`proofStatus` per category; `imageDimensions` on JPEG (baseline and
progressive)/PNG/WebP fixtures; slot below minimum → 422; slot swap keeps the previous photo; `NEVER_PUBLIC` rules in
both directions; export/import round trip keeps `proof_slot`, `width`, `height`; `watermarkLayout` puts the band at
≥ 7 % height, covers all four quadrants with tiles, and includes the ref code and date.

`e2e/proof-share.spec.ts` (Playwright, panel + finder contexts): share two photos with one opaque box → the finder
timeline shows both; the served image, drawn to a canvas, has a near-uniform dark band at the bottom and differs from
the same region of the original; the box region is uniform; owner stops sharing → the finder's next poll shows the
ended entry and the image URL returns 404.

### Plan and effort (S ≤ 1 h, M ≤ ½ day)
| # | Task | Size | Owner |
|---|---|---|---|
| 0 | Spike S1 (below) | S | frontend-engineer |
| 1 | Migration 0007, `image-info`, slot API, completeness, public-photo rule, export columns, tests | M | implementer + test-engineer |
| 2 | Panel proof set: slot grid, tips, capture at 2560 px, badges, inventory filter, quick-card optional step, lost-sheet hint, Show in person | M | frontend-engineer |
| 3 | Share grants server: tables, owner API, finder route, auto-revoke hooks, maintenance step, `proof_viewed`, security tests 1–14 | M (split if > ½ day) | implementer + test-engineer |
| 4 | Finder timeline entry, i18n EN/DE/ES, privacy-notice line | S | implementer |
| 5 | Share sheet: selection, opaque boxes, duration, note, watermark renderer + preview, grant card, revoke | M | frontend-engineer |
| 6 | Ask-for-proof templates and compare panel in the thread | S | frontend-engineer |
| 7 | E2E, `/security-review`, operations (lifecycle rule, rclone exclude, dev-url check), security.md and decisions.md rows | S | test-engineer, devops-engineer |
| later | Stage 2 sealed copies (after ADR 0004 core) | S–M | implementer |
| later | Stage 3 finder photo replies (sealed only, ADR amendment first) | M | architect, implementer |

Tasks 1–7: about 3–4 working days. Production migration needs the owner's explicit permission, as for every migration.

### Reversibility
Cheap. The migration adds nullable columns and two new tables; switching the feature off means hiding the UI,
revoking active grants and letting the maintenance step and the lifecycle rule delete the copies; a later migration
can drop the tables. No new secret, binding, dependency or third-party processor is introduced. The only irreversible
part is inherent to sharing: copies a finder already viewed or saved.

## Consequences
- **Easier:** the owner can verify a claimed finder against a private, comparable photo set; a holder can be shown
  proof without the owner sending files through email or messengers; every view is accounted for and every share ends.
- **Harder:** a new owner habit (completing the proof set before travel); one more timeline entry kind on both sides;
  canvas rendering code to maintain on the owner side; the nightly job gains an R2 listing step.
- **Watch:** share of tagged luggage items with a complete set (the badge works or not); time to complete the four
  slots in the quick-card step; 404 rate on `/c/*/proof/*` (enumeration or broken links); copy size and render time
  on iPhone; any `proof_viewed` long after the conversation went quiet.
- **Docs on acceptance:** `docs/security.md` (new rows: proof shares, finder images), `docs/decisions.md` (row:
  owner-rendered copies, Worker-gated grants), `docs/operations.md` (lifecycle rule
  `wrangler r2 bucket lifecycle add return-files proof-shares shares/ --expire-days 8 -J eu`, rclone
  `--exclude "shares/**"`, dev-url/domain check), finder privacy notice EN/DE/ES.

### Risks and the first spike
| Risk | Mitigation |
|---|---|
| Canvas rendering differs on iOS Safari / installed PWA (fonts, memory with 2560 px sources, `toBlob` quality) | Spike S1 before task 5 |
| Owners skip the proof set, so there is nothing to compare when it matters | Visible badge, quick-card step, overview card; measure completion |
| Sharing helps a scammer more than it helps the owner | Possession-first nudge; `label` never shared; watermark; short TTL; first-view notification |
| Orphaned copies in R2 after failures | Revoke-time delete, nightly prefix sweep, 8-day lifecycle backstop, exclusion from off-site mirror |
| The parallel finder timeline rework changes entry rendering | The `proof` entry is one more `Entry` kind in `timeline.tsx`; land after that work merges |

**Spike S1 (de-risks the riskiest assumption: the owner's phone can produce a legible, watermarked, redacted copy
quickly):** in the panel's gallery route, render a 4032×3024 iPhone photo into a 1280 px copy with two opaque boxes,
the tiled watermark and the footer band, on an iPhone (Safari and the installed PWA) and on Chrome for Android.
Pass: ≤ 1.5 s per photo, ≤ 400 KB, footer text legible at 375 px width, no visible artefacts at box edges, and the
upload passes the server's JPEG checks with `GPS_MARKER` absent. The first automated test to write after that is test
1 (cross-conversation isolation with byte-identical 404s).

## Sources
- OWASP File Upload Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- OWASP Authorization Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP IDOR Prevention Cheat Sheet — https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html
- W3C TAG, Good Practices for Capability URLs — https://w3ctag.github.io/capability-urls/
- NIST SP 800-63B-4 session management (overall and inactivity timeouts) — https://pages.nist.gov/800-63-4/sp800-63b/session
- Cloudflare R2 presigned URLs — https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- Cloudflare R2 public buckets — https://developers.cloudflare.com/r2/buckets/public-buckets/
- Cloudflare Images binding — https://developers.cloudflare.com/images/optimization/transformations/bindings/ ·
  draw overlays — https://developers.cloudflare.com/images/optimization/transformations/draw-overlays/ · billing
  change — https://developers.cloudflare.com/changelog/post/2026-07-01-binding-unique-transformations/
- Cloudflare Workers limits — https://developers.cloudflare.com/workers/platform/limits/
- MDN Cross-Origin-Resource-Policy — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Resource-Policy
- web.dev, Fetch Metadata resource isolation — https://web.dev/articles/fetch-metadata
- Google robots meta / `X-Robots-Tag` (`noimageindex`) — https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
- MDN Barcode Detection API — https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API · caniuse —
  https://caniuse.com/mdn-api_barcodedetector · Chrome shape detection status —
  https://developer.chrome.com/docs/capabilities/shape-detection
- Unredacter coverage — https://thehackernews.com/2022/02/this-new-tool-can-retrieve-pixelated.html ·
  https://bleepingcomputer.com/news/security/researcher-reverses-redaction-extracts-words-from-pixelated-image
- Krebs, "What's in a Boarding Pass Barcode? A Lot" (2015) — https://krebsonsecurity.com/2015/10/whats-in-a-boarding-pass-barcode-a-lot/
  [unverified URL] · Executive Traveller breakdown — https://www.executivetraveller.com/what-that-barcode-on-your-boarding-pass-reveals-about-you
- Laxton, Wang, Savage, "Reconsidering Physical Key Secrecy: Teleduplication via Optical Decoding" (CCS 2008) —
  https://datarepo.eng.ucsd.edu/visiondata/blaxton/public_html/pagePapers/laxton_wang_savage_ccs2008.pdf
- McAfee EXIF episode — https://grahamcluley.com/john-mcafee-location-exif/
- Filigrane Facile (France Travail) — https://www.francetravail.fr/candidat/soyez-vigilants/filigrane-facile--un-nouveau-ser.html
- KopieID (Rijksoverheid, 2014) — https://www.rijksoverheid.nl/actueel/nieuws/2014/12/01/laat-u-niet-zomaar-kopieren-een-veilig-id
- FBI El Paso lost-pet scam advice (KFOX) — https://kfoxtv.com/news/local/fbi-el-paso-field-office-issues-warning-about-lost-pet-scams
- BBB advice via WBAY — https://www.wbay.com/2026/07/15/lost-pet-scam-targets-green-bay-dog-owner-facebook/ · San Antonio
  ACS — https://www.sa.gov/Directory/News-Releases/Animal-Care-Services-Warns-of-Lost-Pets-Scam
- Airport lost-property practice — https://311.sanantonio.gov/kb/docs/articles/transportation/lost-items-at-the-airport ·
  https://www.flysanjose.com/lost-found · https://flypittsburgh.com/wp-content/uploads/2023/06/acaa_lost_and_found_policy.pdf
- r/hardwareswap timestamp rules (mirror) — https://lr.us.psf.lt/r/hardwareswap/wiki/rules/timestamps
