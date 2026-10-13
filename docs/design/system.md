# RETURN design system v2

Status: implemented (tokens, library, shell, finder CSS) · 2026-10-13 · Owner: design-engineer
Files: `src/app/styles.css` (panel tokens + materials), `src/app/ui/**` (library), `src/app/components/Shell.tsx`
(chrome), `public/p/public.css` (finder pages), living gallery at **`/gallery`** (Settings › System).
Audit that motivated it: `docs/design/audit-002.md`.

## 1. Direction
**Calm · translucent · travel-ready.** Apple's current design language (Liquid Glass, iOS 26/27) applied with
restraint: a glass *chrome* layer floats over a warm, photo-forward *content* layer. Petrol for action, sage for
"all good", terracotta only for "lost". One product for the owner (panel) and for strangers (finder pages).

Reference patterns: iOS 26 floating tab bar + separate action button (Music/Photos), iPadOS sidebar-adaptable tab
view (rail → sidebar), Settings-style inset grouped lists, Messages bubbles, Wallet pass layout for the printed card.

Avoid: gradients as decoration, centred-everything heroes, card soup (stacks of identical cards), grey-on-grey,
emoji icons, glass on content (lists, text, forms), more than one primary action per view, colour as the only signal.

### Sources (Apple HIG, read 2026-10-13 via developer.apple.com JSON endpoints)
- Materials — <https://developer.apple.com/design/human-interface-guidelines/materials>: "Liquid Glass forms a distinct
  functional layer for controls and navigation elements … that floats above the content layer"; "Don't use Liquid Glass
  in the content layer"; "Use Liquid Glass effects sparingly"; regular variant "blurs and adjusts the luminosity of
  background content to maintain legibility"; clear variant only over rich media with a ~35 % dimming layer; appearance
  adapts to reduce transparency / increase contrast.
- Color — <https://developer.apple.com/design/human-interface-guidelines/color>: tint the *background* of the primary
  action, "apply color sparingly", "Liquid Glass appears more opaque in larger elements like sidebars".
- Tab bars — <https://developer.apple.com/design/human-interface-guidelines/tab-bars>: "A tab bar floats above content
  at the bottom of the screen"; single-word labels; badges only for critical info; "Use a tab bar to support navigation,
  not to provide actions" (hence the separate "+" button); on iPad a tab bar can convert to a sidebar.
- Sheets — <https://developer.apple.com/design/human-interface-guidelines/sheets>: grabber in resizable sheets, swipe
  to dismiss, Cancel/Done pairing, form/page sheets on iPad.

How we applied them: glass only on chrome (tab bar, rail, sidebar, compact header, toasts, floating toolbars, sheets);
larger glass is more opaque (`glass-strong`); the primary action is a tinted solid with a specular edge; no "clear"
variant (we never float controls over full-bleed media except the gallery demo).

## 2. Token architecture
| Layer | Where | Examples | Rule |
|---|---|---|---|
| Primitive | `styles.css` §1 | `--petrol-600`, `--sand-50`, `--terracotta-600`, `--ink-875` | Raw palette mirroring `src/shared/brand.ts`. Never used in components. |
| Semantic | `styles.css` §2 (light, dark ×2) + §2c; `public.css` (same names) | `--surface`, `--raised`, `--fg`, `--muted`, `--primary`, `--lost`, `--glass`, `--shadow-2`, `--dur-base` | Meaning, not appearance. Themes and accessibility modes swap these. |
| Theme (Tailwind) | `styles.css` §3 `@theme inline` | `bg-raised`, `text-muted`, `rounded-card`, `text-headline`, `ease-spring`, `px-page-x` | The only API components use. No hex, no px colours in `.tsx`. |
| Component | rare | `dialog.sheet`, `.chrome-header` | Only when a component needs CSS that utilities cannot express. |

Dark mode: `[data-theme="dark"]` (explicit choice) and `prefers-color-scheme: dark` without an explicit light choice.
The two dark blocks in `styles.css` must stay identical. The `dark:` variant follows the same rule. Any element can
force a theme with `data-theme` (the gallery uses it for side-by-side previews). Finder pages follow the OS only.

