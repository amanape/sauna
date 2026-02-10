# Codebase SRP Refactor — Tasks

## Priority 1: Module Decomposition (specs/module-decomposition.md)

- [x] Extract model resolution module (`getProviderFromModel`, `getApiKeyEnvVar`, `validateApiKey`, `DEFAULT_MODEL`) from `cli.ts` into its own file — specs/module-decomposition.md
- [x] Extract tool factory module (`createTools`, `resolveSearchFn`) from `cli.ts` into its own file — specs/module-decomposition.md ✓ (src/tool-factory.ts; cli.ts re-exports for backward compat)
- [x] Extract workspace factory module (`createWorkspace`, `WorkspaceOptions`) from `cli.ts` into its own file — specs/module-decomposition.md ✓ (src/workspace-factory.ts; cli.ts re-exports for backward compat)
- [x] Extract agent definitions module (`createDiscoveryAgent`, `createResearchAgent` and their config types) from `cli.ts` into its own file — specs/module-decomposition.md ✓ (src/agent-definitions.ts; cli.ts re-exports for backward compat)
- [ ] Extract session runner module (transport-agnostic conversation logic) from `runConversation` in `cli.ts` — specs/module-decomposition.md, specs/session-runner.md
- [ ] Reduce `cli.ts` to CLI adapter: `parseCliArgs`, readline transport, `main()` entry point wiring — specs/module-decomposition.md
- [ ] Create `index.ts` entry point that imports from the CLI adapter module (`package.json` declares `"module": "index.ts"` but it doesn't exist) — specs/module-decomposition.md
- [ ] Update all test imports to point at new module locations; all 98 tests must pass — specs/module-decomposition.md

## Priority 2: Session Runner (specs/session-runner.md)

- [ ] Session runner must accept a user message string, append to history, call `agent.stream()`, return stream result — must NOT own the I/O loop — specs/session-runner.md
- [ ] Session runner must replace message array with `getFullOutput().messages` after each turn — specs/session-runner.md
- [ ] Session runner must skip empty/whitespace-only user messages without calling the agent — specs/session-runner.md
- [ ] Session runner must accept `maxSteps`, `onStepFinish`, and optional `onFinish` configuration — specs/session-runner.md
- [ ] Session runner must NOT import readline, stdin, stdout, `Readable`, `Writable`, or any I/O primitives — specs/session-runner.md

## Priority 3: Type Tightening (specs/type-tightening.md)

- [ ] Replace `messages: any[]` with `MastraDBMessage[]` (from `@mastra/core`) — cli.ts:96 — specs/type-tightening.md
- [ ] Replace `onStepFinish(step: any)` with `LLMStepResult` type — cli.ts:112 — specs/type-tightening.md
- [ ] Replace `onFinish?: (event: any)` with `MastraOnFinishCallback` type — cli.ts:92 — specs/type-tightening.md
- [ ] Replace `catch (e: any)` with `catch (e: unknown)` plus type guard — cli.ts:218 — specs/type-tightening.md
- [ ] Verify no `any` type annotations remain in application source files (`as any` in tests is acceptable) — specs/type-tightening.md

## Priority 4: Environment Decoupling (specs/env-decoupling.md)

- [ ] Make `validateApiKey` accept an `env: Record<string, string | undefined>` parameter instead of reading `process.env` directly — cli.ts:154 — specs/env-decoupling.md
- [ ] Remove `process.env` fallback from `createTools`; caller must pass resolved `searchFn` or resolve it before calling — cli.ts:59 — specs/env-decoupling.md
- [ ] Update `validateApiKey` tests to pass env records as parameters instead of mutating `process.env` — specs/env-decoupling.md
- [ ] Verify `process.env`/`process.*` appears only in CLI adapter `main()` and test files — specs/env-decoupling.md

## Priority 5: Dead Code Cleanup (specs/dead-code-cleanup.md)

- [ ] Remove unused `normalize` import from `node:path` in `output-constrained-filesystem.ts:5` (only `posix` is used) — specs/dead-code-cleanup.md
- [ ] Remove unused type imports `FileStat` and `FileEntry` from `output-constrained-filesystem.ts:9-10` — specs/dead-code-cleanup.md
- [ ] Remove stale comment `// Traces to: specs/cli-simplification.md` from `cli.ts:2` — specs/dead-code-cleanup.md
- [ ] Remove stale comment `// Traces to: specs/agent-framework-and-workspace.md, specs/discovery-agent.md` from `output-constrained-filesystem.ts:3` — specs/dead-code-cleanup.md
- [ ] Resolve or remove `// TODO: Why pass the entire env instead of just the key?` from `cli.ts:44` (will be clear after env-decoupling) — specs/dead-code-cleanup.md

## Verification (all specs)

- [ ] `bun test` — all 98 tests pass with no behavior changes
- [ ] `bunx tsc --noEmit` — zero type errors
