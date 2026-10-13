---
status: proposed
---
# 003 — Completion: hardening, polish, then PWA → push → sealed chat → native

## Problem
The final audit (docs/audit/final-audit.md) found broken/inconsistent state transitions, operational gaps that defeat
the core promise in production (owner alerts fail), and UI polish the owner noticed. The owner also wants RETURN
installable (PWA), with push, end-to-end encrypted chat on web and mobile, and later a native Expo app.

## Scope
- **Phase 3 — Hardening & polish** (this spec's first deliverable): every P0/P1 in the final audit plus the grouped P2/P3
  items; ops (alerts, backups verified, off-site code, release guard, DNSSEC); docs drift.
- **Phase 4 — Owner PWA** (ADR 0002), after spike S1 (Access login inside the installed iOS PWA).
- **Phase 5 — Owner push** (ADR 0003): Web Push from the Worker, content-free payloads.
- **Phase 6 — Finder PWA + finder push** (ADR 0002/0003): install from `/c/*` only, nothing private stored on device.
- **Phase 7 — Sealed conversations on the web** (ADR 0004): HPKE-sealed per-conversation key, key in the link fragment,
  owner key with recovery; place names resolved on the owner device.
- **Gate G1 — native?** after weeks of PWA use. **Phase 8–10 — Expo** (ADR 0005): device pairing via panel QR, tags,
  NFC writing, push, sealed chat.

## Non-goals
Multi-owner/SaaS, payments, AI, real-time location, maps/tiles, OTA updates for the native app.

## Acceptance (phase 3)
- All P0/P1 items in docs/audit/final-audit.md fixed with a failing test first (unit/integration or E2E), green gates.
- Owner receives a real email for a new finder message in production (after Email Sending onboarding), and the panel
  shows a persistent banner whenever the last owner email failed.
- First nightly backup present in R2; off-account export done; restore drill recorded in operations.md.
- External uptime check + dead-man's switch for the cron; release script refuses dirty tree / pending migrations and
  tags the deployment with the git SHA.
- Code pushed to a private remote with CI running lint · typecheck · test.
- UI re-audit: owner-reported dropdown and Settings-scroll issues gone; axe 0 serious on all panel routes (E2E-covered).
- Docs match reality (CLAUDE.md, README, operations, security, decisions, printing, plans).
