# 002 — UX polish, component library and place names

## Problem
Phase 1 works end to end, but the experience is uneven across devices (tablet is an afterthought), components
grew page by page without a catalogue, and locations are shown as raw coordinates, which people cannot read.

## Users
- Owner on phone (travelling, one hand), tablet (couch/hotel) and desktop (planning, printing).
- Finder on a phone, often in a hurry, in EN/DE/ES, possibly on poor mobile data.

## Scope
1. **Design system v2** — documented tokens (colour, type, space, radius, elevation, motion) shared by the panel
   (Tailwind 4 `@theme`) and finder pages (plain CSS); a defined component library with variants and states; a
   living component gallery in the panel; three layouts: phone (<640 px, bottom bar), tablet (640–1023 px, nav rail +
   master–detail where useful), desktop (≥1024 px, sidebar).
2. **UX audit and fixes** — real-device-size review of every panel screen and finder page; fix the gaps it finds
   (hierarchy, empty/loading/error states, feedback, copy, consistency, touch ergonomics, accessibility).
3. **Place names** — when a location is shared with coordinates, RETURN resolves a readable place name and address
   (OpenStreetMap Nominatim, server-side, once, cached in D1) and shows it everywhere instead of bare coordinates;
   coordinates stay available as secondary detail. The owner can search a place by name when proposing a meeting
   point (explicit search button, no autocomplete).

## Non-goals
Embedded maps or tile servers, routing, live location, autocomplete, new product features beyond the above.

## Acceptance criteria
- A shared GPS location shows e.g. "Estación de Atocha, Madrid" (+ street/area detail) on the finder page and in the
  panel, with "© OpenStreetMap contributors" next to it; raw coordinates only as secondary text.
- If geocoding fails or times out (≤ 4 s), the location is stored and shown with coordinates — never lost, never blocks.
- Geocoding requests are user-triggered, identified (User-Agent), cached in D1, never repeated for the same point.
- Privacy notice (EN/DE/ES) discloses that shared coordinates are sent to OpenStreetMap's geocoder.
- Owner can type a place in the proposal form, press Search, pick a result; lat/lng and name are filled.
- Component gallery route lists every UI component with its variants and states, in light and dark.
- No horizontal scroll and no clipped content at 375, 768, 1024 and 1440 px on every panel screen and finder page;
  axe shows no serious/critical violations; touch targets ≥ 44 px on touch layouts.
- All gates green; E2E suite still passes (updated where copy/layout changed).
