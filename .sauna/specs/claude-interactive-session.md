# Claude Interactive Session

## Overview

`ClaudeProvider.createInteractiveSession()` wraps the Claude Agent SDK's `query()` v1 API behind the `InteractiveSession` interface, using the existing message channel pattern for multi-turn input.

## Background

The current interactive mode in `interactive.ts` uses a message channel (async queue) to feed user messages into `query()`. This Claude-specific mechanism moves into the provider so `interactive.ts` only sees the abstract `InteractiveSession` interface.

## Acceptance Criteria

- `ClaudeProvider` implements `createInteractiveSession(config)` returning an `InteractiveSession`
- The session resolves `claudePath` via `which claude` + `realpathSync` (same as `createSession()`)
- The session throws if the Claude binary is not found (same error as `createSession()`)
- Query options match the existing interactive configuration:
  - `pathToClaudeCodeExecutable: claudePath`
  - `systemPrompt: { type: "preset", preset: "claude_code" }`
  - `settingSources: ["user", "project"]`
  - `permissionMode: "bypassPermissions"`
  - `allowDangerouslySkipPermissions: true`
  - `includePartialMessages: true`
  - `model` included only when `config.model` is defined
- `send()` on the first call builds the full prompt via `buildPrompt(message, config.context)`
- `send()` on subsequent calls pushes raw user input with the captured `session_id`
- `stream()` adapts each SDK message via `adaptClaudeMessage()` and yields `ProviderEvent` objects
- `stream()` returns after encountering a `msg.type === "result"` SDK message
- On the next `send()` + `stream()` cycle, the same `query()` generator continues (the message channel feeds new input)
- `stream()` resets `ClaudeAdapterState` at the start of each turn
- `stream()` captures `session_id` from messages that carry one
- `close()` calls `q.close()` on the query generator
- `createMessageChannel()` moves from `interactive.ts` into this file

## Constraints

- The `query()` generator is created once at session construction time, not per-turn
- `buildPrompt()` is called only for the first message (context is not re-prepended on follow-ups)
- Message format pushed to channel: `{ type: "user", message: { role: "user", content }, session_id, parent_tool_use_id: null }`

## Tests

Tests in `tests/session.test.ts` (which already tests `ClaudeProvider.createSession()` via SDK mocking):

- `createInteractiveSession()` passes correct query options (systemPrompt, settingSources, permissionMode, etc.)
- `model` is omitted from query options when `config.model` is undefined
- First `send()` call prepends context via `buildPrompt()`; follow-up `send()` calls do not
- `close()` calls `q.close()` on the underlying query

## Dependencies

- Depends on `interactive-session-contract` (imports `InteractiveSession`, `InteractiveSessionConfig`)
- Can be implemented in parallel with `codex-interactive-session`

## Files

- `src/providers/claude.ts` (modified)
- `tests/session.test.ts` (modified)
