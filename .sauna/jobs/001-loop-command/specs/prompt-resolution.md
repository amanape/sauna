# Prompt Resolution

## Overview

Determine whether the prompt argument is inline text or a file path, and return the final prompt string to be sent to the agent.

## Acceptance Criteria

- If the prompt argument ends with `.md` and the file exists on disk, its contents are read and used as the prompt
- If the prompt argument ends with `.md` but the file does not exist, an error is printed with the missing path and the CLI exits with code 1
- If the prompt argument does not end with `.md`, it is used as-is as inline text
- The resolved prompt is a non-empty string after trimming whitespace
- An empty file (0 bytes or whitespace-only) produces an error and exits with code 1

## Edge Cases

- File path with spaces (e.g. `"my prompts/task.md"`) resolves correctly
- Relative paths resolve relative to the current working directory
- File containing only whitespace or newlines is treated as empty
- Very large `.md` files (e.g. 100KB+) are read without issue

## Constraints

- Use `Bun.file()` for file reading
