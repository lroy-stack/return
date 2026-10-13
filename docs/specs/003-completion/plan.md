# 003 — plan (phase 3 first; later phases are planned in detail when they start)

Owner actions (blocking, not code): **O1** onboard Email Sending for `return.lr0y.dev` · **O2** OK to create a private
GitHub repo · **O3** confirm domain auto-renew + enable DNSSEC (DS at Hostinger) · **O4** real-phone scan test.

| # | Task | Owner agent | Files/areas | Verify | Size |
|---|---|---|---|---|---|
| 3.1 | Block/unblock lifecycle: fix panel block (A2), unblock & list blocks API+UI, expiry, keep on delete/restore (B1) | implementer + frontend | api/conversations, domain, db/export, Thread.tsx, Settings › Privacy | vitest + e2e block/unblock | M |
| 3.2 | Item/recovery state model: archived lost items keep a reachable tag page or block archiving; recovery close/transition rules in UI; recovered → prompt to thank & close conversation; notes append (B2, B3, F-20) | implementer + frontend | db/items, db/recoveries, api/items, ItemDetail | vitest + e2e lost→archive, close recovery | M |
| 3.3 | Dates & time zones: one wall-clock model (zone stored with meetAt), calendar validation, no past dates, locale-formatted inputs (B4, B5, F-19) | implementer + frontend | schemas, domain, ProposalSheet, finder forms | vitest + e2e two zones | M |
| 3.4 | Owner alert reliability: delivery-status model, persistent failure banner, clear test-email messages, honest System checks (A1 code part, F-12) | implementer + frontend | notify, api/system, Shell | vitest | S |
| 3.5 | UI polish batch 1 — owner-reported: custom glass `Select`/`Menu` (native on touch), searchable pickers, time-zone combobox; Settings scroll (padding, sticky top, single scroller); Reduce-transparency/contrast-more dark fix; overflow, contrast, 44 px targets, tab order (B6–B12) | design-engineer → frontend | ui/**, styles.css, settings, item detail | ui-qa re-audit + e2e axe on panel routes | L |
| 3.6 | UI polish batch 2 — P2 list (item detail order/photo actions, copy, truncations, tags 375, card-message legend, gallery overflow, Ctrl+Enter double send, `dir="auto"`, filters in URL, unsaved-sheet guard, accent-insensitive search, money parsing, remove-from-container) | frontend + implementer | pages/**, db/items | e2e + vitest | M |
| 3.7 | Places: cache picked search results (no re-geocode), retention aligned with conversations, OSM-down message, retry on next view, budget only on outbound calls, global daily cap; privacy wording (B14, F-13, L2, L5, L12) | implementer | services/geocode, api/geocode, i18n, maintenance | vitest | S |
| 3.8 | Data integrity: restore warns about missing files and offers file backup path; CSV BOM + active-only option; server-side EXIF strip; replace-tag warning; revoke closes conversations (F-14, F-17, F-23, F-26, F-28) | implementer + frontend | db/export, api/files, tags | vitest | M |
| 3.9 | Engineering hygiene: hermetic Nominatim/throttle seams, `/api/*` 404 JSON, single APP_VERSION, Turnstile dev loopback, Sheet onCancel, split QuickCardFlow/PrintStudio, gallery uses real renderer, merge print strings, a11y E2E on panel + conversation page, finder form error ARIA (M3, M4, F-18, L6–L11, F-15) | implementer + test-engineer | worker/lib, app/**, e2e | gates + e2e | M |
| 3.10 | Ops: release script (clean tree, pending-migration guard, `--tag` SHA), cron dead-man's switch, uptime checks, backup verification + off-account export + restore drill, wrangler token hygiene (B13, B15, L14) | devops-engineer | package.json, scripts/, maintenance, docs/operations.md | dry run + drill record | M |
| 3.11 | Git remote + CI (after O2) | devops-engineer | .github/workflows | CI green on push | S |
| 3.12 | Docs drift (9 items) + CLAUDE.md/README update | scribe | docs/** | review | S |
| 3.13 | Final re-audit (ui-qa + functional smoke) → deploy (migrations guarded) → verify live | ui-qa, lead | — | report + curl/live checks | S |

Phases 4–10: see docs/architecture/next-phases.md (spikes S1–S5 first; ADRs 0002–0005 must be accepted before code).
