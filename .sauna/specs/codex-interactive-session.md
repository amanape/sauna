# Codex Interactive Session

## Overview

`CodexProvider.createInteractiveSession()` uses the Codex SDK's thread persistence to implement multi-turn interactive sessions behind the `InteractiveSession` interface.

## Background

The `@openai/codex-sdk`'s `Thread` class automatically persists the `thread_id` after the first `runStreamed()` call. Subsequent calls on the same `Thread` instance resume the conversation via the CLI's `resume <thread_id>` subcommand. Each `runStreamed()` call is a single turn.

## Acceptance Criteria

- `CodexProvider` implements `createInteractiveSession(config)` returning an `InteractiveSession`
- A `Codex` SDK client and `Thread` are created once at session construction time
- Thread options match `createSession()`: `workingDirectory: process.cwd()`, `sandboxMode: "workspace-write"`, model conditional
- `send()` stores the pending message for the next `stream()` call
- `send()` on the first call builds the full prompt via `buildPrompt(message, config.context)`
- `send()` on subsequent calls stores the raw user input (no `buildPrompt`)
- `stream()` calls `thread.runStreamed(pendingMessage)` and yields adapted `ProviderEvent` objects via `adaptCodexEvent()`
- `stream()` returns after the events async generator is exhausted (one turn)
- `stream()` is a no-op (returns immediately) if no message was sent via `send()`
- Multi-turn works automatically — the SDK's `Thread` captures `thread_id` from the first `thread.started` event and passes it as `resume <id>` on subsequent turns
- `close()` is a no-op (the Codex CLI process exits after each turn)
- Duration tracking (`Date.now() - startMs`) is per-turn, same as in `createSession()`

## Constraints

- One `Thread` instance per session — do not create a new thread per turn
- The SDK's `ThreadEvent` is cast via `as unknown as ThreadEvent` to bridge SDK types with local adapter types (same pattern as `createSession()`)
- Availability is not re-checked — the CLI gates `provider.isAvailable()` before any session is created

## Tests

Tests in `tests/codex.test.ts`:

- `createInteractiveSession()` returns an object with `send`, `stream`, `close` methods
- `createInteractiveSession()` throws when provider is unavailable (subprocess test with no auth)
- First `send()` call prepends context via `buildPrompt()`

## Dependencies

- Depends on `interactive-session-contract` (imports `InteractiveSession`, `InteractiveSessionConfig`)
- Can be implemented in parallel with `claude-interactive-session`

## Files

- `src/providers/codex.ts` (modified)
- `tests/codex.test.ts` (modified)
