# Codex CLI — Implementation Tasks

Spec-to-code gap analysis for the provider abstraction system.
Branch: `feat/codex-cli`. All 9 specs are in `.sauna/specs/`.

---

## Phase 1: Foundation (no dependencies)

- [ ] **Create `src/provider.ts`** — Provider contract types
  Export `Provider` interface, `ProviderSessionConfig`, `ProviderEvent` discriminated union, `SummaryInfo` type.
  `Provider` interface: `name: string`, `isAvailable(): boolean`, `resolveModel(alias?: string): string | undefined`, `knownAliases(): Record<string, string>`, `createSession(config: ProviderSessionConfig): AsyncGenerator<ProviderEvent>`.
  `ProviderSessionConfig`: `{ prompt: string, model?: string, context: string[] }`.
  `ProviderEvent` variants: `text_delta`, `tool_start`, `tool_end`, `result`, `error`.
  `SummaryInfo`: `{ inputTokens, outputTokens, numTurns, durationMs }`.
  Move `SummaryInfo` from `src/stream.ts` into this file; update `stream.ts` to import from here.
  All types use `export type`. File has zero runtime dependencies (types only). No provider-specific SDK types.
  Spec: `provider-contract.md` → File: `src/provider.ts`

- [ ] **Create `src/prompt.ts`** — Extract `buildPrompt()`
  Move `buildPrompt()` from `src/session.ts` to a new provider-agnostic `src/prompt.ts`.
  Update `src/session.ts` to re-export `buildPrompt` from `src/prompt.ts` (backward compat for `interactive.ts` during migration).
  Update `src/interactive.ts` import of `buildPrompt` to point to `src/prompt.ts`.
  Spec: `claude-provider.md` (constraint) → File: `src/prompt.ts`

## Phase 2: Event adapters (depend on Phase 1)

- [ ] **Create Claude event adapter in `src/providers/claude.ts`**
  Pure function: `adaptClaudeMessage(msg, state: ClaudeAdapterState) → ProviderEvent[]`.
  Converts Claude SDK `stream_event` and `result` messages to `ProviderEvent` objects.
  Handles: `content_block_delta` + `text_delta` → `text_delta`, `content_block_start` + `tool_use` → `tool_start` + begin JSON accumulation, `input_json_delta` → accumulate (no event), `content_block_stop` → `tool_end` with detail extraction, `result` success/failure → `result` event.
  Detail extraction fallback chain: `file_path`, `command`, `description`, `pattern`, `query`. Only first line used. Commands redacted via `redactSecrets()`.
  Fallback: if no text emitted and `result.result` has text, emit `text_delta` before `result`.
  Edge cases: empty `text_delta` (skip), abandoned accumulation on new `content_block_start`, malformed JSON (no detail, no crash).
  State: `{ pendingToolName: string | undefined, pendingToolJson: string, hasEmittedText: boolean }`.
  Reuses `redactSecrets()` and `extractFirstLine()` from `stream.ts`.
  Spec: `claude-event-adapter.md`

- [ ] **Create Codex event adapter in `src/providers/codex.ts`**
  Pure function: `adaptCodexEvent(event: ThreadEvent, durationMs: number) → ProviderEvent[]`.
  Tool mapping:
  - `item.started` + `command_execution` → `tool_start` Bash; `item.completed` + `command_execution` → `tool_end` Bash (detail: redacted command).
  - `item.started` + `file_change` → `tool_start` Edit; `item.completed` + `file_change` → `tool_end` Edit (detail: first changed file path).
  - `item.started` + `mcp_tool_call` → `tool_start` (tool name); `item.completed` + `mcp_tool_call` → `tool_end` (tool name).
  - `item.completed` + `web_search` → `tool_start` WebSearch + `tool_end` WebSearch (detail: query).
  Text/error: `item.completed` + `agent_message` → `text_delta`; `item.completed` + `error` → `error`.
  Lifecycle: `turn.completed` → `result` success (usage from event, numTurns=1, durationMs from caller); `turn.failed` → `result` failure.
  Ignored: `thread.started`, `turn.started`, `item.updated`, `reasoning`, `todo_list`, unknown items.
  Edge cases: empty `changes` array → no detail; null exit code → only `tool_start`; empty `agent_message` text → skip.
  Reuses `redactSecrets()` from `stream.ts`.
  Spec: `codex-event-adapter.md`

## Phase 3: Providers (depend on Phase 2)

