# SDK Migration Tasks

## Priority 1 — Foundation (unblocks everything else)

- [x] Add `ai`, `@ai-sdk/anthropic`, `zod` dependencies; remove `@anthropic-ai/sdk` — [jtbd.md]
  - Installed: ai@6.0.77, @ai-sdk/anthropic@3.0.39, zod@4.3.6
  - Expected breakage: anthropic.ts, anthropic.test.ts, cli.test.ts (all slated for deletion/rewrite)
  - 61/63 tests still pass; sole tsc error is the removed import
- [x] Delete `src/types.ts` (Message, ToolCall, Tool, LLMProvider, LLMResponse, EngineOutput) — all replaced by Vercel AI SDK types — [vercel-ai-sdk-integration.md]
  - Deleted file and inlined minimal type definitions in consuming files (engine.ts, anthropic.ts, all tool files, cli.ts)
  - No test regression: still 61/63 pass, same 2 pre-existing failures (anthropic.test.ts, cli.test.ts from missing @anthropic-ai/sdk)
- [x] Delete `src/providers/anthropic.ts` and `src/providers/anthropic.test.ts` — replaced by `@ai-sdk/anthropic` provider — [vercel-ai-sdk-integration.md]
  - Deleted both files and removed empty `src/providers/` directory
  - Removed `AnthropicProvider` import and usage from `src/cli.ts`; `main()` stubbed pending Priority 3 rewrite
  - Removed unused imports (`createInterface`, `resolve`, `dirname`, `join`, `ConversationEngine`) from cli.ts
  - All 74 tests pass, tsc clean (previously 61/63 with 1 tsc error from missing @anthropic-ai/sdk)
- [x] Delete `src/engine.ts` and `src/engine.test.ts` — replaced by Vercel AI SDK agentic loop — [vercel-ai-sdk-integration.md]
  - Deleted both files; no other files import ConversationEngine
  - 62 tests pass (down from 74 — 12 engine tests removed), tsc clean
  - Priority 1 foundation complete — all custom plumbing removed

## Priority 2 — Tool migration (3 tools, Zod schemas)

- [x] Rewrite `src/tools/file-read.ts` to Vercel AI SDK `tool()` pattern with Zod schema and `.describe()` on params — [tool-migration.md]
  - Uses `tool()` from `ai` with `inputSchema: z.object({ path: z.string().describe(...) })`
  - Execute receives typed `{ path: string }` input; all sandbox/error logic preserved
  - 9/9 file-read tests pass; 2 cli.test.ts tests now fail (reference `.name` on tool — fixed in Priority 3)
- [x] Rewrite `src/tools/file-read.test.ts` to match new tool signature — [tool-migration.md]
  - Tests call `tool.execute!(input, { toolCallId, messages, abortSignal })` matching Vercel AI SDK's ToolExecuteFunction signature
  - All 9 behavioral tests preserved: happy path, nested dirs, path traversal, directory rejection, sibling-prefix attack
- [x] Create `src/tools/file-write.ts` — single general-purpose writer replacing `write_jtbd`/`write_spec`; Zod schema, sandboxed to output dir, creates parent dirs, returns `"Wrote <relative-path>"` — [tool-migration.md]
  - Factory function `createFileWriteTool(outputPath)` returning Vercel AI SDK `tool()` with Zod schema
  - Sandbox check mirrors file-read pattern (normalizedBase + "/" prefix); mkdir + Bun.write for writes
  - 5/6 mutations caught (83%); surviving mutation: `mkdir` redundant because Bun.write auto-creates dirs — kept for intent clarity
- [x] Create `src/tools/file-write.test.ts` — happy path, path traversal rejection, directory creation, overwrite behavior — [tool-migration.md]
  - 8 behavioral tests: write + confirm, nested dir creation, overwrite, path traversal, absolute outside, absolute inside, sibling-prefix attack, .. resolution
  - Pre-existing cli.test.ts failures (2) unrelated — `createTools` references `.name` on Vercel AI SDK tools (fixed in Priority 3)
