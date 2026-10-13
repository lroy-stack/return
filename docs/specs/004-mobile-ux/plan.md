# 004 — plan

| # | Task | Owner agent | Files/areas | Verify | Size |
|---|---|---|---|---|---|
| 4M.1 | Finder location flow (M-01, M-07): apply on fix, remove/redo, single consent, two-stage geolocation, platform guidance EN/DE/ES, error styling, approximate instead of reject | implementer | public/p/public.js, public.css, src/worker/public/**, schemas location | e2e stubbed geolocation (granted/denied/timeout/coarse), vitest forms | M |
| 4M.2 | Finder conversation as a chat (M-06, M-08, M-09, P2 finder): timeline, anchored composer, autogrow, fetch send + anchor, live refresh in place, aria-live, no floating bar, flexible Turnstile, native share of the link, tap targets | frontend-engineer | src/worker/public/**, public/p/** | e2e 320/393/landscape, axe | L |
| 4M.3 | Owner chat (M-05): chat layout, composer, smart scroll + pill, title, read receipts | frontend-engineer | pages/inbox/** | e2e | M |
| 4M.4 | Owner location (M-02) after D1: geolocation helper, "Use my location" in ProposalSheet and item location, owner share-location API + thread card | implementer + frontend | api/conversations, db, pages/inbox, pages/item | vitest + e2e | M |
| 4M.5 | Install + theme + shell (M-03, M-10, M-12): install button/guide, theme-color meta, no-flash head script, landscape shell | frontend-engineer | app shell, lib/pwa, lib/theme, index.html | e2e beforeinstallprompt, theme meta | S |
| 4M.6 | No-zoom + settings (M-04, M-11): ≥16 px fields on touch, instant-apply settings or non-overlapping save bar, zoom regression test | frontend-engineer | ui/Select, ui/Field, TagSheet, settings | e2e font-size test | S |
| 4M.7 | P2 batch (place search unavailable, QR PNG/share, share activation, offline language, note timestamps, add-tag confirm, 404 slugs, duplicate requests) | frontend-engineer | various src/app | e2e/vitest | M |
| 4M.8 | Icons + luggage illustrations (in progress) → adoption in finder pages | design-engineer | ui/Icon, assets, gallery | gallery screenshots | M |
| 4M.9 | Real iOS verification (after D2) + ui-qa re-audit + review + deploy | lead, ui-qa, code-reviewer | — | simulator screenshots, live checks | S |
