# Codex Stream Adapter

## Overview

A translation layer that converts Codex SDK streaming events into sauna's existing internal message format so that `processMessage()` in `src/stream.ts` and `runLoop()` in `src/loop.ts` can handle Codex output without modification. This is the key architectural piece that keeps the loop and stream systems provider-agnostic.

## Problem

The Anthropic Agent SDK and the Codex SDK emit fundamentally different event shapes during streaming:

**Anthropic SDK events (existing):**
```typescript
{ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "..." } } }
{ type: "stream_event", event: { type: "content_block_start", content_block: { type: "tool_use", name: "Read" } } }
{ type: "stream_event", event: { type: "content_block_stop" } }
{ type: "result", subtype: "success", usage: { input_tokens, output_tokens }, num_turns, duration_ms }
```

**Codex SDK events (`@openai/codex-sdk@0.104.0`):**
```typescript
// ThreadEvent = ThreadStartedEvent | TurnStartedEvent | TurnCompletedEvent | TurnFailedEvent
//             | ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent | ThreadErrorEvent

{ type: "thread.started", thread_id: "..." }
{ type: "turn.started" }
{ type: "item.started", item: ThreadItem }
{ type: "item.updated", item: ThreadItem }
{ type: "item.completed", item: ThreadItem }
{ type: "turn.completed", usage: { input_tokens, cached_input_tokens, output_tokens } }
{ type: "turn.failed", error: { message: "..." } }
{ type: "error", message: "..." }

// ThreadItem types:
// { type: "agent_message", id, text: string }
// { type: "reasoning", id, text: string }
// { type: "command_execution", id, command: string, aggregated_output: string, exit_code?: number, status }
// { type: "file_change", id, changes: FileUpdateChange[], status }
// { type: "mcp_tool_call", id, server, tool, arguments, result?, error?, status }
// { type: "web_search", id, query: string }
// { type: "todo_list", id, items: TodoItem[] }
// { type: "error", id, message: string }
```

## Solution: src/codex-stream-adapter.ts

A new file `src/codex-stream-adapter.ts` exports a single async generator function:

```typescript
export async function* adaptCodexEvents(
  events: AsyncIterable<ThreadEvent>,
  startTime: number
): AsyncGenerator<any>
```

It wraps the Codex event stream and yields adapted messages in sauna's existing format. `runCodexSession()` composes with it:

```typescript
yield* adaptCodexEvents(events, startTime);
```

## Event Translation Map

| Codex SDK Event | Adapted sauna Message(s) |
|---|---|
| `item.completed` with `item.type === "agent_message"` | `stream_event/content_block_delta` (text_delta with `item.text`) |
| `item.completed` with `item.type === "command_execution"` | `stream_event/content_block_start` (tool_use, name="Bash") + `stream_event/content_block_delta` (input_json_delta with `{"command": item.command}`) + `stream_event/content_block_stop` |
| `item.completed` with `item.type === "file_change"` | `stream_event/content_block_start` (tool_use, name="Write") + `stream_event/content_block_delta` (input_json_delta with `{"file_path": <paths>}`) + `stream_event/content_block_stop` |
| `item.completed` with `item.type === "mcp_tool_call"` | `stream_event/content_block_start` (tool_use, name=`item.tool`) + `stream_event/content_block_stop` |
| `item.completed` with `item.type === "reasoning"`, `"web_search"`, `"todo_list"`, or `"error"` | Silently skipped (yield nothing) |
| `turn.completed` | `result/success` with usage + duration |
| `turn.failed` | `result/error_during_execution` with `errors: [event.error.message]`, then return |
| `error` (ThreadErrorEvent) | `result/error_during_execution` with `errors: [event.message]`, then return |
| `thread.started`, `turn.started`, `item.started`, `item.updated` | Silently skipped (yield nothing) |
| SDK throws (try/catch) | `result/error_during_execution` with error details |

### item.completed with agent_message → text output

When a completed item has `type === "agent_message"`, yield a single `text_delta`:

```typescript
if (event.type === "item.completed" && event.item.type === "agent_message") {
  yield {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: event.item.text },
    },
  };
}
```

