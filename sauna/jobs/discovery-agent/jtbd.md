# Discovery Agent — JTBD Interview + Spec Writer

## Problem

When defining what needs to be built, the current workflow involves starting a Claude Code session, pointing it at a JTBD prompt, conducting a discovery interview, and then having the same agent write specs — all in one ad-hoc session. This works, but the output isn't structured for handoff. JTBDs and specs live in the same context window rather than as self-contained file packages that independent downstream agents (planning, implementation) can pick up cold.

The goal is to formalize Phase 1 of a multi-phase pipeline where discovery + spec writing produces a clean, portable output that enables parallel Phase 2 work.

## Job to Be Done

When a human has a problem to solve, they should be able to describe it to a CLI agent that interviews them, explores the relevant codebase, and produces a `jobs/` directory where each job is a self-contained package (JTBD definition + specs) that a downstream agent can pick up with no additional context.

## Activities

- Human starts a CLI session and describes the problem in natural language
- Agent conducts a structured discovery interview following the JTBD framework (problem context → desired outcome → activities & scope → acceptance criteria → relationships)
- Agent explores the codebase to ground its understanding (file reading, pattern searching)
- Agent searches the web when external context is needed
- Agent writes one or more JTBD files based on what it discovers
- Agent writes spec files for each JTBD within the same session (leveraging the rich context it has built up)
- Human reviews output and provides feedback; agent modifies files accordingly
- Final output is a `jobs/` directory structured for downstream handoff

## Acceptance Criteria

- [ ] CLI agent accepts a user's initial problem description and conducts a multi-turn discovery conversation
- [ ] Agent has access to codebase reading (file read, search/grep) and web search tools
- [ ] Agent follows the JTBD interview flow: problem context → desired outcome → activities/scope → acceptance criteria → relationships
- [ ] Agent produces a `jobs/` directory with one folder per job, each containing `jtbd.md` and `specs/*.md`
- [ ] Each JTBD folder is self-contained — a downstream agent can read only that folder and have everything it needs
- [ ] Human can provide feedback after output is generated and agent modifies files accordingly
- [ ] Architecture separates the core engine from the CLI interface so a server/chat adapter can replace it later without rewriting business logic
- [ ] LLM provider is abstracted behind an interface so models can be swapped

## Out of Scope

- Phase 2 planning agents or any downstream execution
- UI, approval workflows, or visual review interfaces
- Parallel execution of any agents
- Session persistence or resumption across process restarts
- MCP/plugin configuration system (future — codebase read + web search is sufficient for SLC)
- Auto-generation of `_index.md` or cross-JTBD relationship summaries

## SLC Scope

A CLI tool where you run something like `npx discovery-agent --codebase ./my-project`, type your problem, have a back-and-forth conversation, and get a `jobs/` directory written to disk. It uses one hardcoded LLM provider (behind an interface for future swapping), has codebase file reading + grep and web search as tools, and follows the jtbd.md interview prompt. No persistence, no plugins, no UI. The human reviews by looking at the files and can continue the conversation to request changes.

## Related JTBDs

None — this is the first JTBD in the pipeline.
