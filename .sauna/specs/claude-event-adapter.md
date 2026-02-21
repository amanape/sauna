# Claude Event Adapter

## Overview

A pure function that converts a single Claude Agent SDK message into zero or more `ProviderEvent` objects.

## Acceptance Criteria

- `stream_event` with `content_block_delta` + `text_delta` maps to `{ type: 'text_delta', text }`
- `stream_event` with `content_block_start` + `tool_use` emits `{ type: 'tool_start', name }` and begins JSON accumulation for that tool's input
- `stream_event` with `input_json_delta` appends to the accumulated JSON buffer (no event emitted)
- `stream_event` with `content_block_stop` emits `{ type: 'tool_end', name, detail }` where `detail` is extracted from the accumulated JSON
  - Detail extraction checks `file_path`, `command`, `description`, `pattern`, `query` (same fallback chain as current `stream.ts`)
  - Only the first line of the detail value is used
  - Commands in `detail` are redacted via `redactSecrets()` before emitting
- `result` with `subtype: 'success'` maps to the success result variant `{ type: 'result', success: true, summary }` where summary contains `inputTokens`, `outputTokens`, `numTurns`, `durationMs` from the SDK message
- `result` with any other subtype maps to the failure result variant `{ type: 'result', success: false, errors }` where errors come from `msg.errors` (no `summary` — failure results lack SDK usage data)
- If no text was emitted during the session and `result.result` contains text, a `text_delta` is emitted before the `result` event (fallback for non-streaming responses)
- Unknown/unhandled message types are silently ignored (no crash, no emit)
- The adapter takes a message + mutable `ClaudeAdapterState`, returns `ProviderEvent[]`
- `ClaudeAdapterState` contains: `pendingToolName: string | undefined`, `pendingToolJson: string`, `hasEmittedText: boolean`

## Edge Cases

- Empty `text_delta` (zero-length string): no `text_delta` event emitted
- `content_block_start` without a subsequent `content_block_stop`: accumulated state is abandoned on next `content_block_start`
- Multiple consecutive `tool_use` blocks: each gets its own `tool_start` / `tool_end` cycle
- Malformed JSON in tool input: `tool_end` emitted with no detail (no crash)

## Constraints

- Pure function with no side effects — no I/O, no ANSI formatting, no writes
- Reuses `redactSecrets()` and `extractFirstLine()` from `stream.ts`

## File

`src/providers/claude.ts` (exported as a named function, used internally by ClaudeProvider)
