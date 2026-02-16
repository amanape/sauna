# Loop Mode

## Overview

Sauna can repeat the same prompt across multiple fresh agent sessions.

## Acceptance Criteria

- `--loop` without `--count` runs the prompt indefinitely (until Ctrl+C)
- `--loop --count N` runs the prompt exactly N times then exits
- Each iteration starts a fresh agent session (no state carried between iterations)
- Each iteration prints a dim header showing the iteration number: `loop N` for infinite mode, `loop N / X` for fixed count
- Single-run mode (no `--loop`) does not print a loop header
- Ctrl+C (SIGINT) terminates the process; no special signal handling is required beyond the default

## Edge Cases

- `--count 0`: runs zero iterations (exits immediately)
- `--count 1` with `--loop`: runs once, with the iteration header shown
- Agent error in one iteration does not prevent subsequent iterations from running
