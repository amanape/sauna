# Agent Message Color

## Problem

In interactive mode, there is no visual distinction between what the user typed and what the agent responded with. Both appear as plain text, making it hard to scan a conversation and tell who said what.

## Current Behavior

- User types at a `> ` prompt (written to stderr via readline).
- Agent text streams to stdout with no color or prefix.
- The only visual cue is the `> ` prompt before user input — but that prompt has its own visibility issues (see `prompt-visibility.md`).

## Desired Behavior

Agent text output should be rendered in a **subtle, non-distracting color** so it's visually distinct from user input without being loud.

Chosen color: **ANSI 245** (`\x1b[38;5;245m`) — a neutral mid-gray from the 256-color palette. It reads clearly on both dark and light terminal themes but is clearly "different" from the default foreground color.

The color is applied to:
- `text_delta` content (the agent's streamed text)

The color is **not** applied to:
- Tool tags (`[Read]`, `[Bash]`) — these already have their own dim styling
- Summary lines — already dim
- Error messages — already red

## Implementation

- Add a new ANSI constant in `src/stream.ts`: `const AGENT_COLOR = "\x1b[38;5;245m"` and use `RESET` to turn it off.
- In `processMessage()`, wrap `text_delta` writes: `write(AGENT_COLOR + text + RESET)`.
- The color codes should not interfere with newline tracking in `StreamState` (they don't contain `\n`).
- The `isFirstTextOutput` leading-newline stripping happens before coloring (strip first, then color the result).

## Acceptance Criteria

- [ ] Agent text in interactive mode renders in ANSI 245 (mid-gray)
- [ ] Agent text in non-interactive (single-run, loop) mode also renders in ANSI 245 for consistency
- [ ] Tool tags, summary lines, and error messages are unchanged
- [ ] Color codes do not break `StreamState.lastCharWasNewline` tracking
- [ ] Color reset occurs at end of each text chunk so tool tags / summaries aren't accidentally colored
- [ ] Existing tests updated; no regressions in `bun test`

## Files

- `src/stream.ts` — add constant, modify `processMessage()` text_delta handling
- `tests/stream.test.ts` — update expected output in tests