## 3. Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `surface` | #FAF7F2 | #0F1719 | App canvas (with two static brand glows) |
| `raised` | #FFFDF9 | #172225 | Cards, lists, fields |
| `sunken` | #F1ECE3 | #0B1214 | Wells, skeletons, inset notes |
| `fill` / `-hover` / `-pressed` | ink 6/10/14 % | sand 8/12/17 % | Secondary buttons, segmented tracks, chips |
| `fg` / `muted` | #1B2326 / #55656A | #EDEBE6 / #A3B1B5 | Text |
| `line` / `line-strong` | #E3DED5 / #7A8588 | #2A373B / #7F9096 | Dividers / control edges (≥ 3:1) |
| `primary` (+`-fg`, `-text`, `-tint`) | #0E4A55 | #8CCBD5 | Actions, selection, links |
| `accent`, `success` (+`-tint`) | sage #3F5E4A text | #A8C7AF | Success, "with you", agreed |
| `lost` (+`-fg`, `-tint`) | #A84A27 | #F0A27F | Lost state, unread counts. Nothing else. |
| `warning` (+`-tint`) | #7A5100 | #E8C47A | Needs setup, near limits |
| `danger` (+`-fg`, `-tint`) | #A12D2D | #EE8A86 | Errors, destructive actions |
| `glass`, `glass-strong`, `glass-solid` | sand 84 % / 92 % / #FCFBF8 | ink 84 % / 92 % / #1A2629 | Chrome materials |
| `on-glass-muted`, `on-glass-primary`, `on-glass-lost` | #3E4D52, #0E4A55, #93401F | #C3CDD0, #A9DAE1, #F4B597 | Text on glass |

### Contrast (WCAG 2.2 AA), computed with the WCAG formula
Glass rows are the **worst case** over black, white, petrol, terracotta and sage backdrops (blur only lowers contrast
variance, so these are lower bounds).

| Pair | Light | Dark | Min |
|---|---|---|---|
| fg / surface · raised · sunken | 14.9 · 15.7 · 13.6 | 15.2 · 13.6 · 15.9 | 4.5 |
| muted / surface · raised · sunken | 5.7 · 6.0 · 5.2 | 8.2 · 7.4 · 8.6 | 4.5 |
| muted / fill track · primary-tint | 5.1 · 5.0 | 6.8 · 5.5 | 4.5 |
| primary-fg / primary | 9.9 | 9.0 | 4.5 |
| primary-text / raised · primary-tint | 9.7 · 8.1 | 9.0 · 6.7 | 4.5 |
| accent-text / accent-tint | 6.0 | 7.8 | 4.5 |
| lost / lost-tint · raised; lost-fg / lost | 4.7 · 5.6; 5.7 | 7.2 · 7.9; 8.6 | 4.5 |
| danger / danger-tint; danger-fg / danger | 5.8; 7.2 | 6.3; 7.9 | 4.5 |
| warning / warning-tint; solid | 5.9; 6.5 | 8.7; 10.9 | 4.5 |
| success solid (surface on success) | 6.8 | 9.9 | 4.5 |
| line-strong / raised · surface (UI) | 3.7 · 3.6 | 4.9 · 5.5 | 3 |
| ring / surface · raised (focus) | 9.2 · 9.7 | 10.0 · 9.0 | 3 |
| fg on glass (84 %) worst case | 10.7 | 7.8 | 4.5 |
| on-glass-muted on glass worst case | 5.9 | 5.7 | 4.5 |
| on-glass-primary on glass worst case | 6.6 | 6.1 | 4.5 |
| on-glass-lost on glass worst case | 4.7 | 5.3 | 4.5 |
| active tab (primary on tint over glass) | 8.2 | 8.2 | 4.5 |
| finder "my" bubble (85 % fg on primary) | 7.6 | 6.5 | 4.5 |

Rule: plain `muted` is **not** allowed on glass (3.1:1 worst case at 74 %; that is why glass is 84 % and has its own
`on-glass-*` text tokens).

## 4. Materials (Liquid Glass)
| Utility | Recipe | Where |
|---|---|---|
| `glass` | `--glass` + `backdrop-filter: blur(22px) saturate(180%)` + 1 px light edge + specular inset + `--shadow-glass` | Tab bar, rail, toasts, floating toolbar, finder action bar |
| `glass-strong` | same at 92 % | Desktop sidebar, sheets (more text, larger area) |
| `glass-bar` | `--glass` + filter + bottom hairline, no shadow | Compact header (panel), finder top bar |
| `specular` | inset highlight + inset shade + `--shadow-2` | Solid tinted controls: primary buttons, FAB |
| finder `.card` | `--card-glass` (80 %) + edge + specular, **no blur** | Finder content cards over the static canvas |

Fallbacks (automatic, token-level): `prefers-reduced-transparency: reduce`, `prefers-contrast: more`, no
`backdrop-filter` support → `--glass*` = solid, filter `none`; increased contrast also strengthens `muted` and `line`.
These blocks list `:root, :root:not([data-theme="light"]), [data-theme]` and come after the theme blocks: the OS-dark
block has specificity 0-2-0, so a plain `:root` override lost to it in Auto + OS dark (fixed 2026-10-13; verified in
all four combinations light/dark × Auto/explicit).
`forced-colors` draws real borders. QA switch: `data-transparency="reduce"` on any element (gallery checkbox).

