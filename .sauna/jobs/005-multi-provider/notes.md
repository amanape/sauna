# Multi-Provider Implementation Notes

## Status
All phases complete (including Phase 11). 257 tests pass, 0 fail as of 2026-02-19 session 5.

## Key Learnings

### @openai/codex-sdk@0.104.0 — Real API vs Spec

The specs were written for an older/hypothetical API. The real SDK (v0.104.0) differs significantly:

**Real SDK exports:**
- `Codex` class — constructor `new Codex(options?: CodexOptions)`
- `Thread` class — `startThread(options?: ThreadOptions): Thread`
- `thread.runStreamed(input: Input): Promise<{ events: AsyncGenerator<ThreadEvent> }>`

**Real event types (ThreadEvent union):**
- `thread.started` — first event with `thread_id`
- `turn.started` — emitted when model starts processing
- `turn.completed` — `{ usage: { input_tokens, cached_input_tokens, output_tokens } }`
- `turn.failed` — `{ error: { message: string } }`
- `item.started` — `{ item: ThreadItem }` — item beginning
- `item.updated` — `{ item: ThreadItem }` — item in progress
- `item.completed` — `{ item: ThreadItem }` — item finished
- `error` — `{ message: string }` — fatal stream error

**ThreadItem subtypes:**
- `agent_message` — `{ text: string }` — AI text response
- `command_execution` — `{ command: string, aggregated_output: string, status }`
- `file_change` — `{ changes: [{path, kind}], status }`
- `mcp_tool_call` — `{ server, tool, arguments, result?, error?, status }`
- `reasoning` — `{ text: string }` — internal reasoning (skip in display)
- `web_search` — `{ query: string }`
- `todo_list` — `{ items: [{text, completed}] }`
- `error` — `{ message: string }` — non-fatal error item

**The spec said "tool.call" events but this doesn't exist.** Use `item.completed` with typed items.

### Stream Adapter Design

The adapter (`src/codex-stream-adapter.ts`) maps Codex events to sauna's existing message format:
- `agent_message` → `stream_event / content_block_delta / text_delta` (same as Anthropic text)
- `command_execution` → tool_use sequence: `content_block_start (name=Bash)` + `input_json_delta ({"command": "..."})` + `content_block_stop`
- `file_change` → tool_use sequence: name=Write, detail via file_path key
- `mcp_tool_call` → tool_use with name=item.tool, no detail
- `turn.completed` → `result/success` with `usage`, `num_turns: 1`, `duration_ms`
- `turn.failed` / `error` event → `result/error_during_execution` with `errors: string[]`
- Missing turn.completed → synthetic zero-usage result
- Everything else → silently skipped

Critical: `errors` must be `string[]` not objects, or `processMessage()` renders `[object Object]`.

### Provider Routing (resolveProvider)

Key edge case: `"gpt-4o:latest"` has a colon but prefix `"gpt-4o"` is a known model alias (not a provider). This falls through to bare-string handling of the entire input, yielding `{ provider: "anthropic", model: "gpt-4o:latest" }`.

`"google:foo"` has an unknown prefix that is NOT a known model alias → fatal error.

The logic:
1. If colon present:
   - prefix = "anthropic" → anthropic provider, resolve alias in rest
   - prefix = "openai" → openai provider, resolve alias in rest
   - prefix is a known model alias → fall through to bare-string handling of ENTIRE input
   - prefix is unknown → errWrite + process.exit(1)
2. Bare string:
   - In MODEL_ALIASES → anthropic
   - In OPENAI_ALIASES → openai
   - Unknown → anthropic (backward compat)

### Bun.env vs process.env

The implementation uses `Bun.env.OPENAI_API_KEY` (per CLAUDE.md instructions). Tests set `Bun.env.OPENAI_API_KEY` directly. Note that `Bun.env` and `process.env` are different objects in Bun — setting one doesn't affect the other in tests.

### SAUNA_DRY_RUN JSON format change

