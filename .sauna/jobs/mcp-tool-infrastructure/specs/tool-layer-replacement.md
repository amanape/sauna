# Tool Layer Replacement

## What This Component Does

Replaces the existing custom tool layer (Tavily HTTP client, web search tool wrapper, tool factory) with MCP-provided tools. Updates all agent definitions to receive tools from the shared MCP client instead of the custom tool pipeline.

## Requirements

### Removal

- The custom Tavily HTTP client (`search-backends.ts`) must be removed entirely
- The custom web search Mastra tool wrapper (`web-search.ts`) must be removed entirely
- The tool factory (`tool-factory.ts`) must be removed entirely
- All associated test files must be removed
- The `SearchFunction` type, `SearchResult` interface, and all related exports must be removed from the public API (`src/index.ts`)

### Agent Wiring

- Agent factory functions must accept MCP-provided tools (the result of `mcp.listTools()`) instead of the custom tools object
- The `createTools` parameter currently threaded through agent factories must be replaced with the MCP tools record
- All agents (discovery, researcher) must receive the same shared set of MCP tools
- Agent instructions should reference the available MCP tool capabilities (web search, documentation lookup) so the agent knows what it can do

### CLI Integration

- `main()` must create the shared MCP client, resolve tools via `listTools()`, and pass them to agent factories
- `TAVILY_API_KEY` validation must still occur at startup (fail fast if missing)
- The `resolveSearchFn` call in `main()` must be replaced with MCP client creation

### Test Updates

- Tests that mock `createTools` or inject `SearchFunction` must be updated to work with the MCP tools record
- Agent definition tests must verify agents receive the MCP tools
- CLI tests referencing removed modules must be updated or removed

## Constraints

- Must not change workspace filesystem or sandbox behavior
- Must not change agent prompt content (beyond tool capability references in instructions)
- Must preserve the injectable-env pattern for API key configuration
- Must not add any custom tool wrappers around MCP tools
