# RETURN functional audit (end to end)

Date: 2026-10-13 · Build: working tree at audit time (v0.1.0, migrations 0001-0002) · Method: exploratory, read-only on product code.

## How this was run
- Three isolated local instances (Vite dev + `@cloudflare/vite-plugin` with `persistState`, separate state dirs):
  A `:5183` (main), B `:5184` (target of an API restore), C `:5185` (fresh state, outbound 80/443 blocked with `sandbox-exec`, to simulate Nominatim being unreachable; also the target of a UI restore).
- Drivers: Node scripts over HTTP (owner API with `Origin`, finder form posts with `CF-Connecting-IP` per source) and Playwright/Chromium (desktop 1280, mobile 390, locales en/es/de, time zones UTC/New_York/Madrid, offline, throttled responses, axe-core 4.14).
- Scratch evidence (not in the repo): `/private/tmp/claude-501/-Users-lr0y-Workspace-10-Projects-Personal-Return-App/466d170e-3321-44b8-a21f-fa039fca4f30/scratchpad/fa/`. Scripts `p*.mjs` (HTTP), `b*.mjs` (browser), screenshots in `shots/`, export used for restore in `out/export.json`.
- Local-only caveat: the dev server applies the real rate-limit binding (10 writes/min per IP) and shows `CF-Connecting-IP` handling like production. Results that were polluted by that limit were re-run with distinct source IPs and are not listed as bugs.
- On 2026-10-13 another agent ran `pkill -f workerd` mid-audit; all three servers were restarted (state dirs intact) and the affected checks re-run. Nothing below comes from that outage. One 500 on a `POST /api/items` without `Origin` was seen once and never reproduced in 12 retries (expected 403); not reported as a finding.

## Test suites (run once, no test changed)
| Suite | Command | Result |
|---|---|---|
| Unit/integration (workerd) | `pnpm test` | 23 files, **348 passed**, 0 failed, 21.3 s. Harmless `kj/async-io ... disconnected` line printed by workerd at start. |
| E2E (mobile + desktop projects) | `pnpm test:e2e` | **96 passed**, 0 failed, 1.9 min. Side effects in the repo: `.wrangler` state of the default E2E instance and `test-results/.last-run.json`. |

Every defect below passes both suites, i.e. none of them is covered by an existing test.

---

## Findings

### P0 - broken

#### F-01 "Block finder" in the panel always fails
- Steps: Inbox > open any conversation > More actions > Block finder > confirm.
- Expected: conversation becomes `blocked`, finder IP hash blocked, toast "Finder blocked".
- Actual: the dialog stays open with the red error "Request body must be valid JSON". The conversation stays open; nothing is blocked. 100 % reproducible.
- Cause: the SPA calls `api.post('/conversations/:id/block')` without a body (`api.post` then sends no body), while the route does `parseJson(c, blockSchema)` which rejects an empty body. The only owner-facing abuse control is therefore unusable from the UI (it works through the API with a `{}` body).
- Evidence: `b6.mjs`, `shots/blocked-thread.png`. HTTP: `p5.mjs`/`p6.mjs` (block works with `{reason}`).
- Suspected files: `src/app/pages/inbox/Thread.tsx:387` (call), `src/worker/api/conversations.ts` (block route `parseJson`), `src/app/lib/api.ts` (`post` without body). Fix either side (send `{}` or make the body optional) and add an E2E for blocking.

### P1 - wrong behaviour

#### F-02 A blocked finder can never be unblocked ("Unblock and reopen" is a dead button; blocks are permanent)
- Steps (API, because F-01 hides it in the UI): block a conversation, then `POST /api/conversations/:id/reopen`.
- Expected: unblock, or at least a way to lift the IP block.
- Actual: 409 `conversation_blocked` always. The panel shows "Unblock and reopen" on blocked threads and that button calls exactly this endpoint, so it can only fail. `blocks` rows are inserted with `expires_at NULL`, the nightly job only prunes rows with an expiry, and there is no API or screen to list or delete blocks. Deleting the conversation does not lift the block either (re-tested: new contact from the same IP still 429). Blocks are keyed per /32 (IPv4) or /64 (IPv6), so a carrier-grade NAT address can lock out every finder behind it forever, silently (the finder just sees the generic "cannot take your request" message).
- Also: the export does not carry `blocks`, so a restore silently unblocks everybody (F-14).
- Evidence: `p5.mjs` (`reopen blocked 409`), `p7.mjs` (`blocked IP after conv deleted 429`).
- Suspected files: `src/worker/domain/conversations.ts` (`reopenConversation`, `blockConversation`), `src/app/pages/inbox/Thread.tsx:350-367`, `src/worker/db/export.ts`, `src/worker/services/maintenance.ts`.

