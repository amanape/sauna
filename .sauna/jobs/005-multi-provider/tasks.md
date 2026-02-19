# Multi-Provider Implementation Tasks

Phases 1-10 complete + Phase 11 (SDK guard). 257 tests pass, 0 fail (cli.test.ts verified separately; counts: 214 unit + 20 cli + 23 setup = 257).

---

## Phase 1: Package dependency

- [x] Add `"@openai/codex-sdk": "latest"` (installed 0.104.0) to `dependencies` in `package.json` and run `bun install` (file: package.json)

## Phase 2: Provider routing (src/cli.ts)

All changes in this phase are in `src/cli.ts`. The old `resolveModel()` is kept as deprecated
but `resolveProvider()` is now the primary export.

- [x] Define exported `ResolvedProvider` type: `{ provider: "anthropic" | "openai"; model: string | undefined }` (file: src/cli.ts)
- [x] Keep the existing `MODEL_ALIASES` map for Anthropic alias resolution; add a new `OPENAI_ALIASES` map with entries `{ "gpt-4o": "gpt-4o", "o1": "o1" }` (file: src/cli.ts)
- [x] Implement and export `resolveProvider(model: string | undefined, errWrite?: (s: string) => void): ResolvedProvider` with the following routing rules (file: src/cli.ts):
  - `undefined` or `""` returns `{ provider: "anthropic", model: undefined }`
  - Colon syntax: split on first colon; if prefix is "anthropic" or "openai", handle accordingly; if prefix is a known model alias, fall through to bare-string handling of entire input; unknown prefix → errWrite + process.exit(1)
  - Bare Anthropic aliases: `"sonnet"`, `"opus"`, `"haiku"` resolve to `{ provider: "anthropic", model: "<full-id>" }`
  - Bare OpenAI aliases: `"gpt-4o"`, `"o1"` resolve to `{ provider: "openai", model: "<alias-value>" }`
  - Unknown bare string: defaults to `{ provider: "anthropic", model: "my-custom-model" }` for backward compatibility
- [x] Keep `resolveModel()` as `@deprecated` (not removed yet — `index.ts` has already been updated to use `resolveProvider`)

## Phase 3: Codex stream adapter (src/codex-stream-adapter.ts -- new file)

- [x] Create `src/codex-stream-adapter.ts` exporting `adaptCodexEvents(events: AsyncIterable<any>, startTime: number): AsyncGenerator<any>` (file: src/codex-stream-adapter.ts)
- [x] Handle `item.completed` with `agent_message` → text_delta (file: src/codex-stream-adapter.ts)
- [x] Handle `item.completed` with `command_execution` → tool_use (Bash) + input_json_delta with command (file: src/codex-stream-adapter.ts)
- [x] Handle `item.completed` with `file_change` → tool_use (Write) + input_json_delta with file_path (file: src/codex-stream-adapter.ts)
- [x] Handle `item.completed` with `mcp_tool_call` → tool_use with item.tool name (file: src/codex-stream-adapter.ts)
- [x] Handle `turn.completed` → result/success with usage + duration_ms (file: src/codex-stream-adapter.ts)
- [x] Handle `turn.failed` → result/error_during_execution with errors string array, then return (file: src/codex-stream-adapter.ts)
- [x] Handle `error` event type → result/error_during_execution, then return (file: src/codex-stream-adapter.ts)
- [x] Wrap entire iteration in try/catch → yield error result on throw (file: src/codex-stream-adapter.ts)
- [x] After loop: if !turnCompleted, yield synthetic zero-usage result (file: src/codex-stream-adapter.ts)
- [x] Silently skip: reasoning, web_search, todo_list, error items; thread.started, turn.started, item.started, item.updated events; unknown event types (file: src/codex-stream-adapter.ts)

**NOTE**: The original spec referenced `tool.call` events which do NOT exist in `@openai/codex-sdk@0.104.0`.
The real SDK uses `item.completed` with typed `item.type` for tool/command dispatch. Spec has been
updated by Opus subagent to reflect reality.

## Phase 4a: Codex session (src/codex-session.ts -- new file)