- [ ] **Create `ClaudeProvider` in `src/providers/claude.ts`**
  Implements `Provider` interface. `name: "claude"`.
  `isAvailable()`: `which claude` + `realpathSync` (absorbs `src/claude.ts` logic); returns `true`/`false`, never throws. Returns `false` for dangling symlinks and non-executable binaries.
  `createSession(config)`: async generator calling `query()` from SDK with `pathToClaudeCodeExecutable`, `systemPrompt: { type: 'preset', preset: 'claude_code' }`, `settingSources: ['user', 'project']`, `permissionMode: 'bypassPermissions'`, `allowDangerouslySkipPermissions: true`, `includePartialMessages: true`. Passes `model` only when defined. Builds full prompt via `buildPrompt(prompt, context)`. Yields `ProviderEvent` objects by piping each SDK message through `adaptClaudeMessage()`.
  When `isAvailable()` is false, `createSession()` throws with error mentioning Claude Code installation.
  `resolveModel()` / `knownAliases()`: Claude alias map (`sonnet` → `claude-sonnet-4-20250514`, `opus` → `claude-opus-4-20250514`, `haiku` → `claude-haiku-4-20250414`). Unknown names pass through. `undefined`/empty → `undefined`.
  Spec: `claude-provider.md`, `model-alias-resolution.md` → File: `src/providers/claude.ts`

- [ ] **Create `CodexProvider` in `src/providers/codex.ts`**
  Implements `Provider` interface. `name: "codex"`.
  `isAvailable()`: checks `Bun.env.OPENAI_API_KEY` or `Bun.env.CODEX_API_KEY`; returns `true`/`false`, never throws.
  `createSession(config)`: async generator creating `Codex` instance from `@openai/codex-sdk`, calling `codex.startThread()` with `workingDirectory: process.cwd()`, `sandboxMode: 'workspace-write'`. Passes `model` only when defined. Builds full prompt via `buildPrompt(prompt, context)`. Calls `thread.runStreamed()` with the built prompt. Yields `ProviderEvent` objects by piping each `ThreadEvent` through `adaptCodexEvent()`. Tracks wall-clock duration for summary.
  When `isAvailable()` is false, `createSession()` throws with error mentioning `OPENAI_API_KEY`.
  `resolveModel()` / `knownAliases()`: Codex alias map (`codex` → `gpt-5.2-codex`, `codex-mini` → `codex-mini-latest`). Unknown names pass through. `undefined`/empty → `undefined`.
  Spec: `codex-provider.md`, `model-alias-resolution.md` → File: `src/providers/codex.ts`

- [ ] **Add `@openai/codex-sdk` to `package.json` dependencies**
  Run `bun add @openai/codex-sdk` to add the Codex SDK as a runtime dependency.
  Spec: `codex-provider.md`, `cli-provider-integration.md` → File: `package.json`

## Phase 4: Registry & rendering (depend on Phase 3)

- [ ] **Create `src/providers/registry.ts`** — Provider resolution
  `resolveProvider(providerFlag?: string, modelFlag?: string) → Provider`.
  Explicit `--provider` flag wins: `claude` → ClaudeProvider, `codex` → CodexProvider. Unknown value throws with error listing valid providers.
  Model inference when no flag: `claude-*` prefix or Claude aliases (`sonnet`/`opus`/`haiku`) → Claude; `gpt-*` prefix, `o4-mini`, or Codex aliases (`codex`/`codex-mini`) → Codex.
  Default (no flag, no model, or unrecognized model): Claude (backward compat).
  Edge case: `--provider codex --model sonnet` → Codex (explicit flag wins); `sonnet` passed through as raw ID.
  Singleton provider instances (one Claude, one Codex).
  This function only selects the provider — does NOT check `isAvailable()`.
  Spec: `provider-resolution.md`

- [ ] **Add `processProviderEvent()` to `src/stream.ts`** — Stream event rendering
  New function renders `ProviderEvent` objects to terminal with ANSI formatting.
  `text_delta` → gray text (`AGENT_COLOR`); leading blank lines stripped from first text output; newline position tracked.
  `tool_start` → no immediate output.
  `tool_end` → dim bracketed tag on its own line (e.g., `[Bash] ls -la`); newline inserted before tag if previous output didn't end with one.
  `result` success → dim summary line (e.g., `1234 tokens · 3 turns · 2.1s`); newline separator if needed.
  `result` failure → red error from `errors` array; written to `errWrite` if provided.
  `error` → red error to `errWrite` if provided.
  `tool_end` without preceding `tool_start`: still displayed (no crash).
  Simplified `StreamState`: `{ lastCharWasNewline: boolean; isFirstTextOutput: boolean }` — remove `pendingToolName`/`pendingToolJson` (moved to adapter state).
  Keep all existing formatting helpers (`formatToolTag`, `formatSummary`, `formatLoopHeader`, `formatError`, `redactSecrets`, `extractFirstLine`).
  Keep `processMessage()` and old `StreamState`/`createStreamState()` temporarily for `interactive.ts` compat (removed in Phase 6).
  Spec: `stream-event-rendering.md`

