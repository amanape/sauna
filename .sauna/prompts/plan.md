Let's create a plan from the specifications.

Study the specifications in `ralph/specs/*` with up to 5 parallel Sonnet subagents to learn the application specifications.

Study `ralph/tasks.md` (if present; it may be incorrect) to understand the plan so far.

Study `client/app/*` and/or `server/app/*` with up to 10 parallel Sonnet subagents.

Compare the source code against the specifications to identify gaps in implementation.

Use an Opus subagent to analyze findings, prioritize tasks, and create/update `ralph/tasks.md` as a bullet point list sorted in priority of items yet to be implemented (- [ ]). Ultrathink. Study `ralph/tasks.md` to determine starting point for research and keep it up to date with items considered complete/incomplete using subagents.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Prefer consolidated, idiomatic implementations there over ad-hoc copies.

If an element is missing, search first to confirm it doesn't exist, then if needed author the specification at `ralph/specs/FILENAME.md`. If you create a new element then document the plan to implement it in `ralph/tasks.md` using a subagent.