- [x] Create `src/codex-session.ts` exporting `CodexSessionConfig` type and `runCodexSession()` (file: src/codex-session.ts)
- [x] Validate `Bun.env.OPENAI_API_KEY` (trim + empty check) at start (file: src/codex-session.ts)
- [x] Call `buildPrompt()`, create `Codex`, call `startThread({ model })` or `startThread()` when model undefined (file: src/codex-session.ts)
- [x] Delegate to `adaptCodexEvents(events, startTime)` via `yield*` (file: src/codex-session.ts)

## Phase 4b: Codex interactive (src/codex-interactive.ts -- new file)

- [x] Create `src/codex-interactive.ts` exporting `CodexInteractiveConfig`, `CodexInteractiveOverrides`, and `runCodexInteractive()` (file: src/codex-interactive.ts)
- [x] Validate `Bun.env.OPENAI_API_KEY` at start (file: src/codex-interactive.ts)
- [x] Create Codex instance and call `startThread()` once — thread reused across turns (file: src/codex-interactive.ts)
- [x] Set up readline on overrides?.input (file: src/codex-interactive.ts)
- [x] First input from `config.prompt` or readline, apply `buildPrompt()` with context only on first turn (file: src/codex-interactive.ts)
- [x] Multi-turn loop: `thread.runStreamed(input)` → `adaptCodexEvents()` → `processMessage()` → `writePrompt()` → read next line (file: src/codex-interactive.ts)
- [x] Fresh `StreamState` per turn (file: src/codex-interactive.ts)
- [x] SIGINT/SIGTERM handling with cleanup in finally block (file: src/codex-interactive.ts)

## Phase 5: Integration (index.ts)

- [x] Replace `resolveModel` import with `resolveProvider` import (file: index.ts)
- [x] Add `runCodexSession` and `runCodexInteractive` imports (file: index.ts)
- [x] Call `resolveProvider()` before `SAUNA_DRY_RUN` check (file: index.ts)
- [x] Update `SAUNA_DRY_RUN` JSON output with `model` (raw), `provider`, `resolvedModel` fields (file: index.ts)
- [x] Update `--model` flag description to mention OpenAI models (file: index.ts)
- [x] Make `findClaude()` conditional on `provider === "anthropic"` (file: index.ts)
- [x] Provider-based dispatch for interactive mode (openai → runCodexInteractive, anthropic → runInteractive) (file: index.ts)
- [x] Provider-based dispatch for loop/session mode (openai → runCodexSession, anthropic → runSession) (file: index.ts)

## Phase 6: Tests

### 6a. Updated test files

- [x] Updated `tests/cli.test.ts`: replaced `resolveModel` with `resolveProvider` unit tests covering bare aliases (Anthropic + OpenAI), undefined, unknown bare strings (file: tests/cli.test.ts)
- [x] Updated `tests/setup.test.ts`: added test asserting `@openai/codex-sdk` in `package.json` dependencies (file: tests/setup.test.ts)

### 6b. New test files

- [x] Created `tests/provider-router.test.ts`: 25 tests covering all routing cases, colon syntax, alias expansion, unknown provider exit, SAUNA_DRY_RUN subprocess checks (file: tests/provider-router.test.ts)
- [x] Created `tests/codex-stream-adapter.test.ts`: 28 pure unit tests using mock async iterables — all real SDK event types tested (file: tests/codex-stream-adapter.test.ts)
- [x] Created `tests/codex-session.test.ts`: 7 tests using mock.module("@openai/codex-sdk") (file: tests/codex-session.test.ts)
- [x] Created `tests/codex-interactive.test.ts`: 14 tests using CodexInteractiveOverrides for injection (file: tests/codex-interactive.test.ts)

### 6c. Verification

- [x] Run `bun test` — ALL 227 tests pass with zero failures
- [x] Verified test counts: 110 (stream/loop/session/interactive/claude) + 28 (codex-stream-adapter) + 46 (provider-router/codex-session/codex-interactive) + 23 (setup) + 20 (cli) = 227 total
- [x] Confirmed `bun test` exit code 0 for all test files (cli.test.ts spawns subprocesses so takes ~60s total)

## Phase 7: Spec Maintenance

- [x] Identified spec inconsistency in `specs/codex-stream-adapter.md`: `c.file_path ?? c.path` should be `c.path` (real SDK uses `path` not `file_path`); also `result: ""` field in code examples doesn't match implementation
- [x] Dispatched Opus subagent to update `specs/codex-stream-adapter.md` to match actual implementation

