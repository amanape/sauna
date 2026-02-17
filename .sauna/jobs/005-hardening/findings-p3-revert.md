# P3 Mid-Turn Interrupt Revert

## Summary

Reverted P3 (SIGINT mid-turn abort) feature due to conflict with Claude Agent SDK's built-in signal handling.

## The Bug

When pressing Ctrl+C in interactive mode, users encountered:

```
^Cerror: Claude Code process terminated by signal SIGINT
error: Query closed before response received
      at cleanup (/$bunfs/root/sauna:6282:21)
      at readMessages (/$bunfs/root/sauna:6346:47)
```

## Root Cause

**Dual Signal Handling Conflict:**

1. **The Claude Agent SDK** has built-in SIGINT handling that:
   - Detects SIGINT and prints `"Claude Code process terminated by signal SIGINT"`
   - Runs its own cleanup code when terminating

2. **Our P3 Implementation** added:
   - Custom SIGINT handler that tracks `midTurn` state
   - Calls `q.interrupt()` when SIGINT fires mid-turn
   - Separate handlers for SIGINT (context-aware) vs SIGTERM (always exit)

When Ctrl+C is pressed, **both handlers execute simultaneously**:
- SDK detects SIGINT → starts its cleanup
- Our handler detects SIGINT → calls `q.interrupt()`
- SDK's cleanup throws "Query closed before response received" because the query is being interrupted from two sources
- Error is thrown from SDK internal code, outside our try/catch scope

## Design Issues

1. **Assumption Violation**: P3 assumed the SDK didn't handle SIGINT, but it does
2. **Unnecessary Complexity**: Added 70+ lines of state machine code for questionable UX benefit
3. **Non-Standard UX**: Most CLIs exit on Ctrl+C; the "interrupt and return to prompt" behavior is unusual
4. **Duplicates SDK Functionality**: The SDK already has appropriate signal handling

## Solution

**Reverted to Simple Approach:**

```typescript
// Before (P3): Complex mid-turn detection
let midTurn = false;
const onSigint = () => {
  if (midTurn) {
    q.interrupt();  // ← Conflicts with SDK
  } else {
    rl.close();
    q.close();
  }
};

// After (Reverted): Simple cleanup
const onSignal = () => {
  rl.close();
  q.close();
};
```

## Files Changed

- `src/interactive.ts`: Reverted to simple signal handling with injection points
- `tests/interactive.test.ts`: Reverted tests to use injection points, removed P3 test suite

## Test Results

All 15 interactive tests pass after revert.

## Lessons

1. **Check SDK capabilities first** before implementing custom signal handling
2. **Standard CLI UX is usually correct** - exiting on Ctrl+C is expected behavior
3. **Simple is better** - 3 lines vs 70 lines of code
4. **Test with real SDK** - the bug only manifested when the compiled binary ran against the real SDK
