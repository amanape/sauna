# Claude Provider

## Overview

The `ClaudeProvider` implements the `Provider` interface by locating the Claude Code binary and running sessions via the Claude Agent SDK.

## Acceptance Criteria

- `name` is `"claude"`
- `isAvailable()` returns `true` if `which claude` succeeds and the path resolves through symlinks; returns `false` otherwise (never throws)
- `createSession(config)` returns an `AsyncGenerator<ProviderEvent>` that:
  - Builds the full prompt via shared `buildPrompt(prompt, context)` (e.g., `Context: ./src\n\nfix the bug`)
  - Calls `query()` from `@anthropic-ai/claude-agent-sdk` with `pathToClaudeCodeExecutable`, `systemPrompt: { type: 'preset', preset: 'claude_code' }`, `settingSources: ['user', 'project']`, `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `includePartialMessages: true`
  - Passes `model` to the SDK only when `config.model` is defined
  - Yields `ProviderEvent` objects by piping each SDK message through the Claude event adapter
- When `isAvailable()` returns `false`, calling `createSession()` throws with a descriptive error message mentioning Claude Code installation
- `resolveModel()` delegates to the Claude alias map (see model-alias-resolution spec)
- `knownAliases()` returns the Claude alias map

## Edge Cases

- Claude binary is a dangling symlink: `isAvailable()` returns `false`
- `claude` exists on `$PATH` but is not executable: `isAvailable()` returns `false`
- Multiple `claude` binaries on `$PATH`: first one wins (standard `which` behavior)
- Authentication failure during session: SDK error propagates as a `result` event with `success: false`

## Constraints

- `findClaude()` logic (from current `src/claude.ts`) is absorbed into this provider — `src/claude.ts` is deleted
- `runSession()` logic (from current `src/session.ts`) is absorbed — `src/session.ts` is deleted
- `buildPrompt()` is extracted to a shared `src/prompt.ts` (provider-agnostic)
- No fallback search beyond `$PATH` for the binary

## Files

- `src/providers/claude.ts` (new, absorbs `src/claude.ts` + `src/session.ts`)
- `src/prompt.ts` (new, extracts `buildPrompt()` from `src/session.ts`)
