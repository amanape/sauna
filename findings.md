# Complexity Findings

## Verdict: Appropriately simple, with some self-congratulatory testing

571 lines of source. 1,585 lines of tests. 2 runtime dependencies. The code is clean. But let's not give it a medal for doing what any 571-line project *should* do — be simple.

---

## The real question: is this complex *for what it does*?

What sauna does: shell out to the Claude Agent SDK with a prompt, optionally in a loop or REPL. That's it. It's a thin CLI wrapper around `query()`.

The honest answer: **No, it's not over-engineered.** But some of the "simplicity" is a side effect of the scope being tiny, not of disciplined restraint. When your entire product is "call an SDK and print the output," it's hard to over-engineer. The real test of these instincts comes when the next 5 features land.

---

## Abstraction-by-abstraction review

### `write` callback injection — **Justified, but worth questioning the cost**

Every function takes `write: (s: string) => void`. This makes testing easy — no global stdout mocking. Fair enough. But it also means *every function signature* carries a testing concern. The production call site is always `(s) => process.stdout.write(s)`. You're paying a readability tax on every function for testability. For 571 lines, this is fine. At 5,000 lines with `write` threaded through 40 functions, you'd want a different pattern (a writable stream, a context object, something). Watch for this becoming a wart.

### `StreamState` — **Real pain, correctly solved**

Formatting state across a stream of messages is genuinely tricky. Leading whitespace, double newlines before tool tags — these are real bugs that users see. The explicit state object is the right call over hidden module-level variables. No notes.

### `createMessageChannel()` — **Clean, but be honest about what it is**

It's a single-consumer async queue. It exists because the SDK wants `AsyncIterable` and readline is push-based. 30 lines, no dependencies. This is the one piece of genuine "systems programming" in the project. It's well-done.

### `InteractiveOverrides` — **The testing tail wagging the production dog**

5 optional injection points: `input`, `promptOutput`, `createQuery`, `addSignalHandler`, `removeSignalHandler`. That's a lot of injection surface for a 201-line file. Every one of these exists solely for testing. The production path never uses them.

This is the "good practice" trap in disguise: the code is structured around making tests easy rather than around the problem domain. It works at this scale. But the honest critique is that `interactive.ts` is ~50% "how do I test this" and ~50% "what does this do." If you're reading the code to understand the REPL, you have to mentally filter out the testing scaffolding.

The alternative (subprocess testing, mocking at the module boundary) would keep the production code cleaner at the cost of slower, more brittle tests. Neither answer is wrong, but let's not pretend this one is costless.

### `SAUNA_DRY_RUN` env var — **Pragmatic hack**

An env-gated escape hatch so CLI argument parsing can be tested via subprocess without invoking the agent. Common pattern, nothing wrong with it. But it is dead code in production that exists only for tests. Call it what it is.

### `findClaude()` — **Too simple**

8 lines. `execSync("which claude")` + `realpathSync`. No error handling. If Claude isn't on PATH, users get a raw child_process stack trace. This is the single most user-facing bug in the project, and it's been noted in prior findings but not fixed. At some point noting a bug stops counting as due diligence and starts counting as procrastination.

### `resolveModel()` — **Fine**

10-line lookup table. Does its job. The aliases will go stale when new models ship, but that's maintenance, not a design problem.

### Config types (`SessionConfig`, `InteractiveConfig`, `LoopConfig`) — **Fine**

Named parameter shapes. No ceremony. This is what types are for.

---

## What's correctly *not* abstracted

- **Duplicated query options** in `session.ts` and `interactive.ts` — Both construct the same SDK options object independently. Extracting a shared builder would be premature. The risk (divergence) is real but small. Correct for now.

- **Near-identical loop bodies** in `loop.ts` — The forever and count loops are almost the same. A shared helper would save 12 lines and add one layer of indirection. At 76 total lines, keeping them separate is correct.

- **No error class hierarchy** — `catch (err: any)` and format inline. For a CLI that either works or shows a red line, this is fine. Don't let anyone talk you into custom error types here.

- **No config file** — Flags only. No `.saunarc`. Correct for the scope.

---

## Genuine issues

### 1. `findClaude()` has no error handling (src/claude.ts:6)

`execSync("which claude")` throws an unhandled child_process error if Claude Code isn't installed. Users see a stack trace. This has been a known issue across multiple analysis passes and remains unfixed. **Fix it. It's 3 lines.**

