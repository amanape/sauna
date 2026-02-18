# 005-hardening notes

## P0 completion — error handling hardening

### What changed

**src/claude.ts** — `findClaude()` now wraps `execSync("which claude")` and `realpathSync()` in separate try/catch blocks, each throwing a descriptive `Error` with an actionable message:
- Missing claude: "claude not found on $PATH — install Claude Code and ensure `claude` is in your PATH"
- Dangling symlink: "claude found at {path} but could not resolve the path — the symlink may be broken or dangling"

**src/session.ts** — `SessionConfig` now includes `claudePath: string`. `runSession` no longer calls `findClaude()` internally; it receives the pre-resolved path. The `findClaude` import was removed.

**src/interactive.ts** — Same pattern: `InteractiveConfig` now includes `claudePath: string`. `runInteractive` no longer calls `findClaude()` or imports it. This also fixes P5 (readline leak on findClaude failure) because findClaude now runs before readline is created.

**index.ts** — Three changes:
1. Calls `findClaude()` once at startup, after dry-run check but before sessions
2. Passes `claudePath` into both `runInteractive` and `runSession` configs
3. Entire runtime block (findClaude + session dispatch) wrapped in try/catch that formats errors to stderr with `error: {message}\n` and exits 1

**loop.ts** — Both catch blocks (forever mode and count mode) now use `err instanceof Error ? err.message : String(err)` instead of `err.message` directly.

**interactive.ts catch block** — Same guard applied.

### Tests added

- `tests/claude.test.ts` — 2 tests: missing claude produces actionable message (not "Command failed"), dangling symlink produces descriptive message (not "ENOENT")
- `tests/cli.test.ts` — 1 test: missing claude binary at CLI level prints error to stderr and exits 1, no stack trace
- `tests/loop.test.ts` — 1 test: non-Error thrown value renders as string, not "undefined"

### Design decisions

- `findClaude()` throws descriptive errors rather than returning `null` — this keeps the call site simple (no null checks) and lets the top-level catch handle formatting uniformly
- The `claudePath` parameter was added to config objects rather than being a separate argument, keeping the function signatures consistent with the existing config pattern
- P5 (readline leak) is resolved as a side effect of P0 — moving findClaude to index.ts means it runs before any readline is created

## P1 completion — --count input validation

### What changed

**index.ts** — Added a validation block after `const count = argv.flags.count` and before the mutual-exclusivity checks. Three checks in order:
1. `Number.isNaN(count)` — rejects non-numeric input like `--count abc` (cleye parses these as `NaN`)
2. `!Number.isInteger(count)` — rejects fractional values like `--count 1.5`
3. `count <= 0` — rejects zero and negative values (though negatives also hit NaN due to cleye treating `-1` as a flag)

Each check writes a descriptive error to stderr and exits 1.

**src/loop.ts** — Removed the dead `if (config.count === 0) return` guard in the fixed-count branch. Since index.ts now validates count >= 1 before reaching runLoop, this branch is unreachable. Added a comment noting the validation happens upstream.

### Tests added

- `tests/cli.test.ts` — 4 tests in new `--count validation` describe block:
  - `--count 0` → error containing "at least 1"
  - `--count -1` → error (cleye produces NaN, so hits the NaN check)
  - `--count 1.5` → error containing "whole number"
  - `--count abc` → error containing "--count"

### Tests removed

- `tests/loop.test.ts` — Removed `--count 0: runs zero iterations` test. This tested the now-removed `count === 0` guard in runLoop, which is no longer reachable since validation happens at the CLI level.

### Design decisions

- Validation order is NaN → non-integer → non-positive. This means cleye's NaN for `-1` is caught by the first check with a "valid number" message rather than "positive integer" — acceptable since the user's input genuinely isn't a valid number from cleye's perspective
- Validation runs before mutual-exclusivity checks so that `--count abc --forever` reports the invalid count rather than the mutual exclusivity conflict

## P2 completion — single-run exit codes

### What changed

**src/loop.ts** — `runLoop` return type changed from `Promise<void>` to `Promise<boolean>`. Three changes:

1. **Single-run mode** now has a try/catch matching the loop modes' error handling pattern. Tracks a `failed` flag that is set when:
   - The SDK yields a result message with `subtype !== "success"` (non-success result)
   - The session generator throws (SDK crash or other error)
   Returns `!failed` — `true` on success, `false` on failure.

2. **Forever mode** and **fixed-count mode** both return `true`. These modes handle errors per-iteration (catching and displaying them without halting), so individual iteration failures don't represent overall loop failure — the loop itself completed as requested.

**index.ts** — Captures the `runLoop` return value and calls `process.exit(1)` when it returns `false`. This means single-run agent failures now produce exit code 1 instead of 0.

### Tests added

- `tests/loop.test.ts` — 3 tests in the `runLoop` describe block:
  - `single-run: returns false when SDK yields a non-success result` — error result with subtype "error" → `false`
  - `single-run: returns true on success` — success result → `true`
  - `single-run: returns false when session throws` — thrown Error → caught, displayed, returns `false`

### Design decisions

