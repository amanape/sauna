# Complexity Findings

## Verdict: Pain-driven, not ceremony-driven

571 lines of source. 1,585 lines of tests. 2 runtime dependencies. Every abstraction exists because something hurt without it — not because a book said to.

---

## The question: pain or "good practice"?

### `write` callback injection — **Pain**
Every function takes `write: (s: string) => void` instead of calling `process.stdout.write`. This exists because the test suite needs to capture output. Without it, you'd be mocking `process.stdout` globally — fragile, stateful, breaks parallel test runs. This pattern is threaded through every file consistently. It earns its keep.

### `StreamState` — **Pain**
Tracks `lastCharWasNewline` and `isFirstTextOutput` across a stream of SDK messages. Without it: double newlines before tool tags, leading whitespace on first output. These are real formatting bugs that showed up during development. The state object is created fresh per session/iteration and passed explicitly — no hidden globals.

### `createMessageChannel()` — **Pain**
The SDK's `query()` API requires `AsyncIterable<any>` for multi-turn prompts. You have a user typing into readline (push-based) and an SDK wanting to pull messages. This 30-line async queue bridges the two. It's a well-known async primitive implemented inline because pulling in a library for one use site would be absurd.

### `findClaude()` — **Reuse**
Both `session.ts` and `interactive.ts` need the Claude executable path. Extracting it to 8 lines is justified by the two call sites. Not deep, not clever, just shared code.

### `resolveModel()` — **Convenience**
A 3-entry dictionary mapping `sonnet` → `claude-sonnet-4-20250514`. Nobody wants to type model IDs. 10 lines total.

### `buildPrompt()` — **Reuse**
Prepends context path references to the prompt. Called by both `runSession` and `runInteractive`. 5 lines of logic.

### `InteractiveOverrides` — **Pain (testing)**
5 optional fields: `input`, `promptOutput`, `createQuery`, `addSignalHandler`, `removeSignalHandler`. This is a lot of injection surface. But each field unlocks a specific test scenario: fake stdin, captured prompt output, mock query factory, signal handler verification. The alternative is mocking `process.stdin`, `process.stderr`, `process.on`, and the SDK — all global state. The override bag is the lesser evil.

### `SAUNA_DRY_RUN` env var — **Pain (testing)**
The CLI entry point (`index.ts`) has an escape hatch: if `SAUNA_DRY_RUN=1`, print parsed args as JSON and exit. This lets `cli.test.ts` verify argument parsing as a subprocess without invoking the agent. Common pattern for CLIs that are otherwise hard to test.

### `LoopConfig` / `SessionConfig` / `InteractiveConfig` — **Documentation**
Small type aliases for function parameters. These are "good practice" in the boring, useful sense — they name the shape of data flowing between functions. No inheritance, no generics, no ceremony.

---

## What's not abstracted (correctly)

**Duplicated query options** — `session.ts:28-38` and `interactive.ts:127-135` both construct the same `options` object (system prompt, permission mode, etc.) independently. There's no shared builder. With exactly 2 call sites and stable options, this is the right call. The risk: if one changes and the other doesn't, behavior silently diverges. Worth knowing, not worth fixing yet.

**Loop branch duplication** — `loop.ts` has near-identical `for` loops for forever mode (lines 34-48) and count mode (lines 53-67). Extracting a shared helper would save ~12 lines but add indirection. At 76 total lines, readability wins.

**No error class hierarchy** — Errors are caught with `catch (err: any)` and formatted inline with ANSI codes. No custom error types, no error middleware. For a CLI that either works or prints a red message, this is fine.

**No logging framework** — `write()` to stdout, `process.stderr.write()` for prompts. That's all a CLI this size needs.

**No config file** — Flags and env vars only. No `.saunarc`, no YAML/TOML config, no config schema validation. Correct for the scope.

---

## Actual issues

### Real

1. **`findClaude()` has no error handling** (`src/claude.ts:6`) — `execSync("which claude")` throws a raw `child_process` error if Claude Code isn't installed. Users see a stack trace instead of "Claude Code not found on PATH." This is the most user-facing bug.

2. **`msg: any` typing in `processMessage`** (`src/stream.ts:77`) — The SDK message type is not imported or modeled. Deep property access chains (`msg.event.delta.type`, `msg.event.content_block.type`) are untyped. If the SDK changes its streaming protocol, the compiler won't catch it.

3. **`state?: StreamState` is optional but always passed** (`src/stream.ts:77`) — Every caller passes state, but the parameter is optional, creating `if (state)` guards that are dead code in practice. This isn't backward compatibility — the optional form was never a public API. Should just be required.

### Minor

4. **`err: any` in catch blocks** — `err.message` is accessed without verifying `err` is an `Error`. If something throws a string, output shows `undefined`. Low risk.

5. **No validation of `--count` negative values** — `--count -1` silently does nothing. Not a crash, but confusing.

6. **Stale model aliases** — Aliases point to `claude-*-4-2025*` models. These will need updating as new models ship.

---

## Numbers

| Metric | Value |
|---|---|
| Source lines | 571 |
| Test lines | 1,585 |
| Test:source ratio | 2.8:1 |
| Source files | 7 |
| Runtime dependencies | 2 |
| "Good practice" abstractions | 0 |
| Pain-driven abstractions | ~8 |
| Pass-through layers | 0 |

---

## Bottom line

This is a 571-line CLI that reads like a 571-line CLI. You can understand the entire system in 15 minutes. Every file does one thing. The test suite is thorough without being theatrical. The abstractions are scars from real problems — formatting bugs, testability needs, SDK API requirements — not from architecture astronautics.

The biggest risk isn't over-engineering. It's that the codebase is so lean that future features (auth, config profiles, plugin support) would need structural changes. But that's a problem for when those features exist, not before. YAGNI applied correctly.
