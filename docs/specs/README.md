# Specs

One folder per unit of product work: `docs/specs/NNN-slug/`.

| File | Written by | Purpose |
|---|---|---|
| `spec.md` | `/studio:spec` | Problem, users, scope, non-goals, acceptance criteria (Given/When/Then). Status in front-matter. |
| `plan.md` | `/studio:plan` | Technical approach, risks, and an ordered task list with a Definition of Done per task. |
| `notes.md` | anyone | Research findings, open questions, decisions too small for an ADR. |

Status lifecycle (front-matter `status:`): `draft → approved → in-progress → done` (or `dropped`).
The SessionStart hook surfaces every spec that is `draft`, `approved` or `in-progress`.
