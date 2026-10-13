# UI/UX audit: RETURN panel and finder pages

Date: 2026-10-13 - Method: isolated local stack (port 5182, own D1/R2 state), seeded through the owner API (10 items, photos, 2 documents, 9 tags, 3 trackers, 2 contacts, EN/DE/ES settings, 1 lost item, 3 finder conversations with GPS and a return plan). Live finder pages reviewed with GET only.

Screenshots: `$S/shots/...` where `$S` =
`/private/tmp/claude-501/-Users-lr0y-Workspace-10-Projects-Personal-Return-App/466d170e-3321-44b8-a21f-fa039fca4f30/scratchpad/ui2`
(`shots/tour/<state>-<width>-<theme>.png` = 328 captures, 37 states x 375/768/1024/1440 x light/dark; `shots/live/` = live pages; raw metrics in `tour-report-*.json`, `live-report.json`).

Coverage: all panel routes, sheets and flows, settings sections, gallery, finder pages; keyboard pass; coarse pointer (touch) emulation; prefers-reduced-transparency and reduced-motion (CDP); axe-core 4.x on every state at 375 and 1440; console and HTTP errors; slow-3G load of a finder page.
Not verifiable here: the native `<select>` popup and `<datalist>` popup (headless Chromium does not render OS popups), real iOS Safari, Windows classic scrollbars. Items that depend on these are marked "unverified".

## Owner-reported issues

### P1-A. Dropdowns (native selects, datalist)
What was measured (all 13 `Select` instances, light and dark, 375 and 1440): 44 px high, 16 px font (no iOS focus-zoom), `appearance:none`, chevron 14 px from the right edge, `pr-10`, `color-scheme` follows the theme, 3 px focus ring present, no horizontal overflow. So the closed control is technically sound. The problems are elsewhere:

1. Option popup is never themed (unverified visually). `Select` (`src/app/ui/Field.tsx:196-225`) styles only the closed box; `<option>` has transparent background and inherits nothing from the glass system. The popup is the OS widget, so it will look like a different product next to the glass sheets (most visible in dark on desktop and in the `dialog.sheet` side panel). The design direction (Liquid Glass, custom menus) is not met for the one control that is a menu.
2. Time zone field is a text input plus `<datalist>` with every IANA zone (`IdentitySection.tsx:70-90`). No chevron or other affordance that it is a picker, the popup is unthemed and unlabelled, typing a wrong value only fails on Save, and the field sits in a 2-column grid next to Locale with different hint heights so the row looks misaligned (`shots/tour/settings-identity-1440-light.png`). Expected: a real combobox/Select with a search, or at least a hint that suggestions exist.
3. Mixed control shapes: selects use the 14 px control radius, while search and chips beside them are full pills (`InventoryPage.tsx:146`, `shots/tour/inventory-1440-light.png`). The category filter reads as a form field in a toolbar of pills. Expected: pill select in filter toolbars.
4. Long option text: "Tag to preview" options are `RT001 - <item name>`; closed value truncates silently with no tooltip and the item picker lists (Tag sheet "Assigned to", New tags "For item") have no grouping or search, with 9+ items it is a long OS list. Expected: searchable picker for items (the Quick card flow already has one: reuse it).
5. Selects inside sheets: `dialog.sheet` has `overflow:hidden`, `backdrop-filter` and a transform animation (`styles.css` ~541-553). On iOS Safari a native picker inside a backdrop-filtered, animated dialog is a known fragile combination (unverified). Test on device.
6. Disabled select (`disabled:opacity-55`) keeps a full-strength chevron (the icon is a sibling, not dimmed): `Field.tsx:216-219`. Visible in Tag sheet "Assigned to" while items load.

Suggested fix: build one `Menu`/`Select` component (button + `role=listbox` popover in the glass material, native `<select>` kept only on coarse pointers where the iOS wheel is the better UX); dim the chevron when disabled; replace the datalist with it.

### P1-B. Settings page scroll
Measured with `scrollProbe` across 1440x900, 1512x982, 1280x720, 1024x768, 768x1024, 1920x1080 and 812x375 (`settings1.mjs`..`land.mjs` in `$S`):

