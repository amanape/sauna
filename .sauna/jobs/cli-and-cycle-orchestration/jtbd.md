# CLI & Cycle Orchestration

## Problem

There is no CLI interface for running agents independently or in combined cycles. The discovery agent is hardwired as the only entry point in `cli.ts`. Planning and building can only be invoked through the shell script MVP, which lives outside the method6 process and has no integration with the Mastra agent infrastructure.

## Job to Be Done

I can invoke any agent phase independently via a CLI subcommand, or run the plan↔build cycle as a single command — all through the method6 CLI.

## Acceptance Criteria

- [ ] `method6 discover` runs the interactive discovery agent (existing behavior, now behind a subcommand)
- [ ] `method6 plan --job <slug>` runs the planning agent for N iterations (default: 2)
- [ ] `method6 build --job <slug>` runs the builder agent until all tasks are done (with hooks)
- [ ] `method6 cycle --job <slug>` runs plan→build cycles (default: 2 cycles, 2 plan iterations each)
- [ ] `--iterations <n>` overrides the plan iteration count (for `plan` and `cycle`)
- [ ] `--cycles <n>` overrides the cycle count (for `cycle`)
- [ ] `--job <slug>` resolves to `.sauna/jobs/<slug>/` and validates the directory exists
- [ ] Running any command without required flags produces clear usage help
- [ ] The existing `parseCliArgs()` is replaced or extended to support subcommands

## Out of Scope

- Discovery→Plan→Build as a single automated pipeline (multiple jobs complicate routing)
- GUI or TUI for monitoring agent progress
- Remote execution or server mode

## SLC Scope

A subcommand parser in `cli.ts` that dispatches to the appropriate agent and loop runner from JTBD 2. The `cycle` command is a thin wrapper that calls the plan loop followed by the build loop, repeated M times. No new infrastructure beyond CLI argument parsing — the agents, loop runner, and hooks are all provided by JTBD 2.

## Related JTBDs

- `.sauna/jobs/planning-and-building-agents/` — depends on — this JTBD provides the CLI interface for the agents and loop runner defined there
- `.sauna/jobs/mcp-tool-infrastructure/` — shared activity — all subcommands create agents that consume shared MCP tools