#### F-03 Archiving a lost item kills the finder's way to reach you, and the panel does not say so
- Steps: create item + tag, Mark as lost, then Archive (More > Archive).
- Expected: warning, or the tag keeps working while the item is lost.
- Actual: archive succeeds; `/t/<token>` immediately returns the generic 404 "This tag is not active" (no form, no contact), while the recovery stays open. Overview becomes inconsistent: `lostItems` is empty (archived items are filtered) but `openRecoveries` still lists the lost recovery. A lost item can also be created from an archived item (`POST /items/:id/lost` on an archived item returns 200).
- Copy is also wrong: the archive dialog says "Its tags will report that the item is archived"; the finder actually sees "This tag is not active / was deactivated".
- Evidence: `p3.mjs` (`archive LOST item`, `tag page of archived lost item 404`, overview output).
- Suspected files: `src/worker/api/items.ts` (`archive`, `lost`), `src/worker/public/queries.ts:findActiveTag` (`i.archived_at IS NULL`), `src/app/lib/dict.ts` (`item.archiveBody`).

#### F-04 Closing a recovery leaves the item "lost" forever
- Steps: item lost > Recoveries > Update recovery > status "Closed" > Save (the status select offers all five statuses regardless of the allowed transitions).
- Expected: item no longer reported as lost, or "closed" not offered while the item is lost.
- Actual: recovery `closed`, item `status = lost` with no open recovery. The inventory still shows the Lost badge, the tag page keeps its red "lost" banner and reward text, scan alerts keep firing, and "Mark as recovered" then does nothing useful (`recovered` returns 200 with `recovery: null`). The same select also offers invalid targets (e.g. "Lost" from "Returning") that fail with a raw 409 "Cannot move a recovery from X to Y".
- Evidence: `p3.mjs` (`item status after recovery closed while lost: lost`), `src/app/pages/item/LostSheets.tsx:RecoveryForm`.
- Suspected files: `src/worker/db/recoveries.ts:updateRecovery` (the `closed` branch does not touch `items.status`), `LostSheets.tsx` (options not limited to `RECOVERY_TRANSITIONS`).

#### F-05 Dates the owner types are shown shifted when the browser zone differs from Settings > Time zone
- Steps: browser in America/New_York, Settings time zone left at the default `Europe/Berlin`. Mark as lost, "When" = `2026-10-13 10:00`. Open the Recoveries card.
- Expected: 10:00.
- Actual: "13 Oct 2026, 16:00". The `datetime-local` value is converted with the browser zone (`localInputToIso`), displayed with the setting zone. The default "now" value is also in browser time. Same pattern for any `datetime-local` entered by the owner (lost time, tracker last-seen time). A travelling owner (the stated user) gets wrong times without any hint.
- Evidence: `b5.mjs` (stored `2026-10-13T14:00:00.000Z`, displayed 16:00), `shots/tz-lost.png`.
- Suspected files: `src/app/lib/format.ts` (`localInputToIso`, `isoToLocalInput`, `createFormatter`), `LostSheets.tsx`, settings default timezone.

#### F-06 Impossible meeting dates are accepted and silently rolled over; past dates accepted
- Steps: finder (or owner API) proposes a return plan with `meet_at=2026-02-31T18:30`, or `2020-01-01T18:30`.
- Expected: 422 "enter a valid date"; a past time at least warned.
- Actual: stored as typed. The finder page and the panel render "Mar 3, 2026, 6:30 PM" (JS date rollover), i.e. the other party reads a different day than the proposer typed. Month 13 and hour 25 are rejected; day 31 in a 30-day month is not. The owner API (`meetAt` regex only) has no calendar check at all. Past dates ("When: Jan 1, 2020") are shown without warning. `datetime-local` inputs block this in browsers, but the finder form is plain HTML posted by any client.
- Evidence: `p6.mjs` (`proposal 02-31 303`, rendered "When: Mar 3, 2026, 6:30 PM").
- Suspected files: `src/shared/schemas.ts` (`proposalInputSchema.meetAt`), `src/worker/public/forms.ts:parseProposal` (`Date.parse` accepts overflow days), `src/app/lib/format.ts:wallClock`, `src/worker/public/format.ts`.

