1. Use up to 10 subagents to study all files in `jobs/` and `specs/` and summarize what should exist.
2. Use up to 10 subagents to search the existing codebase and summarize what does exist. Do not assume functionality is missing; have subagents confirm with code search first.
3. Compare the two. Identify gaps: missing features, incomplete implementations, TODOs, placeholders, skipped tests, inconsistent patterns.
4. Write or update `tasks.md` (it may be incorrect) as a prioritized bullet-point list of tasks yet to be done. Each task should include what needs to happen and which spec it traces back to.

!IMPORTANT:

- Plan only. No code changes, no commits.
- Search before adding a task; if it already exists in the codebase, don't plan it.
- Keep the plan concise. One line per task. Group by priority, not by file or feature.
