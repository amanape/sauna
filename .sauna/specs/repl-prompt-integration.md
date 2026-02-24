# REPL Prompt Integration

## Problem

`runInteractive()` writes the `> ` prompt directly to stderr via `writePrompt()`, then calls `readLine()` which triggers `rl.question("")`. Readline's `_refreshLine()` erases the prompt because readline is unaware of it. The prompt must instead flow through `readLine()` so readline writes it as part of its own refresh cycle.

## Scope

Replace each `writePrompt(); readLine()` pair in `runInteractive()` with a single `readLine(rl, formatPrompt(state))` call.

## Acceptance Criteria

- [ ] Initial prompt (no CLI `--prompt`, line 131): `readLine(rl, formatPrompt(initialState))` replaces the `writePrompt()` + `readLine()` pair
- [ ] Post-turn prompt (line 150): `readLine(rl, formatPrompt(state))` replaces the `writePrompt()` + `readLine()` pair
- [ ] `writePrompt()` is deleted (no remaining callers)
- [ ] The standalone `promptOutput` variable (line 99) is deleted (no remaining readers)
- [ ] `InteractiveOverrides.promptOutput` is retained (still used for readline's `output` option)
- [ ] P5 prompt visibility tests still detect `BOLD_GREEN_PROMPT` on the prompt output stream
- [ ] Unit tests for `writePrompt` are replaced by unit tests for `formatPrompt` (from spec `prompt-string-formatting`)
- [ ] `bun test` passes
- [ ] Manual: `bun run index.ts -i` shows green `>` prompt on a real terminal

## Files

- `src/interactive.ts` — replace call sites, remove `writePrompt()`, remove `promptOutput` variable
- `tests/interactive.test.ts` — update P5 tests, replace `writePrompt` import with `formatPrompt`