### P2 - rough edges and gaps

#### F-07 Double Ctrl/Cmd+Enter sends the reply twice
- Steps: type a reply in an open thread, press Ctrl+Enter twice quickly (or hold it).
- Actual: two identical messages are stored and the finder sees both. Clicking the button twice is guarded (button disabled while pending); the keyboard path is not (`send` has no `if (sending) return`).
- Evidence: `b7c.mjs` (`messages added with double Ctrl+Enter: 2`).
- Suspected file: `src/app/pages/inbox/Thread.tsx:110` (`send`), `onKeyDown` at ~331. Item create, tag create, quick-card export and delayed item create were all single under double submit.

#### F-08 No way to take an item out of its container
- Items can only be nested ("Contents and accessories" > pick an item) but nothing in the UI sends `parentId: null`, so a nested item stays inside its parent for good (the API supports it). Also: the inventory grid lists contained items as top-level items; archiving a parent leaves children active with a pointer to an archived parent.
- Evidence: `grep parentId src/app` (only `ItemContents.tsx:118` attaches), API probe `p1.mjs`.
- Suspected files: `src/app/pages/item/ItemContents.tsx`, `ItemDetailPage.tsx`.

#### F-09 Search is not case- or accent-insensitive beyond ASCII
- `GET /api/items?q=écharpe` does not find "Écharpe" (SQLite `LIKE` folds only ASCII); `q=ÉCHARPE` does. Same for Ä/ä, Ö/ö, Ñ/ñ in names, serials, descriptions; accent-insensitive search ("echarpe") also finds nothing. For a DE/ES/FR user base this looks like missing items. The search box placeholder promises "name, brand or model" but the server also matches description and serial number.
- Evidence: `p1.mjs` (`search é lower 0`, `search É upper 1`).
- Suspected file: `src/worker/db/items.ts:listItemSummaries`.

#### F-10 Money field rejects European and thousands formats
- `1.234,50`, `1,234.50` and `1 234` all give "Enter a number such as 1200 or 89.90" (only one comma-to-dot replacement). Also accepts `1e3` and `0x10`. Decimals beyond 2 are silently rounded.
- Evidence: `b3.mjs`. Suspected file: `src/app/lib/format.ts:parseMoneyToCents`.

#### F-11 Settings accept values that are later silently ignored
- `identity.timezone = "Mars/Olympus"` and `identity.locale = "zz_??"` save with "Settings saved" (no validation server or client side). The panel then silently falls back to the browser zone/locale, so the owner thinks the zone is Mars and sees local times.
- `PUT /api/settings` with a partial body (e.g. only `contact`) returns 200 and resets every other section to defaults, including `tags.printedEmail` and the finder messages. The SPA always sends the whole document, but any other client or a future bug wipes the printed fallback silently. Other accepted oddities: `mutedUntil` in the past, a phone number such as "call me maybe" (page then hides the link since no digits).
- Evidence: `p8.mjs`, `b9.mjs`. Suspected files: `src/shared/settings.ts`, `src/worker/api/settings.ts`, `src/app/pages/settings/IdentitySection.tsx`.

#### F-12 Test email and system status are unclear or over-optimistic
- Test-email failures print machine codes: `no_recipient`, `email_not_configured`, `hourly_cap`, or a raw `Error: ...` string (up to 300 chars) in the red box. Expected: a sentence saying what to configure. (I could not reproduce "email not configured" locally: `send_email` is simulated by Miniflare and `NOTIFY_FROM` comes from `wrangler.jsonc`, so test-email returns `ok:true` and the log says `sent`.)
- Settings > System shows "Panel sign-in (Cloudflare Access): OK", "Email sending: OK", "Spam protection: OK" on the dev instance although Access is bypassed and mail is simulated; the checks only test that variables/bindings exist, not that the sender domain is onboarded or the destination verified. Panel/public address show "Not set" locally (fine). `lastBackupAt` correctly updates after running the cron handler (`/cdn-cgi/handler/scheduled`).
- Evidence: `p8.mjs`, `b20.mjs`, `src/app/pages/settings/NotificationsSection.tsx:26-35`, `src/worker/api/system.ts`.

