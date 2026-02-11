# Planning & Building Agents — Tasks

## Completed

- [x] Refactor `createDiscoveryAgent()` to accept researcher as parameter (spec: agent-definitions, shared researcher)
- [x] Remove `OutputConstrainedFilesystem` and clean up workspace factory (spec: agent-definitions, workspace simplification)
- [x] Update CLI `main()` to stop passing `outputDir` and pass researcher to discovery agent (spec: agent-definitions)
- [x] Create `createPlanningAgent()` factory with `${JOB_ID}` substitution (spec: agent-definitions)
- [x] Create `createBuilderAgent()` factory with `${JOB_ID}` substitution (spec: agent-definitions)
- [x] Export new agent factories and config types from `src/index.ts` (spec: agent-definitions)
- [x] Add `--job <slug>` CLI flag with directory validation (spec: loop-runner)
- [x] Implement `runFixedCount()` loop runner with tests (spec: loop-runner)
- [x] Implement `runUntilDone()` loop runner with tests — uncommitted (spec: loop-runner)
- [x] Tests for agent definitions, CLI flag, fixed-count runner, until-done runner
- [x] Wire `--job` into CLI `main()` — `runJobPipeline()` in `src/job-pipeline.ts` orchestrates planner then builder; `main()` branches on `args.job` (spec: loop-runner, jtbd acceptance criteria)

## Remaining — Priority Order
- [ ] Implement hooks config loader — read `.sauna/hooks.json` from codebase root; parse as array of shell commands; return empty array if file missing or empty (spec: builder-hooks, configuration)
- [ ] Implement hook executor — run each shell command sequentially in codebase cwd; capture combined stdout+stderr; stop at first non-zero exit and return which command failed plus its output (spec: builder-hooks, execution)
- [ ] Integrate hooks into `runUntilDone` — after each builder iteration, run hooks; on failure, send hook output back to the same `SessionRunner` session (not a new one) so the builder can fix the issue in-context (spec: builder-hooks, failure handling + retry semantics)
- [ ] Implement retry logic — configurable max retries per task; retry counter resets when moving to a new task; halt pipeline with descriptive error when retries exhausted (spec: builder-hooks, retry semantics)
- [ ] Add tests for hooks loader, hook executor, hook-retry integration — cover: missing/empty config, pass/fail execution, failure feedback injection into same session, max retry halt, counter reset between tasks (spec: builder-hooks)
