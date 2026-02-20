# CLI Provider Integration

## Overview

The CLI entry point adds a `--provider` flag and uses the provider system to dispatch sessions.

## Acceptance Criteria

- A new `--provider` / `-p` flag is added accepting a string value
- The help description changes from "A lightweight CLI wrapper around the Claude Agent SDK" to "A lightweight CLI wrapper for AI coding agents"
- `--model` description updates to mention Codex models alongside Claude models
- `findClaude()` is no longer called directly — replaced by `resolveProvider()` + `provider.isAvailable()` check
- The session factory becomes `() => provider.createSession({ prompt, model, context })` instead of `() => runSession({ prompt, model, context, claudePath })`
- `SAUNA_DRY_RUN=1` JSON output includes `provider` field (the provider name string)
- Import of `findClaude` from `./src/claude` is removed
- Import of `runSession` from `./src/session` is removed
- Import of `resolveModel` from `./src/cli` is replaced by provider-scoped resolution
- `--interactive` mode continues to use Claude only (no provider dispatch) until interactive mode is extended
- All existing CLI validation (--count, --forever, --interactive mutual exclusivity) is unchanged
- Alias expansion is unchanged

## Edge Cases

- `--provider codex --interactive`: error message telling user interactive mode is not yet supported for Codex
- `--provider invalidname`: error listing valid providers
- No prompt and no --interactive: shows help (unchanged behavior)

## Constraints

- `src/claude.ts` is deleted (absorbed into `src/providers/claude.ts`)
- `src/session.ts` is deleted (`buildPrompt` moves to `src/prompt.ts`, `runSession` moves into ClaudeProvider)
- `src/cli.ts` is deleted or reduced to a thin re-export

## Files

- `index.ts` (modified)
- `package.json` (add `@openai/codex-sdk` dependency)
