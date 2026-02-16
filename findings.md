# Codebase Complexity Findings

## Verdict: Lean and honest

571 lines of source across 7 files. 1,585 lines of tests. 2 runtime dependencies. Zero gratuitous abstractions detected.

Every abstraction exists because removing it would mean duplicated code or untestable code. Nothing exists for "good practice" alone.

---

## The abstractions, judged

### `src/cli.ts` (10 lines) — Model alias resolution
**Pain-driven.** Nobody wants to type `claude-sonnet-4-20250514`. A 3-entry dictionary + one function. Does one thing. Good.

### `src/claude.ts` (8 lines) — Find the Claude executable
**Necessity-driven.** The Agent SDK needs `pathToClaudeCodeExecutable`. Both `session.ts` and `interactive.ts` call this, so extraction is justified by reuse. Not a premature abstraction — it's shared code.

### `src/session.ts` (40 lines) — Session creation + prompt building
**Reuse-driven.** `buildPrompt` is called by both `runSession` and `runInteractive`. `SessionConfig` type documents the contract clearly. The conditional model spread (`...(config.model ? { model: config.model } : {})`) avoids sending `undefined` as a property. Standard pattern.

### `src/loop.ts` (76 lines) — Loop orchestration
**Requirements-driven.** Three distinct modes (single-run, fixed-count, infinite) with error isolation between iterations and state reset. The forever and count branches are near-duplicates (~12 lines each) — extracting a helper would save lines but obscure the flow at this scale. Acceptable.

### `src/interactive.ts` (201 lines) — Interactive REPL
**Complexity-driven.** The most complex file, and it earns it. `createMessageChannel` is not a fancy pattern choice — the SDK requires `AsyncIterable<any>` for multi-turn prompts, and this is the minimal bridge from imperative `push()` to pull-based iteration. Signal handling exists because the alternative is zombie processes. `InteractiveOverrides` (5 optional fields) is a lot of injection surface, but each field unlocks a specific test scenario that would otherwise require mocking globals.

### `src/stream.ts` (148 lines) — Output formatting + state tracking
**Correctness-driven.** `StreamState` tracks `lastCharWasNewline` and `isFirstTextOutput`. Without it: double newlines before tool tags, leading whitespace on first output. Five pure formatting functions, one stateful processor. Clean separation. The `state?: StreamState` optional parameter adds `if (state)` guards everywhere even though every caller passes state — a minor wart from backward compatibility that could be cleaned up.

### `index.ts` (88 lines) — CLI entry point
**Structurally necessary.** Argument parsing via `cleye`, mutual exclusivity validation, dispatch to execution mode. `SAUNA_DRY_RUN` env-var escape hatch lets tests verify argument parsing without invoking the agent. Pragmatic.

---

## Design decisions worth calling out

**`write` callback injection everywhere** — Instead of calling `process.stdout.write` directly, every function takes a `write: (s: string) => void` parameter. This makes the entire output pipeline testable without mocking globals. Applied consistently across all files. Good pattern.

**`SAUNA_DRY_RUN`** — The entry point has a mode that prints parsed args as JSON and exits, used by `cli.test.ts`. Avoids the common trap of untestable CLI entry points.

**`permissionMode: "bypassPermissions"`** — The agent runs fully autonomous with no permission prompts. Intentional for a non-interactive agent runner, but worth being aware of — this tool gives Claude Code unrestricted access to whatever it's pointed at.

**No shared config object** — Session options (system prompt, permission mode, etc.) are duplicated between `runSession` and `runInteractive` rather than extracted into a shared builder. There are exactly 2 call sites and the options are stable. Acceptable.

---

## What's not here (and shouldn't be)

- No config file abstraction. Env vars are enough.
- No plugin system. Not in scope.
- No logging framework. `process.stdout.write` is fine.
- No custom error classes. Try-catch with formatted output works.
- No dependency injection container. Function parameters work.
- No unnecessary generics. Types are concrete.
- No abstract base classes, strategy patterns, or factory-of-factories.

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

- `cleye` over `commander`/`yargs` — lightweight, declarative, no bloat. Good choice.
- Two runtime deps total. The dependency tree is what it needs to be.
- `yaml` is dev-only, used in one test to parse the GitHub Actions workflow. Fine.

---

## Actual issues found

### Real problems

1. **No error handling in `findClaude()`** (`src/claude.ts:6`) — `execSync("which claude")` throws a raw Node `child_process` error if Claude Code isn't installed. Both `runSession` and `runInteractive` call this. Users see a confusing stack trace instead of "Claude Code not found on PATH." This is the most user-facing bug in the codebase.

2. **`msg: any` typing in `processMessage`** (`src/stream.ts:77`) — The SDK message type is not imported or modeled. The function dereferences `msg.type`, `msg.event.type`, `msg.event.delta.type`, `msg.event.content_block.type` all without type safety. If the SDK changes its streaming protocol, the compiler won't catch it.

3. **Stale model aliases** (`src/cli.ts:1-5`) — Aliases point to `claude-*-4-2025*` models. These may be outdated. Documented in project tasks but not yet fixed.

### Minor items

4. **`err: any` in catch blocks** (`src/loop.ts:44,64`, `src/interactive.ts:193`) — Accesses `err.message` without checking if `err` is actually an `Error` instance. If something throws a string, this produces `undefined` in the output. Low risk in practice.

5. **Loop branch duplication** (`src/loop.ts:34-48` vs `53-67`) — The forever and count branches are nearly identical. Saves ~12 lines to extract but adds a layer. Acceptable at 76 total lines.

6. **`StreamState` optionality** (`src/stream.ts`) — `state?: StreamState` is optional but every caller passes it. The `if (state)` guards are dead code in production. Cosmetic.

7. **No validation of `--count` negative values** — `--count -1` silently does nothing (loop condition `i <= -1` is immediately false). Not a crash, but not great UX.

---

## Summary

This codebase is appropriately engineered for a 571-line CLI tool. Abstractions exist from pain (shared code, testability, visual correctness), not from principle. The test suite is thorough at 2.8:1 without being theatrical. The architecture is obvious — you can understand the entire system in 15 minutes by reading 7 files.

The biggest gap is user-facing error handling at the `findClaude` boundary. Everything else is cosmetic or low-severity.

If anything, the risk is that it's *too* lean — future features might need structural changes. But that's a problem for future features, not for today. YAGNI applied correctly.
