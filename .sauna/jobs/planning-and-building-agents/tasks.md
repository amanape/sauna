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
- [x] Implement hooks config loader — `loadHooks(projectRoot)` in `src/hooks-loader.ts`; reads `.sauna/hooks.json`, parses as `string[]`, returns `[]` if missing; validates array type and string elements; exported from `src/index.ts` (spec: builder-hooks, configuration)
- [x] Implement hook executor — `runHooks(hooks, cwd)` in `src/hook-executor.ts`; runs shell commands sequentially via `Bun.spawn`; captures stdout+stderr; stops at first non-zero exit returning `HookFailure` with `failedCommand`, `exitCode`, and combined `output`; returns `HookSuccess` when all pass; exported from `src/index.ts` with types `HookResult`, `HookSuccess`, `HookFailure` (spec: builder-hooks, execution)

## Remaining — Priority Order
- [x] Integrate hooks into `runUntilDone` — `UntilDoneConfig` accepts optional `hooks`, `runHooks`, `hookCwd`, `maxHookRetries` (default 3), and `onHookFailure` callback; after each builder iteration, hooks run; on failure, output is fed back to the same `SessionRunner` session via `session.sendMessage()` so the builder can fix in-context; retry counter resets per task (new session per outer loop iteration); exhausted retries throw descriptive error with command name and exit code (spec: builder-hooks, failure handling + retry semantics)
- [x] Implement retry logic — integrated into hook integration above; configurable `maxHookRetries` per task; counter resets each outer iteration; pipeline halts with `Hook "<cmd>" failed after N retries (exit code X)` when exhausted (spec: builder-hooks, retry semantics)
- [x] Add tests for hook-retry integration — 8 tests added to `loop-runner.test.ts` covering: hooks run after iteration (pass case), failure feedback sent to same session (accumulated messages), max retry exhaustion throws, retry counter resets between tasks, no-hooks and empty-hooks skip, `onHookFailure` callback invoked with attempt/max, default max retries = 3 (spec: builder-hooks)
- [ ] Wire hooks into `runJobPipeline` — `runJobPipeline()` should load hooks via `loadHooks()` and pass them to `runUntilDone` along with `runHooks` and `hookCwd`, so the builder phase actually uses the validation gate system (spec: builder-hooks, end-to-end integration)
