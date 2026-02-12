# MCP Tool Infrastructure

## Problem

The project maintains ~110 lines of custom Tavily API integration code (HTTP client, response translation, Mastra tool wrapper, factory wiring) plus ~15 tests — all commodity plumbing that Mastra's MCP support handles out of the box. Adding a new external tool today means writing another custom backend, another tool wrapper, and more tests. There is also no documentation lookup capability; agents cannot look up library APIs, which limits the effectiveness of autonomous agents.

## Job to Be Done

When I need to give agents access to an external tool (web search, documentation lookup, etc.), I configure an MCP server in a shared client — not write and maintain custom API integration code. All agents share the same MCP-provided tools.

## Acceptance Criteria

- [x] All agents get web search and documentation lookup tools via a shared `MCPClient` instance
- [x] `search-backends.ts`, `web-search.ts`, `tool-factory.ts` and their test files are deleted
- [x] `@mastra/mcp` is installed as the only new dependency
- [x] The `MCPClient` is configured with Tavily MCP (web search) and Context7 MCP (documentation lookup)
- [x] The MCP client factory accepts an env record parameter (injectable, testable — consistent with existing codebase patterns)
- [x] Agents can still search the web (existing capability preserved)
- [x] Agents can look up library documentation (new capability)

## Out of Scope

- Custom tool wrappers or result formatting on top of MCP tools
- MCP server-side implementation (we consume existing servers, not build our own)
- Changes to the workspace filesystem or sandbox
- Changes to agent prompts or behavior (beyond updating tool references in instructions)

## SLC Scope

A single `MCPClient` factory function that configures Tavily MCP and Context7 MCP servers, called once in `main()` and passed to all agent factories via `mcp.listTools()`. The old custom tool layer is deleted entirely. This is sufficient because MCP servers handle authentication, request formatting, and response translation — the exact code we're removing.

## Related JTBDs

- `.sauna/jobs/autonomous-agents/` — shared activity — new planning and building agents will consume the MCP tools established here
