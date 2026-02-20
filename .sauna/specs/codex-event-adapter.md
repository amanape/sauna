# Codex Event Adapter

## Overview

A pure function that converts a single Codex SDK `ThreadEvent` into zero or more `ProviderEvent` objects.

## Acceptance Criteria

- `item.started` with `type: 'command_execution'` maps to `{ type: 'tool_start', name: 'Bash' }`
- `item.completed` with `type: 'command_execution'` maps to `{ type: 'tool_end', name: 'Bash', detail: item.command }` with secrets redacted
- `item.started` with `type: 'file_change'` maps to `{ type: 'tool_start', name: 'Edit' }`
- `item.completed` with `type: 'file_change'` maps to `{ type: 'tool_end', name: 'Edit', detail: first change path }`
- `item.started` with `type: 'mcp_tool_call'` maps to `{ type: 'tool_start', name: item.tool }`
- `item.completed` with `type: 'mcp_tool_call'` maps to `{ type: 'tool_end', name: item.tool }`
- `item.completed` with `type: 'agent_message'` maps to `{ type: 'text_delta', text: item.text }`
- `item.completed` with `type: 'web_search'` maps to `{ type: 'tool_start', name: 'WebSearch' }` followed by `{ type: 'tool_end', name: 'WebSearch', detail: item.query }`
- `item.completed` with `type: 'error'` maps to `{ type: 'error', message: item.message }`
- `turn.completed` maps to `{ type: 'result', success: true, summary }` where summary extracts `input_tokens`, `output_tokens` from `event.usage`; `numTurns` is `1`; `durationMs` is tracked by the caller
- `turn.failed` maps to `{ type: 'result', success: false, errors: [event.error.message] }`
- `thread.started` and `turn.started` are silently ignored
- `item.updated` events are silently ignored (avoid duplicate output)
- Unknown item types are silently ignored
- The adapter is a pure function with no side effects

## Edge Cases

- `file_change` with empty `changes` array: `tool_end` with no detail
- `command_execution` with `null` exit code (still in progress): only `tool_start`, no `tool_end`
- `agent_message` with empty string text: no `text_delta` emitted
- `reasoning` items: silently ignored (not displayed to user)
- `todo_list` items: silently ignored (not displayed to user)

## File

`src/providers/codex.ts` (exported as a named function, used internally by CodexProvider)