1. Permanent dead zone below the last card: the detail wrapper has `pb-28` (112 px) always (`SettingsPage.tsx:~139`, `className="min-w-0 pb-28"`), reserved for the floating "Unsaved changes" bar even when it is not shown, plus `main` `sm:pb-16` (64 px, `Shell.tsx:292`). Result: about 176 px of blank scroll under every section. This alone creates a page scroll bar on pages whose content fits: e.g. 1512x982 /settings/messages and /settings/tags, 1920x1080 /settings/contact and /public, 768x1024 /settings/tags (content bottom 987 < 1024 but document 1051). Screenshot: `shots/settings-tags-1440-bottom.png` (large empty band under the last card).
2. Sticky nav hidden under the glass header: the list pane is `md:sticky md:top-4` (`ui/SplitView.tsx:24`) while the compact header is `position:fixed`, 52 px high. After scrolling, the nav top sits at 16 px, so the first row (Identity) is partly covered by the header (`shots/settings-tags-1440-bottom.png`, `shots/settings-ipad-air-landscape-scrolled.png`). Expected: `top` = header height + 1rem.
3. Double scroll: the list pane also has `md:max-h-[calc(100dvh-2rem)] md:overflow-y-auto`. At a short viewport (phone landscape 812x375 hits the `md` split) the nav becomes its own scroller (512 px content in 343 px box) on top of the page scroll (`shots/settings-phone-landscape-scrolled.png`). Expected: one scroll container.
4. Whole page scrolls although the master pane is meant to be an app-style split: the page header, nav and form scroll as one document, so the "Settings" title band scrolls away at 1024-1440 while the nav is pinned: two different scroll behaviours in one screen.
5. Phone: index (375x812) does not scroll; each section scrolls normally, which is expected. Duplicate heading: page `h1` "Identity" and first section heading "Identity" repeat (`shots/tour/settings-identity-375-light.png`).
6. Scroll lock under sheets: `body:has(dialog[open]){overflow:hidden}` (`styles.css` ~470). Does not stop rubber-band scroll of the page behind a sheet on iOS (unverified); on classic-scrollbar platforms it causes a layout shift when the scrollbar disappears (unverified).

Suggested fix: make bottom padding conditional (`dirty ? pb-28 : 0`, or rely on `scroll-padding`), set sticky `top` to `calc(var(--header-h)+1rem)`, drop `overflow-y-auto` on the list (or only when `max-h` is smaller than content using `@media (min-height: 40rem)`), optionally cap `SplitView` to the viewport so only the detail pane scrolls.

## P0 (broken)
None found. No horizontal overflow on any panel route at the four widths except the items below; no console errors in the panel or on local finder pages; axe: 0 serious/critical except one (P1).

## P1 (important)
1. Reduced transparency is ignored in OS-dark + Auto theme. Steps: OS dark, `prefers-reduced-transparency: reduce`, any page, open a sheet. Computed `--glass` stays `rgb(26 38 41/0.84)` and `--glass-strong` `/0.92`, only the blur is removed, so content shows through unblurred (worst legibility). Light and explicit `data-theme` are fine. Cause: the reduce block (`styles.css:297-304`, selector `:root,[data-theme]`) is overridden by the later `@media (prefers-color-scheme: dark){:root:not([data-theme=light])}` block (higher specificity, defined earlier in the file but re-asserting `--glass*`). Same risk for `prefers-contrast: more` (line ~319). Fix: repeat the overrides with `:root:not([data-theme="light"])` specificity or move them after the dark block. Evidence: `shots/rt-sheet-375-dark-reduce.png` vs `rt-sheet-375-light-reduce.png`.
2. Horizontal overflow on item detail with a long document filename (375 and 1024, Private details expanded): the link `warranty-with-a-rather-long-file-name-2026.png` extends to x=444 at 375 (page widens). `PrivateSection.tsx`. Fix: `min-w-0 truncate` on the filename. Evidence: `shots/tour/item-backpack-open-375-light.png`.
3. Contrast (axe serious, 3.47:1): archived item cards, "Documents" meta line `text-footnote text-muted` at reduced opacity, light theme, Inventory > Archived. Fix: do not combine `opacity` on the whole card with muted text. Evidence: `shots/inv-archived-375-light.png`.
4. Touch targets below 44 px on coarse pointers (375 and 768): inline links "Lost Mode" 65x16 and "Share Item Location" 123x16 in item detail help text, document links (18 px high), inbox "Cabin suitcase" item links (18 px), "(c) OpenStreetMap contributors" 15 px, Settings > Privacy inline links, Clear button in search 40x40, activity rows 31x44, checkboxes 20-22 px (inside larger labels, not an issue), finder footer "Privacy" 50x18. Fix: padding or `min-h-11` on inline links in touch contexts.
5. Tab order on phone: the tab bar and "+" are last in DOM, so a keyboard or switch user tabs through every card before reaching navigation (375 inventory: nav not reached in 14 stops). Fix: move the bar earlier in DOM or add a skip-to-navigation link.

