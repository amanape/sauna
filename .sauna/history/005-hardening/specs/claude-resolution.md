# Claude Resolution

## Overview

The CLI locates the Claude Code executable on the user's system and fails with a clear, actionable message when it cannot be found.

## Acceptance Criteria

- If `claude` is on `$PATH`, the resolved absolute path (symlinks followed) is used for the SDK
- If `claude` is not on `$PATH`, the CLI exits with a non-zero code and prints a message telling the user to install Claude Code — no stack trace
- If `claude` resolves to a dangling symlink, the CLI exits with a non-zero code and a clear message — no stack trace
- Resolution happens once at startup, before any prompt is sent or REPL is started
- The error message is written to stderr, not stdout

## Edge Cases

- `claude` is a symlink chain (e.g., brew-installed): all symlinks are resolved to the final real path
- `claude` exists on `$PATH` but is not executable: clear error, not a stack trace
- Multiple `claude` binaries on `$PATH`: the first one wins (standard `which` behavior)

## Constraints

- No fallback search (e.g., checking `~/.claude/` or hardcoded paths) — `$PATH` is the only lookup mechanism