After Phase 5, the dry-run JSON changes from:
```json
{ "prompt": "...", "model": "<resolved>", "forever": ..., ... }
```
to:
```json
{ "prompt": "...", "model": "<raw-cli-input>", "provider": "anthropic|openai", "resolvedModel": "<resolved>", ... }
```
Existing tests don't assert on `json.model` so this is backward compatible.

### test/codex-session.test.ts Pattern

Uses `mock.module("@openai/codex-sdk")` + dynamic `import()` inside each test to pick up mocked version. This is the Bun-idiomatic pattern for module mocking.

### `resolveModel` deprecation

`resolveModel` is kept as `@deprecated` in `src/cli.ts` — it still works but is no longer exported by `index.ts`. Safe to remove in a future cleanup pass.

### Index.ts dispatch pattern

For loop/session mode, the factory approach is:
```typescript
() => runCodexSession({ ... })  // openai
() => runSession({ ... })        // anthropic
```
Each call creates a fresh session, which is the same pattern as the existing Anthropic loop.

## Files Changed / Created

| File | Action | Notes |
|------|--------|-------|
| `package.json` | modified | Added `@openai/codex-sdk: latest` |
| `src/cli.ts` | modified | Added `resolveProvider`, `ResolvedProvider`, `OPENAI_ALIASES`; kept deprecated `resolveModel` |
| `src/codex-stream-adapter.ts` | created | Translates ThreadEvent → sauna message format |
| `src/codex-session.ts` | created | Single-turn Codex session |
| `src/codex-interactive.ts` | created | Multi-turn Codex REPL |
| `index.ts` | modified | Uses resolveProvider, imports Codex modules, provider dispatch |
| `tests/cli.test.ts` | modified | Updated model resolution tests to use resolveProvider |
| `tests/setup.test.ts` | modified | Added @openai/codex-sdk dependency check |
| `tests/provider-router.test.ts` | created | 27 tests |
| `tests/codex-stream-adapter.test.ts` | created | 49 tests |
| `tests/codex-session.test.ts` | created | 13 tests (12 original + 1 SDK guard) |
| `tests/codex-interactive.test.ts` | created | 15 tests (14 original + 1 SDK guard) |

## Spec Inconsistencies Fixed

An Opus 4.6 subagent was dispatched to update `specs/codex-stream-adapter.md`,
`specs/codex-session.md`, and `specs/testing-strategy.md` to match the real SDK API.
The main issue was `tool.call` events which don't exist; replaced with `item.completed` handling.

A second Opus subagent pass (2026-02-19) fixed residual inconsistencies in `specs/codex-stream-adapter.md`:
- `c.file_path ?? c.path` → `c.path` (real SDK `file_change.changes` uses `{path, kind}`, not `file_path`)
- Removed `result: ""` from result yield code examples (implementation does not include this field)

### runCodexSession SDK Error Handling (Phase 8 fix)

`runCodexSession` now wraps `await thread.runStreamed(fullPrompt)` in a try/catch. Before this fix, if the SDK threw before returning events (network error, auth failure, etc.), the exception propagated through `runLoop`'s catch block to raw stderr output — bypassing `processMessage`. After the fix, it yields `result/error_during_execution` consistently.

```typescript
try {
  const { events } = await thread.runStreamed(fullPrompt);
  yield* adaptCodexEvents(events, startTime);
} catch (err) {
  yield { type: "result", subtype: "error_during_execution", errors: [err instanceof Error ? err.message : String(err)] };
}
```

### Dead Code Removed (Phase 8 fix)

`isFirstTurn` variable in `runCodexInteractive` was assigned `false` after the first turn but never read again. The variable was originally intended to distinguish first vs subsequent turns, but the design shifted to using `buildPrompt()` on `input` before the loop starts — making the variable redundant.

## Error Message Format (Phase 9)

### Unknown provider error (src/cli.ts)
Spec-compliant format as of 2026-02-19 session 3:
```
error: Unknown provider "google".

Available providers:
  anthropic  (models: sonnet, opus, haiku)
  openai     (models: gpt-4o, o1)
```
Previous format ("valid providers: anthropic, openai") did not list models per provider.

