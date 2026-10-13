# UX audit 002: panel and finder pages

Date: 2026-10-13 · Build: phase 1 + place names (in progress) · Auditor: design-engineer

## Method
- Isolated local stack (own D1/R2 state, so the 500 E2E items in the shared DB stay out). Seeded through the owner API:
  10 items (7 with generated photos, 3 with category fallback, 1 archived, 1 with an 80-character name), 9 tags
  (2 unassigned), 1 lost item, 3 finder conversations started by posting the tag form (EN with GPS + an accepted
  proposal + a second location; ES unread; DE closed).
- 140 full-page screenshots: 13 panel routes and 6 finder routes at 375/768/1024/1440 px, light and dark (OS
  preference emulated). axe-core 4.14 (from `node_modules`) on every page at 375 and 1440 px. Horizontal-overflow and
  touch-target (< 44 px on coarse pointers) probes on every capture.
- Screenshots: `$SCRATCH/shots/audit/<route>-<width>-<theme>.png`, where `$SCRATCH` =
  `/private/tmp/claude-501/-Users-lr0y-Workspace-10-Projects-Personal-Return-App/466d170e-3321-44b8-a21f-fa039fca4f30/scratchpad`
  (raw metrics in `report.json` next to them). Scratch files are not kept in the repo.

## Baseline (what already passes)
- axe: **0 serious/critical violations** on all 21 routes × 2 widths × 2 themes.
- No horizontal overflow at any width.
- Skip link, single focused `h1` after navigation, live regions for results and toasts, `aria-current` in nav,
  native `<dialog>` focus handling, reduced-motion reset are all already in place.

## Findings
P1 = blocks the phase goal (premium, coherent on all three devices) or breaks WCAG/target rules. P2 = visible
inconsistency or friction in a main flow. P3 = polish.

