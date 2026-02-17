# REPL Lifecycle

## Overview

The interactive REPL starts cleanly, handles interruptions and errors gracefully, and releases all resources on exit.

## Acceptance Criteria

- SIGINT (Ctrl+C) during an agent turn stops the current response and returns to the `> ` prompt — it does not exit the REPL
- SIGINT at the `> ` prompt exits the REPL cleanly
- SIGTERM exits the REPL cleanly regardless of state
- EOF (Ctrl+D) at the prompt exits the REPL cleanly
- An SDK error during a turn prints a red error message and returns to the `> ` prompt — the session continues
- An SDK exception (thrown error, not a result error) prints a red error message and exits the REPL
- All signal handlers are removed after the REPL exits
- The readline interface is closed after the REPL exits
- The query generator is closed after the REPL exits
- No resources are leaked on any exit path (signal, EOF, error, empty input)

## Edge Cases

- Signal arrives between turns (after result, before next readline): exits cleanly
- Signal arrives during readline: readline resolves null, REPL exits cleanly
- Rapid repeated SIGINT: does not produce duplicate error output or double-cleanup
- `findClaude()` fails at REPL startup: error is shown before the first `> ` prompt, not after

## Constraints

- Production code should not contain test-only injection points for signal handling — use module-boundary mocking or subprocess testing instead
