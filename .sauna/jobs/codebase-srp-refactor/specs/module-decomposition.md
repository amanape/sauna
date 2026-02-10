# Module Decomposition — Break the God File into Focused Modules

## What This Component Does

The current `src/cli.ts` file carries 8 responsibilities that change for different reasons. This spec defines how those responsibilities should be separated into distinct modules, each with a single reason to change. The goal is a file structure where a developer can find the right place to make a change without reading unrelated code, and where adding a new agent or transport doesn't require touching shared infrastructure.

## Requirements

### Module Boundaries

- The CLI adapter module must contain only CLI-specific concerns: argument parsing (`parseCliArgs`), the readline-based conversation transport, and the `main()` entry point that wires everything together.
- The session runner module must contain the transport-agnostic conversation logic: accepting a user message, passing accumulated messages to `agent.stream()`, processing step callbacks, and returning the response. It must not import or reference any I/O primitives (readline, stdin, stdout, `Readable`, `Writable`).
- The agent definitions module must contain the factory functions for creating agents (`createDiscoveryAgent`, `createResearchAgent`) and their associated config types. This establishes the pattern that future agents (planner, builder) will follow — one module per agent or a shared agents module.
- The workspace factory module must contain `createWorkspace` and its `WorkspaceOptions` type.
- The tool factory module must contain `createTools` and `resolveSearchFn`. It must accept the search function or the API key as an explicit parameter — not read from `process.env`.
- The model resolution module must contain `getProviderFromModel`, `getApiKeyEnvVar`, `validateApiKey`, and the `DEFAULT_MODEL` constant. `validateApiKey` must accept an environment record as a parameter rather than reading `process.env` directly.

### Dependency Direction

- The CLI adapter module may depend on all other modules (it's the composition root).
- The session runner must not depend on the CLI adapter.
- Agent definitions may depend on the tool factory, workspace factory, and model resolution modules.
- No circular dependencies between any modules.

### Entry Point

- `index.ts` must remain the entry point and must import from the CLI adapter module (or whatever the new composition root is called).

### Naming and Location

- All new modules must live under `src/`.
- Module names must reflect their responsibility (not their implementation). For example, the session runner should be named for what it does (running a session/conversation), not how it does it (streaming, looping).

## Constraints

- This is a structural refactoring — no behavior changes. Every public function that exists today must still be importable and work identically.
- The `.sauna/` directory must not be modified.
- The tools modules (`src/tools/web-search.ts`, `src/tools/search-backends.ts`) and `src/output-constrained-filesystem.ts` are already well-structured and must not be restructurally changed (only dead import/comment cleanup per the dead-code-cleanup spec).
