# Subcommand Interface

## What This Component Does

Replaces the current single-purpose CLI argument parser with a subcommand-based interface. Each agent phase is a distinct subcommand with its own flags.

## Requirements

### Subcommands

- `discover` — Runs the interactive discovery agent. No required flags. Behaves like the current default CLI entry point.
- `plan` — Runs the planning agent. Requires `--job <slug>`. Accepts `--iterations <n>` (default: 2).
- `build` — Runs the builder agent. Requires `--job <slug>`.
- `cycle` — Runs plan→build cycles. Requires `--job <slug>`. Accepts `--cycles <n>` (default: 2) and `--iterations <n>` (default: 2).

### Flag Parsing

- `--job <slug>` must resolve to `.sauna/jobs/<slug>/` relative to the codebase root
- The resolved job directory must exist; if not, exit with a clear error message
- `--iterations` and `--cycles` must be positive integers; reject invalid values
- Running `method6` with no subcommand or with `--help` must show usage information listing all subcommands
- Running a subcommand with `--help` must show that subcommand's flags

### Dispatch

- Each subcommand must initialize shared infrastructure (MCP client, workspace) then dispatch to the appropriate agent and loop runner
- The `cycle` subcommand must orchestrate: for each cycle, run planner N times then run builder until done
- All subcommands must handle clean shutdown (close MCP client, exit gracefully on SIGINT/SIGTERM)

## Constraints

- Must not use a CLI framework dependency (keep it lightweight — `parseCliArgs()` style, or `Bun.argv` directly)
- Must follow existing patterns in `cli.ts` for argument parsing
- Must not duplicate agent creation or loop runner logic — delegate to JTBD 2 infrastructure
