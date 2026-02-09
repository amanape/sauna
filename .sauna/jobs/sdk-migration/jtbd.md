# SDK Migration — Replace Custom Agent Infrastructure with Vercel AI SDK

## Problem

The current discovery agent maintains ~600 lines of custom plumbing: a conversation engine (message loop, tool dispatch, completion detection), an LLM provider adapter (message translation, tool schema translation, response mapping), a custom type system, and 6 hand-coded tools with custom parameter schemas. This infrastructure duplicates what the Vercel AI SDK provides out of the box.

Adding a new agent (e.g., planning, building) currently means either sharing this engine code — which was shaped around the discovery agent's specific needs — or duplicating it. The cost of maintaining custom plumbing grows with each agent.

## Job to Be Done

When a developer wants to create a new agent, they should only need to define a prompt and a tool set. The conversation engine, LLM provider translation, tool schema generation, and agentic loop should be handled by the Vercel AI SDK — not hand-maintained code. The existing discovery agent should work identically from the user's perspective, just with dramatically less infrastructure behind it.

## Acceptance Criteria

- [ ] The custom conversation engine, LLM provider, and shared type system are eliminated — the Vercel AI SDK handles the agentic loop, provider communication, and message/tool types
- [ ] The Anthropic provider is `@ai-sdk/anthropic` — no hand-rolled API translation
- [ ] Tools use the Vercel AI SDK tool definition pattern with Zod parameter schemas
- [ ] Only three tools remain: file read, file write, and web search
- [ ] The `file_search` and `session_complete` tools are removed
- [ ] The two specialized output writers (`write_jtbd`, `write_spec`) are consolidated into a single general-purpose file write tool
- [ ] CLI behavior is unchanged: start session, multi-turn conversation, file write notifications, clean exit
- [ ] A new agent can be created by defining a system prompt, a tool set, and a model — no engine or provider code required
- [ ] Dependencies: `ai`, `@ai-sdk/anthropic`, and `zod` are added; `@anthropic-ai/sdk` is removed

## Out of Scope

- Multi-provider support (Anthropic only for now; the Vercel AI SDK makes switching trivial later)
- MCP server integration
- Agent-to-agent communication or pipelines
- Streaming
- Dynamic tool creation at runtime
- Session persistence or resumption
- Web search backend implementation (same stub as today)

## SLC Scope

Replace the custom engine, provider, and tool infrastructure with Vercel AI SDK equivalents. The discovery CLI works exactly as before from the user's perspective. A new agent is a small config object. The `ai`, `@ai-sdk/anthropic`, and `zod` packages are the only new dependencies.

## Related JTBDs

- `discovery-agent/` — depends on — this migration replaces the infrastructure that discovery-agent specs describe. The discovery agent's behavior is preserved but its implementation changes completely.
