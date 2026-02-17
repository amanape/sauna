# Exit Behavior

## Overview

The CLI exits with predictable, documented exit codes so it can be composed with other tools in scripts and pipelines.

## Acceptance Criteria

- Exit 0: the prompt completed successfully (single-run, all loop iterations, or clean REPL exit)
- Exit 1: user error — missing prompt, invalid flags, invalid `--count` value, mutually exclusive flags
- Exit 1: environment error — Claude Code not found on `$PATH`
- Exit 1: agent error — the SDK returned a non-success result in single-run mode
- In loop mode, a failed iteration does not change the final exit code — the loop continues and exits 0 when all iterations complete
- In interactive mode, exit 0 on clean exit (empty input, EOF, signal)
- Errors are written to stderr; agent output is written to stdout
- No unhandled exceptions reach the user — all thrown errors are caught and formatted

## Edge Cases

- Signal interruption (SIGINT/SIGTERM): the process exits promptly without a stack trace
- SDK throws a non-Error value (e.g., a string): the error message still renders correctly, not `undefined`
- Single-run mode with an agent error: exits 1, not 0
