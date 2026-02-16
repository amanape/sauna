# Codebase Complexity Findings

## Verdict: Lean and honest

571 lines of source across 7 files. 1,585 lines of tests. Zero over-engineering detected.

Every abstraction exists because it solves a real problem, not because someone read a design patterns book.

---

## The abstractions, judged

### `src/cli.ts` (10 lines) — Model alias resolution
**Born from pain.** Nobody wants to type `claude-sonnet-4-20250514` every time. A dictionary lookup. Does one thing. Good.

### `src/claude.ts` (8 lines) — Find the Claude executable
**Born from necessity.** The Agent SDK needs a path to the Claude Code binary. `which claude` + `realpathSync`. Can't avoid it.

### `src/session.ts` (40 lines) — Session creation + prompt building
**Born from reuse.** `buildPrompt` is called by both `runSession` and `runInteractive`. `runSession` bundles SDK config so callers don't repeat themselves. Justified by actual duplication.

### `src/loop.ts` (76 lines) — Loop orchestration
**Born from real requirements.** Three distinct modes (single-run, fixed-count, infinite) with error isolation between iterations and state reset. Each branch is ~15 lines with clear behavior. There's minor duplication across branches (error catch + state reset) but extracting it would obscure more than it clarifies.

### `src/interactive.ts` (201 lines) — Interactive REPL
**Born from genuine complexity.** Multi-turn conversations need async message feeding while the agent processes. `createMessageChannel` implements a push/pull async queue — this isn't a fancy pattern choice, it's what the SDK requires. Signal handling (SIGINT/SIGTERM) exists because the alternative is zombie processes. The `InteractiveOverrides` injection pattern exists because the alternative is untestable code.

This is the most complex file. It earns its complexity.

### `src/stream.ts` (148 lines) — Output formatting + state tracking
**Born from visual correctness.** `StreamState` tracks whether the last character was a newline and whether we've seen text output yet. Without it: double newlines before tool tags, leading whitespace on first output. Five pure formatting functions, one stateful processor. Clean separation.

### `index.ts` (88 lines) — CLI entry point
**Born from being a CLI.** Argument parsing, mutual exclusivity validation (`--forever` + `--count` is illegal), dispatch to execution mode. Dry-run support for testing. Boilerplate, but necessary boilerplate.

---

## What's not here (and shouldn't be)

- No config file abstraction. Env vars are enough.
- No plugin system. Not in scope.
- No logging framework. `process.stdout.write` is fine.
- No custom error classes. Try-catch with formatted output works.
- No dependency injection container. Function parameters work.
- No unnecessary generics. Types are concrete.

---

## Numbers

| Metric | Value |
|---|---|
| Source lines | 571 |
| Test lines | 1,585 |
| Test:source ratio | 2.8:1 |
| Source files | 7 |
| Exported functions | ~12 |
| Runtime dependencies | 2 (`@anthropic-ai/claude-agent-sdk`, `cleye`) |
| Pass-through layers | 0 |
| Unused abstractions | 0 |

---

## Dependency choices

Good: `cleye` over `commander`/`yargs`. Lightweight, declarative, no bloat.
Good: Two runtime deps total. The dependency tree is what it needs to be.

---

## Technical debt

Almost none. Two minor items:

1. **Loop branch duplication** — error handling + state reset repeated 3x in `loop.ts`. Low severity. Extracting a helper saves ~6 lines but loses readability.
2. **No context path validation** — `buildPrompt` trusts its inputs. The SDK would error anyway, so this is fine.

---

## Summary

This codebase respects the reader's time. Abstractions exist because removing them would mean duplicated code or untestable code, not because someone thought they should. The test suite is thorough without being theatrical. The architecture is obvious in the best way — you can understand the entire system in 15 minutes.

If anything, the only risk is that it's *too* lean to the point where future features might need structural changes. But that's a problem for future features, not a problem for today.
