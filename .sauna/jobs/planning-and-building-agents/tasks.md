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
- [x] Implement `runUntilDone()` loop runner with tests (spec: loop-runner)
- [x] Tests for agent definitions, CLI flag, fixed-count runner, until-done runner
- [x] Wire `--job` into CLI `main()` with `runJobPipeline()` orchestration (spec: loop-runner, jtbd)
- [x] Implement hooks config loader `loadHooks()` (spec: builder-hooks, configuration)
- [x] Implement hook executor `runHooks()` (spec: builder-hooks, execution)
- [x] Integrate hooks into `runUntilDone` with retry logic and same-session failure feedback (spec: builder-hooks, failure handling + retry semantics)
- [x] Wire hooks into `runJobPipeline` with full integration (spec: builder-hooks, end-to-end)

- [x] Add barrel-export smoke tests in `src/index.test.ts` for: `runUntilDone`, `runJobPipeline`, `loadHooks`, `runHooks`, `SessionRunner`, `parseCliArgs`, `runConversation`, `createDiscoveryAgent`, `createResearchAgent` (spec: agent-definitions, loop-runner, builder-hooks)

## Remaining — Priority Order

All tasks complete.