Performance rules: at most **3 blurred layers on screen** (header, tab bar, one toast/sheet); never blur inside
scrolling lists; no animated blur radius; the canvas glow is a fixed, static gradient.

## 5. Typography
System stack (`-apple-system, "SF Pro Text"/"SF Pro Display", system-ui, Segoe UI, Roboto…`), no web fonts.
iOS text styles, 16 px web body (finder: 17 px body for strangers on phones).

| Token (`text-*`) | Size / line | Weight | Use |
|---|---|---|---|
| `large-title` | clamp(30→34) / 1.15, −0.02em | 700 | Page h1 (PageHeader) |
| `title1` | 28 / 34 | 700 | Rare (hero numbers) |
| `title2` | 22 / 28 | 700 | Gallery sections, finder h2 (20) |
| `title3` | 20 / 26 | 600 | Card and sheet titles |
| `headline` | 17 / 24 | 600 | Section headers, compact header title |
| `body` | 16 / 24 | 400–600 | Text, list titles |
| `subhead` | 15 / 22 | 400–600 | Secondary lines, controls |
| `footnote` | 13 / 18 | 400 | Hints, meta, counters |
| `caption` | 12 / 16 | 600 | Badges, coordinates |

Headings `text-wrap: balance`; paragraphs `pretty`; measure ≤ `max-w-prose` (40rem); numbers `tabular-nums`; ids and
URLs `font-mono`.

## 6. Space, layout, shape, elevation
- **Spacing**: 4 px grid (Tailwind scale). Rhythm: 4/8 inside controls, 12/16 inside cards, 24 between sections,
  32–48 between page regions. Page gutter token `px-page-x`: 16 / 24 / 40 px (phone / tablet / desktop).
- **Breakpoints**: phone < 640 (`max-sm`), tablet 640–1023 (`sm`–`lg`), desktop ≥ 1024 (`lg`). Use `md` (768) for
  master–detail splits. Touch sizing follows `pointer-coarse:`, not width.
- **Grids**: content max 72rem (`max-w-page`), prose 40rem; inventory 2 / 3 / 4 columns (phone / md / xl);
  `SplitView` list 17–22rem + detail from 768 px; settings nav 13–16rem.
- **Radius**: text entry 14 (`rounded-control`: TextInput, TextArea), card 20 (`rounded-card`, also popovers),
  sheet/chrome 28 (`rounded-sheet`), capsules full for everything you *choose or press*: buttons, chips, segmented
  controls, SearchField, Select, Combobox. Rows inside a popover use 14 (= 20 − 6 px padding). Nested radius =
  outer − padding.
- **Chrome tokens**: `--header-h` (compact glass header incl. safe area; sticky content uses
  `top: calc(var(--header-h) + 1rem)`), `--shell-left` (width of rail/sidebar + gap, 0 on phones; set by the Shell),
  `--shell-bottom` (below). Variant `tall:` = `min-height: 40rem` (pin side navigation only where it fits).
- **Touch targets**: controls are ≥ 44 px on coarse pointers. Inline links in text and attributions use the
  `touch-target` utility (an invisible ≥ 44 × 44 hit area on coarse pointers, no layout change); links inside
  truncated/overflow-hidden rows get `pointer-coarse:min-h-11` instead.
- **Elevation**: `shadow-card` (content), `shadow-float` (hover, floating content), `shadow-overlay` (sheets),
  `shadow-glass` (chrome). Dark mode relies on surface steps more than shadows.
- **Safe areas**: chrome uses `env(safe-area-inset-*)` (panel viewport has `viewport-fit=cover`); content reserves
  `--shell-bottom` (tab bar height + inset) on phones: use `pb-[var(--shell-bottom)]` /
  `bottom-[calc(var(--shell-bottom)+…)]` for anything fixed at the bottom.

## 7. Motion
Durations `--dur-fast` 120 ms (hover, colour), `--dur-base` 200 ms (press, fades), `--dur-slow` 320 ms (side panels),
`--dur-sheet` 420 ms (bottom sheets). Easing `ease-standard` (decelerate), `ease-exit`, `ease-spring` (CSS `linear()`
spring, ~4 % overshoot) for presses, toggles and sheets. Animate `transform`/`opacity` only. `pressable` = 0.97 scale on
press. `prefers-reduced-motion: reduce` disables all animation and transitions (global reset).

