# Discovery Agent — Tasks

Status: **In progress.** Shared types defined; remaining work is net-new.

## P0 — Core Foundation

- [ ] Define shared TypeScript types: `Message`, `ToolDefinition`, `ToolCall`, `LLMResponse`, `LLMProvider`, `Tool`, `EngineOutput` — traces to all specs
- [ ] Implement `LLMProvider` interface and `AnthropicProvider` concrete class with `complete(messages, tools?)`, config-based instantiation (API key, model, temperature), and tool-definition translation — traces to `specs/llm-provider.md`
- [ ] Implement `Tool` interface and tool registry (simple array passed to engine at startup) — traces to `specs/tool-system.md`
- [ ] Implement `ConversationEngine` with `start()`/`respond()` methods, internal message array, tool-execution loop (LLM call → tool calls → execute → repeat → return text), `files_written` tracking, and `done` detection via `session_complete` — traces to `specs/conversation-engine.md`

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

- [ ] Tests for `AnthropicProvider`: verify message/tool-definition translation and response parsing — traces to `specs/llm-provider.md`
- [ ] Tests for `ConversationEngine`: tool-execution loop, done detection, files_written tracking — traces to `specs/conversation-engine.md`
- [ ] Tests for `file_read`, `file_search`, and `web_search` tools: path scoping, error handling, result formatting — traces to `specs/tool-system.md`
- [ ] Tests for `write_jtbd`/`write_spec`: slug validation (reject uppercase/spaces/special chars), directory creation, overwrite behavior — traces to `specs/output-writer.md`
- [ ] Tests for CLI argument parsing: required args, defaults, missing codebase error — traces to `specs/cli-adapter.md`
