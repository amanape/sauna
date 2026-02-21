# Interactive Session Contract

## Overview

Defines the `InteractiveSession` interface and `InteractiveSessionConfig` type for multi-turn interactive mode. Extends the `Provider` type with a `createInteractiveSession()` method.

## Background

Interactive mode currently uses Claude's `query()` API directly. To support multiple providers, we need a shared turn-based interface: send a message, stream the response, repeat.

## Acceptance Criteria

- An `InteractiveSessionConfig` type is exported with: `model?: string`, `context: string[]`
- An `InteractiveSession` type is exported with:
  - `send(message: string): Promise<void>` — queues a user message for the next turn
  - `stream(): AsyncGenerator<ProviderEvent>` — yields `ProviderEvent` objects for the current turn; ends after a `result` event
  - `close(): void` — releases resources
- The `Provider` type gains a required method: `createInteractiveSession(config: InteractiveSessionConfig): InteractiveSession`
- `InteractiveSessionConfig` has no `prompt` field — the first user message is passed via `send()`
- No provider-specific types leak into the contract
- The file remains zero runtime dependencies (types only)
- All types use `export type` to match project conventions
- Existing `Provider` methods are unchanged
- A mock provider in `tests/provider.test.ts` can implement `createInteractiveSession` and the returned session satisfies the type (has `send`, `stream`, `close`)

## Constraints

- `stream()` yields events for a single turn per call — the REPL drives the send/stream loop
- `stream()` ends (returns) after yielding a `result` event, not continuing into the next turn

## Dependencies

None — this spec defines types only and is the foundation for all interactive session specs.

## Files

- `src/provider.ts` (modified)
- `tests/provider.test.ts` (modified)
