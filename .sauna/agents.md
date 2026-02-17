# Agents — Operational Reference

## Commands
- `bun test` — run all tests
- `bun test setup.test.ts` — run P0 setup + P5 binary compilation tests
- `bun test cli.test.ts` — run P1 CLI parsing tests
- `bun test session.test.ts` — run P2 agent session tests
- `bun test stream.test.ts` — run P3 streaming output tests
- `bun test loop.test.ts` — run P4 loop mode tests
- `bun run build` — compile standalone `sauna` binary
- `bunx tsc --noEmit` — type check without emitting
- `bun index.ts "prompt"` — run the CLI in development mode (requires a prompt argument)
- `bun index.ts -i` — start interactive multi-turn mode (prompt optional)
- `bun index.ts -i "initial prompt"` — start interactive mode with an initial prompt
- `SAUNA_DRY_RUN=1 bun index.ts "prompt"` — print parsed config as JSON and exit (for testing)
- `bun test tests/interactive.test.ts` — run interactive mode tests
- `bun test tests/claude.test.ts` — run P0 claude resolution tests

## Dependencies
- `cleye@2.2.1` — CLI argument parsing
- `@anthropic-ai/claude-agent-sdk@0.2.42` — Claude agent session

## Modules
- `src/claude.ts` — `findClaude()` resolves the Claude Code executable path; called once from `index.ts` at startup
- `index.ts` — CLI entry point; calls `findClaude()` at startup and passes resolved `claudePath` to `runLoop`/`runInteractive`
