# Subcommand Interface

## What This Component Does

Replaces the current single-purpose CLI argument parser with a subcommand-based interface. Each agent phase is a distinct subcommand with its own flags. Shared infrastructure setup is extracted into a reusable helper.

## Requirements

### Subcommands

- `discover` — Runs the interactive discovery agent. Requires `--codebase <path>`. Accepts `--output <path>` (default: `./jobs/`) and `--model <model>`.
- `plan` — Runs the planning agent for a fixed iteration count. Requires `--codebase <path>` and `--job <slug>`. Accepts `--iterations <n>` (default: 1) and `--model <model>`.
- `build` — Runs the builder agent until all tasks are done. Requires `--codebase <path>` and `--job <slug>`. Accepts `--model <model>`. Loads hooks from `.sauna/hooks.json`.
- `run` — Runs plan then build sequentially. Requires `--codebase <path>` and `--job <slug>`. Accepts `--iterations <n>` (default: 1) and `--model <model>`. Equivalent to running `plan` followed by `build`.

### Shared Flags

- `--codebase <path>` is required by all subcommands — the project root to operate on
- `--model <model>` is optional for all subcommands — overrides the default LLM model
- `--job <slug>` resolves to `.sauna/jobs/<slug>/` relative to the codebase root; the directory must exist
- `--iterations` must be a positive integer; reject zero or negative values
- Unknown flags must produce a clear error (strict parsing)

### Help and Errors

- Running with no subcommand or with `--help` must show usage information listing all subcommands and their purpose
- Running a subcommand with `--help` must show that subcommand's flags
- Missing required flags must produce a message naming the missing flag and showing correct usage

### Shared Setup

- All subcommands share initialization: API key validation, search function resolution, tool creation, workspace creation, and researcher agent creation
- This shared setup must be extracted from the current `main()` into a reusable function
- Each subcommand handler receives the shared environment and its parsed flags

### Dispatch

- `main()` must parse the subcommand from the first positional argument, then delegate to the appropriate handler
- `discover` handler: creates discovery agent, calls `runConversation()`
- `plan` handler: creates planner agent, calls `runFixedCount()` with configured iterations
- `build` handler: creates builder agent, loads hooks, calls `runUntilDone()`
- `run` handler: calls plan then build sequentially (delegates to existing `runJobPipeline()` or calls both handlers)

## Constraints

- Must not use a CLI framework dependency (keep it lightweight — `parseArgs` from `node:util`)
- Must not duplicate agent creation or loop runner logic — delegate to existing infrastructure
- Must not change agent definitions, loop runner, or session runner internals
