# Interactive REPL Abstraction

## Overview

Refactors `src/interactive.ts` from a Claude-specific REPL to a provider-agnostic REPL that consumes the `InteractiveSession` interface.

## Background

The current `runInteractive()` imports Claude's `query()` API, `adaptClaudeMessage()`, and `createClaudeAdapterState()` directly. After this change, it only depends on `Provider`, `InteractiveSession`, and `ProviderEvent` from the contract — no SDK-specific imports.

## Acceptance Criteria

### Imports removed
- `query` and `Query` from `@anthropic-ai/claude-agent-sdk`
- `adaptClaudeMessage` and `createClaudeAdapterState` from `./providers/claude`
- `buildPrompt` from `./prompt`

### Functions removed
- `createMessageChannel()` — moved to `src/providers/claude.ts`

### Types removed
- `QueryOptions` export

### `InteractiveConfig` updated
- `claudePath: string` replaced with `provider: Provider`
- `prompt?: string`, `model?: string`, `context: string[]` unchanged

### `InteractiveOverrides` updated
- `createQuery?` replaced with `session?: InteractiveSession`
- `input?`, `promptOutput?`, `addSignalHandler?`, `removeSignalHandler?` unchanged

### REPL loop behaviour
- Session is created via `overrides?.session ?? config.provider.createInteractiveSession({ model, context })`
- First prompt resolution unchanged: from `config.prompt` or first readline input
- First turn: `session.send(firstInput)` then `for await (event of session.stream())`
- Follow-up turns: `writePrompt()`, `readLine()`, exit on empty/null, then `session.send(input)` + `session.stream()`
- `StreamState` is reset (`createStreamState()`) at the start of each follow-up turn
- Each event is rendered via `processProviderEvent(event, write, state, errWrite)`

### Preserved behaviour (no regression)
- `writePrompt()` writes bold green `> ` to `promptOutput`
- `readLine()` returns `null` on EOF/close
- Empty input or EOF exits cleanly
- SIGINT/SIGTERM call `session.close()` and `rl.close()`
- Signal handlers registered via overrides or `process.on()`, removed in `finally`
- Errors caught in try/catch written to `errWrite` (or `write` fallback) with red ANSI formatting
- `session.close()` called in `finally`
- Prompt written to `promptOutput` (stderr), not `write` (stdout)

### Tests (`tests/interactive.test.ts`)
- `mock.module("@anthropic-ai/claude-agent-sdk")` removed — no longer needed
- `createMockQuery()` replaced with `createMockSession()` that queues `ProviderEvent[]` per turn
- `InteractiveOverrides.createQuery` replaced with `InteractiveOverrides.session`
- Claude SDK message fixtures (`textDelta()`, `successResult()`) replaced with `ProviderEvent` objects
- `claudePath` in configs replaced with `provider` (mock provider)
- Tests removed from this file: "query options match non-interactive session configuration", "model is omitted from options when not specified" — these are now tested via `claude-interactive-session` spec in `tests/session.test.ts`
- All behaviour tests preserved: multi-turn, signals, error routing, prompt visibility, EOF, empty input

## Constraints

- `writePrompt()` remains exported
- `readLine()` remains a private helper
- The REPL does not call `buildPrompt()` — that responsibility is in each provider's `send()` implementation

## Dependencies

- Depends on `interactive-session-contract` (imports `InteractiveSession`, `Provider`)
- Depends on `claude-interactive-session` (the `createMessageChannel()` move must happen first)
- Should be implemented after both provider session specs are complete so the full send/stream contract is settled

## Files

- `src/interactive.ts` (modified)
- `tests/interactive.test.ts` (modified)