## 8. Shell (chrome)
| Device | Navigation | Create | Header |
|---|---|---|---|
| Phone < 640 | Floating glass capsule tab bar (4 tabs, icon + 11 px label, unread badge), 12 px from edges + safe area. In the DOM right after the header (before `main`), so keyboard/switch users reach it after the skip link and header; visual position unchanged | Separate round petrol "+" next to the bar (HIG: tab bars navigate, they don't act) | Sticky compact header: logo at rest; turns glass when content scrolls under; shows the page title once the large title scrolls away; Appearance button |
| Tablet 640–1023 | Floating glass rail, collapsed (icons over labels, 84 px) or expanded (icon + label rows, 232 px), choice remembered (`return.rail`); scrolls on short viewports (landscape phones) | "+" at the top of the rail | Glass title bar appears only when the large title has scrolled away |
| Desktop ≥ 1024 | Floating `glass-strong` sidebar (256 px): wordmark, "New", nav with counts, Appearance segmented control | "New" button | Same as tablet |

The "+"/"New" opens **Create** (sheet): Quick card, Add item, New tags. Actions are URLs pages handle:
`/?new=item`, `/?quick-card=1`, `/items/:id?quick-card=1` (from an item page), `/tags?new=1`.

## 9. Component inventory (`src/app/ui`)
All components: typed props, no `any`, semantic HTML first, visible `:focus-visible` ring (3 px, never changes shape),
≥ 44 px targets on coarse pointers, text + icon (never colour alone). Callers pass layout classes only.

| Component | File | Variants / props | States | Rules |
|---|---|---|---|---|
| `Button`, `ButtonLink`, `buttonClass` | Button.tsx | `primary · secondary · tinted · ghost · danger · danger-soft · glass`; `sm · md · lg`; `icon`, `iconEnd`, `block`, `loading` | hover, active (spring), focus, disabled, loading (aria-busy, label kept) | One primary per view. `glass` only over media/chrome. External links get `rel=noopener`. |
| `IconButton` | Button.tsx | same variants; `sm · md · lg` | as Button | `label` required (name + tooltip). |
| `Spinner` | Button.tsx | size via class | — | Decorative; pair with text or aria-busy. |
| `TextInput`, `TextArea` | Field.tsx | `hint`, `error`, `required`, `labelHidden`, `showCount` (+`maxLength`), `leadingIcon` | hover, focus, invalid (aria-invalid + ring + message), disabled | Label always present; errors linked by aria-describedby; form-level `FormError` announces. `Select` in Field.tsx is **deprecated** (native only, children API); use ui/Select.tsx. |
| `Select`, `Combobox`, `Menu` | Select.tsx, Menu.tsx | see § 9a | open, active option, selected, disabled, invalid | Glass popover in the top layer; native picker on coarse pointers (Select). |
| `Field` | Field.tsx | render prop `{ id, describedBy }` | — | Wrap custom controls in the same anatomy. |
| `SearchField` | Field.tsx | `label` (hidden), `clearLabel` | empty, typed (clear button) | Pill; `enterkeyhint=search`. |
| `Toggle` | Field.tsx | `description` | on, off, disabled, focus | Settings that apply at once. Row is the target; switch on the right. |
| `Checkbox` | Field.tsx | `description` | checked, unchecked, disabled | Consent, multi-select. |
| `RadioGroup` | Field.tsx | options with `description`, `disabled` | selected row tinted | 2–6 options that need explanation. |
| `SegmentedControl` | Field.tsx | `sm · md`, `block`, icons | selected thumb, focus, disabled | 2–4 short exclusive options (filters, appearance, paper size). Native radios. |
| `FormError` | Field.tsx | — | role=alert | One per form, above the footer. |
| `Card`, `SectionHeading` | Card.tsx | `raised · outline · inset · tinted · lost`; padding `none · sm · md` | — | Content layer, never glass. |
| `Section` | Card.tsx | `title`, `description`, `actions`, `footer`; `collapsible` (+`summary`, `defaultOpen`) | open, closed | Grouped page sections (prefer over stacking Cards). `collapsible` = native disclosure for secondary/private info; actions appear inside when open. |
| `List`, `ListRow`, `IconTile` | List.tsx | List `inset · plain`; Row `to · href · onClick · static`, `leading`, `subtitle`, `description`, `trailing`, `strong`, `current`, `tone` | hover, pressed, current (aria-current) | Settings-style rows ≥ 56 px; chevron for navigation; external icon for `href`. `flush` inside padded containers; `select` adds a 48 px checkbox cell (bulk actions) or a `"spacer"`; `tone` `lost` only for lost-state rows. |
| `Badge` | Badge.tsx | tones `neutral · info · success · warning · lost · danger`; `solid` | — | A property. |
| `StatusPill` | Badge.tsx | tones; `pulse`; `solid` | — | The state of a thing (dot + word). |
| `CountBadge` | Badge.tsx | `count`, spoken `label` | hidden at 0, "99+" | Navigation counts only. |
| `Thumb`, `Avatar` | Thumb.tsx | Thumb `xs · sm · md · lg · xl · fill`, photo or category fallback | lazy | Decorative alt by default. Avatar = initial only (never a stranger's photo). |
| `Sheet`, `SheetBody`, `SheetFooter` | Sheet.tsx | `size md · lg`; `placement auto · compact · center` | open (spring), dragging, closed | Phone: bottom sheet + grabber + drag/scrim/Esc to close. ≥ 640: `auto` = floating side panel (forms), `compact` = small centred panel (short menus such as Create), `center` = alert on every size. Footer: Cancel then primary; solid so scrolled content never shows through. Escape = native `cancel` (prevented; the parent closes via `open`); a `close` the parent did not ask for is reported once, a late `close` after a programmatic close never is. Controls that own Escape (Select, Combobox, Menu) cancel the keydown so the sheet stays open. |
| `ConfirmDialog` | ConfirmDialog.tsx | `tone danger · primary`, `typed` | pending, error (stays open) | Centred alert. Typed confirmation for irreversible actions. |
| `ToastProvider`, `useToast` | Toast.tsx | tones `success · error · info`; options `action`, `sticky` | auto-dismiss 4.5 s / 8 s; `sticky` stays until closed | Glass capsule above the tab bar; errors are alerts. `sticky` is for decisions the user must not miss ("Update ready"). |
| `OfflineBanner` | components/OfflineBanner.tsx | state from `useConnectivity()`: `offline` · `unreachable` | hidden when online | Warning-tint card at the top of `main` (above `AlertsBanner`) on every screen. `offline` (browser says no network): "You are offline", Try again. `unreachable` (online but the API failed at network level, e.g. expired Access session): Try again + Reload. The shell still renders from the service worker; pages show their own `ErrorState`. No offline data in v1. |
| `PwaUpdateToast` | components/PwaUpdateToast.tsx | none (renders nothing) | — | While a new service worker waits: sticky info toast "Update ready" with a Reload action (skip waiting, reload into the new build). |
| `Tabs`, `Chip` | Tabs.tsx | Tabs `pill · underline`, counts; Chip `pressed` | selected, focus | Tabs switch views of one object; Chips combine filters. |
| `EmptyState`, `ErrorState`, `Skeleton`, `SkeletonRows`, `LoadingBlock`, `errorMessage` | States.tsx | `compact`; LoadingBlock `blocks · rows` | — | Empty: why + next step. Error: what + retry. Loading: final-size skeletons. |
| `PageHeader` | Page.tsx | `eyebrow`, `back`, `badges`, `subtitle`, `actions`, `hideActionsOnPhone` | focus on navigation | The only h1. Feeds the compact header title. |
| `Toolbar` | Page.tsx | inline · `floating` (glass, fixed, centred on the content column via `--shell-left`) · `floating="column"` (glass, sticky at the bottom of its column) | — | Bulk actions (`floating`); unsaved changes (`"column"`: takes space only while shown, so no permanent bottom padding). |
| `KeyValue` | KeyValue.tsx | `stacked · inline · grid`; entry `mono`, `tone`, `empty` | empty value shown muted | Read-only facts. |
| `Timeline` | Timeline.tsx | entry `tone`, `body`, `actions` | — | Recoveries, activity (newest first). |
| `PlaceLabel` | Place.tsx | `place: ResolvedPlace \| null`, `label`, `lat/lng`, `accuracyM` | resolved · label-only · coordinates-only | Name → detail → typed label → small coords → "© OpenStreetMap contributors" link (only for resolved names). |
| `MapLinks` | Place.tsx | `maps: MapLinks \| null` | — | Compact Google/Apple pair; destination only; full "Open in … Maps" accessible name. |
| `SplitView` | SplitView.tsx | `listWidth sm · md`, `splitFrom md · xl`, `listScroll pane · page`, `placeholder` | list-only (phone), both panes (≥ 768) | List pinned below the header (`--header-h` + 1rem). `pane` (Inbox): list is its own scroller. `page` (Settings): one scroll container; the list is pinned only on `tall:` viewports. |
| `cx` | cx.ts | — | — | Class joiner. |

Shell-level: `Shell`, `QuickActionsSheet`, `AppearanceControl`, `AppearanceSheet` (`src/app/components`).
`ItemCard`: archived items dim and desaturate only the media (plus the solid "Archived" pill); text keeps full
contrast (fading the whole card took muted text to 3.5:1).

### 9a. Selection: Select, Combobox, Menu (`src/app/ui/Select.tsx`, `Menu.tsx`, `popover.ts`)
One family, three jobs: **Select** chooses a value from a short/medium list, **Combobox** chooses a value from a
long list with search, **Menu** runs actions. Shared anatomy: capsule trigger (field: raised + `line-strong`
edge, 44 px; `chip`: neutral fill, 36 px / 44 on touch), chevron that turns when open and dims when disabled, and a
`glass-strong` popover (radius 20, 6 px padding, rows 40 px / 44 on touch, radius 14). Active row = `primary-tint`
+ inset `primary` ring (keyboard position); selected = check + semibold; descriptions and group headings use
`on-glass-muted` (never plain `muted` on glass); disabled rows 50 %.

**Popover layer** (`useAnchoredPopover`): rendered as a DOM descendant of its trigger with `popover="manual"`, so
it enters the top layer above sheets and glass bars and is never clipped by `overflow: hidden`, transforms or
`backdrop-filter`, while staying interactive inside a modal `<dialog>`. Positioned in JS: below the anchor, flips
above when less than 180 px (or less than above) remains, clamped to the visual viewport (on-screen keyboard),
max 360 px tall, at least the anchor's width (listboxes), max 28 rem. Follows page scroll/resize; closes if the
anchor leaves the viewport; light dismiss on outside pointer. Enter animation: 200 ms scale 0.96 → 1 (spring).
Fallback without the Popover API: `position: fixed`, z 60 (may be clipped inside a sheet on very old browsers).

| Component | API | Keyboard (APG) | ARIA |
|---|---|---|---|
| `Select<V>` | `label`, `options: SelectOption<V>[]`, `value: V`, `onChange(v)`, `hint`, `error`, `required`, `disabled`, `placeholder`, `name`, `variant field · chip`, `native?` (default: native on `pointer: coarse`) | Closed: ↓ ↑ Enter Space open on the current value; Home/End open on first/last; letters open + type-ahead. Open: ↑↓ (no wrap), PageUp/PageDown ±10, Home/End, type-ahead (600 ms buffer, repeated letter cycles), Enter/Space/Alt+↑ select + close, Tab selects + moves on, Escape closes. Focus never leaves the trigger. | `button[role=combobox]` + `aria-haspopup=listbox`, `aria-expanded`, `aria-controls`, `aria-activedescendant`; `role=listbox` labelled by the field label; `role=group` per `group`; `aria-selected` on the chosen option. Native on coarse pointers (`<optgroup>` for groups). Full label in `title` when truncated. |
| `Combobox<V>` | as Select (minus `variant`/`native`), `value: V \| null`, `placeholder` = search placeholder; options may carry `description`, `keywords`, `leading` | Type to filter (all terms must match label, description or keywords; accent-insensitive); first match becomes active, Enter picks it. ↓/↑ open; Alt+↑ select; PageUp/PageDown; Escape closes and restores the value (when closed and unedited, Escape goes to the sheet); Tab picks the active match while typing. Blur keeps an exact label match, otherwise reverts: **free text is never stored**. | `input[role=combobox][aria-autocomplete=list]`, `aria-activedescendant`; result count in a polite `role=status`; "No matches" row when empty. Pointer: the chevron toggles the list. |
| `Menu` | `label` (name + tooltip), `items: (MenuItem \| {key, separator: true})[]` with `label`, `icon`, `description`, `tone default · danger`, `disabled`, `onSelect`; `icon` (default `more`), `iconOnly` (default true), `variant`, `size`, `align end · start` | Enter/Space/↓ open on the first item, ↑ on the last; ↑↓ wrap; Home/End; type-ahead; Escape closes and refocuses the button; Tab closes and moves on. Choosing closes first, returns focus to the button, then runs `onSelect` (sheets opened by an action restore focus correctly). | `button[aria-haspopup=menu][aria-expanded]`, `role=menu` labelled by the button, `role=menuitem` (roving focus, `tabIndex -1`), `<hr>` separators, `aria-disabled`. |

Rules: values → Select/Combobox, actions → Menu (never a Select that *does* something). Use Combobox above ~15
options or when people search by something other than the first letter (time zones: city or "GMT+1"; items;
tags). Use `variant="chip"` in filter toolbars next to SearchField and Chips. Option data for zones and locales:
`src/app/lib/locale-options.ts` (`timeZoneOptions`: every IANA zone + UTC with today's offset and long name,
grouped by region; `localeOptions`: ~36 common locales labelled in the panel language with a date/number sample).
Gallery: `/gallery#selection` (all states, light/dark, static open-state previews `ListboxPreview`/`MenuPreview`,
which are QA-only and inert).

**Migration (deprecated native `Select` in Field.tsx, remove when done):** `pages/InventoryPage.tsx:146` (category
filter → `Select variant="chip"`), `pages/TagsPage.tsx:272`, `components/TagSheet.tsx:157` ("Assigned to" →
`Combobox` of items with `Thumb` leading, keep the "Not assigned" option) and `:214` (NFC status → `Select`),
`components/ItemFormSheet.tsx:111` (category), `pages/item/LostSheets.tsx:235`, `pages/item/ItemTrackers.tsx:222`,
`pages/inbox/ProposalSheet.tsx:116`, `pages/print/PrintStudio.tsx:171`, `components/QuickCardFlow.tsx:301` (card
language). "More" buttons that open action sheets → `Menu`: `pages/item/ItemDetailPage.tsx:146` (item actions),
`pages/inbox/Thread.tsx:187` (conversation manage). Inline links that need `touch-target`: item detail help text
(`pages/item/ItemTrackers.tsx:59` "Lost Mode", "Share Item Location"), inbox item links (`Thread.tsx:173`), finder footer "Privacy" (finder CSS).
`ItemCard` (+ `CategoryTile`, now a `Thumb` wrapper) stays in `components/`.

## 10. Iconography
One set: inline 24 × 24 stroke icons in `ui/Icon.tsx` (1.75 stroke; 2 for selected tabs; 1.25–1.6 for large
fallbacks). Sizes 16 (inline/meta), 20 (buttons, rows), 24 (tabs, rail), 28–40 (empty states). Decorative by default
(`aria-hidden`); the parent carries the name. Add icons to the same map; never emoji, never a second icon set.

## 10a. Installed app (PWA)
Manifest `public/manifest.webmanifest`: `display: standalone`, `theme_color`/`background_color` `#FAF7F2` (`warmWhite`;
manifests have no dark variant, so dark mode relies on the `<meta name="theme-color" media>` pair in `index.html`).
Icons are generated from the brand mark by `pnpm icons:pwa`: 192 and 512 `any` (rounded petrol tile, transparent
corners), 512 `maskable` and the 180 apple-touch icon (full-bleed petrol, glyph at 120 % inside the 80 % safe zone).
iOS: `apple-mobile-web-app-capable`, title `RETURN`, status bar style `default` (`black-translucent` would draw white
text over the warm-white canvas); `--header-h` and the tab bar already use `env(safe-area-inset-*)`.

## 11. Voice and copy
- **Voice**: calm, short, warm, specific. Say what happened and what to do next. No blame, no exclamation marks in
  errors, no jargon ("tag", not "token"; "address", not "URL" for finders).
- **Panel**: EN (source) and ES; German falls back to EN. **Finder**: EN/DE/ES, written for a stranger in a hurry;
  address the finder as "you" (ES "tú", DE "Sie").
- Buttons: verb + object ("Add item", "Send message"), sentence case, ≤ 3 words where possible. Labels are nouns.
- Status words: Lost / With you / Returning / Recovered; conversation Open / Closed / Blocked; plan Waiting for an
  answer / Agreed / Declined / Cancelled / Replaced.
- **Glossary** (one term per concept): *tag* (QR/NFC), *card* (printed), *conversation*, *return plan* (EN) /
  *plan de devolución* (ES) / *Rückgabe-Plan* (DE) for proposals (replaces "handover proposal" / "return suggestion"),
  *place* (shared location).
- Counts use plural forms (`Intl.PluralRules`), never "1 items". Dates via the owner's locale/time zone (`useFormat`).
  Keyboard hints only on fine pointers.
- Never put state only in uppercase strings; uppercase is a visual style (CSS) at most.

## 12. Flow: Quick card (UI spec; implementation by the lead)
Goal: at an airport, from a phone, in ≤ 5 taps: tag an item and get a print-ready paper card, or send it to the share
sheet (AirPrint, Files, Messages).

**Entry points**: Create sheet › Quick card (`/?quick-card=1`); item hero "Quick card" (`/items/:id?quick-card=1`,
item preselected). **Container**: `Sheet size="lg"` (bottom sheet on phones, side panel elsewhere). Gallery:
`/gallery#quick-card` renders the real paper output (`PaperSpecimen.tsx`: `buildPaperSheet` → `renderPaperSvg`,
sample data, no API). The gallery never opens the real flow (exporting creates real tags); use Create › Quick card.

**Steps on one sheet (progressive, no wizard)**
1. *Item*: `SearchField` + `List` of recent items (`Thumb`, name, current tag); last row "New item…" expands name +
   category inline. Preselected when opened from an item.
2. *Tag*: `RadioGroup` — "Use tag 003" (default when the item has an active tag; reprinting never changes its address)
   / "Create a new tag" (default otherwise; created on export, not on open).
3. *Card*: `SegmentedControl` paper A4 / Letter (default from locale: Letter for en-US/en-CA/es-MX…, else A4); copies
   1 / 2 (spare); card language `Select` (default = settings default finder language, with the secondary-language line);
   colour petrol / sage / warm (from Settings › Tags default).
4. *Preview*: true-proportion page preview + `StatusPill`s (proof warning when the public host is not https; QR size).
5. *Footer*: phones with Web Share Level 2 (`navigator.canShare({ files })`): primary **Share…** (PDF), secondary PNG,
   PDF. Elsewhere: primary **Download PDF**, secondary PNG. Then a success line "Card ready. After printing, mark tag
   003 as attached." (+ toast).

**States**: idle · creating tag (button loading) · rendering (button loading, sheet stays interactive) · error
(`FormError` with retry; tag creation and rendering errors are distinct) · proof (watermark + warning pill) · ready.
Offline: creating a tag needs the network; re-printing an existing tag works offline if the layout code is cached.

**Output (paper)**
- Fold-over card = existing CR80 layouts from `src/shared/card/` (85.6 × 54 mm, r 3.18): **front and back side by
  side** (171.2 × 54 mm), fold line on the shared short edge, hole markers on the two outer short edges (back uses the
  horizontally mirrored hole position so holes coincide after folding — verify in a test).
- Page: A4 210 × 297 mm or Letter 215.9 × 279.4 mm; 1 or 2 pairs, centred, 24 mm apart; crop marks 4 mm long, 2 mm
  outside the trim; dashed fold line (0.35 mm, muted) extending 3 mm beyond the card; one-line instruction at the top
  ("Cut along the outer marks · fold on the dashed line · glue or tape back to back"), "Print at 100 %" note at the
  bottom. No bleed (home printers): artwork stays inside the trim; backgrounds stop at the trim.
- PNG: 300 dpi full page (A4 2480 × 3508 px, Letter 2550 × 3300 px), sRGB. PDF: vector, one page, MediaBox = paper,
  standard fonts as today, `PROOF — NOT FOR PRINT` watermark rules unchanged.
- QR ≥ 30 mm incl. quiet zone, ECC M, module ≥ 0.5 mm (existing rules). File names:
  `return-card-<tag>-<paper>.pdf|png`.

## 13. Finder pages (`public/p/public.css`)
Same tokens and language as the panel, lighter machinery: no framework, no inline style/script, no web fonts, 5.8 KB
gzipped. Blur only on the sticky top bar and the bottom action bar.

| Element | Class | Notes |
|---|---|---|
| Top bar | `.topbar` (sticky glass, full width) + `.brand` (mask logo + wordmark) + `.langs` (segmented) | Language links ≥ 44 px on touch |
| Hero | `.hero` (optional wrapper), `.eyebrow`, `h1`, `.owner`, `.photo`, `.lead` | Photo 4:3, card radius |
| Lost | `.banner-lost` (+ `strong` pill style), `.pill.pill-lost` | Terracotta only here |
| Cards | `.card` (blur-free glass look), `details.card` (disclosure with chevron) | Content layer |
| Notices | `.notice`, `.notice-error` (danger), `.notice-closed` | — |
| Buttons | `.btn` + `.btn-primary` · `.btn-secondary` · `.btn-block` · `.btn-sm` | Capsules, 48 px (44 sm on touch) |
| Floating action | `.action-bar` (fixed glass capsule, phones only) | Holds the one primary action |
| Forms | `.field`, `.hint`, `.optional`, `.field-error`, `.has-error`, `.check`, `.location` (flat group), `.panel` (GPS preview), `.status`, `.turnstile` (reserves 65 px) | — |
| Thread | `.thread`, `.bubble.from-finder` (mine: petrol, right), `.from-owner` (raised, left), `.from-system` (centred) | — |
| Places | `.place-name`, `.place-detail`, `.place-label`, `.place-coords`, `.place-attrib`, `.map-links a` (capsule pair) | Mirrors `PlaceLabel` |
| Plans | `.proposal` + `.status-*`, `.proposal-head`, `.pill` / `.pill-proposed` / `.pill-accepted` (`.chip` legacy) | — |
| Utility | `.visually-hidden`, `.skip`, `.stack`, `.actions`, `.muted` | — |

Template changes needed to use the new pieces are listed in `audit-002.md` (T1–T8).

## 14. Maintenance
- Change a colour → change the primitive or the semantic mapping in **both** stylesheets, re-run the contrast check
  (the table above), update the gallery if a new token appears.
- New component → `src/app/ui/<Name>.tsx`, documented in §9, rendered with all states in `/gallery`.
- Gallery screenshots at 375 / 768 / 1024 / 1440 in light and dark are part of the review of any system change.
