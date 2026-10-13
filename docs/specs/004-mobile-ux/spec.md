---
status: proposed
---
# 004 — Mobile UX: working location, installable app, real chat, no zoom

## Problem
On real phones the owner hit features that only describe themselves, location sharing that silently fails, no way to
install the app, a chat that reloads to the top, and zoom while typing. Findings: docs/audit/mobile-audit.md.

## Scope
1. Finder location never lost: one-step "Use my position" that applies immediately (with remove/redo), one consent,
   two-stage geolocation (coarse then refine), clear denied/timeout guidance per platform, errors styled as errors,
   inaccurate fixes stored as approximate instead of rejecting the message (M-01, M-07).
2. Owner location: "Use my location" in return-plan and item "Set location" (fills coordinates + place name), and
   "Share my location" in a conversation, with explicit consent (M-02) — owner decision D1.
3. Install: Android install button (`beforeinstallprompt`), iOS Add-to-Home-Screen guide, shown in Settings and as a
   dismissible hint; never inside the installed app (M-03).
4. Chat on both sides: full-height chat layout, composer anchored with safe areas, autogrow, `enterkeyhint`, send
   without page jump, smart auto-scroll with a "new messages" pill, live refresh, one timeline (messages, places,
   plans), finder name as title, read receipts (M-05, M-06).
5. No focus zoom: every text field and native select ≥ 16 px computed on touch devices; no zoom lock (M-04).
6. Layout: remove the floating bar on `/t`, flexible Turnstile, landscape shell, settings that apply instantly (or a
   save bar that never covers navigation), theme meta + no flash (M-08–M-12).
7. P2 batch from the audit.
8. Visual identity: custom icon set and dimensional luggage illustrations as no-photo placeholders (in progress).

## Non-goals
Native app; Web NFC writing (separate decision); proof photos and sharing them with finders (ADR 0006, separate).

## Acceptance
- Location: a finder who taps "Use my position" and sends without any other step delivers the location (E2E); denied,
  timeout and unavailable each show actionable text (E2E with stubbed geolocation); owner can propose a plan at their
  current position (E2E).
- Install: Chromium fires `beforeinstallprompt` → our button calls `prompt()` (E2E); iOS UA shows the guide.
- Chat: sending keeps the viewport at the newest message on both sides; the composer stays visible at 320×568 and
  in landscape; new owner replies appear on the finder page without reload (E2E).
- Zoom: a test asserts computed font-size ≥ 16 px for every input/select/textarea on panel and finder routes at 375 px.
- Verified in real iOS Safari (simulator) for zoom, keyboard, geolocation prompt and Add to Home Screen.
- Gates green, axe 0 serious, docs updated.

## Owner decisions
- D1: build owner location sharing (recommended) or remove the claims.
- D2: download the iOS Simulator runtime (~8 GB) for real-Safari verification.
