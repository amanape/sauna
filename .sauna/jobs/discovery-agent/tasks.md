# Discovery Agent — Tasks

Status: **In progress.** Core foundation (types, provider, engine) implemented with tests; P1 tools are next.

## P0 — Core Foundation

- [x] Define shared TypeScript types: `Message`, `ToolDefinition`, `ToolCall`, `LLMResponse`, `LLMProvider`, `Tool`, `EngineOutput` — traces to all specs — implemented in `src/types.ts`; also includes `MessageRole`, `ParameterDef` as supporting types; `Tool extends ToolDefinition` for clean reuse
- [x] Implement `LLMProvider` interface and `AnthropicProvider` concrete class with `complete(messages, tools?)`, config-based instantiation (API key, model, temperature), and tool-definition translation — traces to `specs/llm-provider.md` — implemented in `src/providers/anthropic.ts`; exports pure translation functions (`extractSystemMessage`, `translateMessages`, `translateTools`, `mapResponse`) for testability; handles system message extraction, tool schema conversion to Anthropic `input_schema` format, and response mapping (text + tool_use blocks)
- [x] Implement `Tool` interface and tool registry (simple array passed to engine at startup) — traces to `specs/tool-system.md` — `Tool` interface defined in `src/types.ts` (extends `ToolDefinition` with `execute` method); registry is `Tool[]` passed to engine constructor; no separate module needed per spec
- [x] Implement `ConversationEngine` with `start()`/`respond()` methods, internal message array, tool-execution loop (LLM call → tool calls → execute → repeat → return text), `files_written` tracking, and `done` detection via `session_complete` — traces to `specs/conversation-engine.md` — implemented in `src/engine.ts`; uses `Map<string, Tool>` for O(1) tool lookup; detects file writes via "Wrote " prefix convention; snapshots messages before each LLM call to prevent reference mutation; safety limit of 50 loop iterations; graceful error handling for missing tools and execution failures

## P1 — SLC Tools

- [ ] Implement `file_read` tool: read file contents scoped to `--codebase` path — traces to `specs/tool-system.md`
- [ ] Implement `file_search` tool: grep/pattern search across codebase, return matching paths and lines — traces to `specs/tool-system.md`
- [ ] Implement `web_search` tool: query a search API/fetch+scrape, return title/snippet/URL results — traces to `specs/tool-system.md`
- [ ] Implement `write_jtbd` tool: validate slug (lowercase, hyphenated, no special chars), create dirs, write `jobs/<slug>/jtbd.md`, return confirmation — traces to `specs/output-writer.md`
- [ ] Implement `write_spec` tool: validate slugs, create dirs, write `jobs/<slug>/specs/<spec-slug>.md`, return confirmation — traces to `specs/output-writer.md`
- [ ] Implement `session_complete` no-op tool whose invocation signals the engine to set `done: true` — traces to `specs/conversation-engine.md`

## P2 — CLI & Integration

- [ ] Implement CLI adapter: parse `--codebase` (required), `--output` (default `./jobs/`), `--provider` (default `anthropic`), `--model` (optional) — traces to `specs/cli-adapter.md`
- [ ] Wire entry point: init provider, register tools scoped to codebase path, load `sauna/prompts/jtbd.md` as system prompt, create engine, start readline loop — traces to `specs/cli-adapter.md`
- [ ] Handle I/O: readline stdin/stdout, print file-write notifications mid-conversation, print summary on done, graceful Ctrl+C — traces to `specs/cli-adapter.md`

## P3 — Tests

- [x] Tests for `AnthropicProvider`: verify message/tool-definition translation and response parsing — traces to `specs/llm-provider.md` — implemented in `src/providers/anthropic.test.ts`; 14 tests covering extractSystemMessage, translateMessages (user/assistant/tool/mixed), translateTools (required params, empty params), mapResponse (text-only, tool-only, mixed, multi-tool), and Provider.complete integration with mocked SDK client; all 4 mutation tests caught
- [x] Tests for `ConversationEngine`: tool-execution loop, done detection, files_written tracking — traces to `specs/conversation-engine.md` — implemented in `src/engine.test.ts`; 12 tests covering start/respond lifecycle, tool execution loop (single/multiple calls, multiple iterations), session_complete detection, files_written tracking (single/accumulated), error handling (missing tool, execution throw), assistant message history with tool_calls, and tool definitions passed to provider; all 6 mutation tests caught
- [ ] Tests for `file_read`, `file_search`, and `web_search` tools: path scoping, error handling, result formatting — traces to `specs/tool-system.md`
- [ ] Tests for `write_jtbd`/`write_spec`: slug validation (reject uppercase/spaces/special chars), directory creation, overwrite behavior — traces to `specs/output-writer.md`
- [ ] Tests for CLI argument parsing: required args, defaults, missing codebase error — traces to `specs/cli-adapter.md`
