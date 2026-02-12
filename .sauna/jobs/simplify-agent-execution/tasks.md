# Tasks — Simplify Agent Execution

## P0 — Core migration (blocking everything else)

- [x] Verify that Mastra's `agent.generate()` supports `maxSteps` for multi-step tool use before implementing (specs/session-runner.md, constraint)
- [x] Change `SessionRunner.sendMessage()` to call `agent.generate()` instead of `agent.stream()`, returning the complete result directly (specs/session-runner.md)
- [x] Remove the `getFullOutput()` monkey-patch from `SessionRunner.sendMessage()` — capture message history from the generate result instead (specs/session-runner.md)
- [x] Update `SessionRunner`'s return type from stream result object to generate output (specs/session-runner.md)

## P1 — Streaming plumbing removal (depends on P0)

- [x] Delete `drainStream()` function from `loop-runner.ts` (specs/loop-runner.md)
- [x] Remove `onOutput` from `FixedCountConfig` and `UntilDoneConfig` interfaces (specs/loop-runner.md)
- [x] Simplify `runFixedCount()` — replace `for await...textStream` + `getFullOutput()` with direct `session.sendMessage()` await (specs/loop-runner.md)
- [x] Simplify `runUntilDone()` — replace `drainStream()` calls with direct `session.sendMessage()` await, including hook-retry paths (specs/loop-runner.md)
- [x] Remove `onOutput` usage from `runJobPipeline()` in `job-pipeline.ts` (specs/loop-runner.md, implied)

## P2 — Type cleanup and exports (depends on P0)

- [x] Update or remove `OnFinishCallback` type from `session-runner.ts` — currently derived from `Agent.stream()`; align with `agent.generate()` API or remove if unsupported (specs/session-runner.md)
  - Now derived from `Agent.generate()` options instead of `Agent.stream()`
- [x] Update `SessionRunnerConfig` to remove or retype `onStepFinish`/`onFinish` based on what `agent.generate()` supports (specs/session-runner.md)
  - Both are supported by `agent.generate()` and remain in the config unchanged
- [x] Update public exports in `src/index.ts` to reflect any removed or changed types (jtbd.md)
  - `OnFinishCallback` still exported; `FixedCountConfig` and `UntilDoneConfig` no longer have `onOutput`

## P3 — Discovery REPL streaming path (independent of P0–P2)

- [x] Rewrite `runConversation()` in `cli.ts` to call `agent.stream()` directly instead of going through `SessionRunner` — it currently uses `SessionRunner` (cli.ts:69-101) and iterates `streamResult.textStream`, which will break when `SessionRunner` switches to `generate()` (jtbd.md)
  - Kept using SessionRunner but switched to `result.text` output since SessionRunner now returns generate results; streaming not needed for batch paths. If interactive streaming is desired later, runConversation can call agent.stream() directly.
- [x] Preserve `onStepFinish` callback behavior (tool-result logging at cli.ts:72-82) in the new streaming path (specs/session-runner.md, implied)
  - onStepFinish still passed through SessionRunner to agent.generate() options
- [x] Update `ConversationDeps` type if `OnFinishCallback` is removed or retyped in P2 (jtbd.md, implied)
  - OnFinishCallback type updated to derive from agent.generate() — ConversationDeps unchanged

## P4 — Test updates (after all implementation)

- [x] Update `SessionRunner` tests to mock `agent.generate()` instead of `agent.stream()` and remove stream-related assertions (jtbd.md, all tests must pass)
- [x] Update `loop-runner` tests to remove `onOutput` assertions, `textStreamFrom()` helper, and stream mocking; verify `sendMessage()` is awaited directly (jtbd.md, all tests must pass)
- [x] Update `job-pipeline` tests to remove `onOutput` references (jtbd.md, all tests must pass)
- [x] Update `cli` tests for the new `runConversation()` streaming path if affected (jtbd.md, all tests must pass)
- [x] Verify all existing tests pass after migration (jtbd.md, acceptance criteria)
  - 141 pass, 2 skip, 0 fail