## Phase 5: CLI integration (depends on Phase 4)

- [ ] **Update `index.ts`** — Add `--provider` / `-p` flag and wire provider system
  Add `--provider` / `-p` flag accepting a string value.
  Update help description: `"A lightweight CLI wrapper around the Claude Agent SDK"` → `"A lightweight CLI wrapper for AI coding agents"`.
  Update `--model` description to mention Codex models alongside Claude models.
  Provider selection: `resolveProvider(providerFlag, modelFlag)` replaces direct `findClaude()`.
  After resolution: `provider.isAvailable()` check → if false, exit with provider-specific error (e.g., "Install Claude Code" or "Set OPENAI_API_KEY").
  Model resolution: `provider.resolveModel(model)` replaces global `resolveModel()`.
  Session factory: `() => provider.createSession({ prompt, model, context })` replaces `() => runSession({ prompt, model, context, claudePath })`.
  Dry-run JSON: add `provider` field (e.g., `{ "prompt": "...", "model": "...", "provider": "claude" }`).
  `--provider codex --interactive` → error message saying interactive mode not yet supported for Codex.
  `--provider invalidname` → error from `resolveProvider()` listing valid providers.
  All existing validation (`--count`, `--forever`, `--interactive` mutual exclusivity) unchanged.
  Alias expansion unchanged.
  Remove imports: `resolveModel` from `./src/cli`, `findClaude` from `./src/claude`, `runSession` from `./src/session`.
  Add imports: `resolveProvider` from `./src/providers/registry`.
  Spec: `cli-provider-integration.md`

- [ ] **Update `src/loop.ts`** — Switch to `processProviderEvent()`
  Replace `processMessage(msg, ...)` calls with `processProviderEvent(event, ...)`.
  Update imports: `processProviderEvent` replaces `processMessage`; use new simplified `createStreamState()`.
  Session factory type: `() => AsyncGenerator<ProviderEvent>` instead of `AsyncGenerator<any>`.
  Update single-run failure detection: `event.type === 'result' && !event.success` replaces `msg.type === "result" && msg.subtype !== "success"`.
  Spec: `stream-event-rendering.md` (constraint)

## Phase 6: Cleanup (depends on Phase 5)

- [ ] **Delete `src/claude.ts`** — Logic absorbed into `src/providers/claude.ts`
  Verify no remaining imports reference this file.

- [ ] **Delete `src/session.ts`** — `buildPrompt` in `src/prompt.ts`, `runSession` in ClaudeProvider
  Verify no remaining imports reference this file.
  Update `src/interactive.ts` if it still imports from `./session` — change to `./prompt` for `buildPrompt`.

- [ ] **Delete or reduce `src/cli.ts`** — Alias maps moved to per-provider files
  `resolveModel()` is no longer needed (replaced by per-provider `resolveModel()`).
  Verify no remaining imports reference `resolveModel` from this file.

- [ ] **Remove `processMessage()` and old `StreamState` from `src/stream.ts`**
  Delete `processMessage()`, old `StreamState` type (4-field version), and old `createStreamState()`.
  Keep: `processProviderEvent()`, new simplified `StreamState`, all formatting helpers, `SummaryInfo` re-export from `provider.ts`.
  Update `src/interactive.ts` — it currently uses `processMessage()` from `stream.ts`. Interactive mode migration is deferred per spec, but imports must compile. Options: (a) keep `processMessage()` in `stream.ts` until interactive migration, or (b) update `interactive.ts` to use `processProviderEvent()`.
  Spec: `stream-event-rendering.md`

## Phase 7: Tests

- [ ] **Add `tests/provider.test.ts`** — Provider contract type validation
  Verify `ProviderEvent` discriminated union covers all variants.
  Verify `SummaryInfo` re-exported from `provider.ts` matches usage in `stream.ts`.

- [ ] **Add `tests/prompt.test.ts`** — `buildPrompt()` tests
  Migrate existing `buildPrompt` tests from `tests/session.test.ts` to this file.
  Test: no context returns prompt unchanged, single context path prepended, multiple context paths prepended.
  File: `tests/prompt.test.ts`

