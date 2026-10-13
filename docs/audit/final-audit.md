# RETURN — final audit (2026-10-13) — consolidated

Four independent read-only audits, run in parallel:
[`ui-ux.md`](ui-ux.md) (328 captures, 4 widths, light/dark, axe, keyboard, slow 3G) ·
[`functional.md`](functional.md) (every feature driven end to end; 348 unit/integration + 96 E2E green) ·
[`engineering.md`](engineering.md) (security, robustness, ops, docs drift) ·
[`../architecture/next-phases.md`](../architecture/next-phases.md) + ADRs 0002–0005 (PWA, push, E2EE chat, native).

**Bottom line.** The product works and is well built: no data leaks, no security defect in phase 2, finder pages paint
in ~1.3 s on slow 3G, AA contrast almost everywhere. What stands between it and "done for years" is (1) a few broken or
inconsistent state transitions, (2) operations that exist only on paper — owner alerts fail in production, no off-site
code copy, no alerting — and (3) a round of UI polish the owner already noticed (dropdowns, Settings scroll).

## Must fix first (P0 / critical)
| ID | Problem | Source |
|---|---|---|
| A1 | Owner email alerts fail in production (sending domain not onboarded) while the panel says "configured" — a finder's message reaches nobody | eng C1 · owner action + code |
| A2 | "Block finder" always fails in the panel (`api.post` without a body) | func F-01 |
| A3 | Source code exists only on this laptop (no git remote, no CI) | eng H1 · needs owner OK |

## Important (P1)
| ID | Problem | Source |
|---|---|---|
| B1 | Blocks can never be undone; no list; delete/restore lose them | F-02 |
| B2 | Archiving a lost item makes its tag page a generic 404 — the finder can no longer reach the owner | F-03 |
| B3 | Closing a recovery leaves the item "lost" forever; selector offers invalid transitions (raw 409) | F-04 |
| B4 | Typed date-times shifted between browser zone and Settings zone | F-05 |
| B5 | Impossible/past meeting dates accepted and rolled over | F-06 |
| B6 | Dropdowns: datalist time-zone field, mixed shapes, no search in long pickers, disabled chevron, native popups unthemed | UI P1-A |
| B7 | Settings scroll: always-on 176 px bottom padding, sticky nav under glass header, double scroll in landscape | UI P1-B |
| B8 | Reduce Transparency ignored in OS-dark + Auto (also contrast-more) | UI P1-1 |
| B9 | Long document filename overflows item detail | UI P1-2 |
| B10 | Contrast 3.47:1 on archived cards | UI P1-3 |
| B11 | Touch targets < 44 px (inline links, OSM link, Clear, finder Privacy link/checkbox) | UI P1-4, F-25 |
| B12 | Phone tab order reaches navigation last | UI P1-5 |
| B13 | Backups/restore unverified, no off-account copy, no alerting/uptime | eng H2, H3 |
| B14 | Picked place re-geocoded to a different name; geocode cache outlives retention/deletion | eng M1, M2 |
| B15 | Release does not guard migrations or tag versions | eng M5 |
| B16 | DNSSEC off; domain auto-renew unverified (expires 2027-05-14) | eng M6 · owner action |

## Polish (P2/P3) — grouped
- **Messaging:** double Ctrl+Enter sends twice (F-07); Arabic bubbles need `dir="auto"` (F-24); revoking a tag keeps its
  conversations open (F-28); recovered item keeps the conversation open with no "thank & close" prompt (F-20).
- **Inventory:** can't remove an item from its container (F-08); search not accent/case-insensitive beyond ASCII (F-09);
  money field rejects `1.234,50` (F-10); future dates accepted (F-19); long descriptions not clamped (F-27); typed delete
  confirmation vs collapsed spaces (F-22); filters not in the URL, Escape discards half-filled sheet (F-21).
- **Settings/system:** invalid time zone/locale saved; partial PUT resets other sections (F-11); test email shows raw codes
  and System marks services OK by presence only (F-12).
- **Places:** "No places found" when OSM is down; failed resolutions never retried (F-13); search budget charged on cache
  hits; no global daily geocoding budget (eng L2, L5).
- **Data:** restore keeps rows but not file bytes, drops blocks/notification history (F-14); CSV lacks UTF-8 BOM, includes
  revoked tags (F-23); server doesn't strip EXIF for non-panel uploads (F-26).
- **Accessibility:** finder form errors not tied to fields (`aria-invalid`/`aria-describedby`, focus) (F-15); axe E2E only
  covers the tag page (eng L11).
- **Offline:** panel says only "Network error"; finder loses the page and draft (F-16) — addressed properly by the PWA.
- **Copy:** replace-tag dialog must warn the physical card stops working (F-17); "Item actions" copy; truncated subtitles;
  duplicated "Identity" heading; "Card message" legend; date input in US format.
- **Engineering hygiene:** hermetic tests (Nominatim stub URL, injectable throttle) (M3, M4); unknown `/api/*` returns SPA
  HTML (F-18); oversized `QuickCardFlow`/`PrintStudio`; gallery mock duplicates paper geometry; second dictionary in print
  studio; single `APP_VERSION`; Turnstile dev shortcut also requires loopback; Sheet Escape double-handling; privacy notice
  wording for OSMF ("recipient", not "processor"); docs drift (9 items).

## What works well (keep)
Tag URLs survive restore; revoke/replace correct; photo pipeline strips EXIF; finder abuse limits hold; Turnstile failure
keeps the finder's text and shows the fallback email; double submits create one record; no data exposure on finder
pages; clean token system and AA contrast; fast finder pages.

## Next: the completion plan
See [`../specs/003-completion/spec.md`](../specs/003-completion/spec.md) and `plan.md` — phase 3 closes every P0/P1 and the
grouped polish; phases 4+ follow the architecture roadmap (owner PWA → owner push → finder PWA/push → sealed chat → native
decision → Expo).
