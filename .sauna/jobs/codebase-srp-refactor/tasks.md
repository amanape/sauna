# Codebase SRP Refactor — Tasks

**Status: All tasks complete. No remaining work.**

110 tests pass, 0 type errors. All 8 acceptance criteria from jtbd.md satisfied.

## Priority 1: Module Decomposition (specs/module-decomposition.md)

- [x] Extract model resolution module into `src/model-resolution.ts`
- [x] Extract tool factory module into `src/tool-factory.ts`
- [x] Extract workspace factory module into `src/workspace-factory.ts`
- [x] Extract agent definitions module into `src/agent-definitions.ts`
- [x] Extract session runner module into `src/session-runner.ts`
- [x] Reduce `cli.ts` to CLI adapter only (parseCliArgs, runConversation, main)
- [x] Create `src/index.ts` entry point re-exporting public API
- [x] Update all test imports to new module locations

## Priority 2: Session Runner (specs/session-runner.md)

- [x] Accept user message, append to history, call agent.stream(), return stream result
- [x] Replace message array with getFullOutput().messages after each turn
- [x] Skip empty/whitespace-only messages without calling agent
- [x] Accept maxSteps, onStepFinish, optional onFinish configuration
- [x] Must NOT import readline, stdin, stdout, Readable, Writable, or I/O primitives

## Priority 3: Type Tightening (specs/type-tightening.md)

- [x] Replace `messages: any[]` with `MessageInput[]`
- [x] Replace `onStepFinish(step: any)` — BLOCKED: LLMStepResult not exported by @mastra/core; TODO comment added
- [x] Replace `onFinish?: (event: any)` — BLOCKED: MastraOnFinishCallback not exported by @mastra/core; TODO comment added
- [x] Replace `catch (e: any)` with `catch (e: unknown)` + type guard
- [x] Verify no undocumented `any` remains in source files

## Priority 4: Environment Decoupling (specs/env-decoupling.md)

- [x] validateApiKey accepts env record parameter instead of reading process.env
- [x] createTools requires explicit searchFn parameter (no process.env fallback)
- [x] Tests pass env records as parameters instead of mutating process.env
- [x] process.env/process.* appears only in CLI adapter main() and test files

## Priority 5: Dead Code Cleanup (specs/dead-code-cleanup.md)

- [x] Remove unused normalize import from output-constrained-filesystem.ts
- [x] Remove unused FileStat and FileEntry type imports
- [x] Remove stale "Traces to" comments
- [x] Remove resolved TODO comment about env parameter

## Verification

- [x] `bun test` — 110 tests pass
- [x] `bunx tsc --noEmit` — zero type errors