## Phase 8: Additional test coverage & bug fixes (2026-02-19)

### Bugs discovered

- `runCodexSession` propagated exceptions from `thread.runStreamed()` rather than yielding `result/error_during_execution`. If the SDK threw before returning events (e.g., network error), `runLoop` caught it but bypassed `processMessage`. Fixed by wrapping the call in a try/catch that yields an error result. (file: src/codex-session.ts)
- Dead code: `isFirstTurn` variable in `runCodexInteractive` was assigned but never read after the first turn. Removed. (file: src/codex-interactive.ts)

### Missing test cases from spec

- [x] Added `tests/codex-stream-adapter.test.ts`: "item.completed with unrecognized item type yields nothing (no crash)" (file: tests/codex-stream-adapter.test.ts)
- [x] Added `tests/codex-stream-adapter.test.ts`: "item.completed with null item yields nothing (no crash)" (file: tests/codex-stream-adapter.test.ts)
- [x] Added `tests/codex-stream-adapter.test.ts`: "multiple agent_message items in one turn yield multiple text_deltas" (file: tests/codex-stream-adapter.test.ts)
- [x] Added `tests/codex-stream-adapter.test.ts`: "agent_message item with non-string text is skipped (no crash)" (extra robustness) (file: tests/codex-stream-adapter.test.ts)
- [x] Added `tests/codex-session.test.ts`: "runStreamed throwing yields result/error_during_execution (not uncaught exception)" — TDD: test failed first, then src/codex-session.ts was fixed to make it pass (file: tests/codex-session.test.ts)

### Spec maintenance

- [x] Dispatched Opus subagent to fix `specs/testing-strategy.md`: `file_path` → `path` in file_change mock events, updated test counts (28→32 for stream-adapter, 7→8 for session), added missing test case descriptions

### Verification

- [x] All 212 non-subprocess tests pass (10 files, verified via `bun test` per-file)
- [x] Test counts: 32+8+14+25+23+20(cli)+110 = 232 total (up from 227)

## Phase 9: Error message improvements (2026-02-19)

Per `specs/error-handling.md` acceptance criteria (previously unaddressed):

### Changes
- [x] Improved unknown provider error message in `src/cli.ts`: now includes model listings per provider matching the spec format:
  `error: Unknown provider "X".\n\nAvailable providers:\n  anthropic  (models: sonnet, opus, haiku)\n  openai     (models: gpt-4o, o1)` (file: src/cli.ts)
- [x] Updated OPENAI_API_KEY error message in `src/codex-session.ts` to 3-step format with `.env` file option (file: src/codex-session.ts)
- [x] Updated OPENAI_API_KEY error message in `src/codex-interactive.ts` to match (file: src/codex-interactive.ts)

### New tests (TDD — wrote failing tests first, then implemented)
- [x] `tests/provider-router.test.ts`: "error message for unknown provider lists models for each provider" — checks sonnet, opus, haiku, gpt-4o, o1 in error output (file: tests/provider-router.test.ts)
- [x] `tests/provider-router.test.ts`: "error message for unknown provider names the bad provider" — checks prefix name appears in output (file: tests/provider-router.test.ts)
- [x] `tests/codex-session.test.ts`: "OPENAI_API_KEY error message includes step-by-step fix instructions" — checks `.env` file and API key URL (file: tests/codex-session.test.ts)

### Remaining error-handling.md items (deferred)
- [x] Codex SDK not installed message — implemented as Phase 11 (see below)

### Verification
- [x] 235 tests pass, 0 fail (192 unit + 20 cli + 23 setup = 235, up from 232)

## Phase 10: SDK error classification (2026-02-19)

Per `specs/error-handling.md` acceptance criteria:

### Changes
- [x] Added exported `classifyOpenAIError(err: unknown): string` to `src/codex-stream-adapter.ts`:
  - status 401 or auth-related message patterns → "OpenAI authentication failed. Your API key may be invalid or expired.\n\nCheck your key at https://platform.openai.com/api-keys"
  - status 429 or rate-limit message patterns → "OpenAI rate limit reached. Waiting before next attempt.\n\nTip: Use a different model or wait a moment before retrying."
  - ECONNREFUSED/ENOTFOUND/ETIMEDOUT/EHOSTUNREACH codes or "fetch failed" patterns → "Could not connect to OpenAI API. Check your internet connection."
  - All other errors → original message unchanged (file: src/codex-stream-adapter.ts)
