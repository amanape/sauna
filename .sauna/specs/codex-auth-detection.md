# Codex Auth Detection

## Overview

`CodexProvider.isAvailable()` must recognise all three authentication methods the Codex CLI supports: `OPENAI_API_KEY` env var, `CODEX_API_KEY` env var, and subscription-based auth stored in `~/.codex/auth.json` by `codex login`.

## Background

The `@openai/codex-sdk` spawns a bundled `codex` binary as a subprocess. When no `apiKey` is passed to `new Codex()`, the CLI reads `~/.codex/auth.json` for OAuth subscription tokens. The current `isAvailable()` only checks env vars, so subscription-only users are blocked with a misleading error.

## Acceptance Criteria

- `isAvailable()` returns `true` when `OPENAI_API_KEY` is set (existing behaviour, no regression)
- `isAvailable()` returns `true` when `CODEX_API_KEY` is set (existing behaviour, no regression)
- `isAvailable()` returns `true` when `~/.codex/auth.json` exists and neither env var is set
- `isAvailable()` returns `true` when `CODEX_HOME` is set and `$CODEX_HOME/auth.json` exists
- `isAvailable()` returns `false` when no env vars are set and no `auth.json` exists at the resolved path
- `isAvailable()` never throws — if `homedir()` or `existsSync()` throws, the exception is caught and `false` is returned
- The error message thrown by `createSession()` when unavailable mentions all three options: `OPENAI_API_KEY`, `CODEX_API_KEY`, and `codex login`
- The CLI-level error message in `index.ts` for Codex unavailability also mentions `codex login`
- The file contents of `auth.json` are not validated — existence alone is sufficient (the Codex binary handles token validation and refresh internally)
- The existing `returns false` test must set `CODEX_HOME` to an empty temp dir (or nonexistent path) to prevent the host machine's real `~/.codex/auth.json` from causing a false positive

## Constraints

- Uses `existsSync` from `node:fs` for the synchronous check (the method signature is `boolean`, not async)
- Uses `homedir()` from `node:os` for the default home directory (not `Bun.env.HOME`, which may be unset)
- `CODEX_HOME` takes precedence over `homedir()` when set, matching the Codex CLI's own behaviour
- The entire auth.json check is wrapped in try/catch to uphold the never-throws contract

## Dependencies

None — this spec is standalone and can be implemented first.

## Files

- `src/providers/codex.ts` (modified — `isAvailable()`, `createSession()` error message)
- `index.ts` (modified — error message)
- `tests/codex.test.ts` (modified — new auth.json tests, updated existing `returns false` test, updated error assertions)
