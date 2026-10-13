# Handoffs

`/studio:handoff` writes `YYYY-MM-DD-HHMM-slug.md` here at the end of a session: what was done, what is in flight, what is next, and traps found. The SessionStart hook injects the newest one so the next session (or a teammate) resumes with facts instead of guesses. Prune old notes freely; git keeps history.