#### F-13 Place names when the geocoder is unreachable
- Verified on instance C (outbound blocked): finder contact with GPS returns 303 in 37 ms, the location is stored with coordinates and shown with them (good, matches spec). Gaps: (a) the owner's place search answers 200 with an empty list and the sheet says "No places found. Try another name, or type the place by hand." even though the real cause is "OpenStreetMap unreachable"; (b) a failed reverse lookup is never retried, so those rows stay coordinates-only forever; (c) the finder page does not refresh when a name is resolved later (only `last_message_at` drives the "new reply" banner).
- Evidence: `b19.mjs`, `shots/proposal-search-down.png`. Suspected files: `src/worker/services/geocode.ts` (`searchPlaces` returns `[]` for failure), `src/worker/api/geocode.ts`.

#### F-14 Restore keeps the data but not the files, and drops blocks/notification history
- Export > restore into an empty instance (API on B, UI on C) preserves: all 22 tag tokens (printed `/t/<token>` URLs behave identically: 10/10 sampled pages same status), labels, status, NFC status, replaced-by chain, items, conversations with unread state, settings (deep-equal), 4 recoveries, proposals. Re-import is refused (409). Good.
- Gaps: file bytes are not in the export, so restored items show broken thumbnails (2 broken `<img>` on the inventory) and the public photo URL on the tag page 404s, with no warning in the "Backup restored" toast or the result counts. `blocks`, notification log and activity history are not exported (blocked sources are unblocked after a restore).
- Evidence: `p9.mjs`, `b21.mjs`. Suspected files: `src/worker/db/export.ts`, `src/app/pages/settings/SystemSection.tsx`.

#### F-15 Form errors are not programmatically tied to fields
- Finder tag page: the server-rendered error `<p id="message-error" role="alert">` exists but the textarea has no `aria-invalid` and its `aria-describedby` points only to the hint; focus is not moved (stays on `BODY` after the reload), so a screen-reader user hears nothing about which field failed. axe reports 0 violations, so this is not caught by the existing a11y spec.
- Panel (React) sets `aria-invalid`/`aria-describedby` correctly but focus stays where it was after a failed submit.
- Evidence: `b24.mjs`. Suspected files: `src/worker/public/components.tsx:Field`, `src/worker/public/pages.tsx`, `src/app/ui/Field.tsx`.

#### F-16 Offline and slow-network behaviour
- Panel offline: forms show only "Network error"; lists show "You appear to be offline or the server is unreachable" with Try again (works after reconnect). Hard reload while offline gives the browser's error page (no service worker or offline shell; the app is a private tool, so this is a note rather than a defect).
- Finder offline submit: the browser error page replaces the page; what the finder typed survives only if the browser restores form state on Back. No inline "you are offline, your message was not sent" and no draft saving. For finders on poor mobile data this is the most likely failure mode.
- Slow API (3 s): the Add item button disables and a second activation creates no duplicate (good).
- Evidence: `b22.mjs`, `b17.mjs` (offline run).

#### F-17 Copy that over-promises
- Tag replace dialog: "Use it when a tag is damaged or its URL was exposed" does not say the physical card already on the item stops working (old URL becomes the generic inactive page) until the new one is printed. Revoked/replaced/unassigned/archived URLs are all identical 404s by design, which also means a finder of a replaced-but-still-attached tag gets no route to the owner.
- Evidence: `p2.mjs` (old replaced/assigned URLs 404), `src/app/lib/dict.ts:tag.replaceBody`.

