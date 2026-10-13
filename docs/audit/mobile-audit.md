# RETURN — mobile audit (2026-10-13)

Trigger: the owner, on real phones, found features that "only describe themselves", could not share a location, could
not install the PWA, and saw zoom while typing. Four read-only passes: finder pages on emulated phones, owner panel on
emulated phones/tablet, a static code audit, production checks (read-only); plus a documentation study. Chromium only:
real iOS Safari (zoom, keyboard, permission prompts, downloads) is still unverified.

## P0 — broken core flows
| ID | Problem | Cause |
|---|---|---|
| M-01 | Finder location is dropped silently: "Use my current position" then "Send" without pressing "Confirm" sends no location and no error; on the conversation page the same case gives 422 | hidden fields filled only on Confirm (`public/p/public.js:58-67`); server treats missing coords as "no location" (`src/worker/public/forms.ts:48`); redundant consent checkbox (`components.tsx:145-153`) |
| M-02 | The owner cannot share or pick a location anywhere: no "use my location" in proposals or item "Set location"; "Share Item Location" in Trackers is only an Apple help link; "Location you shared" (`Thread.tsx:282`) can never render | no `navigator.geolocation` in `src/app`; no owner location endpoint (`api/conversations.ts:76-145`) |
| M-03 | No way to install the panel as an app | no `beforeinstallprompt` handling; iOS instructions only inside Settings › Notifications (`PushDevices.tsx:20`) |

## P1
| ID | Problem | Cause |
|---|---|---|
| M-04 | iOS zoom on focus: native `<select>` on touch and the tag URL field are 15 px | `ui/Select.tsx:62,316`, `TagSheet.tsx:170` (all other fields 16–17 px) |
| M-05 | Owner chat composer: fixed 2 rows, no autogrow, 147 px tall (22 % of an SE, 39 % in landscape), messages show through a gap above the tab bar, auto-scroll even while reading history, title "Inbox" not the finder | `pages/inbox/Thread.tsx:81,239,360,366` |
| M-06 | Finder conversation is not a chat: long page, composer mid-page, every send reloads to the top, no autogrow, messages/places/plans in separate sections, replies only via a 30 s banner that reloads | `conversation-view.tsx`, `conversation-routes.tsx:92`, `public.js:106` |
| M-07 | Geolocation options too strict for indoors (`enableHighAccuracy:true, maximumAge:0, timeout:15000`), no coarse fallback; denied state gives no re-enable guidance; errors styled as success (green); accuracy > 100 km rejects the whole contact form | `public.js:54`, `public.css:733`, `schemas.ts:434` |
| M-08 | Floating "Write to the owner" bar on `/t` covers the form and the location preview; header + bar take 37 % of landscape height | `public.css:954`, `pages.tsx:246` |
| M-09 | Horizontal overflow on 320 px (Turnstile 300 px in a 249 px box) | Turnstile not `flexible` |
| M-10 | Landscape phone: tablet rail appears, "Settings" clipped, theme control off-screen | Shell breakpoints |
| M-11 | Settings feel dead: toggles apply only after "Save"; the unsaved bar stacks over the tab bar and "+" | settings pattern + floating toolbar placement |
| M-12 | Theme looks half-applied: `theme-color` meta ignores the explicit choice; flash of wrong theme on load; rail selector stale after changing it in Settings | `index.html:6-7`, `lib/theme.ts`, `Shell.tsx` |

## P2
Place search ignores `unavailable` ("No places found" when OSM is down) · tag QR only as SVG on phones (no PNG/Share) ·
`navigator.share` after an `await` may lose user activation on iOS · offline: language falls back to the browser's ·
raw ISO timestamps in recovery notes · "Add tag" on an item creates one without confirmation · unknown settings slugs
render without 404 · duplicated aborted requests on load · no read receipts shown (`finder_read_at` stored, unused) ·
finder pages: no native share of the private link, 50×18 px Privacy link, no webview hint ("open in Safari/Chrome") ·
NFC is text only (Web NFC on Android not used).

## What works (keep)
Finder geolocation with a granted permission (verified in production with a stubbed fix); CSP and
`Permissions-Policy: geolocation=(self)` are correct; theme switching via the header sun button persists; manifest and
service worker are installable (Chromium, 0 manifest errors); no dead buttons, no unread settings keys, no broken
routes; no console errors or 4xx/5xx on any route.

## Guidance adopted (sources)
- Never lock zoom (`maximum-scale`/`user-scalable=no`): iOS ignores it and it harms low-vision users; keep text fields
  at ≥ 16 px computed instead — https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport
- Chat layout: `100dvh` flex column, scrolling thread, composer in flow at the end with `env(safe-area-inset-bottom)`;
  don't rely on `interactive-widget` (no iOS support yet); VisualViewport as fallback; `field-sizing: content` with a JS
  autogrow fallback; `enterkeyhint="send"`; auto-scroll only when already at the bottom, otherwise a "new messages"
  pill; `role="log"` + `aria-live="polite"` — MDN VisualViewport, field-sizing; caniuse interactive-widget/enterkeyhint
- Geolocation: secure context + Permissions-Policy; two stages — quick coarse fix (`enableHighAccuracy:false,
  maximumAge:60000, timeout:8000`) then refine; the error callback is the source of truth (Safari's Permissions API is
  unreliable); explain how to re-enable on iOS (Settings › Privacy & Security › Location Services › Safari Websites;
  per-site in Safari settings) — https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition
- Install: Android `beforeinstallprompt` (keep the event, show our own button, `prompt()` on click); iOS has no prompt —
  show Share › Add to Home Screen instructions; detect standalone with `display-mode: standalone` /
  `navigator.standalone` — https://web.dev/articles/install-criteria ·
  https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
- Theme: blocking head script to set `data-theme` before paint; update `meta[name=theme-color]` on change.
- Web Push on iOS only from Home Screen apps after a user gesture; Declarative Web Push since Safari 18.4 (WebKit blog).
Unverified items (Apple HIG pages, WebKit posts not readable by the tool) are marked as such in the spec.
