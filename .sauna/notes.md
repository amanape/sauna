# Notes

## codex-auth-detection (done)

- `isAvailable()` checks `OPENAI_API_KEY`, `CODEX_API_KEY`, then `$CODEX_HOME/auth.json` (or `~/.codex/auth.json` via `homedir()`).
- Entire auth.json check is wrapped in try/catch — method never throws.
- File existence alone is sufficient; contents are not validated.
- Error messages in `createSession()`, `createInteractiveSession()`, and `index.ts` all mention all three options: `OPENAI_API_KEY`, `CODEX_API_KEY`, and `codex login`.
- The `returns false` test sets `CODEX_HOME` to an empty temp dir to prevent host machine's real `~/.codex/auth.json` from causing a false positive.
- Was already implemented alongside the codex-interactive-session work; retroactively documented here.

## interactive-session-contract (done)

- Added `InteractiveSessionConfig`, `InteractiveSession` types and `createInteractiveSession` to `src/provider.ts`.
- Added `createInteractiveSession` as a **required** method on the `Provider` type — all providers must implement it.
- Added stubs to `ClaudeProvider` and `CodexProvider` (throw "not yet implemented") to satisfy TypeScript until the real implementations land in `claude-interactive-session` and `codex-interactive-session` tasks.
- Tests in `tests/provider.test.ts`: `InteractiveSessionConfig` shape, `InteractiveSession` method existence, `stream()` yields `ProviderEvent`, mock `Provider` round-trips through `createInteractiveSession`.
- bun strips `import type` at runtime — type-only TDD tests always pass at runtime. Validate by temporarily breaking an assertion, not the import.

## codex-interactive-session (done)

- `CodexProvider.createInteractiveSession()` creates a `Codex` client and `Thread` at construction time; throws synchronously if `isAvailable()` is false.
- `send()` stores a pending message; first call uses `buildPrompt(message, context)`, subsequent calls store raw input.
- `stream()` calls `thread.runStreamed(pendingMessage)` per turn and adapts events via `adaptCodexEvent()`.
- `close()` is a no-op — the Codex CLI process exits naturally after each `runStreamed()` turn.
- **`@openai/codex-sdk` is ESM-only** (`"type": "module"`) — `require()` on it silently exits in Bun's `-e` subprocess mode. Tests that need to mock it must use a temp `.test.ts` file run via `bun test`, which supports `mock.module()` for ESM interop.
- `require()` of an ESM-only package in Bun `-e` scripts: the process exits silently with code 0 after the require call — no error, no output. This is the tell-tale sign of an ESM-only package.

## claude-interactive-session (done)

- `ClaudeProvider.createInteractiveSession()` creates a message channel and calls `query()` once at construction time.
- `send()`: first call uses `buildPrompt(message, config.context)`; subsequent calls push raw input with the captured `session_id`.
- `stream()`: resets `ClaudeAdapterState` per turn, captures `session_id` from messages, adapts via `adaptClaudeMessage()`, returns after a `result` message.
- `close()` delegates to `q.close()` on the underlying query generator.
- `createMessageChannel()` is now defined in `src/providers/claude.ts` (copied from `interactive.ts`; removal from `interactive.ts` is deferred to `interactive-repl-abstraction`).
- Tests in `tests/session.test.ts`: options check, model omission, first-send buildPrompt (via channel inspection), close tracking (via `Object.assign` on the mock generator).

## interactive-repl-abstraction (done)

- `src/interactive.ts` is now provider-agnostic — no Claude SDK imports, no `adaptClaudeMessage`, no `buildPrompt`.
- `InteractiveConfig` uses `provider: Provider` instead of `claudePath: string`.
- `InteractiveOverrides` uses `session?: InteractiveSession` instead of `createQuery?`.
- Session is created via `overrides?.session ?? config.provider.createInteractiveSession({ model, context })`.
- REPL loop: `session.send()` then `for await (event of session.stream())` per turn; `createStreamState()` reset at start of each follow-up.
- `createMessageChannel()` and all Claude SDK imports were moved to `src/providers/claude.ts`.
- `tests/interactive.test.ts` now uses `createMockSession()` with queued `ProviderEvent[]` turns; `mock.module("@anthropic-ai/claude-agent-sdk")` removed.

## cli-interactive-provider-wiring (done)

- `index.ts` no longer imports `realpathSync` or `execSync` (those were only used in the removed Claude path resolution block).
- The `if (provider.name === "codex" && interactive)` guard blocking Codex from interactive mode is gone.
- `runInteractive()` is called with `{ prompt, model, context, provider }` — provider-agnostic.
- All providers reach the same `runInteractive()` code path via `Provider.createInteractiveSession()`.
- Test: `--provider codex --interactive` in dry-run succeeds with exit 0, JSON includes `provider: "codex"` and `interactive: true`.
