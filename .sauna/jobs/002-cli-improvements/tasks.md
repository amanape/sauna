# 002 CLI Improvements - Tasks

All tasks complete.

- **P0**: Repeat Flags Refactor — `--loop` removed, `--forever` added, `--count` alone implies looping, mutual exclusivity enforced
- **P1**: Output Formatting State Tracking — `StreamState` tracks newline/first-output, state resets per loop iteration
- **P2**: Interactive Mode — `--interactive/-i` REPL with SDK v2 sessions, context on first turn only, error isolation
- **P3**: Edge Case Test Coverage — state leak regression, result-only session, existing coverage confirmed

65 tests pass, 0 failures. Type check clean.