### OPENAI_API_KEY error (src/codex-session.ts, src/codex-interactive.ts)
3-step format matching spec:
```
OPENAI_API_KEY is not set.

To fix this:
  1. Get your API key from https://platform.openai.com/api-keys
  2. Create a .env file in your project root:
     echo 'OPENAI_API_KEY=sk-your-key-here' > .env
  3. Or set it in your terminal:
     export OPENAI_API_KEY=sk-your-key-here
```

### SDK error classification (Phase 10 — classifyOpenAIError)

`classifyOpenAIError(err: unknown): string` is exported from `src/codex-stream-adapter.ts` and used in:
- `adaptCodexEvents` catch block (errors from async stream iteration)
- `runCodexSession` catch block (errors from `thread.runStreamed` throw)
- `runCodexInteractive` outer catch block (unexpected errors)

Detection logic (conservative — avoids false positives):
- **Auth (401)**: `err.status === 401` OR message matches `/incorrect api key/i`, `/invalid api key/i`, `/api key.*invalid/i`, `/api key.*expired/i`, `/authentication.*failed/i`, `/\bunauthorized\b/i`
- **Rate limit (429)**: `err.status === 429` OR message matches `/rate.?limit/i`, `/too many requests/i`
- **Network**: `err.code` in `{ECONNREFUSED, ENOTFOUND, ETIMEDOUT, EHOSTUNREACH}` OR message matches `/ECONNREFUSED/`, `/ENOTFOUND/`, `/fetch failed/i`, `/failed to fetch/i`
- Generic strings like "Network failure" do NOT match (no false positives).

### Deferred error-handling items
- "Codex SDK not installed" case: implemented in Phase 11 via a `typeof Codex !== "function"` guard.

## Bun mock.module Behavior — Critical Learnings (Phase 11)

Discovered during implementation of the "SDK not installed" guard:

### What works
- `mock.module(path, () => ({ Codex: MockClass }))` — intercepted by static `import { Codex } from path` at module-evaluation time. This is the correct pattern for all existing tests.
- `mock.module(path, () => ({ Codex: undefined }))` — returns the named export as `undefined`. Static imports succeed (no SyntaxError) with `Codex = undefined`. Use this to simulate a corrupted/missing export.

### What does NOT work
- `mock.module(path, () => { throw new Error("not found") })` — Bun evaluates the factory immediately when `mock.module` is called. The throw happens during test setup, not during import. The test fails at the mock setup line.
- `mock.module(path, () => ({}))` — Empty module. Any `import { NamedExport } from path` then throws `SyntaxError: Export named 'NamedExport' not found`. Use `{ Codex: undefined }` instead.
- Dynamic `import()` calls **inside functions** — NOT intercepted by `mock.module`. When `runCodexSession` does `import("@openai/codex-sdk")` at runtime, Bun hits the real module registry (not the test mock). This is why the implementation uses static top-level imports with a runtime typeof-guard rather than dynamic imports with try/catch.

### SDK not-installed implementation pattern
```typescript
// At top of module (static — intercepted by mock.module in tests):
import { Codex } from "@openai/codex-sdk";

// Inside function — runtime guard:
if (typeof Codex !== "function") {
  yield { type: "result", subtype: "error_during_execution",
    errors: ["@openai/codex-sdk is not installed.\n\nTo fix this, run:\n  bun add @openai/codex-sdk"] };
  return;
}
```

## Test Suite Performance Notes

- Unit tests (stream, loop, session, interactive, claude, codex-stream-adapter, provider-router, codex-session, codex-interactive): ~3.7s for 212 tests
- `tests/setup.test.ts`: ~2s for 23 tests (includes `bun run build` in beforeAll — binary compilation)
- `tests/cli.test.ts`: ~60s total for 20 tests (spawns multiple subprocesses including one with a stripped PATH to test missing-claude behavior)
- `tests/provider-router.test.ts` SAUNA_DRY_RUN subprocess tests: very fast (~60ms each) because SAUNA_DRY_RUN exits immediately after JSON output
- Total: 257 tests, all passing, verified 2026-02-19 session 5 (255 + 2 new SDK guard tests)