## P2 (polish and consistency)
- Item detail on phone: Photos card stacks three full-width actions (Add photos / Stop sharing publicly / Delete photo) in a column, ~160 px; Tags and Photos come before About, pushing description and location below the first screen (`shots/tour/item-backpack-375-light.png`). Expected: one row of icon actions, About before Tags.
- "Item actions" sheet copy says "Edit, share settings, archive or delete" but only Edit and Archive are listed (delete only when archived); row subtitle "Archived items are hidden from the inventory and their tags stop working for finders until restored." is truncated with an ellipsis (`shots/item-more-375-after.png`). Same truncation in the Create sheet ("A tag and a printable card in a few t...").
- Tags page at 375: "Select all" sits at the right edge, nearly touching it, and item names truncate ("Navy travel back...") with a wasted wide status pill (`shots/tour/tags-375-light.png`).
- Return plan sheet: native date-time input renders US format (`mm/dd/yyyy`) despite locale en-GB in Settings; the setting is not applied. Search placeholder truncates ("Station, hotel, cafe..") (`shots/tour/propose-375-dark.png`).
- Settings > Tags: fieldset "Card message" legend sits on the border of a filled well, half in and half out (`shots/settings-tags-1440-bottom.png`). Also the "Unsaved changes" bar is centred on the viewport, not on the content column.
- Phone item list: inventory name clamps and tab bar overlaps the last row until scrolled (acceptable, by design with floating bar); FAB duplicates "New" and the Quick card button.
- Gallery at 375: section chip strip is wider than the viewport and makes the document overflow horizontally (`shots/tour/gallery-375-light.png`). Internal tool, low priority.
- Heading duplication on settings subpages (see above); Inbox thread at 768 uses a single pane with the nav rail, no master-detail (spec said md split for Inbox): `shots/tour/thread-c1-768-light.png`.
- Live tag page (`/t/<real-tag-token>`): fine overall, but the owner e-mail is shown in plain text (owner choice, document it), and the "Write to the owner" floating bar covers the message field label while scrolling (`shots/live/tag-375-light.png`, full-page artefact partly). Turnstile adds a blank gap before the Send button until it loads.

## Finder pages: performance and robustness
- Slow 3G (400 ms RTT, 500 kbps, cache off, 375 px): live tag page first paint 1268 ms, LCP 1268 ms (lead paragraph), HTML 2.3 KB, CSS 6.6 KB, JS 2.0 KB; full load 4.6 s only because of Turnstile (`api.js` ends at 2.2 s, challenge frame at 4.6 s). The message can be read and typed before then. Local finder page with photo: FCP 1.7 s, LCP is the item photo, 13.7 KB (`shots/slow3g-live_tag.png`, `shots/slow3g-local_tag.png`).
- Live console on tag page: `[warning] No available adapters.`, `[http 401] challenges.cloudflare.com/cdn-cgi/challenge-platform/...`, `[warning] OTS parsing error: Size of decompressed WOFF 2.0 is less than compressed size`, `[error] %c%d font-size:0;color:transparent NaN` (all from the Cloudflare Turnstile iframe in headless Chromium, not RETURN code). Home, /privacy, /emergency: no console errors, axe clean at 375 and 1440 (`live-report.json`).
- Local finder pages with `bypassCSP` for axe: no violations.

## Keyboard, touch, motion
- Tab order logical on inventory (skip link, logo, New, nav, search, actions, filters, select, cards); every stop has a 3 px visible ring; focus returns to the opener after Escape on sheets; focus stays inside the dialog (one stop reaches browser chrome, normal). Select focus ring is present (3 px petrol).
- Reduced motion: no animation issues observed; sheets appear without transition.
- Coarse pointer: no sticky hover found in the captures; touch target findings above.

## What works well
- Consistent token system; light and dark both hold AA contrast on every captured state (axe: one violation in 328 captures).
- Floating glass tab bar, rail and sidebar adapt cleanly at 375/768/1024/1440; sheets are bottom sheets on phone and side panels from 640 px.
- All controls are 44 px, 16 px type (no iOS zoom), strong focus rings, skip link, single h1 per page.
- Finder pages are tiny (2-7 KB), paint in about 1.3 s on slow 3G, language switch at the top, readable in dark mode.
- Empty, loading and error states exist for inventory search, inbox and settings; Return plan terminology is consistent in panel and finder.
- Quick card flow and item picker are a good pattern to reuse for dropdowns.
