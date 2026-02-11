# Planning & Building Agents — Tasks

## P0: Agent Definitions (spec: agent-definitions.md)

- [x] Refactor `createDiscoveryAgent()` to accept researcher as a parameter instead of creating its own — currently hardcoded at `src/agent-definitions.ts:43-47` (spec: shared researcher)
- [x] Remove `OutputConstrainedFilesystem` — delete `src/output-constrained-filesystem.ts` and `src/output-constrained-filesystem.test.ts` (spec: workspace simplification)
- [x] Remove `outputDir` option from `createWorkspace()` in `src/workspace-factory.ts` and its `OutputConstrainedFilesystem` import (spec: workspace simplification)
- [x] Update CLI `main()` in `src/cli.ts` to stop passing `outputDir` and to pass researcher to `createDiscoveryAgent()` (spec: workspace simplification + shared researcher)
- [ ] Create `createPlanningAgent()` factory — accepts config with researcher, tools, workspace, jobId; substitutes `${JOB_ID}` in `plan.md` prompt; agent id `"planner"` (spec: agent-definitions)
- [ ] Create `createBuilderAgent()` factory — same pattern; substitutes `${JOB_ID}` in `build.md` prompt; agent id `"builder"`; shell execution via sandbox (spec: agent-definitions)
- [ ] Update `src/index.ts` exports — add new agent factories and their config types (spec: agent-definitions)

## P1: Loop Runner (spec: loop-runner.md)

- [ ] Add `--job <slug>` CLI flag to `parseCliArgs()` — resolves to `.sauna/jobs/<slug>/`; validates directory exists (spec: loop-runner, job resolution)
- [ ] Implement fixed-count loop runner — runs agent N times with fresh `SessionRunner` per iteration; streams output; reports progress `"Iteration 3/10"` (spec: loop-runner, iteration strategies)
- [ ] Implement until-done loop runner — runs agent until no `- [ ]` lines in `tasks.md`; fresh session per iteration; configurable safety limit (spec: loop-runner, iteration strategies)
- [ ] Wire loop runners into CLI — `--job` selects planner/builder mode vs current interactive discovery mode (spec: loop-runner)

## P2: Builder Hooks (spec: builder-hooks.md)

- [ ] Implement hooks config loader — reads `.sauna/hooks.json`; gracefully skips if missing/empty (spec: builder-hooks, configuration)
- [ ] Implement hook executor — runs shell commands sequentially in codebase cwd; captures stdout+stderr; stops at first non-zero exit (spec: builder-hooks, execution)
- [ ] Integrate hooks into until-done loop — after builder stream finishes, run hooks; on failure feed output back to same session for fix attempt (spec: builder-hooks, failure handling)
- [ ] Implement retry logic — configurable max retries per task; counter resets per task; halt pipeline when exhausted (spec: builder-hooks, retry semantics)

## P3: Tests

- [ ] Update `cli.test.ts` — reflect addition of `--job` flag (spec: loop-runner). Note: `outputDir` constraint tests already removed alongside `OutputConstrainedFilesystem` deletion; researcher parameter change already reflected.
- [ ] Add tests for `createPlanningAgent()` and `createBuilderAgent()` — config wiring, `${JOB_ID}` substitution, researcher sub-agent (spec: agent-definitions)
- [ ] Add tests for fixed-count loop runner — iteration count, fresh session per iteration, progress reporting (spec: loop-runner)
- [ ] Add tests for until-done loop runner — `- [ ]` completion condition, safety limit, progress reporting (spec: loop-runner)
- [ ] Add tests for hooks loader, executor, retry logic — pass/fail semantics, failure feedback injection, max retry halt (spec: builder-hooks)
