# Tasks — Simplify Agent Execution

## Remaining Work

### P1 — Spec compliance

- [ ] Mark acceptance criteria checkboxes in `jtbd.md` as done once all criteria are verified green (jtbd.md)

## Completed

- [x] Verify that Mastra's `agent.generate()` supports `maxSteps` for multi-step tool use (specs/session-runner.md)
- [x] Change `SessionRunner.sendMessage()` to call `agent.generate()` (specs/session-runner.md)
- [x] Remove `getFullOutput()` monkey-patch from `SessionRunner` (specs/session-runner.md)
- [x] Update `SessionRunner` return type to generate output (specs/session-runner.md)
- [x] Delete `drainStream()` from `loop-runner.ts` (specs/loop-runner.md)
- [x] Remove `onOutput` from `FixedCountConfig` and `UntilDoneConfig` (specs/loop-runner.md)
- [x] Simplify `runFixedCount()` to direct `session.sendMessage()` await (specs/loop-runner.md)
- [x] Simplify `runUntilDone()` to direct `session.sendMessage()` await (specs/loop-runner.md)
- [x] Remove `onOutput` from `runJobPipeline()` (specs/loop-runner.md)
- [x] Align `OnFinishCallback` type with `agent.generate()` API (specs/session-runner.md)
- [x] Retain `onStepFinish`/`onFinish` in `SessionRunnerConfig` (specs/session-runner.md)
- [x] Update public exports in `src/index.ts` (jtbd.md)
- [x] Update all test suites to use `generate()` mocks — 141 pass, 2 skip, 0 fail (jtbd.md)
- [x] Rewrite `runConversation()` in `cli.ts` to call `agent.stream()` directly — iterates `textStream` for real-time output, manages message history via `getFullOutput()`, preserves `onStepFinish` workspace write logging, removes `SessionRunner` dependency (jtbd.md criterion 6)
- [x] Update CLI tests to mock `agent.stream()` instead of `agent.generate()` — all 10 runConversation tests pass; 141 pass, 2 skip, 0 fail across full suite (jtbd.md criterion 7)
