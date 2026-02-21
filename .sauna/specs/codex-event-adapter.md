# Codex Event Adapter

## Overview

A pure function that converts a single Codex SDK `ThreadEvent` into zero or more `ProviderEvent` objects.

## Acceptance Criteria

### Tool events

- `item.started` with `type: 'command_execution'` maps to `{ type: 'tool_start', name: 'Bash' }`
- `item.completed` with `type: 'command_execution'` maps to `{ type: 'tool_end', name: 'Bash', detail }` where detail is the command string (e.g., `npm install`), redacted via `redactSecrets()`
- `item.started` with `type: 'file_change'` maps to `{ type: 'tool_start', name: 'Edit' }`
- `item.completed` with `type: 'file_change'` maps to `{ type: 'tool_end', name: 'Edit', detail }` where detail is the first changed file path (e.g., `src/index.ts`)
- `item.started` with `type: 'mcp_tool_call'` maps to `{ type: 'tool_start', name: item.tool }`
- `item.completed` with `type: 'mcp_tool_call'` maps to `{ type: 'tool_end', name: item.tool }`
- `item.completed` with `type: 'web_search'` maps to `{ type: 'tool_start', name: 'WebSearch' }` followed by `{ type: 'tool_end', name: 'WebSearch', detail: item.query }`

### Text and error events

- `item.completed` with `type: 'agent_message'` maps to `{ type: 'text_delta', text: item.text }`
- `item.completed` with `type: 'error'` maps to `{ type: 'error', message: item.message }`

### Turn lifecycle events

- `turn.completed` maps to the success result variant `{ type: 'result', success: true, summary }` where summary extracts `input_tokens`, `output_tokens` from `event.usage`; `numTurns` is `1`; `durationMs` is passed in by the caller
- `turn.failed` maps to the failure result variant `{ type: 'result', success: false, errors: [event.error.message] }` (no `summary` — failure results lack SDK usage data)

### Ignored events

- `thread.started`, `turn.started`: silently ignored (lifecycle bookkeeping)
- `item.updated`: silently ignored (avoid duplicate output from partial updates)
- `reasoning` items: silently ignored (internal chain-of-thought)
- `todo_list` items: silently ignored (not displayed to user)
- Unknown item types: silently ignored

## Edge Cases

- `file_change` with empty `changes` array: `tool_end` emitted with no detail
- `command_execution` with `null` exit code (still in progress): only `tool_start` emitted, no `tool_end`
- `agent_message` with empty string text: no `text_delta` emitted

## Constraints

- Pure function with no side effects — no I/O, no ANSI formatting, no writes
- Reuses `redactSecrets()` from `stream.ts`

## File

`src/providers/codex.ts` (exported as a named function, used internally by CodexProvider)