- [x] Updated `adaptCodexEvents` catch block to use `classifyOpenAIError` (file: src/codex-stream-adapter.ts)
- [x] Updated `runCodexSession` catch block to use `classifyOpenAIError` (file: src/codex-session.ts)
- [x] Updated `runCodexInteractive` outer catch block to use `classifyOpenAIError` (file: src/codex-interactive.ts)

### New tests (TDD — wrote failing tests first, then implemented)
- [x] `tests/codex-stream-adapter.test.ts`: 13 tests for `classifyOpenAIError` — status 401/429, message patterns (incorrect api key, invalid api key, Unauthorized, rate limit, too many requests), ECONNREFUSED/ENOTFOUND codes, fetch failed, generic passthrough, non-Error value (file: tests/codex-stream-adapter.test.ts)
- [x] `tests/codex-stream-adapter.test.ts`: 4 tests for error classification in `adaptCodexEvents` catch — auth/rate-limit/network classified correctly; generic "Network failure" passes through unchanged (file: tests/codex-stream-adapter.test.ts)
- [x] `tests/codex-session.test.ts`: 3 tests for classified error messages from `runStreamed` throw — auth (status 401), rate limit (status 429), network (ECONNREFUSED code) (file: tests/codex-session.test.ts)

### Remaining error-handling.md items (deferred)
- [x] Codex SDK not installed message — implemented as Phase 11 (see below)

### Verification
- [x] 255 tests pass, 0 fail (212 unit + 20 cli + 23 setup = 255, up from 235)
  - codex-stream-adapter.test.ts: 49 pass (+17 new)
  - codex-session.test.ts: 12 pass (+3 new)
  - all other files unchanged

## Phase 11: Codex SDK not-installed guard (2026-02-19)

Previously deferred as an edge case. Implemented as a runtime `typeof Codex !== "function"` guard
after the API-key check in both Codex modules. This handles the "corrupted SDK / missing Codex
export" scenario without requiring dynamic imports (which Bun's mock.module doesn't intercept at
runtime). Truly-missing packages still crash at startup (expected for a required dependency).

### Changes
- [x] Added `typeof Codex !== "function"` guard in `src/codex-session.ts` — yields `result/error_during_execution` with "bun add @openai/codex-sdk" instructions (file: src/codex-session.ts)
- [x] Added `typeof Codex !== "function"` guard in `src/codex-interactive.ts` (skipped when `overrides.createCodex` is set) — writes error via `errWrite ?? write` and returns (file: src/codex-interactive.ts)

### New tests (TDD — wrote failing tests first, then implemented)
- [x] `tests/codex-session.test.ts`: "@openai/codex-sdk missing Codex export yields error_during_execution with install instructions" — uses `mock.module("@openai/codex-sdk", () => ({ Codex: undefined }))` to simulate missing export (file: tests/codex-session.test.ts)
- [x] `tests/codex-interactive.test.ts`: "@openai/codex-sdk missing Codex export writes error and returns" — same mock pattern, verifies errWrite contains SDK name and install command (file: tests/codex-interactive.test.ts)

### Bun mock.module learnings
- `mock.module(path, () => { throw ... })` — Bun evaluates the factory immediately; the throw causes the test to fail at mock setup, NOT at import time
- `mock.module(path, () => ({}))` — returns empty module; named imports like `import { Codex } from ...` then throw `SyntaxError: Export named 'Codex' not found`
- `mock.module(path, () => ({ Codex: undefined }))` — correct approach; named import succeeds with `Codex = undefined`, triggering the runtime typeof guard
- Dynamic `import()` inside functions does NOT pick up Bun's module mocks; only static imports at module-evaluation time are intercepted

### Verification
- [x] 257 tests pass, 0 fail (214 unit + 20 cli + 23 setup = 257, up from 255)
  - codex-session.test.ts: 13 pass (+1 new)
  - codex-interactive.test.ts: 15 pass (+1 new)
