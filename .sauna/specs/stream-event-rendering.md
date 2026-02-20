# Stream Event Rendering

## Overview

A new `processProviderEvent()` function renders `ProviderEvent` objects to the terminal with ANSI formatting, replacing the current `processMessage()`.

## Acceptance Criteria

- `text_delta` events: text is written in `AGENT_COLOR` (gray, `\x1b[38;5;250m`); leading blank lines stripped from first text output; newline position tracked in state
- `tool_start` events: no immediate output (name stored for potential future use)
- `tool_end` events: dim bracketed tag written (e.g., `[Bash] ls -la`); newline inserted before tag if previous output didn't end with one
- `result` with `success: true`: dim summary line with tokens/turns/duration; newline separator if needed
- `result` with `success: false`: red error with subtype and error details; written to `errWrite` if provided
- `error` events: red error message written to `errWrite` if provided
- `StreamState` is simplified to `{ lastCharWasNewline: boolean; isFirstTextOutput: boolean }` — no more `pendingToolName` or `pendingToolJson` (those moved into the Claude event adapter)
- Existing formatting functions (`formatToolTag`, `formatSummary`, `formatError`, `formatLoopHeader`, `redactSecrets`) are unchanged and reused
- `processMessage()` is removed (all callers migrate to `processProviderEvent()`)

## Edge Cases

- `tool_end` without a preceding `tool_start`: tag is still displayed (no crash)
- Multiple consecutive `text_delta` events: concatenated naturally (state tracks newline position)
- `result` with no preceding text output and fallback text: handled by the adapter (not here)

## Constraints

- `loop.ts` call sites update from `processMessage(msg, ...)` to `processProviderEvent(event, ...)`
- `interactive.ts` is not updated in this spec (Claude-only, deferred)

## File

`src/stream.ts` (modified)
