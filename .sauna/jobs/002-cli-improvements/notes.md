# Notes — Job 002: CLI Improvements

## P0: Repeat Flags Refactor

### Design Decisions

- **`runLoop` dispatch order**: The function checks `forever` first, then `count !== undefined`, then falls through to single-run. This makes the control flow explicit — each mode is a self-contained block with an early `return`.
- **`count` alone implies looping**: Previously `--count` required `--loop` and was silently ignored without it. Now `--count N` alone triggers fixed-count mode. This is cleaner UX — users don't need to remember two flags for the common "run N times" case.
- **Mutual exclusivity validation in `index.ts`**: The `--forever` + `--count` conflict is checked before dry-run, so it applies in all modes. Error goes to stderr with exit code 1.

### Files Changed

- `src/loop.ts`: `LoopConfig.loop` → `LoopConfig.forever`, reordered `runLoop` dispatch logic
- `index.ts`: Removed `--loop/-l`, added `--forever` (no alias), added mutual exclusivity check, updated dry-run JSON
- `tests/loop.test.ts`: All tests updated to use `{ forever: bool, count }` config shape
- `tests/cli.test.ts`: Replaced "silently ignored" test with "count alone enables looping" test, added mutual exclusivity test

## P1: Output Formatting State Tracking

### Design Decisions

- **`StreamState` as explicit mutable object**: Rather than making `processMessage` a closure or class, the state is a plain `{ lastCharWasNewline, isFirstTextOutput }` object passed as an optional third parameter. This preserves backwards compatibility — callers that don't pass state get the old stateless behavior.
- **`lastCharWasNewline` defaults to `true`**: A fresh session starts as if the cursor is at column 0. This means the first tool tag doesn't get a spurious leading newline, and consecutive tool calls render correctly.
- **`isFirstTextOutput` strips only leading `\n` characters**: The spec says "leading blank lines" — we strip `\n` but not spaces/tabs within the first line. This preserves intentional indentation.
- **State reset per iteration**: Each `runLoop` iteration creates a fresh `StreamState`. Formatting state does not bleed between loop iterations.
- **Summary separator**: With state, the summary uses `state.lastCharWasNewline` to decide whether to prepend `\n`. Without state (backwards compat), it always prepends `\n`.

### Bugfix

- **`index.ts` typo**: `runSeOKssion` → `runSession` on line 69.

### Files Changed

- `src/stream.ts`: Added `StreamState` type, `createStreamState()` factory, updated `processMessage` to accept optional state parameter
- `src/loop.ts`: Creates fresh `StreamState` per iteration, passes to `processMessage`
- `index.ts`: Fixed typo `runSeOKssion` → `runSession`
- `tests/stream.test.ts`: Added 7 P1 tests covering newline insertion, leading whitespace stripping, consecutive tool calls, summary separation

## P2: Interactive Mode

### Design Decisions

- **SDK v2 session API (`unstable_v2_createSession`)**: Uses the persistent session API rather than `query()`. A single `SDKSession` object is created once and reused for all turns — `session.send()` sends user input, `session.stream()` yields the response. No need for `unstable_v2_resumeSession` since the session object itself maintains state.
- **`SDKSessionOptions.model` is required**: Unlike `query()` where model is optional, the v2 API requires a model. Defaults to `claude-sonnet-4-20250514` when the user doesn't specify `--model`.
- **Testability via `InteractiveOverrides`**: The `runInteractive` function accepts optional `input`, `promptOutput`, and `createSession` overrides. This allows tests to inject `PassThrough` streams as fake stdin/stderr and mock session objects without global `mock.module()` interference.
- **Readline prompt on stderr**: The `> ` prompt is written to stderr via `createInterface({ output: process.stderr })` so it doesn't mix with agent output on stdout.
- **Context paths on first turn only**: `buildPrompt()` is called with context paths for the first turn. Subsequent turns send the raw user input without context — the agent already has the context from the session's conversation history.
- **Empty input or EOF exits**: Both empty string input and EOF (Ctrl+D / null from readline) break the REPL loop. The session is always cleaned up via `finally` block.
- **Error isolation per turn**: Each turn's `session.stream()` is wrapped in try/catch. Errors are printed in red but do not exit the REPL — the user can try another prompt.
- **`readLine` handles close race**: The `readLine` helper listens for both the "close" event (EOF) and `rl.question()` callback, with proper listener cleanup to avoid dangling handlers. A try/catch around `rl.question()` handles the case where readline is already closed.

### Files Changed

- `src/interactive.ts`: New file — `runInteractive()` REPL loop, `InteractiveConfig` and `InteractiveOverrides` types, `readLine` helper
- `index.ts`: Added `--interactive/-i` flag, mutual exclusivity checks, optional prompt when interactive, wired `runInteractive` call
- `tests/cli.test.ts`: Added 3 tests — `--interactive --forever` error, `--interactive --count N` error, `--interactive` without prompt dry-run
- `tests/interactive.test.ts`: New file — 7 tests covering first prompt with context, empty input exit, EOF exit, multi-turn context isolation, error recovery, readline-first-prompt, and EOF-without-prompt

## P3: Edge Case Test Coverage

### Design Decisions

- **State leak regression test**: Tests that `isFirstTextOutput` resets between loop iterations by having iteration 1 produce text (setting `isFirstTextOutput=false`) and iteration 2 produce text with leading `\n` characters. If state leaked, the leading newlines wouldn't be stripped. Validated by temporarily moving `createStreamState()` outside the loop — test correctly fails.
- **Result-only session test**: Verifies that when a session produces only a `result` message (no `text_delta` or `tool_use`), the summary renders without a spurious leading newline. This works because `lastCharWasNewline` defaults to `true`, so the separator logic correctly omits the `\n` prefix.
- **Existing unit tests suffice for tasks 1-3**: The `--count 0`, `-n 1`, and "no flags" behaviors were already tested in `loop.test.ts` as unit tests on `runLoop`. These survive the `--loop` → `--forever` refactor unchanged because `runLoop`'s dispatch logic is independent of how flags are parsed. CLI-level dry-run tests would only test `cleye` flag parsing, not loop behavior.

### Files Changed

- `tests/loop.test.ts`: Added "formatting state resets between loop iterations" test with custom session factory yielding different messages per iteration
- `tests/stream.test.ts`: Added "session with only a result message (no text, no tools) renders summary correctly" test
