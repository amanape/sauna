# CLI Parsing

## Overview

Sauna parses a positional prompt argument and optional flags from the command line using the `cleye` library.

## Acceptance Criteria

- `sauna "some prompt"` passes `"some prompt"` as the prompt to the agent
- `sauna` with no prompt prints help and exits with a non-zero code
- `--model` / `-m` accepts a string value (e.g., `sonnet`, `opus`, `haiku`, or a full model ID like `claude-sonnet-4-20250514`)
- Short model names (`sonnet`, `opus`, `haiku`) resolve to their full model IDs
- An unrecognized model name is passed through as-is (assumed to be a full model ID)
- `--loop` / `-l` is a boolean flag that enables loop mode
- `--count` / `-n` accepts a number specifying how many loop iterations to run
- `--context` / `-c` accepts one or more file/directory paths; can be specified multiple times (e.g., `-c foo.md -c bar/`)
- `--help` prints usage information (provided by cleye automatically)
- `--version` prints the version (provided by cleye automatically)

## Edge Cases

- Prompt containing special characters or quotes is preserved verbatim
- `--count` without `--loop` is silently ignored (no error, no looping)
- `--context` with a nonexistent path: defer validation to the agent (it will fail to read it)