| # | Sev | Finding | Evidence | Affected | Fix |
|---|---|---|---|---|---|
| 1 | P1 | **Tablet has no layout of its own.** 640–1023 px renders the phone layout stretched: bottom bar with 4 tabs spread over 768 px, Inbox list in one column with half the screen empty, Settings as a link list with drill-down. | `p-inbox-768-light`, `p-inventory-768-light`, `p-settings-768-light` | `components/Shell.tsx`, `pages/InboxPage.tsx`, `pages/settings/SettingsPage.tsx` | Floating nav rail on tablet (done in Shell v2). Pages: master–detail for Inbox and Settings from `md` (768), not only `lg`. |
| 2 | P1 | **Touch targets shrink to 36 px on tablets.** `Button size="sm"` uses `sm:min-h-9`, so at 640–1023 px (touch) every small button is 36 px: Set location, Add tag, Print cards, Add tracker, Update recovery, map links, More actions, all Print studio downloads (24 targets on one page). | `report.json` (768 rows), `p-item-lost-768-light`, `p-print-768-light` | `ui/Button.tsx` | Size by pointer, not width: `min-h-9 pointer-coarse:min-h-11` (done in Button v2). |
| 3 | P1 | **No visual language yet.** Flat cards on a flat background, no depth or material hierarchy between chrome and content; the panel reads as a generic admin dashboard, the finder pages as a separate product (pill buttons, 14 px radii, different dark petrol `#7fc3cf` vs `#8ccbd5`). | `p-inventory-1440-dark`, `f-tag-lost-375-light`, `f-conv-375-dark` | `styles.css`, `public/p/public.css` | Design system v2 (Liquid Glass chrome over an ambient canvas, one token set mirrored in both stylesheets): `docs/design/system.md`. |
| 4 | P1 | **Item detail on phone is 3,300 px of 11 stacked cards** (card soup). Primary facts (status, tags, where it is) are mixed with rare actions (Archive, Trackers help). Edit buttons sit in three different positions (header right, below heading, inline). | `p-item-lost-375-light`, `p-item-lost-1024-light` | `pages/item/*` | Hero (photo + title + StatusPill + primary action), then grouped `List`/`ListRow` sections; rare actions into a "More" sheet; one rule: section actions live in `Section actions` (top right). |
| 5 | P1 | **No quick path from "at the airport" to a printable card.** Creating a tag and printing needs Tags → New tags → Print studio (CR80 PVC layout) → download; nothing for plain paper or the share sheet. | `p-print-1440-light` | new flow | "Quick card" flow (spec in `system.md` § Flows, mock in `/gallery`): FAB and item hero → sheet → PNG/PDF fold-over card or Share. |
| 6 | P2 | **Locations show a label or nothing**: panel location cards print only the finder's label; coordinates are hidden when a label exists; no place name or OSM attribution yet. Finder places card stacks 7 equal-weight lines. | `p-thread-375-light`, `f-conv-375-dark` | `pages/inbox/Thread.tsx`, `src/worker/public/conversation-view.tsx` | `PlaceLabel` (name → detail → small coords + accuracy → attribution) and `MapLinks` (compact pair) in the panel; `.place*` classes on the finder (template change list below). |
| 7 | P2 | **Map links are two full-width buttons per card** in the thread (4 per location + proposal), dominating the conversation. | `p-thread-375-light` | `pages/inbox/Thread.tsx` | `MapLinks` component: one segmented pair, 44 px, icons + short labels "Google Maps" / "Apple Maps". |
| 8 | P2 | **Sheets are centred modals from 768 px** and have no grabber or swipe on phone. Long forms (Add item, Proposal) lose context on tablet/desktop. | `p-inventory-add-375-light`, `p-inventory-add-1024-light` | `ui/Sheet.tsx` | Sheet v2: bottom sheet with grabber + drag-to-dismiss on phone, floating side panel from 640 px; `ConfirmDialog` uses the centred alert placement (done). |
| 9 | P2 | **Attention strip shouts.** A terracotta panel with three chips on every inventory visit; terracotta is the "lost" colour, so unread messages also read as alarms. Copy is not pluralised ("1 unread conversations", "1 lost items", "1 open recoveries"). | `p-inventory-375-light` | `pages/InventoryPage.tsx`, `lib/dict.ts` | Neutral `Card` with `ListRow`s; terracotta only on the lost row; `Intl.PluralRules` keys (`.one`/`.other`) in dict. |
| 10 | P2 | **Phone inventory has three "add" actions** (header Add item, New tag, FAB) and the FAB covers the last card's meta. Item names truncate to one line in the 2-column grid ("Noise-cancellin…"). | `p-inventory-375-light` | `pages/InventoryPage.tsx`, `components/ItemCard.tsx` | Shell owns the FAB (quick actions); hide header actions below `md`; 2-line clamp for names; bottom padding from `--shell-bottom`. |
| 11 | P2 | **Focus ring changes the shape of the control**: global `:focus-visible { border-radius: .375rem }` squares pills, chips and round buttons when focused. | `styles.css` line 146 | `src/app/styles.css` | Ring via `outline` only, inherit radius; offset 2 px (done). |
| 12 | P2 | **Finder: the primary action is below the fold.** On the tag page the "Send message" button is ~1,500 px down after the message, name and a nested location fieldset (box in box in box). Lost banner sits above the title, so hierarchy reads Banner → eyebrow → title. | `f-tag-lost-375-light` | `public/p/public.css`, `src/worker/public/pages.tsx` | Hero card (photo, title, owner, lost pill), floating glass bottom bar with "Write to the owner" anchor; flatten the location fieldset (`.location` without border inside cards). |
| 13 | P2 | **Toggle off state looks "on"**: off knob is solid ink on a light track. | `p-print-1440-light` (Appearance) | `ui/Field.tsx` | iOS-style switch: off = neutral track + white knob with shadow; on = primary track (done). |
| 14 | P2 | **Terminology drifts**: panel "Handover proposal", finder "Return suggestions", inbox "Propose a handover". Panel reply placeholder mentions "Ctrl/Cmd+Enter" on phones. Finder reply card has heading "Your reply" and label "Your reply". | `p-thread-375-light`, `f-conv-375-dark` | `lib/dict.ts`, `src/worker/public/i18n.ts` | One term: **"Return plan"** (EN) / "Plan de devolución" (ES) / "Rückgabe-Plan" (DE). Keyboard hint only on `pointer: fine`. Visually hide the duplicate label. |
| 15 | P3 | **Theme switch is a cycling button** labelled "Auto" with a sun icon; state is unclear. | `p-inventory-1440-dark` (sidebar) | `components/Shell.tsx` | Segmented Auto/Light/Dark in Settings › Identity › Appearance; Shell keeps a compact menu entry (done in Shell). |
| 16 | P3 | **"LOST" is uppercase in the string**, so screen readers spell it and filters shout. | `p-inventory-375-light` | `lib/dict.ts` | String "Lost"; `StatusPill` applies small-caps styling visually. |
| 17 | P3 | **Native selects** show the platform arrow without padding; inconsistent with inputs. | `p-inventory-768-light` | `ui/Field.tsx` | `appearance: none` + chevron icon + `pr-10` (done). |
| 18 | P3 | **Category fallback tile** is a large flat petrol block that outweighs real photos in the grid. | `p-inventory-1440-dark` | `components/ItemCard.tsx` | `Thumb` with a soft tinted gradient and smaller icon (done). |
| 19 | P3 | **`dark:` variant ignores the OS preference** (only `[data-theme=dark]`); no current usages, but any future `dark:` class would break in Auto mode. | `styles.css` line 4 | `src/app/styles.css` | Variant also matches `prefers-color-scheme: dark` when no explicit light choice (done). |
| 20 | P3 | **Finder pages lack `viewport-fit=cover` and `theme-color`**, so a floating bottom bar cannot respect the iPhone home indicator. | `layout.tsx` head | `src/worker/public/layout.tsx` | Template change T1 below. |

Not reproduced: the 20×20 checkboxes flagged by the probe on Tags/Print sit inside 44×44 labels (false positive).

## Page-level changes for the next agent (frontend-engineer)
Apply the v2 library (`docs/design/system.md` §9); do not restyle locally. Already done by design-engineer as trivial
call-site updates: `InventoryPage` (page FAB removed, `?new=item` opens Add item, category `Select` uses
`labelHidden`), `SystemSection` (link to `/gallery`).

