# Eliminate Streaming

## Problem

The `simplify-agent-execution` job switched batch execution (planning and building) from `agent.stream()` to `agent.generate()`, but left the interactive discovery REPL (`runConversation` in `cli.ts`) on the streaming path. This was intentional at the time — streaming provided real-time token output. However, streaming is being removed entirely as a supported execution model. The remaining streaming code in `runConversation` duplicates message-management logic already handled by `SessionRunner`, and the test suite carries ~44 streaming-specific references (types, helpers, mocks) that exist only to support this one code path.

## Job to Be Done

All agent execution flows through `agent.generate()` via `SessionRunner`. No streaming types, helpers, or code paths remain in the codebase.

## Acceptance Criteria

- [ ] `runConversation()` uses `SessionRunner` to call the agent — no direct `agent.stream()` call
- [ ] `runConversation()` writes `result.text` to output after each turn (batch, not streamed)
- [ ] The duplicated message-management logic in `runConversation()` is removed — `SessionRunner` owns it
- [ ] The `onStepFinish` callback (workspace write logging) is passed into `SessionRunner` via config, not hardcoded in `runConversation()`
- [ ] `ConversationDeps` exposes `onStepFinish` so callers can customize step handling
- [ ] All streaming types and helpers are removed from `cli.test.ts`: `StreamOptions`, `MockStreamFn`, `mockStreamResult`, `ReadableStream`
- [ ] `runConversation` tests mock `agent.generate()` (same pattern as `session-runner.test.ts` and `loop-runner.test.ts`)
- [ ] All existing tests pass

## Out of Scope

- Changing `SessionRunner` internals (it already uses `agent.generate()`)
- Modifying loop runner, job pipeline, or hook logic
- Agent prompt content or agent definitions
- CLI argument parsing

## SLC Scope

Rewrite `runConversation()` to construct a `SessionRunner` and call `session.sendMessage()` in a loop, writing `result.text` to output. Move the `onStepFinish` workspace-write callback into `ConversationDeps` so it's injectable rather than hardcoded. Replace all streaming mocks in `cli.test.ts` with generate-based equivalents following the existing pattern in `session-runner.test.ts`.

## Related JTBDs

- `.sauna/jobs/simplify-agent-execution/` — continues — completes the migration that job started
