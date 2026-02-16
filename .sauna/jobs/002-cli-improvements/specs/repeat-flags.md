# Repeat Flags

## Overview

Sauna's repeat behavior is controlled by two flags: `--count/-n` for a fixed number of iterations and `--forever` for uncapped looping. The previous `--loop` flag is removed.

## Acceptance Criteria

- `sauna "prompt"` (no flags) runs exactly once with no iteration header
- `sauna -n 5 "prompt"` runs exactly 5 iterations with `loop N / 5` headers
- `sauna -n 1 "prompt"` runs once with `loop 1 / 1` header
- `sauna -n 0 "prompt"` exits immediately without running
- `sauna --forever "prompt"` runs indefinitely until Ctrl+C, with `loop N` headers
- `--forever --count N` exits with a non-zero code and an error message (mutually exclusive)
- The `--loop` / `-l` flag no longer exists and is not recognized by the CLI

## Edge Cases

- `--count` with a negative number: defer to cleye's default handling (likely treated as 0 or NaN)
- Agent error in one iteration does not prevent subsequent iterations
