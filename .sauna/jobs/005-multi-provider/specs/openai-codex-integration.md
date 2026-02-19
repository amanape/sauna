# OpenAI Codex Integration

## Overview
Add OpenAI Codex as a second provider alongside Anthropic Claude, using the official Codex TypeScript SDK (`@openai/codex-sdk`). This mirrors the existing Claude Agent SDK integration pattern so that both providers share the same loop, streaming, and interactive architecture.

## Current Architecture (Do Not Break)
The current codebase resolves the Claude Code executable once at startup in `index.ts` via `findClaude()` and passes `claudePath` to both `runSession()` and `runInteractive()`. The session module (`src/session.ts`) calls the Claude Agent SDK `query()` function. The loop module (`src/loop.ts`) accepts a `SessionFactory` that returns an `AsyncGenerator<any>`. The stream module (`src/stream.ts`) processes messages via `processMessage()` and tracks state via `StreamState`. All error output goes to a separate `errWrite` callback targeting stderr.

## Files Changed

### New files added

| File | Purpose |
|---|---|
| `src/codex-session.ts` | Single-turn Codex session factory returning an adapted `AsyncGenerator` |
| `src/codex-stream-adapter.ts` | Translates Codex SDK streaming events into sauna's internal message format |
| `src/codex-interactive.ts` | Multi-turn interactive REPL using Codex thread continuations |

### Existing files modified

| File | Change |
|---|---|
| `src/cli.ts` | Replace `resolveModel()` with `resolveProvider()` (accepts optional `errWrite` second arg) |
| `index.ts` (root) | Update dispatch logic: call `resolveProvider()`, conditionally call `findClaude()`, route to Codex session/interactive when provider is `"openai"` |
| `package.json` | Add `@openai/codex-sdk` to `dependencies` |

### Files NOT modified

`src/session.ts`, `src/loop.ts`, `src/stream.ts`, `src/interactive.ts`, `src/claude.ts` — these are unchanged. The new Codex path reuses `buildPrompt()` from `src/session.ts` and the formatting/processing functions from `src/stream.ts`.

## SAUNA_DRY_RUN Format

`SAUNA_DRY_RUN=1` continues to work. The JSON output is extended to include the resolved provider and model so callers can verify routing decisions:

```json
{
  "prompt": "hello",
  "model": "openai:gpt-4o",
  "provider": "openai",
  "resolvedModel": "gpt-4o",
  "forever": false,
  "count": null,
  "interactive": false,
  "context": []
}
```

`model` is the raw CLI flag value. `provider` and `resolvedModel` are the outputs of `resolveProvider()`. Existing tests that check `model` in the dry-run output are unaffected; they must also gain assertions for `provider` and `resolvedModel` where relevant.

## User Experience

### Model Selection Syntax
Users select providers using colon-separated format on the `--model` flag:

```
bun run index.ts --model openai:gpt-4o "prompt"
bun run index.ts --model openai:o1 "prompt"
```

Existing Claude usage remains unchanged:
```
bun run index.ts --model sonnet "prompt"
bun run index.ts --model opus "prompt"
bun run index.ts --model anthropic:sonnet "prompt"  (optional explicit prefix)
```

### Short Aliases
Common models should have short aliases that auto-detect the provider:

```
sonnet    → anthropic:claude-sonnet-4-20250514
opus      → anthropic:claude-opus-4-20250514
haiku     → anthropic:claude-haiku-4-20250414
gpt-4o    → openai:gpt-4o
o1        → openai:o1
```

### API Key Configuration
OpenAI API key via environment variable (Bun auto-loads .env):

```
OPENAI_API_KEY=sk-...
```

If the key is missing when an OpenAI model is selected, sauna should print a clear error to stderr:
```
error: OPENAI_API_KEY is not set.
Set it in your .env file or run: export OPENAI_API_KEY=sk-...
```

## Acceptance Criteria

- [ ] `--model openai:gpt-4o "prompt"` runs a Codex agent session and returns output
- [ ] `--model gpt-4o "prompt"` auto-detects OpenAI provider via alias
- [ ] `--model sonnet "prompt"` continues to work exactly as before (no regressions)
- [ ] OpenAI sessions work with `--count N` loop mode
- [ ] OpenAI sessions work with `--forever` loop mode
- [ ] OpenAI sessions work with `--interactive` mode (via `runCodexInteractive()`)
- [ ] OpenAI sessions work with `--context` flag (context paths prepended to first prompt)
- [ ] Missing OPENAI_API_KEY shows a helpful error message to stderr
- [ ] Token usage and duration are displayed after each OpenAI session (same format as Claude)
- [ ] All existing tests continue to pass
- [ ] `SAUNA_DRY_RUN=1` output includes `provider` and `resolvedModel` fields
- [ ] `src/loop.ts` and `src/stream.ts` are not modified
- [ ] The `claude` binary is not required when using an OpenAI model

## Edge Cases

- User provides invalid OpenAI model name: show clear error listing valid models
- User provides `--model unknown:something`: show clear error listing valid providers
- OpenAI API returns a rate limit error: display the error clearly and continue to next loop iteration
- OpenAI API key is invalid: show authentication error with instructions
- Codex SDK not installed: show clear error with install instructions

## Constraints

- Do NOT break any existing Claude functionality
- Do NOT remove or rename `findClaude()` in `src/claude.ts`
- Do NOT change the `.sauna/jobs/` structure, prompts, or scripts
- Do NOT change the `--model` flag type — it remains a single String flag
- The loop, streaming, and interactive systems should be provider-agnostic where possible
- Error output must go through `errWrite` (stderr), not `write` (stdout)