- [ ] **Add `tests/claude-adapter.test.ts`** — Claude event adapter tests
  Test `adaptClaudeMessage()` with: text_delta mapping, tool_use start/stop cycle, input_json_delta accumulation, detail extraction fallback chain, result success/failure, empty text_delta skip, malformed JSON fallback, fallback text for no-streaming responses, abandoned tool accumulation.
  File: `tests/claude-adapter.test.ts`

- [ ] **Add `tests/codex-adapter.test.ts`** — Codex event adapter tests
  Test `adaptCodexEvent()` with: command_execution start/completed, file_change start/completed, mcp_tool_call, web_search, agent_message text, error events, turn.completed/failed, ignored event types, empty changes array, empty message text.
  File: `tests/codex-adapter.test.ts`

- [ ] **Update `tests/claude.test.ts`** — Test `ClaudeProvider.isAvailable()`
  Replace `findClaude()` tests with `ClaudeProvider.isAvailable()` tests.
  Test: returns true when claude binary found, returns false when not on PATH, returns false for dangling symlink.
  Test `ClaudeProvider.resolveModel()`: sonnet/opus/haiku aliases, pass-through, undefined.
  Test `ClaudeProvider.knownAliases()`: returns expected map.

- [ ] **Update `tests/session.test.ts`** — Test `ClaudeProvider.createSession()` + adapter
  Replace `runSession()` tests with `ClaudeProvider.createSession()` tests.
  Verify: query() called with correct options, model passed only when defined, context prepended to prompt, yields ProviderEvent objects (not raw SDK messages).
  Remove `buildPrompt` tests (migrated to `tests/prompt.test.ts`).

- [ ] **Add `tests/codex.test.ts`** — CodexProvider tests
  Test `CodexProvider.isAvailable()`: true when OPENAI_API_KEY set, true when CODEX_API_KEY set, false when neither set.
  Test `CodexProvider.resolveModel()`: codex/codex-mini aliases, pass-through, undefined.
  Test `CodexProvider.knownAliases()`: returns expected map.
  Test `CodexProvider.createSession()`: throws when unavailable, yields ProviderEvent objects.

- [ ] **Add `tests/registry.test.ts`** — Provider resolution logic tests
  Test `resolveProvider()`: explicit `--provider claude`, explicit `--provider codex`, unknown provider throws.
  Model inference: `claude-*` prefix → Claude, `gpt-*` prefix → Codex, `o4-mini` → Codex, `sonnet`/`opus`/`haiku` → Claude, `codex`/`codex-mini` → Codex.
  Default: no flag + no model → Claude, unrecognized model → Claude.
  Edge case: `--provider codex --model sonnet` → Codex.
  Singleton: same instance returned on repeated calls.

- [ ] **Update `tests/stream.test.ts`** — Add tests for `processProviderEvent()`
  Test with all `ProviderEvent` variants: `text_delta` (gray text, leading blank line stripping), `tool_start` (no output), `tool_end` (dim bracketed tag, newline insertion), `result` success (summary line), `result` failure (red error to errWrite), `error` (red error to errWrite).
  Test simplified `StreamState` tracking.
  Keep existing `processMessage()` tests until Phase 6 cleanup removes it.

- [ ] **Update `tests/loop.test.ts`** — Fake sessions yield `ProviderEvent` objects
  Update mock session factories to yield `ProviderEvent` objects instead of raw SDK messages.
  Update failure detection assertions: check `event.type === 'result' && !event.success`.
  Verify loop headers, error isolation, abort signal, and errWrite routing still work.

- [ ] **Update `tests/cli.test.ts`** — Test `--provider` flag and Codex integration
  Test `--provider` flag: `--provider claude` in dry-run, `--provider codex` in dry-run.
  Test dry-run JSON includes `provider` field.
  Test `--provider codex --interactive` → error.
  Test `--provider invalidname` → error listing valid providers.
  Test model inference: `--model codex` in dry-run resolves to Codex provider.
  Test updated help text.
  Keep existing tests for `--count`, `--forever`, `--interactive` validation, alias resolution.

- [ ] **Update `tests/interactive.test.ts`** — Fix imports after migration
  Update imports if `buildPrompt` source changes from `./session` to `./prompt`.
  Update imports if `processMessage` is replaced by `processProviderEvent`.
  Interactive mode remains Claude-only per spec — no provider dispatch tests needed yet.