```ts
try {
  const which = execSync("which claude", { encoding: "utf-8" }).trim();
  return realpathSync(which);
} catch {
  throw new Error("Claude Code not found on PATH. Install it first.");
}
```

### 2. `msg: any` in processMessage (src/stream.ts:77)

The SDK's streaming message type is not imported or modeled. Deep property chains like `msg.event.delta.type` are untyped. If the SDK changes its wire format, the compiler won't catch it. This is a calculated bet that the SDK is stable — fine for now, but document the bet.

### 3. `state?: StreamState` is optional but never omitted (src/stream.ts:77)

Every caller passes state. The optional parameter creates dead `if (state)` guards. The comment says "backwards-compatible" but this was never a public API. Make it required. Remove the guards.

### 4. `err: any` in catch blocks

`err.message` is accessed without verifying `err` is an Error. If something throws a string (which some Node APIs do), the output shows `undefined`. Minor, but sloppy.

### 5. No validation of `--count` values

`--count 0` silently does nothing. `--count -1` silently does nothing. Neither is documented behavior. Either validate or document.

### 6. `permissionMode: "bypassPermissions"` is hardcoded

Both `session.ts` and `interactive.ts` hardcode `allowDangerouslySkipPermissions: true`. There's no way for users to opt into permission prompts. This is a reasonable default for a power-user tool, but it should at least be documented — preferably as a flag.

---

## The testing ratio question

**Test:source ratio is 2.8:1** (1,585 test lines / 571 source lines).

Is this good? It depends on what you're testing. Some observations:

- `setup.test.ts` (230 lines) tests that `package.json` has the right fields and that `bun build` produces binaries for 5 platforms. This is genuinely useful — it catches build/release regressions.

- `interactive.test.ts` (508 lines) is the longest file in the *entire project*, source or test. It's longer than the file it tests (201 lines). Much of it is setting up mock streams, fake query factories, and signal handler overrides. The `InteractiveOverrides` type exists to serve this file. There's a circularity: the production code was shaped to be testable, and the tests are complex because the production code's testability surface is large.

- `stream.test.ts` (360 lines) is thorough and well-structured. The formatting functions are pure, so the tests are straightforward assertions. This is where the test ratio pays off most clearly.

The test suite is comprehensive. But "comprehensive tests for simple code" is not the same value proposition as "comprehensive tests for complex code." At this scale, many of the tested behaviors are visible by running the CLI once. The tests are insurance against regressions — good insurance, but the premium is high relative to the property value.

---

## Numbers

| Metric | Value |
|---|---|
| Source lines | 571 |
| Test lines | 1,585 |
| Test:source ratio | 2.8:1 |
| Source files | 7 |
| Test files | 6 |
| Runtime dependencies | 2 |
| Abstractions driven by pain | 3 (StreamState, createMessageChannel, DRY_RUN) |
| Abstractions driven by testability | 3 (write callback, InteractiveOverrides, findClaude extraction) |
| Abstractions driven by reuse | 2 (buildPrompt, resolveModel) |
| Pass-through layers | 0 |
| Known bugs, unfixed | 1 (findClaude error handling) |

---

## Bottom line

This is a 571-line CLI that reads like a 571-line CLI. That's good. The code is clean, the dependency footprint is minimal, and you can understand the whole system in 15 minutes.

But the previous analysis was too gentle. The honest version:

1. **Half the abstractions serve testing, not the problem domain.** The `write` callback, `InteractiveOverrides`, and `SAUNA_DRY_RUN` exist for tests. The production code would be simpler without them. This is a reasonable trade-off, not a virtue.

2. **The test suite is thorough for code that barely needs it.** 2.8:1 test ratio on a thin SDK wrapper is more about developer confidence than risk mitigation. The riskiest code (the SDK integration itself) isn't really testable in isolation anyway — the tests mock it away entirely.

3. **The one real bug (`findClaude` error handling) has been documented multiple times and not fixed.** At some point, writing about a bug is not a substitute for fixing it.

4. **The codebase isn't simple because of discipline — it's simple because the scope is small.** The real question is what happens when the next 5 features land. The current structure has no obvious extension points (no plugin system, no middleware, no config layer). That's fine *now*, but claiming "YAGNI applied correctly" is unfalsifiable until you actually need it.

The code is good. Just don't mistake "small and clean" for "architecturally principled." They're correlated at this scale, not equivalent.
