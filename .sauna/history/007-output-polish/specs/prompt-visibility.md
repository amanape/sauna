# Prompt Visibility

## Problem

The `> ` prompt in interactive mode is frequently invisible. It only appears after specific triggers like terminal resize, backspace, or clearing messages. The user has to guess when the agent is done and when it's safe to type.

## Root Cause

The readline interface is configured with `output: process.stderr` (line 106 of `src/interactive.ts`). This is intentional — it keeps the prompt off stdout so piped output stays clean. However:

1. **stderr buffering**: stderr may not flush immediately on all terminals/platforms, causing the prompt to be delayed or lost.
2. **stdout/stderr interleaving**: when both streams write to the same terminal, the prompt can be overwritten or visually buried by preceding stdout content.
3. **No explicit flush**: `rl.prompt()` writes to stderr but there's no guarantee it's flushed before the terminal awaits input.

## Desired Behavior

The `> ` prompt should be **reliably visible** every time the agent finishes a turn and the CLI is ready for user input. The prompt should also be **visually distinct** so it's easy to spot.

### Approach: Write prompt manually to stderr with explicit flush

Instead of relying on readline's built-in `rl.prompt()`, write the prompt string directly to stderr with a manual flush, and give it a color treatment:

- Color the prompt with **bold green** (`\x1b[1;32m> \x1b[0m`) to make it stand out as the "your turn" indicator.
- Write it via `process.stderr.write()` (or the injected `promptOutput` stream) which returns a boolean indicating if the write was flushed.
- Ensure there's a newline before the prompt if the last agent output didn't end with one, so the prompt starts on a fresh line.

### Readline configuration change

Set `prompt: ""` on the readline interface (empty string) so readline itself doesn't write a competing prompt. The prompt display is now fully controlled by our code.

## Implementation

1. In `runInteractive()`, change `prompt: "> "` to `prompt: ""` in the `createInterface` config.
2. Create a helper: `writePrompt(output: Writable, state: StreamState)`:
   - If `!state.lastCharWasNewline`, write `\n` first.
   - Write `\x1b[1;32m> \x1b[0m` to the output stream.
3. Replace both `rl.prompt()` calls (lines 115 and 176) with `writePrompt(promptOutput, state)`.
4. The `promptOutput` stream is `overrides?.promptOutput ?? process.stderr` (already available).

## Acceptance Criteria

- [ ] The `> ` prompt appears in bold green on stderr after every agent turn completes
- [ ] The `> ` prompt appears on a fresh line (newline inserted if agent output didn't end with one)
- [ ] The prompt is visible immediately — no delay or trigger required
- [ ] Readline's own prompt is empty (`""`) so it doesn't write a duplicate
- [ ] The first prompt (when no `--prompt` arg is given) also uses the styled prompt
- [ ] Piped stdout remains clean — no prompt characters in stdout
- [ ] Existing tests updated; no regressions in `bun test`

## Files

- `src/interactive.ts` — modify readline config, replace `rl.prompt()` calls, add `writePrompt()` helper
- `tests/interactive.test.ts` — update/add tests for prompt output
