# Loop Input Validation

## Overview

The CLI validates `--count` values at parse time and rejects nonsensical inputs before any work begins.

## Acceptance Criteria

- `--count 0` exits with a non-zero code and a message explaining that count must be at least 1
- `--count -1` (or any negative number) exits with a non-zero code and a message explaining that count must be a positive integer
- `--count 1.5` (or any non-integer) exits with a non-zero code and a message explaining that count must be a whole number
- All validation errors are written to stderr
- Validation happens before the agent session starts — no prompt is sent, no Claude binary is resolved

## Edge Cases

- `--count` with no value: handled by the argument parser (cleye), not custom validation
- Very large counts (e.g., `--count 999999`): accepted without validation — the user asked for it
