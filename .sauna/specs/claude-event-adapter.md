# Claude Event Adapter

## Overview

A pure function that converts a single Claude Agent SDK message into zero or more `ProviderEvent` objects.

## Acceptance Criteria

- `stream_event` with `content_block_delta` + `text_delta` maps to `{ type: 'text_delta', text }`
- `stream_event` with `content_block_start` + `tool_use` begins JSON accumulation (does not emit immediately)
- `stream_event` with `input_json_delta` appends to the accumulated JSON buffer
- `stream_event` with `content_block_stop` emits `{ type: 'tool_end', name, detail }` where `detail` is extracted from the accumulated JSON (checks `file_path`, `command`, `description`, `pattern`, `query` — same fallback chain as current `stream.ts`)
- Commands in `detail` are redacted via existing `redactSecrets()` before emitting
- `result` with `subtype: 'success'` maps to `{ type: 'result', success: true, summary: { inputTokens, outputTokens, numTurns, durationMs } }`
- `result` with any other subtype maps to `{ type: 'result', success: false, errors }`
- Malformed JSON in tool input produces a `tool_end` with no detail (no crash)
- If no streaming text was emitted and `result.result` contains text, a `text_delta` is emitted before the result (fallback behavior from current `stream.ts` lines 130-137)
- Unknown/unhandled message types are silently ignored (no crash, no emit)
- The adapter is a pure function with no side effects — it takes a message + mutable adapter state, returns `ProviderEvent[]`

## Edge Cases

- Empty `text_delta` (zero-length string): no `text_delta` event emitted
- `content_block_start` without a subsequent `content_block_stop`: accumulated state is abandoned on next `content_block_start`
- Multiple consecutive `tool_use` blocks: each gets its own start/end cycle

## File

`src/providers/claude.ts` (exported as a named function, used internally by ClaudeProvider)
