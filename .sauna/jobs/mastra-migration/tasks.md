# Mastra Migration — Tasks

## Priority 1: Agent Framework & Workspace (foundational — blocks everything)

- [x] Install `@mastra/core`; remove `ai` and `@ai-sdk/anthropic` from package.json — spec: agent-framework-and-workspace
  - Installed `@mastra/core@1.2.0`, removed `ai` and `@ai-sdk/anthropic`
  - Migrated tool files from `tool()` to `createTool()` with `id` field
  - Migrated `cli.ts` from `generateText()`/`anthropic()` to `new Agent()` with `agent.generate()`
  - Updated `ConversationDeps` interface: takes `Agent` instead of `model + tools + systemPrompt`
  - `onStepFinish` now reads `tr.payload.result` instead of `tr.output`
  - Default model changed to `"anthropic/claude-sonnet-4-5-20250929"` (provider-prefixed string)
  - Tests rewritten to inject mock agent directly (no more `mock.module("ai")`)
  - All 41 tests pass, `tsc --noEmit` clean, 3/3 mutation tests caught
- [x] Create workspace config: `LocalFilesystem` (scoped to `--codebase`) + `LocalSandbox` for shell tools — spec: agent-framework-and-workspace
  - Added `createWorkspace(codebasePath)` to `cli.ts`: creates `Workspace` with `LocalFilesystem` (contained, scoped to codebase) + `LocalSandbox` (working dir = codebase)
  - Wired workspace into Agent in `main()` — Mastra auto-injects workspace tools (read, write, edit, list, mkdir, stat, delete, execute_command)
  - 3 behavioral tests: filesystem reads files, filesystem rejects path traversal (mutation-tested), sandbox executes in codebase dir
  - 44 tests pass, `tsc --noEmit` clean
  - Note: output directory constraint (`--output` scoping) deferred to discovery agent task — workspace filesystem covers codebase; agent instructions + future task will handle write scoping
- [x] Create web search tool via Mastra `createTool()` with injectable search backend — spec: agent-framework-and-workspace
  - Already implemented: `createWebSearchTool(searchFn)` in `src/tools/web-search.ts` with 8 tests
  - Injectable `SearchFunction` backend, Zod input schema, formatted output
  - Wired into `createTools()` and Agent in `main()`
- [x] Delete hand-rolled tool files and tests: `src/tools/file-read.ts`, `file-write.ts`, `file-read.test.ts`, `file-write.test.ts` — spec: agent-framework-and-workspace
  - Deleted `file-read.ts` (8 tests) and `file-write.ts` (7 tests) — workspace `LocalFilesystem` replaces them
  - Kept `web-search.ts` and `web-search.test.ts` — workspace doesn't provide web search
  - Simplified `createTools()`: no longer takes `codebasePath`/`outputPath`, only returns `{ web_search }`
  - Removed imports of `createFileReadTool` and `createFileWriteTool` from `cli.ts`
  - Updated `createTools` tests: 3 tests verify single `web_search` key, execute function, and injectable search fn
  - 27 tests pass across 2 files, `tsc --noEmit` clean

## Priority 2: Discovery Agent (primary deliverable)

- [x] Define discovery agent as `new Agent()` with system prompt from `.sauna/prompts/discovery.md`, workspace, and web search tool — spec: discovery-agent
  - Extracted `createDiscoveryAgent(config)` from `main()` — takes `systemPrompt`, `model?`, `tools`, `workspace`; returns configured `Agent`
  - Exported `DEFAULT_MODEL` constant (`anthropic/claude-sonnet-4-5-20250929`)
  - Exported `DiscoveryAgentConfig` interface for type-safe agent creation
  - `main()` now calls `createDiscoveryAgent()` instead of inline `new Agent()`
  - 4 behavioral tests (all mutation-tested): model defaults, model override, system prompt wiring, web_search tool inclusion
  - 31 tests pass across 2 files, `tsc --noEmit` clean
- [x] Rewrite `runConversation()` to use `agent.stream()`: iterate `textStream` for stdout, accumulate history across turns — spec: discovery-agent
  - Replaced `agent.generate()` with `agent.stream()` — text chunks stream to stdout in real time via `for await (const chunk of streamResult.textStream)`
  - After stream completes, calls `streamResult.getFullOutput()` to retrieve `messages` for history accumulation
  - `onStepFinish` callback preserved for file write notifications (unchanged behavior)
  - Tests updated: mock provides `stream()` returning `{ textStream, getFullOutput() }` instead of `generate()` returning `{ text, messages }`
  - Added "streams text chunks to output in real time" test with multi-chunk ReadableStream
  - All 4 mutations caught: stream vs generate, textStream iteration, message accumulation, onStepFinish
  - 32 tests pass across 2 files, `tsc --noEmit` clean
- [ ] Surface file writes in real time via `onStepFinish` callback on `agent.stream()` (detect workspace `write_file` tool results) — spec: discovery-agent, lifecycle-hooks
- [ ] Wire CLI args (`--codebase`, `--output`, `--model`) to agent/workspace config; derive API key env var from `--model` provider prefix and validate at startup — spec: discovery-agent
- [ ] Verify model/provider configurable via `--model` string (e.g. `anthropic/claude-sonnet-4-5-20250929`) without code changes — spec: agent-framework-and-workspace, discovery-agent

## Priority 3: Lifecycle Hooks

- [ ] Wire `onFinish` callback on agent calls to support per-agent completion hooks (receives final output + tool call history); discovery agent doesn't need one yet but the pattern must exist — spec: lifecycle-hooks
- [ ] Confirm Mastra's per-tool hooks (`createTool` lifecycle) and processor system don't preclude future pre-tool/post-tool hooks — design review only, no code — spec: lifecycle-hooks

## Priority 4: Sub-Agent Support

- [ ] Define research sub-agent as `new Agent()` with workspace tools, configurable `maxSteps`, isolated context — spec: sub-agents
- [ ] Register research sub-agent on discovery agent via `agents: { researcher }` (auto-exposed as `agent-researcher` tool) — spec: sub-agents

## Priority 5: Skills Infrastructure

- [ ] Add `skills` directory path to workspace config for SKILL.md discovery and loading — spec: skills-infrastructure
- [ ] Create `.sauna/skills/` directory with one placeholder SKILL.md (name, description, instructions) to validate the pipeline — spec: skills-infrastructure

## Priority 6: Verification

- [ ] Write tests for: Mastra agent creation, web search `createTool`, `runConversation` with `agent.stream()` — spec: all
- [ ] Verify `bunx tsc --noEmit` passes with zero errors — spec: all
- [ ] Verify `bun test` passes with all new tests green — spec: all