**Important**: Unlike Anthropic streaming, Codex `item.completed` fires once per complete item, not per character. Text appears in full chunks rather than word-by-word. This is acceptable behavior for v1 — the user sees the complete response at the end of each tool step.

### item.completed with command_execution → tool_use sequence (Bash)

When a completed item has `type === "command_execution"`, yield a three-message tool_use sequence so that `processMessage()` renders the `[Bash]` tag with argument detail:

```typescript
if (event.type === "item.completed" && event.item.type === "command_execution") {
  yield {
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "tool_use", name: "Bash" },
    },
  };
  yield {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify({ command: event.item.command }),
      },
    },
  };
  yield {
    type: "stream_event",
    event: { type: "content_block_stop" },
  };
}
```

### item.completed with file_change → tool_use sequence (Write)

When a completed item has `type === "file_change"`, yield a three-message tool_use sequence. Extract the file paths from `event.item.changes` and display them:

```typescript
if (event.type === "item.completed" && event.item.type === "file_change") {
  const paths = event.item.changes.map((c: any) => c.path).join(", ");
  yield {
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "tool_use", name: "Write" },
    },
  };
  yield {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify({ file_path: paths }),
      },
    },
  };
  yield {
    type: "stream_event",
    event: { type: "content_block_stop" },
  };
}
```

### item.completed with mcp_tool_call → tool_use sequence

When a completed item has `type === "mcp_tool_call"`, yield a two-message tool_use sequence using `item.tool` as the tool name:

```typescript
if (event.type === "item.completed" && event.item.type === "mcp_tool_call") {
  yield {
    type: "stream_event",
    event: {
      type: "content_block_start",
      content_block: { type: "tool_use", name: event.item.tool },
    },
  };
  yield {
    type: "stream_event",
    event: { type: "content_block_stop" },
  };
}
```

### item.completed with other types → silently skip

Items with `type === "reasoning"`, `"web_search"`, `"todo_list"`, or `"error"` are silently skipped — yield nothing. These item types have no useful user-facing representation in sauna's output format.

### turn.completed → result

```typescript
if (event.type === "turn.completed") {
  turnCompleted = true;
  yield {
    type: "result",
    subtype: "success",
    usage: {
      input_tokens: event.usage.input_tokens,
      output_tokens: event.usage.output_tokens,
    },
    num_turns: 1,
    duration_ms: Date.now() - startTime,
  };
}
```

Note: `event.usage` also includes `cached_input_tokens` but sauna's summary display only uses `input_tokens` and `output_tokens`, so `cached_input_tokens` is ignored.

### turn.failed → result/error, then return

```typescript
if (event.type === "turn.failed") {
  yield {
    type: "result",
    subtype: "error_during_execution",
    errors: [event.error.message],
  };
  return; // Stop processing events
}
```

### error (ThreadErrorEvent) → result/error, then return

```typescript
if (event.type === "error") {
  yield {
    type: "result",
    subtype: "error_during_execution",
    errors: [event.message],
  };
  return; // Stop processing events
}
```

### try/catch → Error result

If iterating the Codex events throws, catch and yield:

```typescript
yield {
  type: "result",
  subtype: "error_during_execution",
  errors: [error.message ?? String(error)],
};
```

This routes through the existing `formatError()` path in `src/stream.ts`.

> **Important:** `errors` must be `string[]`, not an array of objects. `processMessage()` calls `formatError(msg.subtype, msg.errors ?? [])` which is typed as `formatError(subtype: string, errors: string[]): string` and iterates the array as plain strings. The Anthropic SDK's `{ type: "text", text }` object format is NOT used here — use plain strings.

### Synthetic result when stream ends without turn.completed

After the `for await` loop completes, if no `turn.completed` event was received (tracked by a `turnCompleted` boolean flag), yield a synthetic result with zero usage so the loop does not hang:

```typescript
if (!turnCompleted) {
  yield {
    type: "result",
    subtype: "success",
    usage: { input_tokens: 0, output_tokens: 0 },
    num_turns: 1,
    duration_ms: Date.now() - startTime,
  };
}
```