- `runLoop` returns a boolean rather than throwing because the error has already been displayed by `processMessage` (for non-success results) or by the new catch block (for thrown exceptions). Throwing would require the caller to suppress the already-displayed error, creating coupling.
- Loop modes (forever/count) always return `true` because their contract is to run all requested iterations, catching errors per-iteration. A single iteration failure doesn't mean the overall loop failed — the user asked for N runs and got N runs.
- The try/catch in single-run mode mirrors the loop modes' catch pattern (red ANSI error message) for consistency.

## P3 completion — SIGINT mid-turn abort

### What changed

**src/interactive.ts** — Signal handling split from a single `onSignal` handler into separate `onSigint` and `onSigterm` handlers, with a `midTurn` boolean tracking REPL state:

1. **`midTurn` flag** — set to `true` when entering the `for await` loop (processing SDK messages), set to `false` when a `result` message arrives and the REPL prompts for input, set back to `true` after the user submits a follow-up message.

2. **`onSigint`** — context-dependent:
   - Mid-turn (`midTurn === true`): calls `q.interrupt()` which sends an SDK control interrupt request, stopping the current response. The SDK yields a result message after interrupt, which the existing `for await` loop handles normally — it prompts for the next input.
   - At prompt (`midTurn === false`): calls `rl.close()` + `q.close()` to exit the REPL entirely (preserving pre-P3 behavior for the at-prompt case).

3. **`onSigterm`** — always calls `rl.close()` + `q.close()` regardless of `midTurn` state. SIGTERM is a termination signal and should always exit.

4. **`finally` block** — removes both handlers separately (`onSigint` and `onSigterm`).

### Rapid repeated SIGINT

Not implemented as a separate guard. `q.interrupt()` is idempotent — calling it multiple times mid-turn just re-sends the interrupt control request. At the prompt, `rl.close()` and `q.close()` are also safe to call repeatedly (Node.js readline close and SDK query close are idempotent).

### Tests added

- `tests/interactive.test.ts` — 3 tests in new `P3: SIGINT mid-turn abort` describe block:
  - `SIGINT mid-turn calls interrupt() and REPL continues to prompt` — uses a PausePoint mechanism in the mock generator to pause mid-turn, fires SIGINT, verifies `interrupt()` was called and the REPL continued to a second turn
  - `SIGINT at prompt exits the REPL (does not call interrupt)` — SIGINT fires after first result (at prompt), verifies `close()` was called and REPL exited
  - `SIGTERM always exits regardless of mid-turn state` — SIGTERM fires mid-turn, verifies `close()` was called (not `interrupt()`)

### Test infrastructure changes

- **`createMockQuery`** updated to support `interrupt()` method on the mock Query object. When `interrupt()` is called, an internal `interrupted` flag stops the current turn from yielding remaining messages and instead yields an error result.
- **`PausePoint` sentinel** added to the test infrastructure. When placed in a turn's message array, the mock generator pauses until `resume()` is called. This enables precise timing control — the test can pause the generator mid-turn, fire a signal, then resume.

### Design decisions

