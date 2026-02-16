# Tasks

## Repeat Flags
- [ ] Remove `--loop/-l` flag from `index.ts` CLI definition
- [ ] Add `--forever` boolean flag to `index.ts` CLI definition
- [ ] Add mutual-exclusivity validation (`--forever` + `--count` = error)
- [ ] Change `LoopConfig` type from `{ loop, count }` to `{ count, forever }` in `loop.ts`
- [ ] Rewrite `runLoop` decision tree: count=0 early return, forever → infinite, count → fixed, else → single
- [ ] Update dry-run JSON output to reflect new flag shape
- [ ] Update `loop.test.ts`: all configs to new shape, update descriptions
- [ ] Update `cli.test.ts`: remove --count-without-loop test, add --forever dry-run test, add --forever+--count error test

## Output Formatting
- [ ] Add `StreamFormatter` class to `stream.ts` with `hasEmitted` and `lastCharWasNewline` state tracking
- [ ] Implement `ensureNewline()` and `reset()` methods on `StreamFormatter`
- [ ] `StreamFormatter.processMessage()`: strip leading whitespace from first text delta, ensure newline before tool tags
- [ ] Update `loop.ts` to use `StreamFormatter` instead of standalone `processMessage`
- [ ] Add `StreamFormatter` tests to `stream.test.ts`: leading whitespace stripping, newline insertion, no double-newline, reset behavior

## Interactive Mode
- [ ] Add `resume?: string` to `SessionConfig` in `session.ts` and pass through to SDK `query()` options
- [ ] Add `--interactive/-i` flag to `index.ts` CLI definition
- [ ] Add mutual-exclusivity validation (`--interactive` + `--count`/`--forever` = error)
- [ ] Create `src/interactive.ts` with `runInteractive()`: readline REPL loop, session resumption via `session_id`
- [ ] Wire `runInteractive()` into `index.ts` (branch on `interactive` flag)
- [ ] Create `tests/interactive.test.ts`: initial prompt, session resumption, multi-turn continuity, exit on empty input
- [ ] Add `resume` passthrough tests to `session.test.ts`
- [ ] Add `--interactive` dry-run and error-combination tests to `cli.test.ts`
