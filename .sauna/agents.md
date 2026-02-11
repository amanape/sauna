# Agent Operations

## Build & Test

- **Run tests:** `bun test`
- **Type-check:** `bunx tsc --noEmit`
- **Run the CLI:** `bun run src/cli.ts` (requires `TAVILY_API_KEY` and an LLM provider key in env)

## Key Paths

- `src/cli.ts` — entry point / main()
- `src/mcp-client.ts` — MCP client factory (Tavily + Context7)
- `src/agent-definitions.ts` — agent factories
- `src/session-runner.ts` — conversation loop

## Conventions

- Bun, not Node. No dotenv (Bun loads `.env` automatically).
- All functions accept injected env records; `process.env` is only used at the `main()` boundary.
- MCP integration tests auto-skip when `TAVILY_API_KEY` is absent.
