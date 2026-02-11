# Planning & Building Agents

## Problem

The only Mastra agent in the codebase today is the discovery agent (with its researcher sub-agent). Planning and building are handled by a rough shell script MVP that calls Claude Code CLI in a loop. This works but lives outside the method6 process — there's no shared tool infrastructure, no programmatic control over iterations, no hook system for validation gates, and no way to observe what the agents are doing from within the application.

The prompts for planning (`plan.md`) and building (`build.md`) already exist and capture the desired behavior, but they aren't wired to Mastra agents.

## Job to Be Done

After discovery produces specs, I can run a planning agent that autonomously produces a prioritized task list, then a builder agent that autonomously implements every task — with configurable validation hooks that must pass between builder iterations.

## Acceptance Criteria

- [ ] A planning agent exists as a Mastra agent (`createPlanningAgent()`), using the existing `plan.md` system prompt
- [ ] A builder agent exists as a Mastra agent (`createBuilderAgent()`), using the existing `build.md` system prompt
- [ ] A loop runner can execute the planner for a configurable N iterations (fresh session each)
- [ ] A loop runner can execute the builder until all tasks in `tasks.md` are marked `[x]` (fresh session per task)
- [ ] Hooks defined in `.sauna/hooks.json` run between builder iterations; the builder cannot proceed to the next task until hooks pass
- [ ] When hooks fail, the failure output is fed back to the same builder session so it can fix the issue
- [ ] A max retry limit prevents infinite hook-failure loops; pipeline halts when exhausted
- [ ] The job is specified via `--job <slug>` CLI flag, resolving to `.sauna/jobs/<slug>/`
- [ ] Both agents have full codebase read/write access (no output constraint)
- [ ] `OutputConstrainedFilesystem` and its tests are removed from the codebase

## Out of Scope

- Pipeline orchestration (discovery → plan → build as a single command) — separate JTBD
- Changes to agent prompt content (`plan.md`, `build.md`)
- Discovery agent behavior changes (beyond removing output constraint)
- UI/monitoring for agent progress (noted on roadmap as a future concern)

## SLC Scope

Two new agent factory functions following the existing `createDiscoveryAgent()` pattern, plus a loop runner that supports both iteration strategies (fixed-count and until-done). Hooks are shell commands read from a JSON config file. The builder's hook-failure retry uses the existing `SessionRunner` multi-turn capability — inject hook output as a new message in the same session. This is sufficient because the prompts already define agent behavior; the infrastructure just needs to execute them in loops with validation gates.

## Related JTBDs

- `.sauna/jobs/mcp-tool-infrastructure/` — shared activity — these agents consume the MCP tools established there
- `.sauna/jobs/agent-pipeline-orchestration/` — depends on this — the pipeline wires these agents into a single flow
