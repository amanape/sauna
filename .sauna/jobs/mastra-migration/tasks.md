# Mastra Migration — Tasks

## Completed (Priorities 1–6)

All foundational work is done. 71/71 tests pass across 3 files, `tsc --noEmit` clean. See git history for details.

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

- [ ] Resolve `web-search.ts` deletion discrepancy — both JTBD AC #9 and spec `agent-framework-and-workspace` say delete all three hand-rolled tools including `web-search.ts`, but it was intentionally kept because workspace doesn't provide web search; either (a) delete `web-search.ts` and provide search via MCP/provider-native tool, or (b) update JTBD AC #9 *and* spec to reflect the intentional deviation — spec: agent-framework-and-workspace, jtbd
- [ ] Enforce output directory constraint at filesystem level — spec says writes "must be constrained to this output directory" but current implementation only appends an instruction to the system prompt; `LocalFilesystem` prevents escape from codebase root but allows writes anywhere within it — spec: agent-framework-and-workspace, discovery-agent