- [x] Rewrite `src/tools/web-search.ts` to Vercel AI SDK `tool()` pattern with Zod schema and `.describe()` on params — [tool-migration.md]
  - Factory function `createWebSearchTool(searchFn)` returning Vercel AI SDK `tool()` with Zod schema (`z.object({ query: z.string().describe(...) })`)
  - Removed old custom `Tool` interface; Zod handles parameter validation (empty/missing query rejected by schema)
  - All behavioral logic preserved: trim, no-results message, numbered formatting, error handling for Error and non-Error throws
  - 6/6 mutations caught (100%): trim removal, empty-results check, numbering, error message content, formatting indent, try/catch removal
- [x] Rewrite `src/tools/web-search.test.ts` to match new tool signature — [tool-migration.md]
  - 8 behavioral tests using Vercel AI SDK `execute(input, { toolCallId, messages, abortSignal })` signature
  - Removed old tests for empty/missing query (now handled by Zod schema validation, not execute logic)
  - Pre-existing cli.test.ts failures (2) unrelated — `createTools` references `.name` on Vercel AI SDK tools (fixed in Priority 3)
- [x] Delete `src/tools/file-search.ts` and `src/tools/file-search.test.ts` — [tool-migration.md]
  - Deleted both files and removed import/usage from `src/cli.ts` (`createTools` now returns 5 tools)
  - 55/58 tests pass; 3 cli.test.ts failures are pre-existing (`.name` property on Vercel AI SDK tools, wrong tool count) — fixed in Priority 3
- [x] Delete `src/tools/output-writer.ts` and `src/tools/output-writer.test.ts` — [tool-migration.md]
  - Deleted both files (14 tests for write_jtbd/write_spec removed — replaced by file-write tool's 8 tests)
  - Replaced `createWriteJtbdTool`/`createWriteSpecTool` imports in cli.ts with `createFileWriteTool`
  - `createTools` now returns 4 tools: file_read, file_write, web_search, session_complete
  - 38/41 tests pass; 3 cli.test.ts failures are pre-existing (`.name` property, wrong tool count) — fixed in Priority 3
- [x] Delete `src/tools/session-complete.ts` and `src/tools/session-complete.test.ts` — [tool-migration.md]
  - Deleted both files and removed import/usage from `src/cli.ts`
  - `createTools` now returns 3 tools: file_read, file_write, web_search
  - 35/38 tests pass; 3 cli.test.ts failures are pre-existing (`.name` property, wrong tool count) — fixed in Priority 3
  - Priority 2 (Tool migration) complete

## Priority 3 — CLI simplification

- [ ] Rewrite `src/cli.ts` to use Vercel AI SDK `generateText()` with `maxSteps: 50` instead of ConversationEngine; accumulate messages array across turns — [cli-simplification.md, vercel-ai-sdk-integration.md]
- [ ] Remove `--provider` argument from CLI arg parsing — [cli-simplification.md]
- [ ] Validate `ANTHROPIC_API_KEY` before first LLM call with clear error message — [cli-simplification.md]
- [ ] Print file-write notifications immediately as writes occur (detect `"Wrote "` prefix in tool results) — [cli-simplification.md]
- [ ] Remove programmatic session-complete detection (`output.done` logic) — session ends on user Ctrl+C/EOF only — [cli-simplification.md]
- [ ] Rewrite `src/cli.test.ts` — update `parseCliArgs` tests (no `--provider`), update `createTools` to expect 3 tools — [cli-simplification.md]

## Priority 4 — Validation

- [ ] Verify all tests pass with `bun test` — [all specs]
- [ ] Verify type-check passes with `bunx tsc --noEmit` — [all specs]
- [ ] Manual smoke test: run CLI end-to-end, confirm multi-turn conversation, file writes, and Ctrl+C exit — [cli-simplification.md]
