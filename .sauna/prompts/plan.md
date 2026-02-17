0a. Use subagents to study all files referenced files and summarize what should exist.
0b. Study `.sauna/jobs/xxx-[job-id]/tasks.md` (if present; it may be incorrect) to understand the plan so far.
0c. Use subagents to search the existing codebase and summarize what does exist. Do not assume functionality is missing; have subagents confirm with code search first.
0d. Compare the two. Identify gaps: missing features, incomplete implementations, TODOs, placeholders, skipped tests, inconsistent patterns.

1. Study `.sauna/jobs/xxx-[job-id]/tasks.md` (if present; it may be incorrect) and use up to 15 Sonnet subagents to study existing source code and compare it against the referenced files. Use an Opus subagent to analyze findings, prioritize tasks, and create/update `.sauna/jobs/xxx-[job-id]/tasks.md` as a bullet point list sorted in priority of items yet to be implemented (- [ ]). Ultrathink. Study `.sauna/jobs/xxx-[job-id]/tasks.md` to determine starting point for research and keep it up to date with items considered complete/incomplete using subagents.
2. If a `.sauna/jobs/xxx-[job-id]/tasks.md` does not exist for the current job, create one with the findings from step 1.

!IMPORTANT:

- Plan only. No code changes, no commits.
- Search before adding a task; if it already exists in the codebase, don't plan it.
- Keep the plan concise. One line per task. Group by priority, not by file or feature.
- Never add git/branch management tasks (merging, rebasing, PR creation, branch cleanup). Those are the developer's responsibility, not the builder's.
