# Tasks

## Priority 2 — Codex auth detection

- [x] **Codex auth detection** (`codex-auth-detection`) — DONE
  - `isAvailable()` checks `OPENAI_API_KEY`, `CODEX_API_KEY`, and `~/.codex/auth.json` (or `$CODEX_HOME/auth.json`)
  - Never throws; wraps everything in try/catch
  - Error messages in `createSession()` + `index.ts` mention all three options including `codex login`
  - Files: `src/providers/codex.ts`, `index.ts`, `tests/codex.test.ts`

## Priority 3 — Provider sessions

- [x] **Claude interactive session** (`claude-interactive-session`) — DONE
- [x] **Codex interactive session** (`codex-interactive-session`) — DONE

## Priority 4 — REPL refactor

- [x] **Interactive REPL abstraction** (`interactive-repl-abstraction`) — DONE
  - Removed Claude SDK imports from `interactive.ts`
  - Removed `createMessageChannel()`, `QueryOptions` export
  - `InteractiveConfig.provider: Provider` (was `claudePath`)
  - `InteractiveOverrides.session?: InteractiveSession` (was `createQuery?`)
  - REPL loop uses `session.send()` + `session.stream()`
  - Tests rewritten: `createMockSession()` + `ProviderEvent` fixtures, 3 query-option tests removed (covered in session.test.ts)
  - Files: `src/interactive.ts`, `tests/interactive.test.ts`

## Priority 5 — Final integration

- [x] **CLI interactive provider wiring** (`cli-interactive-provider-wiring`) — DONE
  - Removed `realpathSync`/`execSync` imports from `index.ts`
  - Removed the `if (provider.name === "codex" && interactive)` guard
  - Removed Claude path resolution block from interactive branch
  - `runInteractive({ prompt, model, context, provider })` wired correctly
  - `tests/cli.test.ts`: `--provider codex --interactive` now succeeds (exit 0, `provider: "codex"`, `interactive: true`)
  - Files: `index.ts`, `tests/cli.test.ts`