## Generator Structure

```typescript
export async function* adaptCodexEvents(
  events: AsyncIterable<ThreadEvent>,
  startTime: number
): AsyncGenerator<any> {
  let turnCompleted = false;
  try {
    for await (const event of events) {
      if (event.type === "item.completed") {
        const item = event.item;
        if (item.type === "agent_message") {
          // yield text_delta
        } else if (item.type === "command_execution") {
          // yield Bash tool_use sequence
        } else if (item.type === "file_change") {
          // yield Write tool_use sequence
        } else if (item.type === "mcp_tool_call") {
          // yield tool_use sequence with item.tool
        }
        // else: reasoning, web_search, todo_list, error → skip
      } else if (event.type === "turn.completed") {
        turnCompleted = true;
        // yield result/success
      } else if (event.type === "turn.failed") {
        // yield result/error_during_execution, then return
      } else if (event.type === "error") {
        // yield result/error_during_execution, then return
      }
      // else: thread.started, turn.started, item.started, item.updated → skip
    }
    // After loop: if !turnCompleted, yield synthetic zero-usage result
    if (!turnCompleted) {
      // yield synthetic result/success with zero usage
    }
  } catch (error: any) {
    // yield result/error_during_execution
  }
}
```

## What processMessage() Already Handles (No Changes Needed)

The existing `processMessage()` already handles:
- `stream_event/content_block_start` with `tool_use` → saves tool name to `StreamState`
- `stream_event/content_block_stop` → renders `[ToolName]` dim tag
- `stream_event/content_block_delta/text_delta` → renders agent-colored text
- `stream_event/content_block_delta/input_json_delta` → renders tool arguments
- `result/success` → renders `formatSummary()` with token count + duration
- `result/error_*` → renders red error via `errWrite`

The adapter produces exactly these shapes, so `src/stream.ts` requires zero changes.

## Acceptance Criteria

- [ ] New file `src/codex-stream-adapter.ts` exists and exports `adaptCodexEvents()`
- [ ] `item.completed` with `agent_message` item yields a `text_delta` with `item.text`
- [ ] `item.completed` with `command_execution` item yields a tool_use sequence (start with name="Bash", input_json_delta with command, stop)
- [ ] `item.completed` with `file_change` item yields a tool_use sequence (start with name="Write", input_json_delta with file paths, stop)
- [ ] `item.completed` with `mcp_tool_call` item yields a tool_use sequence (start with name=`item.tool`, stop)
- [ ] `item.completed` with `reasoning`, `web_search`, `todo_list`, or `error` items are silently skipped
- [ ] `turn.completed` produces a dim summary line (`N tokens · 1 turn · X.Xs`) identical to Claude format
- [ ] `turn.failed` produces red error output via `errWrite` and stops processing
- [ ] `error` (ThreadErrorEvent) produces red error output via `errWrite` and stops processing
- [ ] Errors thrown by the Codex SDK (try/catch) produce red error output via `errWrite`
- [ ] `src/stream.ts` is not modified
- [ ] `src/loop.ts` is not modified
- [ ] `thread.started`, `turn.started`, `item.started`, `item.updated` events are silently skipped (no crash)
- [ ] `startTime` parameter is used for `duration_ms` calculation
- [ ] Stream ending without `turn.completed` yields a synthetic zero-usage result

## Edge Cases

- Codex emits a `turn.completed` with `usage` missing or zero: emit the result message regardless (zero tokens is valid)
- Codex emits multiple text items in one turn: yield a `text_delta` for each — they concatenate naturally through `processMessage()`
- `event.item` is `null` or not an object: skip without crashing
- The Codex event stream ends without a `turn.completed`: yield a synthetic `result/success` with zero usage so the loop doesn't hang
- `turn.failed` arrives mid-stream: yield error result and stop immediately (return from generator)
- `error` event arrives at any point: yield error result and stop immediately (return from generator)
- `item.completed` with unrecognized `item.type` (future SDK additions): silently skip — yield nothing
- `file_change` item with empty `changes` array: yield tool_use sequence with empty `file_path` string
