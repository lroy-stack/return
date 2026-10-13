# 002 — plan

| # | Task | Owner | Files | Verify |
|---|---|---|---|---|
| 1 | Contract: `placeName`/`placeAddress` on SharedLocation and Proposal; `GeocodeResult` | lead | `src/shared/schemas.ts` | typecheck |
| 2 | Geocoding service + migration 0002 + store on share/propose + `GET /api/geocode/search` + finder display + attribution + privacy copy | implementer | `migrations/0002_*`, `src/worker/services/geocode.ts`, domain/public/api conversations | `pnpm vitest run test/geocode*.test.ts test/public.test.ts test/conversations.test.ts` |
| 3 | UX audit (screenshots 375/768/1024/1440, light/dark) → ranked findings + design system v2 spec | design-engineer | `docs/design/` | review doc |
| 4 | Design system v2 implementation: tokens, component library, gallery route, tablet nav rail, finder CSS parity | design-engineer | `src/app/styles.css`, `src/app/ui/**`, `src/app/components/Shell*`, `src/app/pages/gallery/**`, `public/p/public.css` | typecheck + gallery screenshots |
| 5 | Apply library + audit fixes across panel pages; place names + place search in panel | frontend-engineer | `src/app/pages/**`, `src/app/lib/**` | build + e2e |
| 6 | Browser QA at 4 widths, axe, E2E update | ui-qa / test-engineer | `e2e/**` | `pnpm test:e2e` |
| 7 | Deploy + verify production | lead | — | curl + panel check |

## Status (2026-10-13)
- [x] 1–5 implemented and committed; lint · typecheck · 348 vitest green; 112 + 40 browser captures (375–1440, light/dark) without overflow or axe serious/critical issues
- [x] Production: migration 0002 applied (pre-migration point in time 2026-10-13T16:38Z for Time Travel), version f085e30f deployed and verified (finder page hero/action bar, headers, Access redirect, no /api on public host, new columns present)
- [ ] 6 E2E suite update (in progress)
