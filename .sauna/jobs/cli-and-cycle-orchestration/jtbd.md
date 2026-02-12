# CLI Subcommand Interface

## Problem

The CLI has a single entry point with implicit mode selection: omitting `--job` triggers an interactive discovery REPL, providing `--job` triggers a combined plan+build pipeline. Planning and building cannot be run independently — there is no way to run just the planner to review `tasks.md` before committing to a build, or to run just the builder against an existing task list. The `plannerIterations` count is hardcoded to 1 in `cli.ts` with no way to override it. Discovery being the "no flags" default is surprising — a new user running the CLI with just `--codebase` enters an interactive REPL with no indication that this is a specific mode.

## Job to Be Done

I can invoke any agent phase independently via a CLI subcommand (`discover`, `plan`, `build`) or run the full plan-then-build pipeline as a single command (`run`) — with each subcommand accepting its own relevant flags.

## Acceptance Criteria

- [ ] `sauna discover --codebase <path>` runs the interactive discovery agent (existing behavior, now behind an explicit subcommand)
- [ ] `sauna plan --codebase <path> --job <slug>` runs the planning agent for N iterations (default: 1, override with `--iterations <n>`)
- [ ] `sauna build --codebase <path> --job <slug>` runs the builder agent until all tasks are done (with hooks)
- [ ] `sauna run --codebase <path> --job <slug>` runs plan then build sequentially
- [ ] `--job <slug>` resolves to `.sauna/jobs/<slug>/` and validates the directory exists
- [ ] `--iterations <n>` overrides the plan iteration count (for `plan` and `run`)
- [ ] `--model <model>` overrides the default LLM model (shared across all subcommands)
- [ ] Running `sauna` with no subcommand or with `--help` shows usage listing all subcommands
- [ ] Running a subcommand with invalid or missing required flags produces a clear error message
- [ ] The existing `parseCliArgs()` is replaced with subcommand-aware parsing

## Out of Scope

- Multiple plan-then-build cycles in a single invocation (can be added to `run` later with `--cycles`)
- GUI or TUI for monitoring agent progress
- Remote execution or server mode
- Discovery-then-plan-then-build as a single automated pipeline

## SLC Scope

A subcommand parser in `cli.ts` that dispatches to the appropriate agent and loop runner. `discover` wraps the existing `runConversation()`. `plan` calls `runFixedCount()` directly with the planner agent. `build` calls `runUntilDone()` directly with the builder agent and hooks. `run` calls both sequentially (the existing `runJobPipeline()` behavior). Shared setup (API key validation, workspace, tools, researcher agent) is extracted into a helper used by all subcommands. No new dependencies — uses `parseArgs` from `node:util`.

## Related JTBDs

- `.sauna/jobs/planning-and-building-agents/` — depends on — this JTBD provides the CLI interface for the agents and loop runner defined there
- `.sauna/jobs/simplify-agent-execution/` — shared activity — the simpler SessionRunner makes subcommand handlers cleaner
