# Migrate Agent Framework from Vercel AI SDK to Mastra

## Problem

The current agent system is built on the Vercel AI SDK (`ai` v6, `@ai-sdk/anthropic`). It supports a single agent (discovery) with three hand-rolled tools (`file_read`, `file_write`, `web_search`), a manual readline conversation loop, and no skill, sub-agent, or lifecycle hook system beyond a per-step `onStepFinish` callback.

This is too rigid for the project's direction. At least three more agents are planned — each needing its own skills, guardrails, and tools. The current setup requires re-implementing conversation loops, tool wiring, and message accumulation for each new agent. There is no way to package reusable agent capabilities, no sub-agent delegation, no provider flexibility without code changes, and no "done" hook for autonomous agents that run without human interaction.

## Job to Be Done

When building a new agent, the developer should be able to define its skills, tools, model, provider, and hooks declaratively — and the framework handles the agent loop, tool discovery, skill loading, and lifecycle events. Adding a new agent should not require re-implementing infrastructure.

Specifically:

- Any agent can be configured with a different model and provider without code changes
- Agents automatically receive workspace tools (file read, file write, bash, search) without hand-rolling each one
- Agents can declare and discover skills from the filesystem
- The discovery agent (interactive, human-in-the-loop) can spawn sub-agents that run autonomously with workspace tools
- Future autonomous agents can register "done" hooks that fire when the agent completes its task
- Future autonomous agents can register tool-blocking hooks (speculative, not required now)

## Acceptance Criteria

- [ ] The project uses Mastra (`@mastra/core`) as its agent framework instead of the Vercel AI SDK
- [ ] The discovery agent works interactively (stdin/stdout) with the same behavior as today: reads user input, responds, uses tools, writes spec files
- [ ] The discovery agent uses its existing system prompt from `.sauna/prompts/discovery.md`
- [ ] Agents receive file read, file write, edit, list, bash/shell, and web search capabilities through the framework's workspace and tool system — not hand-rolled tool implementations
- [ ] The discovery agent can spawn sub-agents that have access to the same workspace tools
- [ ] Skills can be defined as files in a skills directory and are discoverable by agents
- [ ] The agent framework supports a "done" / completion hook that fires when an autonomous agent finishes
- [ ] Model and provider are configurable per agent without code changes (e.g., switch from Anthropic to OpenAI by changing configuration)
- [ ] The hand-rolled tool files (`file-read.ts`, `file-write.ts`) and their tests are deleted; `web-search.ts` is retained as a Mastra `createTool()` wrapper because workspace does not provide web search natively — it delegates to an injectable search backend (e.g., Tavily)
- [ ] `ai`, `@ai-sdk/anthropic` dependencies are removed from `package.json`
- [ ] Type-checking passes (`bunx tsc --noEmit`)

## Out of Scope

- Building the build agent or any other future agents beyond discovery
- CLI redesign or multi-agent routing from a single entry point
- Deployment, packaging, or distribution concerns
- Migrating or rewriting existing tests (left to downstream agents)
- Implementing tool-blocking hooks (speculative future need, not required now)

## SLC Scope

The simplest complete solution migrates the existing discovery agent to Mastra with workspace-provided tools, sub-agent support, skill directory loading, and a completion hook mechanism — while deleting all hand-rolled tool infrastructure. This is sufficient because it proves the framework works for the interactive discovery agent and lays the foundation (workspace, skills, hooks, sub-agents) that future agents will build on.

## Related JTBDs

None — this is the foundational migration that all future agent work depends on.
