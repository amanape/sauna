# 007 Output Polish — Tasks

Prioritized by user-facing impact and dependency order.

## 1. Loop Header Divider (`src/stream.ts`, `tests/stream.test.ts`)

- [ ] Replace dim label with bold full-width divider using `─` (U+2500)
- [ ] Read terminal width from `process.stdout.columns`, default to 40
- [ ] Add optional `columns` parameter to `formatLoopHeader()` for testability
- [ ] Center the label with one space on each side, fill remaining width with `─`
- [ ] Give extra character to the right side when total is odd
- [ ] Fall back to bold label only when `columns < label.length + 4`
- [ ] Add `BOLD` / `BOLD_OFF` ANSI constants (or reuse `\x1b[1m` / `\x1b[22m`)
- [ ] Update tests: `formatLoopHeader(2, 5)` at 40 cols, `formatLoopHeader(1)` at 40 cols, narrow fallback, non-TTY default

## 2. Agent Message Color (`src/stream.ts`, `tests/stream.test.ts`)

- [ ] Add `AGENT_COLOR = "\x1b[38;5;245m"` constant
- [ ] Wrap `text_delta` writes in `processMessage()` with `AGENT_COLOR` + `RESET`
- [ ] Apply coloring after leading-newline stripping (strip first, then color)
- [ ] Ensure color reset at end of each chunk so tool tags / summaries aren't affected
- [ ] Verify `lastCharWasNewline` tracking is unbroken (color codes don't contain `\n`)
- [ ] Apply in both interactive and non-interactive paths (same `processMessage` function)
- [ ] Update tests: expected output strings now include ANSI 245 wrapping
- [ ] Update `result` fallback text path (lines 86-92) to also color with AGENT_COLOR

## 3. Prompt Visibility (`src/interactive.ts`, `tests/interactive.test.ts`)

- [ ] Change `prompt: "> "` to `prompt: ""` in `createInterface` config
- [ ] Create `writePrompt(output: Writable, state: StreamState)` helper
  - If `!state.lastCharWasNewline`, write `\n` first
  - Write `\x1b[1;32m> \x1b[0m` to the output stream
- [ ] Replace `rl.prompt()` at line 115 (initial prompt) with `writePrompt(promptOutput, state)`
  - Need a `StreamState` available before the query starts; create one for the initial prompt phase
- [ ] Replace `rl.prompt()` at line 176 (after result) with `writePrompt(promptOutput, state)`
- [ ] Verify piped stdout stays clean (prompt only on stderr / promptOutput)
- [ ] Update tests: capture `promptOutput` content and verify bold green `> ` appears
