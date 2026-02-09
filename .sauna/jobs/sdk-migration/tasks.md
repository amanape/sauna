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

- [ ] Rewrite `src/tools/file-read.ts` to Vercel AI SDK `tool()` pattern with Zod schema and `.describe()` on params — [tool-migration.md]
- [ ] Rewrite `src/tools/file-read.test.ts` to match new tool signature — [tool-migration.md]
- [ ] Create `src/tools/file-write.ts` — single general-purpose writer replacing `write_jtbd`/`write_spec`; Zod schema, sandboxed to output dir, creates parent dirs, returns `"Wrote <relative-path>"` — [tool-migration.md]
- [ ] Create `src/tools/file-write.test.ts` — happy path, path traversal rejection, directory creation, overwrite behavior — [tool-migration.md]
- [ ] Rewrite `src/tools/web-search.ts` to Vercel AI SDK `tool()` pattern with Zod schema and `.describe()` on params — [tool-migration.md]
- [ ] Rewrite `src/tools/web-search.test.ts` to match new tool signature — [tool-migration.md]
- [ ] Delete `src/tools/file-search.ts` and `src/tools/file-search.test.ts` — [tool-migration.md]
- [ ] Delete `src/tools/output-writer.ts` and `src/tools/output-writer.test.ts` — [tool-migration.md]
- [ ] Delete `src/tools/session-complete.ts` and `src/tools/session-complete.test.ts` — [tool-migration.md]

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
