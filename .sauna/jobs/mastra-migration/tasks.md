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
- [x] Surface file writes in real time via `onStepFinish` callback on `agent.stream()` (detect workspace `write_file` tool results) — spec: discovery-agent, lifecycle-hooks
  - Replaced old string-based detection (`"Wrote "` prefix) with workspace tool detection: checks `tr.payload.toolName === "mastra_workspace_write_file"` and `tr.payload.result?.success`
  - Workspace write_file returns `{ success: boolean, path: string, size: number }` — notification formats as `"Wrote <path>"`
  - Only successful writes are surfaced; failed writes and other workspace tools (edit_file, delete, etc.) are excluded
  - 2 behavioral tests (all mutation-tested, 3/3 mutations caught): successful write surfaced + edit_file excluded, failed write excluded
  - 33 tests pass across 2 files, `tsc --noEmit` clean
- [x] Wire CLI args (`--codebase`, `--output`, `--model`) to agent/workspace config; derive API key env var from `--model` provider prefix and validate at startup — spec: discovery-agent
  - Extracted `getProviderFromModel(model?)`: parses `"provider/model"` prefix, defaults to `"anthropic"` when no slash
  - Extracted `getApiKeyEnvVar(provider)`: uppercases provider + `_API_KEY` (supports any provider dynamically)
  - Extracted `validateApiKey(model?)`: combines both, throws if env var is missing
  - `main()` now calls `validateApiKey(args.model)` instead of hardcoded `ANTHROPIC_API_KEY` check
  - `--output` wired into `createDiscoveryAgent({ outputPath: args.output })` — appends output directory instruction to system prompt
  - `DiscoveryAgentConfig` extended with optional `outputPath` field
  - 13 new tests: getProviderFromModel (4), getApiKeyEnvVar (4), validateApiKey (3), createDiscoveryAgent outputPath (2)
  - All 5/5 mutations killed; 46 tests pass, `tsc --noEmit` clean
- [x] Verify model/provider configurable via `--model` string (e.g. `anthropic/claude-sonnet-4-5-20250929`) without code changes — spec: agent-framework-and-workspace, discovery-agent
  - `getProviderFromModel` handles any `"provider/model"` format; model string passed directly to Mastra Agent which routes to the correct provider
  - Dynamic API key validation ensures the correct env var is checked (e.g., `OPENAI_API_KEY` for `openai/gpt-4`)

## Priority 3: Lifecycle Hooks

- [x] Wire `onFinish` callback on agent calls to support per-agent completion hooks (receives final output + tool call history); discovery agent doesn't need one yet but the pattern must exist — spec: lifecycle-hooks
  - Added optional `onFinish` callback to `ConversationDeps` interface — any agent call site can provide a completion hook
  - `runConversation()` conditionally passes `onFinish` to `agent.stream()` options — Mastra invokes it with final output (text, messages, toolResults)
  - Discovery agent doesn't set `onFinish` (not needed), but future agents (build agent, etc.) can provide one at the call site
  - 3 behavioral tests: callback invoked by Mastra with correct payload, callback identity passed through to stream options, onFinish absent when not provided
  - Mutation tested: removing onFinish wiring fails 2 tests
  - 49 tests pass across 2 files, `tsc --noEmit` clean
- [x] Confirm Mastra's per-tool hooks (`createTool` lifecycle) and processor system don't preclude future pre-tool/post-tool hooks — design review only, no code — spec: lifecycle-hooks
  - **Confirmed: Mastra fully supports future pre-tool/post-tool hooks without framework modification** via two complementary systems:
  - Tool-level hooks (`onInputStart`, `onInputDelta`, `onInputAvailable`, `onOutput`): observer-only, receive full context including `toolCallId`, messages, and `abortSignal`; ideal for metrics, logging, and side effects
  - Agent-level processors (`processInputStep`, `processOutputStep`): transforming hooks that can validate, filter, block, or modify tool sets; support `abort({ retry: true })`, persistent state across steps, and processor chaining
  - 12 built-in reference processor implementations (ToolSearchProcessor, ToolCallFilter, ModerationProcessor, TokenLimiterProcessor, etc.) demonstrate extension patterns
  - No framework modifications needed: per-agent `processors` config at definition time satisfies the "configurable per agent without framework changes" constraint

## Priority 4: Sub-Agent Support

- [x] Define research sub-agent as `new Agent()` with workspace tools, configurable `maxSteps`, isolated context — spec: sub-agents
  - Created `createResearchAgent(config)` with `ResearchAgentConfig` interface: `model?`, `tools`, `workspace`, `maxSteps?`
  - Agent has `id: "researcher"`, `description` for tool exposure, `instructions` for autonomous research role
  - `defaultOptions: { maxSteps }` configures step limit (default 30) — Mastra enforces independently of parent agent
  - Workspace and web_search tools shared with parent; fresh context per invocation (isolation by Mastra design)
  - Wired into `createDiscoveryAgent()` via `agents: { researcher }` — Mastra auto-exposes as `agent-researcher` tool
  - Researcher inherits model from discovery agent config (consistent provider across parent/child)
  - 9 new tests: createResearchAgent (7 — model default/override, instructions, tools, maxSteps default/override, description) + createDiscoveryAgent sub-agents (2 — registration, model inheritance)
  - All 5/5 mutations caught; 58 tests pass, `tsc --noEmit` clean
- [x] Register research sub-agent on discovery agent via `agents: { researcher }` (auto-exposed as `agent-researcher` tool) — spec: sub-agents
  - Completed as part of the previous task: `createDiscoveryAgent()` now creates researcher via `createResearchAgent()` and passes it as `agents: { researcher }`
  - Mastra auto-exposes as `agent-researcher` tool — LLM decides when to delegate research tasks
  - Verified via `agent.listAgents()` test: researcher key present in agents record
  - Model inheritance verified: researcher uses same model as discovery agent config

## Priority 5: Skills Infrastructure

- [x] Add `skills` directory path to workspace config for SKILL.md discovery and loading — spec: skills-infrastructure
  - Extended `createWorkspace()` with optional `WorkspaceOptions` parameter containing `skillsPaths?: string[]`
  - When `skillsPaths` is provided, passes paths to Mastra `Workspace` config as `skills` resolver (static string array)
  - When `skillsPaths` is omitted, workspace has no skills (`workspace.skills` is undefined) — backward compatible
  - 2 behavioral tests: skills discovery from configured directories (creates SKILL.md with frontmatter, verifies `workspace.skills.list()` returns it), no skills when not configured
  - 1/1 mutation caught (removing skills wiring breaks discovery test); 60 tests pass, `tsc --noEmit` clean
- [x] Create `.sauna/skills/` directory with one placeholder SKILL.md (name, description, instructions) to validate the pipeline — spec: skills-infrastructure
  - Created `.sauna/skills/spec-writing/SKILL.md` with YAML frontmatter (name, description, version, tags) and markdown instructions for structured JTBD spec writing
  - Wired `skillsPaths: [".sauna/skills"]` into `main()` so workspace discovers skills from the conventional `.sauna/skills/` directory within the target codebase
  - Integration test validates the actual `.sauna/skills/spec-writing/SKILL.md` is discovered by the workspace pipeline (mutation-tested: 1/1 caught)
  - 61 tests pass across 2 files, `tsc --noEmit` clean

## Priority 6: Verification

- [ ] Write tests for: Mastra agent creation, web search `createTool`, `runConversation` with `agent.stream()` — spec: all
- [ ] Verify `bunx tsc --noEmit` passes with zero errors — spec: all
- [ ] Verify `bun test` passes with all new tests green — spec: all
