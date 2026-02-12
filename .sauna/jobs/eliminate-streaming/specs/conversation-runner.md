# Conversation Runner — SessionRunner Integration

## What This Component Does

`runConversation()` in `cli.ts` is the interactive discovery REPL. It reads lines from stdin, sends each to the agent, writes the response to stdout, and loops until EOF. It currently calls `agent.stream()` directly and manages its own message array — duplicating what `SessionRunner` already provides.

## Requirements

### SessionRunner Adoption

- `runConversation()` must construct a `SessionRunner` and use `session.sendMessage()` for each user line
- The function must not manage its own message array — `SessionRunner` owns message accumulation
- The function must not call `agent.stream()` or `agent.generate()` directly

### Output Behavior

- After each `sendMessage()` call, write `result.text` to the output writable followed by a newline
- Empty-message handling is delegated to `SessionRunner` (which already returns `null` for blank input)

### ConversationDeps Changes

- Add an optional `onStepFinish` callback to `ConversationDeps`
- The workspace-write logging behavior (detecting `mastra_workspace_write_file` tool results) must be provided by the caller via this callback, not hardcoded in `runConversation()`
- `onStepFinish` and `onFinish` are both passed through to `SessionRunner` config

### Import Cleanup

- The inline `import("@mastra/core/agent/message-list").MessageInput[]` type annotation must be removed — it is no longer needed when `SessionRunner` manages messages
- `SessionRunner` must be imported (it was removed in the previous job)
- Any imports that become unused after the rewrite must be removed

## What Does Not Change

- The readline interface setup and EOF handling
- The `ConversationDeps` agent/input/output/onFinish fields
- How `main()` constructs and calls `runConversation()`

## Constraints

- Must not introduce any streaming code (`agent.stream`, `textStream`, `getFullOutput`, `ReadableStream`)
- Must not change `SessionRunner`'s public API — use it as-is