### P3 - polish and notes
- F-18 Unknown `/api/*` paths return 200 with the SPA HTML (the `notFound` handler of the mounted sub-app is not used), so a typo'd client call surfaces as `bad_response`. `GET /api/blocks` answers 200 HTML. Files: `src/worker/index.ts`, `src/worker/api/index.ts`.
- F-19 Future dates accepted: `acquiredOn` 2099-01-01, `lostAt` tomorrow.
- F-20 Marking an item recovered overwrites the recovery notes written when it was marked lost (`COALESCE(?, notes)` replaces instead of appending), and the conversation stays open (finder can keep writing) with no prompt to close or thank. The recovery card shows one entry only: intermediate steps (found, returning) have no timestamps in the model, so the "timeline" cannot show them. Files: `src/worker/db/recoveries.ts`.
- F-21 Escape closes a half-filled Add item sheet without confirmation; inventory search/filters are not in the URL (reload/back resets them); "Not found" panel states show a pointless "Try again".
- F-22 Typed delete confirmation compares the raw name while HTML collapses repeated spaces: an item named `Zoë  double  space` (two spaces) displays with one, and what the user sees cannot be typed to enable Delete.
- F-23 CSV export has no UTF-8 BOM (Excel garbles umlauts/emoji); cells starting with `= + - @` are correctly prefixed with `'`, which changes the value for NFC tools. Revoked and unassigned tags are included in the NFC list.
- F-24 Message bubbles have no `dir="auto"`: Arabic text renders left-aligned (finder and panel).
- F-25 Finder touch targets: footer "Privacy" link is 50x18 px and the consent checkbox 24x24 px (below the 44 px used elsewhere).
- F-26 Server-side photo upload does not strip EXIF (client-side canvas re-encode does, verified: GPS/EXIF gone, orientation applied, 3000x2000 to 1600 px). A custom client could publish a GPS-tagged photo as the public photo.
- F-27 A 2000-character description is not clamped on the item page (very long page); long unbroken strings do not overflow at 390 px on any page tested.
- F-28 Revoking a tag does not close existing conversations (their private links keep working), and tag verification does not take `FALLBACK_CONTACT_EMAIL` into account (reports `no_contact_method` when only the env fallback exists).

---

## Coverage table
Result key: OK = behaved as specified, BUG = see finding, NOTE = works with caveats.

