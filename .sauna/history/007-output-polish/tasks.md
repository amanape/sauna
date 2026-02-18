# 007 Output Polish — Tasks

Prioritized by user-facing impact and dependency order.

## 1. Loop Header Divider (`src/stream.ts`, `tests/stream.test.ts`) — DONE

- [x] Replace dim label with bold full-width divider using `─` (U+2500)
- [x] Read terminal width from `process.stdout.columns`, default to 40
- [x] Add optional `columns` parameter to `formatLoopHeader()` for testability
- [x] Center the label with one space on each side, fill remaining width with `─`
- [x] Give extra character to the right side when total is odd
- [x] Fall back to bold label only when `columns < label.length + 4`
- [x] Add `BOLD` / `BOLD_OFF` ANSI constants
- [x] Update tests: `formatLoopHeader(2, 5)` at 40 cols, `formatLoopHeader(1)` at 40 cols, narrow fallback, non-TTY default
- [x] Update existing `tests/loop.test.ts` to expect bold instead of dim

## 2. Agent Message Color (`src/stream.ts`, `tests/stream.test.ts`) — DONE

- [x] Add `AGENT_COLOR = "\x1b[38;5;245m"` constant
- [x] Wrap `text_delta` writes in `processMessage()` with `AGENT_COLOR` + `RESET`
- [x] Apply coloring after leading-newline stripping (strip first, then color)
- [x] Ensure color reset at end of each chunk so tool tags / summaries aren't affected
- [x] Verify `lastCharWasNewline` tracking is unbroken (color codes don't contain `\n`)
- [x] Apply in both interactive and non-interactive paths (same `processMessage` function)
- [x] Update tests: expected output strings now include ANSI 245 wrapping
- [x] Update `result` fallback text path (lines 86-92) to also color with AGENT_COLOR

### 2a. Lighten Agent Color — DONE

Bumped from ANSI 245 to **ANSI 250** (light gray) for better readability on dark terminal themes.

- [x] Change `AGENT_COLOR` from `"\x1b[38;5;245m"` to `"\x1b[38;5;250m"` in `src/stream.ts`
- [x] Update `tests/stream.test.ts` expected output to match new ANSI 250 code
- [x] Update spec in `.sauna/jobs/007-output-polish/specs/agent-message-color.md` to reflect ANSI 250

## 3. Prompt Visibility (`src/interactive.ts`, `tests/interactive.test.ts`) — DONE

- [x] Change `prompt: "> "` to `prompt: ""` in `createInterface` config
- [x] Create `writePrompt(output: Writable, state: StreamState)` helper
  - If `!state.lastCharWasNewline`, write `\n` first
  - Write `\x1b[1;32m> \x1b[0m` to the output stream
- [x] Replace `rl.prompt()` at line 115 (initial prompt) with `writePrompt(promptOutput, state)`
  - Created a fresh `StreamState` for the initial prompt phase
- [x] Replace `rl.prompt()` at line 176 (after result) with `writePrompt(promptOutput, state)`
- [x] Verify piped stdout stays clean (prompt only on stderr / promptOutput)
- [x] Update tests: 5 new test cases in `tests/interactive.test.ts` under `describe('P5: prompt visibility')`
