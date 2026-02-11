# MCP Tool Infrastructure — Tasks

## Completed

- [x] Install `@mastra/mcp` as a dependency — _jtbd.md §AC3_
- [x] Create `src/mcp-client.ts`: factory accepting env record, configuring Tavily + Context7 MCP servers — _jtbd.md §AC4, §AC5_
- [x] Update agent config types from `ReturnType<typeof createTools>` to `ToolsInput` — _jtbd.md §AC1_
- [x] Update agent instructions to reference web search and documentation lookup — _jtbd.md §AC6, §AC7_
- [x] Replace `resolveSearchFn()` + `createTools()` in `main()` with MCP client creation and `mcp.listTools()` — _jtbd.md §AC1_
- [x] Add `mcp.disconnect()` in `main()` finally block — _jtbd.md §SLC_
- [x] Validate LLM provider API key at startup (subprocess integration test confirms) — _jtbd.md §AC6_
- [x] Delete `src/tools/search-backends.ts`, `web-search.ts`, `tool-factory.ts` and their tests — _jtbd.md §AC2_
- [x] Remove `createTools`, `resolveSearchFn` exports from `src/index.ts` — _jtbd.md §AC2_
- [x] Add tests for MCP client factory (env injection, server configs) — _jtbd.md §AC5_
- [x] Update agent definition tests to verify agents receive MCP tools — _jtbd.md §AC1_
- [x] Check off all 7 acceptance criteria in `jtbd.md` — _jtbd.md §AC1–AC7 (verified: 95 tests passing, all criteria confirmed)_
- [x] Fail fast when `TAVILY_API_KEY` is missing — added `validateTavilyApiKey()` in `mcp-client.ts`, wired into `main()` startup validation; unit tests + subprocess integration test confirm exit(1) with clear error message (99 tests passing) — _specs/tool-layer-replacement.md §CLI Integration_

## Remaining

### P1: Spec coverage gap

- [ ] Add integration test verifying MCP tool names are namespaced by server name (e.g. `tavily_*`, `context7_*`) — current tests only use stubs; nothing confirms real `mcp.listTools()` output matches the naming contract — _specs/shared-mcp-client.md §Tool Exposure_

### P2: Housekeeping (not blocking ship)

- [ ] Export `createMcpClient` and `buildMcpServerConfigs` from `src/index.ts` — currently only used internally by `cli.ts` — _specs/shared-mcp-client.md §Configuration_
- [ ] Replace 4 `any` types (`MastraOnFinishCallback`, `LLMStepResult`) when `@mastra/core` exports them — `cli.ts:49`, `cli.ts:58`, `session-runner.ts:13-14`, `session-runner.ts:21-22` — _blocked on upstream_
