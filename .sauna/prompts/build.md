0a. Study `.sauna/jobs/${JOB_ID}/*` to understand what needs to be built. Use up to 5 subagents in parallel.
0b. Study `.sauna/jobs/${JOB_ID}/tasks.md` and choose the most important item to address.

1. IMPORTANT DO NOT IGNORE: Work only on the chosen item this run. Search codebase before assuming missing functionality. Do NOT implement anything outside the chosen item.

2. If you discover any bugs or inconsistencies, immediately update `.sauna/jobs/${JOB_ID}/tasks.md` immediately.

---

**For new features or bug fixes (TDD):**

1. IMPORTANT: Search for existing test files related to the feature/bug. If none exist, create a new test file. Use up to 5 subagents to help identify relevant test files.

2. Draft the test cases first (what are we testing?)

3. Write the tests and confirm it fails.

4. IMPORTANT: Write the minimal code to make ONE test case pass. Do not fix other problems. Do not make any other changes.

5. Refactor the code and test case (clean up while tests stay green)

6. Repeat steps 4 and 5 for the remaining test cases until the test suite passes.

---

**For refactoring or consolidation:**

1. Run existing tests first and confirm they pass.

2. Make ONE small change.

3. Run tests again and confirm they still pass. If not, undo and retry.

4. Repeat steps 2 and 3 until the task is complete.

---

```IMPORTANT!

9. IMPORTANT: Update `.sauna/jobs/${JOB_ID}/tasks.md` after finishing your turn to reflect what was done and what remains.

99. Run linters and type checkers after making code changes to ensure code quality.

999. IMPORTANT DO NOT IGNORE: If you have written tests that pass without any code changes, such as new tests for already implemented functionality, confirm that the test is valid by temporarily making it fail (e.g., change an expected value). Then run the tests to see it fail, revert the change, and run the tests again to see it pass. This ensures the test is meaningful and correctly verifies the intended behavior. REMOVE IF THE TEST ALWAYS PASSES.

9999. Prefer testing behavior over implementation details. Use mocks/stubs only when necessary to isolate the unit under test.

99999. VERY IMPORTANT: Author documentation. When authoring documentation, capture the why — tests and implementation importance. They will serve as the rationale for future maintainers, not just the how.

999999999. Keep `.sauna/jobs/${JOB_ID}/notes.md` (create if it does not exist) current with learnings. Future work depends on this to avoid duplicating efforts. Update especially after finishing your turn.

9999999999. When you learn or create something new about how to run the application, update `.sauna/agents.md` using a subagent but keep it brief. For example if you run commands multiple times before learning the correct command then that file should be updated.

999999999999. Implement functionality completely. Placeholders and stubs waste efforts and time redoing the same work.

9999999999999. When `.sauna/jobs/${JOB_ID}/tasks.md` becomes large periodically clean out the items that are completed from the file using a subagent.

99999999999999. SUPER IMPORTANT: If you find inconsistencies in the `.sauna/jobs/${JOB_ID}/specs/*` then use an Opus 4.5 subagent with 'ultrathink' requested to update the specs.

999999999999999. IMPORTANT: Keep `.sauna/agents.md` operational only — status updates and progress notes belong in `.sauna/jobs/${JOB_ID}/tasks.md`.

9999999999999999. Use subagents use the web search tool or equivalent to study documentation, libraries, and frameworks as needed to complete the task. Always search before assuming knowledge or implementation details.
```

IMPORTANT: One test/change at a time. Minimal changes only. Search before creating.
