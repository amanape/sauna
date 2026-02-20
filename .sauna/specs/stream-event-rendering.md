# Stream Event Rendering

## Overview

A new `processProviderEvent()` function renders `ProviderEvent` objects to the terminal with ANSI formatting, replacing the current `processMessage()`.

## Acceptance Criteria

- `text_delta` events: text is written in `AGENT_COLOR` (gray, `\x1b[38;5;250m`); leading blank lines stripped from first text output; newline position tracked in state
- `tool_start` events: no immediate output (name stored in state for potential future use)
- `tool_end` events: dim bracketed tag written on its own line (e.g., `[Bash] ls -la`, `[Edit] src/index.ts`); newline inserted before tag if previous output didn't end with one
- `result` with `success: true`: dim summary line (e.g., `1234 tokens · 3 turns · 2.1s`); newline separator if needed
- `result` with `success: false`: red error message from `errors` array; written to `errWrite` if provided, otherwise to `write`
- `error` events: red error message written to `errWrite` if provided
- `StreamState` is simplified to `{ lastCharWasNewline: boolean; isFirstTextOutput: boolean }` — `pendingToolName` and `pendingToolJson` are no longer needed (moved into the Claude event adapter)
- Existing formatting functions (`formatToolTag`, `formatSummary`, `formatError`, `formatLoopHeader`, `redactSecrets`) are unchanged and reused
- `processMessage()` is removed (all callers migrate to `processProviderEvent()`)

## Edge Cases

- `tool_end` without a preceding `tool_start`: tag is still displayed (no crash)
- Multiple consecutive `text_delta` events: concatenated naturally (state tracks newline position)
- `result` with no preceding text output: fallback text handling is the adapter's responsibility (spec 2/4), not this function's

## Constraints

- `loop.ts` call sites update from `processMessage(msg, ...)` to `processProviderEvent(event, ...)`
- `interactive.ts` is not updated in this spec (Claude-only, deferred)

## File

`src/stream.ts` (modified)