1. **Shell integration (all pages):** anything fixed at the bottom uses `bottom-[calc(var(--shell-bottom)+0.75rem)]`
   instead of `bottom-[calc(4.75rem+…)]` (TagsPage bulk bar → `Toolbar floating`; SettingsPage unsaved bar →
   `Toolbar floating`). Handle `?quick-card=1` on `/` and `/items/:id` (Quick card sheet, lead). Header actions that
   duplicate the Create sheet: `PageHeader hideActionsOnPhone`.
2. **InboxPage:** `SplitView` (master–detail from 768 px); rows → `ListRow` (+ `Avatar`, `CountBadge`/unread);
   status filter → `SegmentedControl`. Thread: locations and proposals use `PlaceLabel` + `MapLinks`; proposals in
   `Card variant="outline"` + `StatusPill`; composer keyboard hint only on fine pointers.
3. **SettingsPage:** `SplitView listWidth="sm"`; section nav → `List` + `ListRow` + `IconTile`; `SectionCard` →
   `Section` with `List`/`Toggle` rows; add Appearance (`AppearanceControl` from `components/QuickActions.tsx`) to
   Identity.
4. **ItemDetailPage:** hero (`Thumb xl` or photo, title, `StatusPill`, one primary action, `IconButton more`), then
   `Section`s with `List`/`ListRow`/`KeyValue`; recoveries → `Timeline`; archive/delete and tracker help into the
   More sheet; "Quick card" button in the hero (`?quick-card=1`).
5. **InventoryPage:** attention strip → neutral `Card` + `ListRow`s (terracotta only for the lost row); search →
   `SearchField`; loading → `Skeleton` grid (already), empty → `EmptyState` (already).
6. **TagsPage / PrintStudio:** rows → `ListRow` (QR `IconTile`, number, item, `StatusPill`); bulk bar → `Toolbar
   floating`.
7. **Copy (`lib/dict.ts`, EN + ES):** plural keys for attention counts; "Lost" (not "LOST"); "Return plan"
   terminology; drop "(Ctrl/Cmd+Enter to send)" from the placeholder. **Move the strings in
   `components/shell-strings.ts` into dict** (`quick.*`, `nav.expand/collapse`, `theme.appearance`, `common.new`,
   `system.gallery`) and delete that file.
8. **Shared contract (lead):** move `OSM_ATTRIBUTION` + copyright URL from `worker/services/geocode.ts` to
   `src/shared/` and import it in `ui/Place.tsx` (today a documented copy, because the worker module is not
   importable from the SPA).
9. **E2E:** link names now include counts ("1 unread Inbox"); sheets are side panels from 640 px; ConfirmDialog is a
   centred alert. Update selectors that relied on the old layout.

### Finder template changes (route to the agent editing `src/worker/public/**`)
All styles exist in `public/p/public.css` v2 and old class names keep working, so these can land in any order. Already
handled by CSS alone (no template change needed): flat location group inside cards, map links as a capsule pair,
`.chip` styled as a pill, sticky glass top bar, logo mark.

| # | File | Change |
|---|---|---|
| T1 | `layout.tsx` (+ `public/p/emergency.html`) | `viewport` meta → `width=device-width, initial-scale=1, viewport-fit=cover`; add `<meta name="theme-color" content="#FAF7F2" media="(prefers-color-scheme: light)">` and `content="#0F1719"` for dark. |
| T2 | `pages.tsx` TagPage | Wrap eyebrow/title/owner/photo/lead in `<section class="hero">`; move the lost banner below the title (inside the hero). |
| T3 | `pages.tsx` TagPage | After the form card: `<nav class="action-bar" aria-label={t.tag.writeHeading}><a class="btn btn-primary btn-block" href="#write">{t.tag.writeHeading}</a></nav>` (floating glass bar, phones only; CSS hides it ≥ 640 px). |
| T4 | `conversation-view.tsx` | Place block: `<p class="place-name">`, `<p class="place-detail">`, finder label as `<p class="place-label">“…”</p>`, coordinates `<p class="place-coords">lat, lng · ±n m</p>`, attribution `<p class="place-attrib"><a …>© OpenStreetMap contributors</a></p>`. |
| T5 | `conversation-view.tsx` | Proposal chip → `<span class="pill pill-{status}">` (`proposed`, `accepted`, others neutral). |
| T6 | `conversation-view.tsx` | Reply card: `<label class="visually-hidden">` for the duplicate "Your reply" label (the h2 stays). Messages from the system keep `bubble from-system` (styled centred). |
| T7 | `i18n.ts` | "Return suggestions"/"Handover proposal" → "Return plan" / "Rückgabe-Plan" / "Plan de devolución". |
| T8 | `conversation-view.tsx` MapLinks | Optional: shorter visible labels "Google Maps" / "Apple Maps" with `aria-label` "Open in … Maps" (CSS already lays the pair out; long labels wrap below 360 px). |
