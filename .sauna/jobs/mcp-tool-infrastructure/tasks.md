# MCP Tool Infrastructure — Tasks

## Completed

- [x] Install `@mastra/mcp` as a dependency — _jtbd.md §AC3_
- [x] Create `src/mcp-client.ts`: factory accepting env record, configuring Tavily + Context7 MCP servers — _jtbd.md §AC4, §AC5_
- [x] Update agent config types from `ReturnType<typeof createTools>` to `ToolsInput` — _jtbd.md §AC1_
- [x] Update agent instructions to reference web search and documentation lookup — _jtbd.md §AC6, §AC7_
- [x] Replace `resolveSearchFn()` + `createTools()` in `main()` with MCP client creation and `mcp.listTools()` — _jtbd.md §AC1_
- [x] Add `mcp.disconnect()` in `main()` finally block — _jtbd.md §SLC_
- [x] Validate LLM provider API key at startup — _jtbd.md §AC6_
- [x] Delete `src/tools/search-backends.ts`, `web-search.ts`, `tool-factory.ts` and their tests — _jtbd.md §AC2_
- [x] Remove `createTools`, `resolveSearchFn` exports from `src/index.ts` — _jtbd.md §AC2_
- [x] Add tests for MCP client factory (env injection, server configs) — _jtbd.md §AC5_
- [x] Update agent definition tests to verify agents receive MCP tools — _jtbd.md §AC1_
- [x] Fail fast when `TAVILY_API_KEY` is missing — _specs/tool-layer-replacement.md §CLI Integration_
- [x] Add integration test verifying MCP tool names are namespaced by server name — _specs/shared-mcp-client.md §Tool Exposure_
- [x] Export `createMcpClient`, `buildMcpServerConfigs`, `validateTavilyApiKey` from `src/index.ts` — _specs/shared-mcp-client.md §Configuration_
- [x] Replace `LLMStepResult` `any` types in production code — _housekeeping_
- [x] Replace `OnFinishCallback` `any` types in production code — _housekeeping_
- [x] Replace ~26 `any` types in test files (`cli.test.ts`, `session-runner.test.ts`) with proper mock types — introduced `MockStreamFn`, `StreamOptions`, and `mockCallArgs()` typed helper; all `msgs: any[]`, `opts: any`, `as any` agent casts, and `mock.calls as any` accessors replaced with `Agent`, `MessageInput`, `StreamOptions`, `LLMStepResult`, and `OnFinishCallback` types — _housekeeping, P3_

## Remaining

No remaining tasks. All acceptance criteria met and all housekeeping complete.
