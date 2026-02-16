# 002 CLI Improvements - Tasks

## P0: Repeat Flags Refactor

- [x] Remove `--loop/-l` flag from `index.ts` CLI definition (cleye config)
- [x] Add `--forever` boolean flag (no short alias) to `index.ts` CLI definition
- [x] Rename `LoopConfig.loop` field to `LoopConfig.forever` in `src/loop.ts` and update `runLoop` logic
- [x] Update `index.ts` to pass `forever: argv.flags.forever ?? false` instead of `loop` to `runLoop`
- [x] When `--count/-n` is passed without `--forever`, still run in fixed-count mode (currently requires `--loop`; the `--count` flag alone should imply looping)
- [x] Add mutual exclusivity validation: error and exit if both `--forever` and `--count` are provided
- [x] Update `SAUNA_DRY_RUN` JSON output in `index.ts` to reflect new flag names (`forever` instead of `loop`)
- [x] Update all tests in `tests/loop.test.ts` to use `forever` instead of `loop` in `LoopConfig`
- [x] Update tests in `tests/cli.test.ts` (`--count without --loop` test) to reflect new semantics where `--count` alone enables looping
- [x] Add test: `--forever --count N` prints error and exits non-zero

## P1: Output Formatting State Tracking

- [ ] Make `processMessage` stateful: introduce a `StreamState` object tracking `lastCharWasNewline` and `isFirstTextOutput` flags
- [ ] Before writing a tool tag, check `lastCharWasNewline`; if false, prepend `\n` to ensure tag starts on a new line
- [ ] Strip leading whitespace/blank-lines from the very first text_delta output in a session
- [ ] After writing text or tool tag, update `lastCharWasNewline` based on whether the written string ends with `\n`
- [ ] Ensure summary line has exactly one `\n` separator from preceding text (no double blank lines, no missing separator)
- [ ] In `runLoop`, reset `StreamState` between iterations so formatting state does not bleed across loops
- [ ] Add test: tool tag after text that lacks trailing newline gets newline inserted
- [ ] Add test: tool tag after text that already ends with newline gets no extra newline
- [ ] Add test: first text output with leading blank lines has them stripped
- [ ] Add test: consecutive tool calls (no text between them) each start on own line
- [ ] Add test: session with only tool calls (no text) formats correctly

## P2: Interactive Mode

- [ ] Add `--interactive/-i` boolean flag to `index.ts` CLI definition
- [ ] Add mutual exclusivity validation: error and exit if `--interactive` combined with `--count` or `--forever`
- [ ] Allow `--interactive` without a positional prompt (first prompt comes from CLI arg or first readline input)
- [ ] Create `src/interactive.ts` with a REPL loop: read line from stdin (`> ` prompt written to stderr), send to agent, stream response
- [ ] Use SDK v2 session APIs (`unstable_v2_createSession` for first turn, `unstable_v2_resumeSession` for subsequent turns) to maintain conversation context
- [ ] Pass context paths only on the first turn's prompt (via `buildPrompt`); omit them on subsequent turns
- [ ] Handle empty input: exit the REPL cleanly (exit code 0)
- [ ] Handle Ctrl+C and Ctrl+D: exit the REPL cleanly
- [ ] Agent errors during a turn print the error but do not end the session; REPL continues
- [ ] Wire `--interactive` flag into `index.ts` main flow: if set, call interactive REPL instead of `runLoop`
- [ ] Add test: interactive mode starts, accepts input, streams response, and prompts again
- [ ] Add test: empty input exits interactive mode
- [ ] Add test: `--interactive --count N` prints error and exits non-zero
- [ ] Add test: `--interactive --forever` prints error and exits non-zero
- [ ] Add test: agent error mid-session does not terminate the REPL

## P3: Edge Case Test Coverage

- [ ] Add test: `--count 0` with `--forever` removed still exits immediately (ensure `-n 0` semantics survive refactor)
- [ ] Add test: `-n 1` runs once with `loop 1 / 1` header
- [ ] Add test: no repeat flags runs once with no header (regression guard)
- [ ] Add test: formatting state resets between loop iterations (tool tag newline tracking does not leak)
- [ ] Add test: session that produces only a result message (no text, no tools) renders summary correctly
