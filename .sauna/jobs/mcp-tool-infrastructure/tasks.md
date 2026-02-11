# MCP Tool Infrastructure — Tasks

## P0: Foundation

- [x] Install `@mastra/mcp` as a dependency (`bun install @mastra/mcp`) — _shared-mcp-client.md_
- [x] Create `src/mcp-client.ts`: factory accepting env record, configuring Tavily MCP (stdio, `TAVILY_API_KEY`) and Context7 MCP (stdio), returning `MCPClient` — _shared-mcp-client.md_

## P1: Agent Wiring

- [x] Change `DiscoveryAgentConfig.tools` and `ResearchAgentConfig.tools` types from `ReturnType<typeof createTools>` to the MCP tools record type — _tool-layer-replacement.md_
- [x] Update `createDiscoveryAgent`/`createResearchAgent` to pass MCP tools to the `Agent` constructor (already pass `config.tools` through — just needs type alignment) — _tool-layer-replacement.md_
- [x] Update agent instructions to reference both web search and documentation lookup capabilities — _tool-layer-replacement.md_

## P2: CLI Integration

- [ ] Replace `resolveSearchFn()` + `createTools()` in `main()` with MCP client creation and `mcp.listTools()` — _tool-layer-replacement.md_
- [ ] Add `mcp.disconnect()` in `main()` cleanup path for clean shutdown — _shared-mcp-client.md §Lifecycle_
- [ ] Verify `TAVILY_API_KEY` validation (`validateApiKey`) still fires at startup after migration — _tool-layer-replacement.md_

## P3: Cleanup — Remove Old Tool Layer

- [ ] Delete `src/tools/search-backends.ts` and `src/tools/search-backends.test.ts` — _tool-layer-replacement.md_
- [ ] Delete `src/tools/web-search.ts` and `src/tools/web-search.test.ts` — _tool-layer-replacement.md_
- [ ] Delete `src/tool-factory.ts` — _tool-layer-replacement.md_
- [ ] Remove `createTools` and `resolveSearchFn` exports from `src/index.ts` — _tool-layer-replacement.md_

## P4: Test Updates

- [x] Add tests for MCP client factory (env injection, server configuration, disconnection) — _shared-mcp-client.md_
- [ ] Update `cli.test.ts`: remove `createTools`/`resolveSearchFn` tests, add MCP client integration tests — _tool-layer-replacement.md_
- [x] Update agent definition tests to verify agents receive MCP tools record — _tool-layer-replacement.md_
