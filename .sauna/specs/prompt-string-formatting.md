# Prompt String Formatting

## Problem

The prompt `> ` is currently constructed inside `writePrompt()` which couples formatting to I/O. There is no way to obtain the formatted string without writing it to a stream, which prevents passing it through readline's prompt mechanism.

## Scope

Add a pure function `formatPrompt(state: StreamState): string` to `src/interactive.ts` that returns the bold-green `> ` string with a conditional newline prefix based on stream state.

## Acceptance Criteria

- [ ] `formatPrompt(state)` is exported from `src/interactive.ts`
- [ ] Returns `"\x1b[1;32m> \x1b[0m"` when `state.lastCharWasNewline` is `true`
- [ ] Returns `"\n\x1b[1;32m> \x1b[0m"` when `state.lastCharWasNewline` is `false`
- [ ] Reuses the existing `BOLD_GREEN` and `RESET` constants already defined in `interactive.ts`
- [ ] Unit tests assert both return values directly via string equality

## Files

- `src/interactive.ts` — add `formatPrompt()`
- `tests/interactive.test.ts` — add unit tests for `formatPrompt()`
