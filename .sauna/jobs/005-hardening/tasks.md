# 005-hardening tasks

## P0 — Blocking: errors reach users as stack traces

- [x] Add try/catch to `findClaude()` so missing/non-executable/dangling-symlink `claude` produces a one-line stderr message + exit 1 instead of a stack trace (src/claude.ts)
- [x] Move `findClaude()` call to `index.ts` startup, before `runLoop`/`runInteractive`, so resolution happens once before any session or REPL setup — removed `findClaude()` from `session.ts` and `interactive.ts`; pass the resolved path as `claudePath` in config
- [x] Wrap top-level `await runLoop(…)` / `await runInteractive(…)` in try/catch that formats the error to stderr and exits 1 — no unhandled exceptions reach the user (index.ts)
- [x] Guard `err.message` access in all catch blocks: if thrown value is not an Error, coerce to string instead of printing `undefined` (loop.ts, interactive.ts, index.ts)

## P1 — Input validation: bad `--count` values silently misbehave

- [x] Validate `--count` in `index.ts` before mutual-exclusivity checks: reject 0 (must be at least 1), negatives (must be a positive integer), non-integers (must be a whole number), and `NaN` (cleye produces `NaN` for non-numeric input like `--count abc`) — stderr + exit 1
- [x] Remove the dead `if (config.count === 0) return` guard in `loop.ts:54` once validation is in index.ts
- [x] Update the `--count 0` test in `tests/loop.test.ts` (currently asserts silent no-op) to match the new validation behavior or remove it

## P2 — Exit codes: single-run agent errors exit 0 instead of 1

- [x] Make single-run mode in `loop.ts:70–75` detect a non-success SDK result and propagate failure (return a success/failure indicator or throw) so `index.ts` can exit 1
- [x] Add try/catch around the single-run `for await` in `loop.ts` matching the loop modes' error handling pattern
- [x] Wire exit 1 in `index.ts` when `runLoop` signals an agent failure in single-run mode

## P3 — REPL signal handling: SIGINT always exits instead of aborting the turn

**REVERTED** - The mid-turn interrupt feature conflicted with the Claude Agent SDK's built-in signal handling, causing "Query closed before response received" errors. The SDK already handles SIGINT appropriately, so custom handling is unnecessary and causes conflicts. Reverted to simple signal handling that just closes readline and query gracefully.

- [x] ~~Track whether the REPL is mid-turn vs. at the prompt~~ **REVERTED**
- [x] ~~SIGINT mid-turn calls `q.interrupt()` to abort the current response~~ **REVERTED**
- [x] ~~SIGINT at the `> ` prompt exits cleanly~~ **REVERTED**
- [x] ~~SIGTERM always exits regardless of mid-turn state~~ **REVERTED**
- [x] Both SIGINT and SIGTERM now use simple handler that closes readline and query (restored original behavior)

## P4 — Error output channel: runtime errors go to stdout instead of stderr

- [x] Route caught iteration errors in `loop.ts` to stderr instead of the `write` callback (which goes to stdout)
- [x] Route caught query errors in `interactive.ts` to stderr instead of the `write` callback
- [x] Route SDK non-success result formatting in `stream.ts` (line 108) to stderr (or pass a separate error-write callback)

## P5 — REPL resource leak: `findClaude()` failure leaks readline

- [x] Move `findClaude()` out of `runInteractive` (to index.ts per P0 task) — eliminates the rl leak since `findClaude` now runs before readline is created

## P6 — Signal handling in loop mode: no SIGINT/SIGTERM handler

- [x] Wire an AbortController in `index.ts` for SIGINT/SIGTERM that feeds into `runLoop`'s existing `signal` parameter — currently the parameter exists but is never connected at the call site
- [x] Extend `runLoop` fixed-count mode to check `signal?.aborted` between iterations — currently only the `forever` branch checks the signal
- [x] Remove signal handlers after runLoop completes

## P7 — Test-only injection points in production code

**REVERTED** - Restored `addSignalHandler` / `removeSignalHandler` injection points in `InteractiveOverrides` as part of P3 revert. Tests now use these injection points instead of `spyOn` for signal handler testing.

- [x] ~~Remove `addSignalHandler` / `removeSignalHandler` from `InteractiveOverrides`~~ **REVERTED**
- [x] Restored injection points for signal handler testing
