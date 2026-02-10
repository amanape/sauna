# Codebase SRP Refactor — Make the Codebase Extensible for New Agents and Transports

## Problem

The codebase has a single source file (`src/cli.ts`, 246 lines) carrying at least 8 distinct responsibilities: CLI argument parsing, environment-based search function resolution, tool factory, workspace factory, conversation loop (readline + streaming), two agent factories (discovery + research), model/provider/API key resolution, and the `main()` entry point wiring. This violates the Single Responsibility Principle and creates concrete pain:

- **Adding a new agent** (planner, builder) has no established pattern — the only examples are factory functions buried in the CLI file.
- **Adding a new transport** (web UI) is blocked because the conversation loop is hardwired to Node readline streams. Message accumulation logic is trapped inside the I/O loop.
- **Lazy `any` types** (`messages: any[]`, `onStepFinish(step: any)`, `onFinish?: (event: any)`) hide the real Mastra types that exist and are exported (`MastraDBMessage`, `LLMStepResult`, `MastraOnFinishCallback`), making it harder for the next developer or AI agent to extend safely.
- **`process.env` accessed directly** in business logic (`validateApiKey`, `createTools`) couples those functions to the CLI runtime and makes them harder to test or reuse in a web server context.
- **Dead imports and stale comments** — `output-constrained-filesystem.ts` imports `normalize`, `FileStat`, and `FileEntry` but never uses them; both source files have "Traces to" comments referencing specs from completed JTBDs.

The people affected are the developer and the AI agents (planner, builder) that will extend this codebase. The trigger is now — before more agents and a web UI are built on top of a foundation that fights them.

## Job to Be Done

When a developer or AI agent needs to add a new agent type or a new interaction transport (CLI, web UI, automated loop), they should be able to do so by defining only what's unique to that agent or transport — without modifying shared infrastructure, without copy-pasting patterns from existing code, and without fighting type ambiguity or hidden environment coupling.

## Acceptance Criteria

- [ ] `src/cli.ts` no longer exists as a God File — its responsibilities are distributed across focused modules, each with a single reason to change
- [ ] The conversation/session logic (message accumulation, agent.stream() calls, step callbacks) is separated from I/O transport (readline, stdin/stdout) so a web UI or automated loop can drive the same session logic
- [ ] Agent definitions (discovery, research) live in their own module(s), establishing a clear pattern that planner/builder agents can follow
- [ ] All `any` types in application code are replaced with proper Mastra-exported types (`MastraDBMessage`, `LLMStepResult`, `MastraOnFinishCallback`, etc.) or narrowed appropriately
- [ ] No business logic function directly accesses `process.env` — environment values are passed in as explicit parameters
- [ ] Dead imports (`normalize`, `FileStat`, `FileEntry` in `output-constrained-filesystem.ts`) are removed
- [ ] Stale "Traces to" comments referencing completed JTBD specs are removed from all source files
- [ ] All 98 existing tests continue to pass (imports may change, behavior must not)
- [ ] Type-checking passes (`bunx tsc --noEmit`)

## Out of Scope

- Building the planner or builder agents (this job makes the codebase *ready* for them)
- Building the web UI (this job decouples the architecture so it *can* be built)
- Anything in `.sauna/` (prompts, scripts, skills, jobs)
- Changing Mastra framework behavior or upgrading `@mastra/core`
- Adding session persistence, history, or resumption (all sessions are ephemeral and disposable)
- Changing the behavior of `OutputConstrainedFilesystem` or the tools modules (they're already clean — only dead imports/comments are touched)
- Changing test behavior (tests may need import path updates but must verify the same things)

## SLC Scope

Extract `cli.ts` into focused modules: CLI adapter (arg parsing + readline transport), session runner (message accumulation + agent interaction), agent definitions, and shared infrastructure (workspace factory, tool factory, model resolution). Replace `any` with real types. Remove dead code and stale comments. The result is a codebase where each file has one reason to change, the session logic can be driven by any transport, and adding a new agent means creating a new file following an established pattern.

## Related JTBDs

None — this is a standalone refactoring job.
