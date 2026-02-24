# Tasks

## Prompt Refactor (specs: prompt-string-formatting → readline-prompt-delivery → repl-prompt-integration)

Dependencies flow top-to-bottom. Each task builds on the previous.

- [x] Add `formatPrompt(state: StreamState): string` to `src/interactive.ts` — pure function returning the bold-green `> ` string with conditional newline prefix. Export it. (spec: prompt-string-formatting)
- [x] Add unit tests for `formatPrompt()` in `tests/interactive.test.ts` — assert both return values via string equality. (spec: prompt-string-formatting)
- [x] Change `readLine()` signature to `readLine(rl, prompt?: string)` and forward `prompt` (defaulting to `""`) to `rl.question(prompt, ...)`. (spec: readline-prompt-delivery)
- [x] Replace `writePrompt(promptOutput, initialState); readLine(rl)` (line ~131) with `readLine(rl, formatPrompt(initialState))`. (spec: repl-prompt-integration)
- [x] Replace `writePrompt(promptOutput, state); readLine(rl)` (line ~150) with `readLine(rl, formatPrompt(state))`. (spec: repl-prompt-integration)
- [x] Delete `writePrompt()` function (no remaining callers). (spec: repl-prompt-integration)
- [x] Delete standalone `promptOutput` variable (line ~99). Retain `overrides?.promptOutput` for readline's `output` option. (spec: repl-prompt-integration)
- [x] Update P5 tests — replace `writePrompt` import with `formatPrompt`. P5 prompt visibility tests still detect `BOLD_GREEN_PROMPT` on the prompt output stream (readline writes the prompt to its `output`). (spec: repl-prompt-integration)
- [x] `bun test` passes (297/297)
- [ ] Manual verification: `bun run index.ts -i` shows green `>` prompt on a real terminal