| Feature | Tested how | Result |
|---|---|---|
| Item create/edit validation (lengths, category, value, currency, dates, parent) | HTTP `p1.mjs`, UI `b3.mjs` | OK; F-10, F-19 |
| Archive / restore / delete with typed confirm | HTTP + UI `b25.mjs` | OK; F-22; archive of lost item F-03 |
| Nesting contents (cycle checks, parent delete) | HTTP | Server OK (cycle/self rejected, parent delete nulls child); UI cannot detach F-08 |
| Photos: resize, EXIF strip, orientation, wide image | UI upload `b8.mjs` with synthetic EXIF/GPS JPEG, 3000x2000 PNG, 8000x200 PNG | OK (F-26 for server side) |
| Documents (PDF), type sniffing, size limits, filename handling | HTTP `b8.mjs` | OK: fake PDF 415, 21 MB 413, SVG-as-JPEG 415, empty 422, unicode filename attachment |
| Public photo choice, delete clears it, tag page + `/photo` | HTTP | OK |
| Search / filters (Lost, Archived, category) | HTTP + UI `b23.mjs` | NOTE F-09, F-21 |
| Lost to recovered, transitions, overview | HTTP `p3.mjs`, `b26.mjs` | BUG F-03, F-04; F-20 |
| Tags: create N (0, 51, 3.5, "3", "1e1"), assign/unassign/reassign | HTTP + UI `b11.mjs` | OK |
| Revoke / replace / double replace / old URLs | HTTP `p2.mjs` | OK (guards correct); F-17 copy |
| NFC status values, QR SVG (attachment), verify | HTTP + UI `b12.mjs` | OK; F-28 |
| CSV export (injection guard, quoting) | HTTP | OK; F-23 |
| Print studio SVG/PNG/PDF downloads | UI `b13.mjs` | OK (files generated; stamped "PROOF" on localhost as designed); true-size/print not verifiable locally |
| Quick card: new tag vs reuse, A4/Letter UI, PNG + PDF, double click | UI `b15.mjs`, `b16.mjs` | OK (1 tag per export, 2nd export reuses) |
| Finder tag page EN/DE/ES, `?lang`, Accept-Language, no-store/noindex headers | HTTP `p4.mjs`, UI | OK |
| Finder contact: validation, Turnstile, location manual/GPS, long text, emoji/RTL/umlauts | HTTP + UI `b17.mjs`, `b27.mjs` | OK; F-15, F-24, F-25 |
| Turnstile blocked | UI `b17.mjs` | OK: error + fallback email shown, typed text kept |
| Conversation page, reply, caps and limits (3/day per client, 5 sources per tag, 10 writes/min) | HTTP `p6.mjs`, `p7.mjs` | OK (limits observed); 50/20/10 per-conversation caps only by unit tests |
| Return plans propose/accept/decline/cancel both sides, supersede, closed conversation | HTTP `p5.mjs`, `p6.mjs` | OK; F-06 dates |
| Block / close / reopen / delete conversation | HTTP + UI `b6.mjs`, `b7c.mjs` | BUG F-01, F-02; close/reopen/delete OK |
| Cookie continue-link | HTTP (manual Cookie header) | OK on same tag, absent on other tag; browser cookie not exercised (`__Host-` + Secure on http://localhost) |
| Owner inbox: unread, polling (30 s), double send | UI `b7c.mjs` | OK (new finder message appeared after 29 s); F-07 |
| Place names and place search | UI `b18.mjs` (online), `b19.mjs` (blocked) | OK online; F-13 offline |
| Settings: every field round trip (all sections), validation | HTTP `p8.mjs` | OK (0 diffs); F-11 |
| Settings UI: dirty state, save with invalid zone | UI `b9.mjs` | F-11 (unsaved edits persist across in-app navigation, only `beforeunload` guards reload) |
| Trusted contacts, public visibility, item override | HTTP `p10.mjs`, `p11.mjs` | OK (HTML escaped) |
| Trackers CRUD | HTTP | OK |
| Test email | HTTP `p8.mjs` | NOTE F-12 |
| Export JSON then restore into empty instance (API and UI), tag URLs | `p9.mjs`, `b21.mjs` | OK for data and tokens; F-14 |
| System status accuracy, backup via cron handler | UI/HTTP | NOTE F-12; backup OK |
| CSRF / Origin checks | HTTP | OK (403 `bad_origin` cross-origin and missing Origin) |
| Double submit (item, tags, quick card, slow API) | UI | OK except F-07 |
| Back/forward, refresh mid-flow, sheet state | UI `b23.mjs` | NOTE F-21 |
| Offline / slow network | UI `b22.mjs`, `b17.mjs` | NOTE F-16 |
| Accessibility of errors | UI + axe `b24.mjs` | 0 axe violations; F-15 |
| Time zones / date formats | UI `b5.mjs`, `b17.mjs` | BUG F-05; finder localizes times client-side OK |
| Very long text, emoji, RTL | UI `b27.mjs` | OK (no overflow at 390 px); F-24 |
| Unit and E2E suites | `pnpm test`, `pnpm test:e2e` | 348 + 96 passed |

## Untested or only partly tested
- Production-only paths: Cloudflare Access JWT validation, real `send_email` delivery and the "email not configured" message on a Worker without the binding, Turnstile `siteverify` with hostname check, host routing (`PUBLIC_HOST`/`APP_HOST` redirect), Custom Domain behaviour of printed URLs.
- Printed output: true-size print on paper, CR80 PVC print file in a real printer workflow, NFC chip writing/reading, QR decoding of PNG/PDF from a physical scan (only E2E decodes the SVG/PNG).
- Degraded mode when D1 is unavailable (`/emergency`, degraded tag page) could not be triggered locally.
- HEIC/HEIF and corrupt-image uploads from a phone camera roll; very large (10+ MB) photos; many-photo batches with a mid-batch failure.
- Cookie `__Host-rc` in real browsers over HTTPS (Safari behaviour on localhost differs); finder polling banner ("New reply - tap to refresh") end to end.
- Finder per-conversation caps (50 messages, 20 proposals, 10 locations) and retention/cron deletion were not driven through the UI.
- Email content for owner/trusted-contact/finder notifications (only the log rows were observed); hourly caps and cooldown.
- Real Nominatim edge cases (rate limit 429 from the service, odd payloads) beyond "reachable" and "unreachable".
- Real devices (iOS Safari: GPS prompt, share sheet for Quick card) and keyboard-only/screen-reader passes.
- Multi-owner isolation (IDOR) was not exercised here (single owner in dev; covered by unit tests).
