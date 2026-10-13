# Return-App

<!-- Project memory for Claude Code. Target ≤ 120 lines. Every line must prevent a real mistake.
     Facts here are advisory; anything that MUST happen belongs in .claude/studio.json (gates) or hooks.
     HTML comments like this one are stripped before Claude reads the file. -->

## What this is
<!-- One paragraph: the product, who uses it, the single most important quality attribute. -->
TBD — run `/studio:adopt` to fill this file from the real codebase.

## Stack
<!-- Language, framework, runtime versions, package manager, database, hosting. Only what is true today. -->

## Commands
<!-- The exact commands. Gates in .claude/studio.json run automatically on Stop; list them here too. -->
| Task | Command |
|---|---|
| Install | |
| Dev server | |
| Lint | |
| Typecheck | |
| Test (all / one file) | |
| Build | |

## Architecture
<!-- 5–10 bullets: top-level directories and what lives where; data flow; external services.
     Link to docs/adr/ for the why. -->

## Conventions
<!-- Only conventions a newcomer would get wrong. Naming, error handling, state management, API shape. -->
- Branch policy: `trunk` · Conventional Commits (enforced by hook).
- Specs live in `docs/specs/NNN-slug/`, decisions in `docs/adr/`, session handoffs in `docs/handoff/`.

## Gotchas
<!-- Things that bit someone. Flaky tests, env quirks, generated files, ordering constraints. -->

## Definition of Done
- Acceptance criteria of the active spec/task met and demonstrated (test, screenshot or command output).
- Studio gates green (lint · typecheck · test), no placeholders, no skipped tests.
- Docs touched when behaviour or setup changed (README, ADR, CLAUDE.md).
