# Mastra Migration — Tasks

## Completed (Priorities 1–6)

All foundational work is done. 98/98 tests pass across 4 files, `tsc --noEmit` clean. See git history for details.

- [x] P1: Install `@mastra/core`; remove `ai` and `@ai-sdk/anthropic` — spec: agent-framework-and-workspace
- [x] P1: Create workspace (`LocalFilesystem` + `LocalSandbox`) scoped to `--codebase` — spec: agent-framework-and-workspace
- [x] P1: Create web search tool via `createTool()` with injectable backend — spec: agent-framework-and-workspace
- [x] P1: Delete hand-rolled `file-read.ts` and `file-write.ts` (and tests) — spec: agent-framework-and-workspace
- [x] P2: Define discovery agent as `new Agent()` with system prompt, workspace, tools — spec: discovery-agent
- [x] P2: Rewrite `runConversation()` to use `agent.stream()` with real-time text output — spec: discovery-agent
- [x] P2: Surface file writes via `onStepFinish` detecting `mastra_workspace_write_file` — spec: discovery-agent, lifecycle-hooks
- [x] P2: Wire CLI args (`--codebase`, `--output`, `--model`) and dynamic API key validation — spec: discovery-agent
- [x] P2: Verify model/provider configurable via `--model` without code changes — spec: agent-framework-and-workspace, discovery-agent
- [x] P3: Wire `onFinish` callback for per-agent completion hooks — spec: lifecycle-hooks
- [x] P3: Confirm Mastra processor system supports future pre/post-tool hooks (design review) — spec: lifecycle-hooks
- [x] P4: Define research sub-agent with configurable `maxSteps`, workspace tools, isolated context — spec: sub-agents
- [x] P4: Register researcher on discovery agent via `agents: { researcher }` — spec: sub-agents
- [x] P5: Add `skillsPaths` option to workspace config for SKILL.md discovery — spec: skills-infrastructure
- [x] P5: Create `.sauna/skills/spec-writing/SKILL.md` and wire `skillsPaths` in `main()` — spec: skills-infrastructure
- [x] P6: 61 tests across 2 files, 81 assertions, all green — spec: all
- [x] P6: `bunx tsc --noEmit` passes with zero errors — spec: all

---

## Remaining Tasks

### Priority 1: Functional (agent breaks without these)

- [x] Wire a real web search backend into `main()` — added Tavily search backend (`src/tools/search-backends.ts`) with `createTavilySearch(apiKey)` and `translateTavilyResponse()`; added `resolveSearchFn(env)` to `cli.ts` that reads `TAVILY_API_KEY` from env; `createTools()` now auto-resolves via `resolveSearchFn` when no explicit `searchFn` is passed; 10 new tests (7 for search-backends, 3 for resolveSearchFn) — spec: agent-framework-and-workspace

### Priority 2: Spec compliance (code works but deviates from written specs)

- [x] Resolve `web-search.ts` deletion discrepancy — chose option (b): updated JTBD AC #9 and spec `agent-framework-and-workspace` to document that `web-search.ts` is intentionally retained as a Mastra `createTool()` wrapper around an injectable `SearchFunction` backend; it is not "hand-rolled" in the same sense as the deleted `file-read.ts`/`file-write.ts` because Mastra workspace does not provide web search natively — spec: agent-framework-and-workspace, jtbd
- [x] Enforce output directory constraint at filesystem level — created `OutputConstrainedFilesystem` wrapper (`src/output-constrained-filesystem.ts`) that delegates reads to inner `LocalFilesystem` but blocks write operations (`writeFile`, `appendFile`, `deleteFile`, `mkdir`, `rmdir`, `copyFile`, `moveFile`) targeting paths outside the configured output directory; wired into `createWorkspace()` via new `outputDir` option; `main()` passes `args.output` through; 23 unit tests + 4 integration tests; handles path normalization and traversal attempts — spec: agent-framework-and-workspace, discovery-agent
