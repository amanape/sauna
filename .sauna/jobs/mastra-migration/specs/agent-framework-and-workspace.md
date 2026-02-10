# Agent Framework and Workspace

## What This Component Does

This is the foundational layer that replaces the Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) with Mastra (`@mastra/core`) and configures a shared workspace that provides tools to all agents.

## Requirements

### Framework

- The project must use Mastra (`@mastra/core`) as the agent framework.
- The `ai`, `@ai-sdk/anthropic` npm dependencies must be removed from `package.json`.
- The hand-rolled tool files (`src/tools/file-read.ts`, `src/tools/file-write.ts`, `src/tools/web-search.ts`) and their corresponding test files must be deleted.

### Workspace

- A workspace must be configured with filesystem access and shell/sandbox execution.
- The workspace filesystem must be scoped to a configurable base path (the codebase directory passed via CLI).
- The workspace sandbox must provide shell command execution.
- Agents that receive the workspace must automatically have access to: file read, file write, file edit, directory listing, and shell command execution — without manually defining these tools.

### Web Search

- A web search tool must be available to agents.
- Since Mastra does not include a built-in web search tool, one must be provided — either as a custom Mastra tool, a provider-native tool (e.g., Anthropic or OpenAI web search), or via an MCP server.
- The choice of search backend should be configurable or injectable, not hardcoded to a single provider.

### Provider Agnosticism

- The model and provider for each agent must be configurable without code changes.
- At minimum, Anthropic and OpenAI providers must be supported.
- The default model should remain Claude Sonnet (currently `claude-sonnet-4-5-20250929`) but must be overridable via CLI argument or configuration.

### Output Directory

- The discovery agent's file write operations for specs and JTBDs must target a configurable output directory (currently `--output`, defaulting to `./jobs/`).
- Write operations for spec output must be constrained to this output directory.

## Constraints

- Runtime is Bun, not Node.js.
- TypeScript strict mode, ESNext target.
- Zod is used for schema validation (Mastra uses Zod natively, so this should carry forward).
