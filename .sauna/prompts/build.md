IMPORTANT: Preserve your context for reasoning and decision-making. Use subagents for all file reading, code searching, and test running. Only consume their summarized findings.

## Instructions

1. Use subagents to study `.sauna/jobs/${JOB_ID}/*` to study the specs and requirements.
2. Study `.sauna/jobs/${JOB_ID}/tasks.md` and pick the highest-priority unfinished task.
3. Use subagents to search the codebase and confirm the task is actually missing before changing anything.
4. Implement the task. Use subagents for file operations; use a single subagent for build/test validation.
5. If tests or builds fail, fix before committing. Do not commit broken code.
6. Update `.sauna/jobs/${JOB_ID}/tasks.md` — mark the task done, note any discoveries or new issues.

### Workflow: New Features / Bug Fixes (TDD)

1. Use subagents to search for existing test files related to the task. If none exist, create one.
2. Draft the test cases first; define what you're testing before writing any implementation.
3. Write the tests. Confirm they fail.
4. Write the minimal code to make ONE test pass. No other changes.
5. Refactor while tests stay green.
6. Repeat steps 4–5 for remaining test cases until the suite passes.

99999. New tests must fail when broken. Alter expected values to verify; if a test doesn't fail, remove or revise it.
999999. Tests must verify behavior, not structure. Do not test that assignment works, that types have fields, or that objects match their own literals. Every test must exercise a code path that can meaningfully break. If removing the implementation wouldn't cause the test to fail, the test is worthless.

### Workflow: Refactoring / Consolidation

1. Run existing tests first. Confirm they pass.
2. Make one small change.
3. Run tests. If they fail, undo and retry differently.
4. Repeat steps 2–3 until the task is complete.

### !IMPORTANT

- One task per iteration. After committing, stop. The loop handles continuation.
- Do not assume functionality is missing; search first.
- Implement completely. No placeholders, no stubs.
- If you discover bugs unrelated to your task, document them in `.sauna/jobs/${JOB_ID}/tasks.md`.
- If you learn something about how to build/run the project, update `.sauna/agents.md` briefly.
- Keep `.sauna/agents.md` operational only; status updates and progress notes belong in `.sauna/jobs/${JOB_ID}/tasks.md`.
- When authoring documentation, capture the why; tests and implementation importance

Implement one task per iteration. Do not batch. Commit when done, then exit.
