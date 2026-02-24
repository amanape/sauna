# Readline Prompt Delivery

## Problem

`readLine()` hardcodes an empty string in `rl.question("")`. On TTY terminals (`output.isTTY === true`), readline's `question()` calls `_refreshLine()` which moves the cursor to column 0, clears the screen downward, then writes the question string. An empty question string means nothing is written after the clear — erasing any content previously on the line.

## Scope

Modify the private `readLine()` function in `src/interactive.ts` to accept an optional `prompt` parameter and forward it to `rl.question(prompt, ...)`.

## Acceptance Criteria

- [ ] `readLine()` signature changes to `readLine(rl, prompt?: string): Promise<string | null>`
- [ ] `prompt` defaults to `""` so callers without a prompt are unaffected
- [ ] `rl.question(prompt, callback)` receives the prompt as its first argument
- [ ] Existing EOF handling (`rl.once("close", ...)`) is unchanged
- [ ] Existing error handling (`try/catch` around `rl.question`) is unchanged

## Files

- `src/interactive.ts` — modify `readLine()` signature and `rl.question()` call
