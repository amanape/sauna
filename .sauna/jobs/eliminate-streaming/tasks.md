# Tasks: eliminate-streaming

## P0 — Core implementation

- [x] Rewrite `runConversation()` in `src/cli.ts` to use `SessionRunner.sendMessage()` instead of `agent.stream()` — remove message array management, write `result.text` + newline to output after each turn (spec: conversation-runner)
- [x] Add optional `onStepFinish` callback to `ConversationDeps` interface and pass it through to `SessionRunner` config — remove hardcoded workspace-write logging from `runConversation()` body (spec: conversation-runner)
- [x] Move workspace-write notification logic (`mastra_workspace_write_file` detection) into the `case "discover"` block in `main()` and pass it via `ConversationDeps.onStepFinish` (spec: conversation-runner)
- [x] Remove the inline `import("@mastra/core/agent/message-list").MessageInput[]` type annotation and clean up unused imports left after rewrite (spec: conversation-runner)

## P1 — Test infrastructure

- [x] Remove `StreamOptions` type, `MockStreamFn` type, and `mockStreamResult()` helper from `src/cli.test.ts` — no `ReadableStream` construction should remain (spec: test-infrastructure)
- [x] Replace `makeDeps` mock agent from `{ stream: mockFn }` to `{ generate: mockFn }` returning `{ text, messages }` shape — rename `streamImpl` parameter accordingly (spec: test-infrastructure)
- [x] Introduce `GenerateOptions` type (derived from `Agent["generate"]`) and update `mockCallArgs` to use it instead of `StreamOptions` (spec: test-infrastructure)
- [x] Adapt all ~10 `runConversation` tests to exercise the generate-based path through `SessionRunner` — preserve coverage for multi-turn accumulation, empty-line skipping, onFinish passthrough, onStepFinish invocation (spec: test-infrastructure)

## P2 — Verification

- [x] Run `bun test` — all tests pass with zero streaming references in source or test code (spec: jtbd)
- [x] Run `bunx tsc --noEmit` — no new type errors introduced (spec: jtbd)

## Notes

- Two pre-existing test failures in `main() startup validation` (API key checks) — not related to streaming elimination; they fail on main branch too
- Pre-existing type errors in `handlers.test.ts`, `session-runner.test.ts`, `loop-runner.test.ts`, `hooks-loader.test.ts` also exist on main branch
- The `onStepFinish` workspace-write notification test was replaced with a general `onStepFinish` passthrough test since the notification logic now lives in `main()`, not `runConversation()`
- The "does not surface failed workspace write_file results" test was replaced with "does not pass onStepFinish when not provided" since `runConversation` no longer has hardcoded notification logic
