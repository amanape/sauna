# Output Formatting

## Overview

Sauna's streaming output properly separates tool tags from text content and avoids spurious leading whitespace.

## Acceptance Criteria

- Tool tags (e.g., `[Read]`) always appear at the start of a new line, never appended to the end of a text line
- If the agent's text output does not end with a newline, a newline is inserted before the next tool tag
- If the agent's text output already ends with a newline, no extra newline is added before a tool tag
- The very first text output of a session does not begin with blank lines (leading whitespace is stripped)
- The success summary line is separated from preceding text by a newline
- Between loop iterations, formatting state resets so each iteration starts clean

## Edge Cases

- Agent produces only tool calls with no text: tool tags are printed on separate lines, summary follows
- Agent's first output is a tool call (no text): no leading blank line before the tool tag
- Multiple consecutive tool calls: each on its own line
