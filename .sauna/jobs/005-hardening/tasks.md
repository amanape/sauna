# 005-hardening tasks

## P0 — Blocking: errors reach users as stack traces

- [ ] Add try/catch to `findClaude()` so missing/non-executable/dangling-symlink `claude` produces a one-line stderr message + exit 1 instead of a stack trace (src/claude.ts)
- [ ] Move `findClaude()` call to `index.ts` startup, before `runLoop`/`runInteractive`, so resolution happens once before any session or REPL setup
- [ ] Wrap top-level `await runLoop(…)` / `await runInteractive(…)` in try/catch that formats the error to stderr and exits 1 — no unhandled exceptions reach the user (index.ts)
- [ ] Guard `err.message` access in all catch blocks: if thrown value is not an Error, coerce to string instead of printing `undefined` (loop.ts:44–45, loop.ts:63–64, interactive.ts:193–194)

## P1 — Input validation: bad `--count` values silently misbehave

- [ ] Validate `--count` in `index.ts` before mutual-exclusivity checks: reject 0 (must be at least 1), negatives (must be a positive integer), non-integers (must be a whole number) — stderr + exit 1
- [ ] Remove the dead `if (config.count === 0) return` guard in `loop.ts:54` once validation is in index.ts
- [ ] Update the `--count 0` test in `tests/loop.test.ts` (currently asserts silent no-op) to match the new validation behavior or remove it

## P2 — Exit codes: single-run agent errors exit 0 instead of 1

- [ ] Make single-run mode in `loop.ts:70–75` detect a non-success SDK result and propagate failure (return a success/failure indicator or throw) so `index.ts` can exit 1
- [ ] Add try/catch around the single-run `for await` in `loop.ts` matching the loop modes' error handling pattern
- [ ] Wire exit 1 in `index.ts` when `runLoop` signals an agent failure in single-run mode

## P3 — REPL signal handling: SIGINT always exits instead of aborting the turn

- [ ] Track whether the REPL is mid-turn vs. at the prompt; SIGINT mid-turn should abort the current response (via AbortController or equivalent) and return to the `> ` prompt, not exit the REPL
- [ ] SIGINT at the `> ` prompt should still exit cleanly (current behavior, but needs to be the explicit "at prompt" branch)
- [ ] Add a guard against rapid repeated SIGINT producing duplicate cleanup or output

## P4 — Error output channel: runtime errors go to stdout instead of stderr

- [ ] Route caught iteration errors in `loop.ts` (lines 44–45, 63–64) to stderr instead of the `write` callback (which goes to stdout)
- [ ] Route caught query errors in `interactive.ts` (line 194) to stderr instead of the `write` callback
- [ ] Route SDK non-success result formatting in `stream.ts` (line 108) to stderr (or pass a separate error-write callback)

## P5 — REPL resource leak: `findClaude()` failure leaks readline

- [ ] Move `findClaude()` out of `runInteractive` (to index.ts per P0 task), which also eliminates the rl leak when findClaude throws after rl is created but before the try/finally block

## P6 — Signal handling in loop mode: no SIGINT/SIGTERM handler

- [ ] Wire an AbortController in `index.ts` for SIGINT/SIGTERM that feeds into `runLoop`'s existing `signal` parameter — currently the parameter exists but is never connected at the call site
- [ ] Remove signal handlers after runLoop completes

## P7 — Test-only injection points in production code

- [ ] Remove `addSignalHandler` / `removeSignalHandler` from `InteractiveOverrides` and use module-boundary mocking or subprocess testing for signal behavior, per the spec constraint
