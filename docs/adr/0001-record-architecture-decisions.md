# 0001. Record architecture decisions

- Status: accepted
- Date: 2026-10-13

## Context
Decisions get made in chat and are lost. Agents and humans need the *why* to avoid re-litigating choices or silently reversing them.

## Decision
We record every significant, hard-to-reverse decision as an ADR in `docs/adr/NNNN-title.md` (Michael Nygard format, see `TEMPLATE.md`). ADRs are immutable once accepted; a reversal is a new ADR that supersedes the old one. `/studio:adr` creates them.

## Consequences
- New contributors (human or agent) read `docs/adr/` before proposing structural changes.
- Small, reversible choices do not need an ADR — the commit message is enough.
