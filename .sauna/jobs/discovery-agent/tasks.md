# Discovery Agent — Tasks

Status: **Near-complete.** All core architecture, tools, engine, and CLI implemented with 88 passing tests. 4 gaps remain.

## Remaining

### P1 — Blocking

- [ ] Implement a concrete `SearchFunction` for `web_search` (API wrapper or fetch+scrape) — `cli.ts:47` `defaultSearchFn` throws "not configured"; tool wrapper works, needs a real backend — `specs/tool-system.md`, `jtbd.md`

### P2 — Packaging

- [ ] Add `bin` field to `package.json` so the tool runs via `bunx discovery-agent --codebase ./path` — `specs/cli-adapter.md`, `jtbd.md`

### P3 — Spec compliance

- [ ] Accumulate `files_written` across all turns in the CLI loop and print full summary on session complete — currently only per-turn; spec says "print summary of files written and exit" — `specs/cli-adapter.md`
- [ ] Add visual separator (e.g. `---`) between agent response and input prompt — spec says "print a visual separator so the conversation is easy to follow" — `specs/cli-adapter.md`

## Completed

- [x] Shared types (`src/types.ts`) — Message, ToolCall, LLMProvider, Tool, EngineOutput
- [x] LLMProvider interface + AnthropicProvider (`src/providers/anthropic.ts`) — 14 tests
- [x] ConversationEngine (`src/engine.ts`) — start/respond, tool loop, done detection, file tracking — 12 tests
- [x] file_read tool (`src/tools/file-read.ts`) — sandbox-scoped reads — 8 tests
- [x] file_search tool (`src/tools/file-search.ts`) — recursive regex grep — 10 tests
- [x] web_search tool wrapper (`src/tools/web-search.ts`) — injectable SearchFunction — 9 tests
- [x] write_jtbd + write_spec tools (`src/tools/output-writer.ts`) — slug validation, dir creation — 14 tests
- [x] session_complete tool (`src/tools/session-complete.ts`) — 3 tests
- [x] CLI adapter (`src/cli.ts`) — arg parsing, readline, Ctrl+C, file-write notifications — 8 tests
- [x] Entry point (`index.ts`) — wires provider, tools, engine, prompt
- [x] System prompt (`discovery.md`) — full JTBD interview flow
