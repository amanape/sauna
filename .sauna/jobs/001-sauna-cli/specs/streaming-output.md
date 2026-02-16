# Streaming Output

## Overview

Sauna streams the agent's text output token-by-token and displays tool activity as it happens.

## Acceptance Criteria

- Assistant text is written to stdout in real-time as tokens arrive (no buffering until turn completion)
- When the agent invokes a tool, the tool name is printed in dim text (e.g., `[Read]`, `[Bash]`, `[Edit]`)
- Tool input/output details are not shown (only the tool name)
- On successful completion, a dim summary line is printed: total token count (input + output), number of turns, and wall-clock duration
- On error, a red error message is printed with the error subtype and any error details
- Colors use `Bun.color()` for terminal-aware ANSI output (no external color library)

## Edge Cases

- Agent produces no text output (only tool calls): only tool names and the result summary are shown
- Very long streaming output: no truncation, stdout handles it naturally
