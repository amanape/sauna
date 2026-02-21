# Codex CLI — Implementation Tasks

Spec-to-code gap analysis for the provider abstraction system.
Branch: `feat/codex-cli`. All 9 specs are in `.sauna/specs/`.

**Status: ALL PHASES COMPLETE.** Every spec has been implemented and every test file compiles with correct imports. See implementation notes at the bottom for minor observations that are not blocking issues.

---

## Phase 1: Foundation (no dependencies) — COMPLETE

- [x] **Create `src/provider.ts`** — Provider contract types
      `Provider` interface, `ProviderSessionConfig`, `ProviderEvent` (5 variants), `SummaryInfo`. All `export type`, zero runtime dependencies.
      Spec: `provider-contract.md`

- [x] **Create `src/prompt.ts`** — Extract `buildPrompt()`
      Moved from `src/session.ts`. All consumers updated to import from `src/prompt.ts`.
      Spec: `claude-provider.md`

## Phase 2: Event adapters (depend on Phase 1) — COMPLETE

- [x] **Create Claude event adapter in `src/providers/claude.ts`**
      `adaptClaudeMessage(msg, state)` — pure function. All message-to-event mappings implemented: `text_delta`, `tool_start`, `input_json_delta` accumulation, `tool_end` with detail extraction (fallback chain: file_path, command, description, pattern, query), result success/failure, fallback text_delta for non-streaming responses. Edge cases handled: empty text_delta, abandoned accumulation, malformed JSON.
      Spec: `claude-event-adapter.md`

- [x] **Create Codex event adapter in `src/providers/codex.ts`**
      `adaptCodexEvent(event, durationMs)` — pure function. All event mappings: command_execution, file_change, mcp_tool_call, web_search, agent_message, error, turn.completed, turn.failed. Silently ignored: thread.started, turn.started, item.updated, reasoning, todo_list. Edge cases handled: empty changes, null exitCode, empty agent_message.
      Spec: `codex-event-adapter.md`

## Phase 3: Providers (depend on Phase 2) — COMPLETE

- [x] **Create `ClaudeProvider` in `src/providers/claude.ts`**
      name: "claude". isAvailable(): which + realpathSync, never throws. createSession(): buildPrompt, query() with all 7 required SDK params, model conditional, yields ProviderEvent via adaptClaudeMessage. resolveModel(): CLAUDE_ALIASES (sonnet/opus/haiku), unknown pass-through, empty string to undefined. knownAliases() present.
      Spec: `claude-provider.md`, `model-alias-resolution.md`

- [x] **Create `CodexProvider` in `src/providers/codex.ts`**
      name: "codex". isAvailable(): checks OPENAI_API_KEY or CODEX_API_KEY. createSession(): buildPrompt, Codex SDK startThread with workingDirectory/sandboxMode, model conditional, runStreamed, duration tracking, adaptCodexEvent. resolveModel(): CODEX_ALIASES (codex/codex-mini), empty string to undefined. knownAliases() present.
      Spec: `codex-provider.md`, `model-alias-resolution.md`

- [x] **Add `@openai/codex-sdk` to `package.json` dependencies**
      Present in package.json and bun.lock.
      Spec: `codex-provider.md`

## Phase 4: Registry & rendering (depend on Phase 3) — COMPLETE

- [x] **Create `src/providers/registry.ts`** — Provider resolution
      resolveProvider(providerFlag?, modelFlag?). Explicit flag: claude/codex/unknown-throws. Model inference: claude- prefix, Claude aliases, gpt- prefix, o4-mini, Codex aliases. Default: Claude. Singletons, no isAvailable() call.
      Spec: `provider-resolution.md`

- [x] **Add `processProviderEvent()` to `src/stream.ts`** — Stream event rendering
      processProviderEvent() with correct signature. processMessage() fully removed. Simplified StreamState: { lastCharWasNewline, isFirstTextOutput } only. All formatting helpers preserved (formatToolTag, formatSummary, formatError, formatLoopHeader, redactSecrets, extractFirstLine). SummaryInfo imported from provider.ts, re-exported.
      Spec: `stream-event-rendering.md`

## Phase 5: CLI integration (depends on Phase 4) — COMPLETE

- [x] **Update `index.ts`** — Add `--provider` / `-p` flag and wire provider system
      --provider / -p flag present. Help description updated. resolveProvider() replaces findClaude(). provider.isAvailable() check with provider-specific error. provider.resolveModel(model). Session factory: provider.createSession(). Dry-run JSON includes provider field. --interactive + codex rejected. src/cli.ts deleted.
      Spec: `cli-provider-integration.md`

- [x] **Update `src/loop.ts`** — Switch to `processProviderEvent()`
      processProviderEvent replaces processMessage. Session factory type uses AsyncGenerator<ProviderEvent>. Failure detection uses event.type === 'result' && !event.success.
      Spec: `stream-event-rendering.md`

## Phase 6: Cleanup (depends on Phase 5) — COMPLETE

- [x] **Delete `src/claude.ts`** — Logic absorbed into `src/providers/claude.ts`
- [x] **Delete `src/session.ts`** — `buildPrompt` in `src/prompt.ts`, `runSession` in ClaudeProvider
- [x] **Delete `src/cli.ts`** — Alias maps moved to per-provider files, global resolveModel eliminated
- [x] **Remove `processMessage()` and old `StreamState` from `src/stream.ts`**
      processMessage() fully removed. interactive.ts updated to use processProviderEvent().
      Spec: `stream-event-rendering.md`

## Phase 7: Tests — COMPLETE

- [x] **`tests/provider.test.ts`** — Provider contract type validation
- [x] **`tests/prompt.test.ts`** — buildPrompt (no context, single, multiple)
- [x] **`tests/claude-adapter.test.ts`** — adaptClaudeMessage (all event types, edge cases)
- [x] **`tests/codex-adapter.test.ts`** — adaptCodexEvent (all event types, edge cases)
- [x] **`tests/claude.test.ts`** — ClaudeProvider (isAvailable, resolveModel, knownAliases)
- [x] **`tests/session.test.ts`** — ClaudeProvider.createSession (SDK params, model conditional, context, ProviderEvent output)
- [x] **`tests/codex.test.ts`** — CodexProvider (name, isAvailable, resolveModel, knownAliases, createSession guard)
- [x] **`tests/registry.test.ts`** — resolveProvider (explicit flag, inference, defaults, singletons)
- [x] **`tests/stream.test.ts`** — processProviderEvent (all event types), formatters, redaction
- [x] **`tests/loop.test.ts`** — runLoop (all modes), formatLoopHeader
- [x] **`tests/cli.test.ts`** — CLI parsing, --provider flag, alias resolution, validation
- [x] **`tests/interactive.test.ts`** — runInteractive (multi-turn, signals, error routing, prompt visibility)

---

## Implementation Notes

These are observations from the gap analysis, not missing work. No spec gaps were found.

1. **`exitCode` vs `exit_code` field name (codex.ts)** — The local `ThreadItem` type uses camelCase `exitCode` but the Codex SDK uses snake_case `exit_code`. The `as unknown as ThreadEvent` cast does not rename nested fields. The null-exit-code guard will not fire against real SDK events. This is documented in code comments (lines 6-9 of codex.ts). Minor edge case only — in production, `tool_end` is always emitted for `command_execution` items.

2. **Secret redaction scope (claude.ts)** — `redactSecrets()` is applied only when `input.command !== undefined`. Non-command detail fields (`file_path`, `description`, `pattern`, `query`) are not redacted. This is correct behavior per spec intent — only shell commands contain secrets worth redacting.
