# Codex Provider

## Overview

The `CodexProvider` implements the `Provider` interface by creating a Codex SDK client and running single-turn sessions via `Thread.runStreamed()`.

## Acceptance Criteria

- `name` is `"codex"`
- `isAvailable()` returns `true` if `OPENAI_API_KEY` or `CODEX_API_KEY` is set in the environment; returns `false` otherwise (never throws)
- `createSession(config)` returns an `AsyncGenerator<ProviderEvent>` that:
  - Creates a `Codex` instance from `@openai/codex-sdk` (with API key from environment)
  - Calls `codex.startThread()` with `workingDirectory` set to `process.cwd()` and `sandboxMode: 'workspace-write'`
  - Passes `model` to `startThread()` only when `config.model` is defined
  - Calls `thread.runStreamed()` with the prompt (context paths prepended via shared `buildPrompt()`)
  - Yields `ProviderEvent` objects by piping each `ThreadEvent` through the Codex event adapter
  - Tracks session wall-clock duration for the summary event
- When `isAvailable()` returns `false`, calling `createSession()` throws with a descriptive error message mentioning `OPENAI_API_KEY`
- `resolveModel()` delegates to the Codex alias map (see model-alias-resolution spec)
- `knownAliases()` returns the Codex alias map
- The `@openai/codex-sdk` package is added to `dependencies` in `package.json`

## Edge Cases

- Missing API key at session time (env var removed after availability check): SDK error propagates as `result` with `success: false`
- Codex binary not found by SDK: error propagates with descriptive message
- Network failure mid-session: SDK error propagates

## Constraints

- No interactive/multi-turn support in this spec (deferred)
- The Codex SDK spawns the `codex exec` binary as a subprocess — sauna does not manage this process directly
- Environment variable check uses `Bun.env` per project conventions

## File

`src/providers/codex.ts`
