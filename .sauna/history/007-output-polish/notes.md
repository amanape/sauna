# 007 Output Polish — Notes

## Loop Header Divider (completed)

- `formatLoopHeader()` in `src/stream.ts` now accepts an optional `columns` parameter (3rd arg) for testability.
- Default column width is `process.stdout.columns ?? 40`.
- The `BOLD` and `BOLD_OFF` constants were added alongside existing `DIM`/`DIM_OFF`.
- Both `BOLD_OFF` and `DIM_OFF` use `\x1b[22m` — this is correct per ANSI spec (22 resets both bold and dim).
- Tests in `tests/loop.test.ts` also needed updating since they checked for the old dim code (`\x1b[2m`).
- 5 new test cases added in `tests/stream.test.ts` covering: fixed count, infinite mode, odd width, narrow fallback, default columns.

## Prompt Visibility (completed)

- Readline `prompt` set to `""` (empty) so readline itself doesn't write a competing prompt.
- New exported `writePrompt(output, state)` helper in `src/interactive.ts` writes `\x1b[1;32m> \x1b[0m` (bold green) to the output stream.
- `writePrompt` inserts `\n` before the prompt if `state.lastCharWasNewline` is false, ensuring the prompt always starts on a fresh line.
- A `promptOutput` variable is extracted once at the top of `runInteractive()` to avoid repeating the `overrides?.promptOutput ?? process.stderr` fallback.
- For the initial prompt (no `--prompt` CLI arg), a fresh `StreamState` is created via `createStreamState()` — starts with `lastCharWasNewline: true`, so no extra `\n` is inserted.
- After result messages, the existing `state` from the query loop is passed, which correctly reflects whether the last stdout write ended with a newline.
- Piped stdout remains clean — prompt only goes to `promptOutput` (stderr by default).
- 5 new test cases: initial prompt visibility, after-result prompt, writePrompt with/without newline prefix, stdout cleanliness.

## Agent Message Color (completed)

- `AGENT_COLOR` uses `"\x1b[38;5;250m"` (ANSI 256-color light gray) in `src/stream.ts`. Originally 245 (mid-gray), bumped to 250 for better readability on dark terminal themes.
- `text_delta` writes in `processMessage()` are wrapped: `write(AGENT_COLOR + text + RESET)`.
- Leading-newline stripping occurs before coloring — strip first, then wrap the remaining text.
- `lastCharWasNewline` tracks the actual text content (checks `text.endsWith("\n")`), not the ANSI codes. This works because the RESET code (`\x1b[0m`) doesn't contain `\n`.
- Result fallback text path (when `isFirstTextOutput` and `msg.result` exists) also gets `AGENT_COLOR + RESET` wrapping.
- Tool tags, summary lines, and error messages are unaffected — they use their own styling (dim, red).
- 6 new test cases in `tests/stream.test.ts` under `describe('agent message color')`.
- 6 existing tests updated to include ANSI 250 wrapping in expected output strings.
