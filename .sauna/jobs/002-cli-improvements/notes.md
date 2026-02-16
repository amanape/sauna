# Notes — Job 002: CLI Improvements

## P0: Repeat Flags Refactor

### Design Decisions

- **`runLoop` dispatch order**: The function checks `forever` first, then `count !== undefined`, then falls through to single-run. This makes the control flow explicit — each mode is a self-contained block with an early `return`.
- **`count` alone implies looping**: Previously `--count` required `--loop` and was silently ignored without it. Now `--count N` alone triggers fixed-count mode. This is cleaner UX — users don't need to remember two flags for the common "run N times" case.
- **Mutual exclusivity validation in `index.ts`**: The `--forever` + `--count` conflict is checked before dry-run, so it applies in all modes. Error goes to stderr with exit code 1.

### Files Changed

- `src/loop.ts`: `LoopConfig.loop` → `LoopConfig.forever`, reordered `runLoop` dispatch logic
- `index.ts`: Removed `--loop/-l`, added `--forever` (no alias), added mutual exclusivity check, updated dry-run JSON
- `tests/loop.test.ts`: All tests updated to use `{ forever: bool, count }` config shape
- `tests/cli.test.ts`: Replaced "silently ignored" test with "count alone enables looping" test, added mutual exclusivity test