- Used `q.interrupt()` (SDK's native control request) rather than `AbortController`. The interrupt mechanism is purpose-built for aborting a single turn while keeping the session alive, which is exactly what SIGINT mid-turn needs. AbortController would kill the entire query.
- The `midTurn` flag is a simple boolean rather than a state machine because there are only two states (mid-turn and at-prompt) with well-defined transitions at `result` message boundaries.
- SIGTERM was kept as an unconditional exit because SIGTERM is a process-level termination signal — users expect it to always terminate, regardless of application state.

## P4 completion — error output routing to stderr

### What changed

**src/stream.ts** — `processMessage` gains an optional 4th parameter `errWrite?: WriteFn`. When provided, non-success result messages (error subtype) are written to `errWrite` instead of `write`. Falls back to `write` when `errWrite` is not provided, preserving backwards compatibility for callers that don't pass it.

**src/loop.ts** — `runLoop` gains an optional 5th parameter `errWrite?: WriteFn`. Three changes across all three modes (forever, fixed-count, single-run):
1. Catch blocks now route error messages to `errWrite ?? write` instead of `write`
2. `processMessage` calls now forward `errWrite` so non-success SDK results also route to stderr

**src/interactive.ts** — `runInteractive` gains an optional 4th parameter `errWrite?: (s: string) => void`. Two changes:
1. The catch block for query exceptions routes error messages to `errWrite ?? write`
2. The `processMessage` call forwards `errWrite` so non-success SDK results route to stderr

**index.ts** — Creates `errWrite = (s: string) => process.stderr.write(s)` alongside the existing `write` for stdout. Passes `errWrite` to both `runLoop` and `runInteractive`.

### Tests added

- `tests/stream.test.ts` — 3 tests in new `P4: error output routing` describe block:
  - `non-success result writes to errWrite, not write` — error result with errWrite → error in stderr, nothing in stdout
  - `success result still writes to write (stdout)` — success summary stays in stdout
  - `without errWrite, non-success result falls back to write (backwards-compat)` — no errWrite → error goes to write

- `tests/loop.test.ts` — 3 tests:
  - `caught errors in loop mode go to errWrite, not write` — thrown exception in count mode → stderr
  - `caught errors in single-run mode go to errWrite, not write` — thrown exception in single-run → stderr
  - `non-success SDK result goes to errWrite, not write` — error result via processMessage → stderr

- `tests/interactive.test.ts` — 2 tests in new `P4: error output routing to stderr` describe block:
  - `query exception goes to errWrite, not write` — thrown exception → stderr
  - `non-success SDK result goes to errWrite via processMessage` — error result → stderr, normal text → stdout

### Design decisions

- `errWrite` is an optional trailing parameter rather than a required one, preserving backwards compatibility. Existing call sites that don't pass it continue to work (errors fall back to `write`). This avoids a breaking change in the internal API.
- The parameter is named `errWrite` (not `stderrWrite`) to keep it generic — callers decide where it goes. The name signals "error output" without coupling to a specific stream.
- Error routing happens at two levels: (1) `processMessage` routes SDK non-success results, (2) catch blocks in `loop.ts` and `interactive.ts` route thrown exceptions. Both must use `errWrite` for complete coverage.
- Success results (summaries with token counts) remain on stdout because they are informational output, not error output. Only non-success results and caught exceptions go to stderr.

## P6 completion — signal handling in loop mode

### What changed

**src/loop.ts** — Fixed-count mode now checks `signal?.aborted` in two places, mirroring the forever mode pattern:
1. Before starting each iteration (at the top of the for loop)
2. After each iteration completes (at the bottom of the for loop)

This ensures that if a signal arrives during an iteration, the current iteration completes but the next one doesn't start.

**index.ts** — Three changes in the non-interactive branch:
1. Creates an `AbortController` before calling `runLoop`
2. Registers SIGINT and SIGTERM handlers that call `abort.abort()`
3. Passes `abort.signal` as the signal parameter to `runLoop`
4. Removes both signal handlers in a `finally` block after `runLoop` completes, regardless of success or failure

### Tests added

- `tests/loop.test.ts` — 1 test:
  - `--count N: stops early when signal is aborted between iterations` — aborts after iteration 2 of 5, verifies only 2 iterations ran and iteration 3's header doesn't appear

### Design decisions

- Signal handlers are scoped to the non-interactive branch only. Interactive mode has its own SIGINT/SIGTERM handling (P3) that distinguishes mid-turn vs at-prompt behavior. Loop mode's signal handling is simpler: any SIGINT/SIGTERM means "stop after the current iteration."
- The `finally` block ensures handlers are removed even if `runLoop` throws, preventing leaked listeners from affecting process behavior after the CLI finishes.
- Single-run mode also receives the signal but doesn't check it (no loop to break out of). This is harmless — the signal parameter is simply unused in single-run. SIGINT during a single-run session will still terminate the process via Node's default SIGINT behavior since the handler just sets a flag on the AbortController.

## P7 completion — removing test-only injection points

### What changed

**src/interactive.ts** — Removed `addSignalHandler` and `removeSignalHandler` from the `InteractiveOverrides` type. The production code now calls `process.on("SIGINT", ...)` and `process.removeListener("SIGINT", ...)` directly, with no indirection layer. Two lines in the type definition and three lines of runtime indirection were removed.

**tests/interactive.test.ts** — Six tests that previously used the `addSignalHandler`/`removeSignalHandler` overrides were rewritten to use `spyOn(process, "on")` and `spyOn(process, "removeListener")` from Bun's test runner. The pattern:

1. `spyOn(process, "on").mockImplementation(...)` captures the signal handlers that `runInteractive` registers via `process.on("SIGINT", handler)`
2. Tests call the captured handler directly to simulate signal delivery
3. `spyOn(process, "removeListener").mockImplementation(...)` captures cleanup calls for verification
4. Both spies are restored in a `finally` block via `.mockRestore()` to prevent test interference

### Tests changed (6 total, all behavior-preserving rewrites)

**P2 describe block:**
- `SIGINT during query calls close() for graceful cleanup` — now uses spyOn
- `SIGTERM during query calls close() for graceful cleanup` — now uses spyOn
- `signal handlers are removed after REPL exits normally` — now uses spyOn

**P3 describe block:**
- `SIGINT mid-turn calls interrupt() and REPL continues to prompt` — now uses spyOn
- `SIGINT at prompt exits the REPL (does not call interrupt)` — now uses spyOn
- `SIGTERM always exits regardless of mid-turn state` — now uses spyOn

### Design decisions

- Chose `spyOn(process, ...)` over subprocess isolation because the tests already mock the SDK via `mock.module()` and use `createMockQuery` for precise turn/message control. Subprocess testing would require reimplementing all that infrastructure. `spyOn` achieves the same interception at the module boundary (the `process` global) without any production code changes beyond removing the injection points.
- Each test manages its own spy lifecycle with `try/finally` + `.mockRestore()` rather than `beforeEach/afterEach` to keep spy scope tight — only the 6 signal tests need the spy, not all 18 tests in the file.
- The `mockImplementation` captures handlers into a local `Map<string, Function>` within each test, matching the previous pattern but without leaking the capture mechanism into production code.
