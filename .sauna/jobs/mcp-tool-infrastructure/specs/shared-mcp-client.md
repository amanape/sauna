# Shared MCP Client

## What This Component Does

A factory function that creates and configures a single `MCPClient` instance with all external tool servers (Tavily for web search, Context7 for documentation lookup). This client is the sole source of external tools for all agents in the system.

## Requirements

### Configuration

- The factory must accept an env record parameter (not read `process.env` directly) for testability
- The factory must configure a Tavily MCP server for web search, passing the Tavily API key from the env record
- The factory must configure a Context7 MCP server for library documentation lookup
- Both servers must use stdio transport (subprocess-based)
- The factory must return the `MCPClient` instance (not pre-resolved tools), so callers can use `listTools()` or `listToolsets()` as needed

### Tool Exposure

- All tools from all configured MCP servers must be available via `mcp.listTools()`
- Tool names must be namespaced by server name (Mastra's default behavior) to avoid conflicts
- The returned tools must be directly passable to Mastra `Agent` constructors via the `tools` parameter

### Lifecycle

- The MCP client must be created once during application startup
- The MCP client should be disconnectable for clean shutdown

## Constraints

- Must use `@mastra/mcp` package for the `MCPClient` class
- Must not include custom tool wrappers, result formatters, or response translators — MCP servers handle this
- Must not hardcode API keys; all secrets come from the injected env record
