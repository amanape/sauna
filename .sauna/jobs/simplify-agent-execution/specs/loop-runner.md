# Loop Runner — Generate-Based Simplification

## What This Component Does

The loop runner orchestrates agent iterations. This spec removes the streaming plumbing (`drainStream`, `onOutput`) and relies on `SessionRunner.sendMessage()` returning the complete result directly.

## Requirements

### drainStream Removal

- The `drainStream()` function must be deleted entirely
- All call sites that called `drainStream(result, onOutput)` must instead just await `session.sendMessage()`
- Since `sendMessage()` now returns the full result directly, no stream consumption is needed

### Config Simplification

- Remove `onOutput` from `FixedCountConfig` and `UntilDoneConfig`
- The `onProgress` callback remains (it reports iteration counts, not streaming chunks)
- The `onHookFailure` callback remains (it reports hook failures)

### runFixedCount Changes

- Each iteration calls `session.sendMessage(message)` and awaits the result
- No stream draining, no chunk forwarding
- Progress reporting via `onProgress` is unchanged

### runUntilDone Changes

- The initial agent call and hook-failure retry calls both use `session.sendMessage()` directly
- After each call, the loop continues to read `tasks.md` and check pending count
- Hook retry logic remains identical — send failure message to same session, await response

### What Does Not Change

- Fixed-count iteration logic (N iterations, fresh session each)
- Until-done completion logic (count `- [ ]` lines, safety limit)
- Hook execution and retry semantics
- Session-per-iteration pattern

## Constraints

- Must not introduce any new streaming code in the loop runner
- Must not change the hook retry flow — the only change is how agent responses are awaited
- Progress reporting (`onProgress`) is retained; only streaming output (`onOutput`) is removed
