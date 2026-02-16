# CLI Parsing

## Overview

Parse and validate command-line arguments for the `sauna loop` command so the user can specify a prompt, iteration count, and model from the terminal.

## Acceptance Criteria

- Running `sauna loop "do something"` parses `"do something"` as the prompt argument
- Running `sauna loop path/to/file.md` parses the path as the prompt argument
- `--iterations N` (or `-n N`) sets the iteration count; defaults to 1 if omitted
- `--model <opus|sonnet|haiku>` (or `-m`) sets the model; defaults to `sonnet` if omitted
- Running `sauna` with no subcommand prints usage help and exits with code 0
- Running `sauna loop` with no prompt argument prints an error message and exits with code 1
- Running `sauna loop "prompt" --iterations 0` prints an error (iterations must be >= 1) and exits with code 1
- Running `sauna loop "prompt" --iterations abc` prints an error (not a number) and exits with code 1
- Running `sauna loop "prompt" --model unknown` prints an error listing valid models and exits with code 1
- Unknown flags (e.g. `--foo`) print an error and exit with code 1

## Edge Cases

- Prompt argument containing dashes (e.g. `"fix the --strict flag"`) is not confused with flags
- Very long prompt strings (multi-paragraph) are accepted without truncation
- Prompt argument that looks like a file path but the file doesn't exist is treated as inline text (prompt resolution handles this, not CLI parsing)

## Constraints

- Use `cleye` for argument parsing — it handles subcommands, typed flags, aliases, `--help` generation, and unknown flag rejection declaratively
