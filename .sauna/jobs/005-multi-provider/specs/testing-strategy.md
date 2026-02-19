# Testing Strategy — Multi-Provider

## Overview

Describes the test files to create, the mocking approach for the Codex SDK, and the updates required to existing tests. All tests use `bun test`.

## New Test Files

| File | What it tests |
|---|---|
| `tests/provider-router.test.ts` | `resolveProvider()` — all routing cases, alias expansion, error cases |
| `tests/codex-stream-adapter.test.ts` | `adaptCodexEvents()` — event translation for all Codex event types |
| `tests/codex-session.test.ts` | `runCodexSession()` — session factory, prompt building, error wrapping |
| `tests/codex-interactive.test.ts` | `runCodexInteractive()` — multi-turn REPL with mocked Codex thread |

## Mocking the Codex SDK

Use Bun's `mock.module()` to intercept `@openai/codex-sdk` before any test that imports a Codex module:

```typescript
import { mock, expect, test } from "bun:test";

mock.module("@openai/codex-sdk", () => ({
  Codex: class MockCodex {
    startThread(options?: { model?: string }) {
      return {
        id: "mock-thread-id",
        runStreamed: mock(async (prompt: string) => ({
          events: (async function* () {
            yield { type: "item.completed", item: { id: "msg-1", type: "agent_message", text: "hello from codex" } };
            yield { type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } };
          })(),
        })),
      };
    }
  },
}));
```

Each test can customize the mock return value to exercise specific event sequences.

### Simulating command execution (tool calls)

```typescript
events: (async function* () {
  yield { type: "item.completed", item: { id: "cmd-1", type: "command_execution", command: "cat README.md", aggregated_output: "file contents", exit_code: 0, status: "completed" } };
  yield { type: "turn.completed", usage: { input_tokens: 20, cached_input_tokens: 0, output_tokens: 15 } };
})()
```

### Simulating file changes

```typescript
events: (async function* () {
  yield { type: "item.completed", item: { id: "fc-1", type: "file_change", changes: [{ path: "src/index.ts", kind: "update" }], status: "completed" } };
  yield { type: "turn.completed", usage: { input_tokens: 20, cached_input_tokens: 0, output_tokens: 15 } };
})()
```

### Simulating MCP tool calls

```typescript
events: (async function* () {
  yield { type: "item.completed", item: { id: "mcp-1", type: "mcp_tool_call", server: "my-server", tool: "search_docs", arguments: "{}", status: "completed" } };
  yield { type: "turn.completed", usage: { input_tokens: 20, cached_input_tokens: 0, output_tokens: 15 } };
})()
```

### Simulating turn failure

```typescript
events: (async function* () {
  yield { type: "turn.failed", error: { message: "rate_limit_exceeded" } };
})()
```

### Simulating thread error

```typescript
events: (async function* () {
  yield { type: "error", message: "connection_lost" };
})()
```

### Simulating stream throwing

```typescript
events: (async function* () {
  throw new Error("rate_limit_exceeded");
})()
```

## tests/provider-router.test.ts

Test cases:

```typescript
test("openai:gpt-4o → provider 'openai', model 'gpt-4o'")
test("anthropic:sonnet → provider 'anthropic', model 'claude-sonnet-4-20250514'")
test("anthropic:claude-opus-4-20250514 → provider 'anthropic', full ID passes through")
test("sonnet (no prefix) → provider 'anthropic' via alias")
test("opus (no prefix) → provider 'anthropic' via alias")
test("haiku (no prefix) → provider 'anthropic' via alias")
test("gpt-4o (no prefix) → provider 'openai' via alias")
test("o1 (no prefix) → provider 'openai' via alias")
test("undefined → provider 'anthropic', model undefined (default)")
test("'' (empty string) → treated as undefined, provider 'anthropic'")
test("openai:gpt-4o:latest → split on first colon, model is 'gpt-4o:latest'")
test("google:gemini → errWrite called with unknown provider message, process.exit(1)")
test("gpt-5 (unknown alias, no prefix) → defaults to provider 'anthropic', model 'gpt-5' passed through (no error)")
test("resolveProvider() passes errWrite second arg to error output (not process.stderr directly)")
test("resolveProvider() with no errWrite arg still writes to stderr on failure")
```

Use `SAUNA_DRY_RUN=1` via subprocess invocation (same pattern as `tests/cli.test.ts`) for end-to-end routing checks. Check that dry-run output includes `provider` and `resolvedModel` fields:

```typescript
test("SAUNA_DRY_RUN: --model openai:gpt-4o includes provider and resolvedModel", async () => {
  const result = await Bun.$`SAUNA_DRY_RUN=1 bun run index.ts --model openai:gpt-4o hello`.text();
  const json = JSON.parse(result);
  expect(json.provider).toBe("openai");
  expect(json.resolvedModel).toBe("gpt-4o");
  expect(json.model).toBe("openai:gpt-4o");
});
```

## tests/codex-stream-adapter.test.ts

Test cases:

```typescript
test("item.completed with agent_message yields text_delta with item.text")
test("item.completed with command_execution yields tool_use sequence (Bash) with command in input_json_delta")
test("item.completed with file_change yields tool_use sequence (Write) with file paths in input_json_delta")
test("item.completed with mcp_tool_call yields tool_use sequence with item.tool as name")
test("item.completed with reasoning item is silently skipped")
test("item.completed with web_search item is silently skipped")
test("item.completed with todo_list item is silently skipped")
test("item.completed with error item is silently skipped")
test("item.completed with unrecognized item type yields nothing (no crash)")
test("item.completed with null item yields nothing (no crash)")
test("turn.completed yields result/success with correct usage (input_tokens, output_tokens)")
test("turn.completed uses startTime to compute duration_ms")
test("turn.failed yields result/error_during_execution with event.error.message and stops")
test("error event yields result/error_during_execution with event.message and stops")
test("thrown error yields result/error_during_execution with error message")
test("stream ending without turn.completed yields synthetic zero-usage result")
test("thread.started event is silently skipped")
test("turn.started event is silently skipped")
test("item.started event is silently skipped")
test("item.updated event is silently skipped")
test("multiple agent_message items in one turn yield multiple text_deltas")
test("agent_message item with non-string text is skipped (no crash)")
test("processMessage can consume all adapted messages without error")
```

The adapter tests should be pure unit tests — pass a mock async iterable directly to `adaptCodexEvents()` and collect all yielded messages to assert on their shape.

## tests/codex-session.test.ts

Test cases:

```typescript
test("runCodexSession creates a Codex instance with correct model")
test("runCodexSession omits model option when config.model is undefined")
test("runCodexSession prepends context paths via buildPrompt()")
test("runCodexSession returns AsyncGenerator compatible with runLoop()")
test("runCodexSession yields adapted messages (not raw Codex events)")
test("summary display shows token counts from turn.completed")
test("runStreamed throwing yields result/error_during_execution (not uncaught exception)")
test("OPENAI_API_KEY is not required to import the module (checked at runtime)")
test("missing OPENAI_API_KEY yields result/error_during_execution with helpful message")
test("empty string OPENAI_API_KEY (after trim) yields result/error_during_execution")
```

For API key tests, temporarily override `Bun.env.OPENAI_API_KEY` (or use an override injection pattern) so the test is hermetic and does not depend on the real environment.

## tests/codex-interactive.test.ts

Mirror the structure of `tests/interactive.test.ts`. Key test cases:

```typescript
test("first prompt with context prepended is passed to thread.runStreamed()")
test("empty first input exits without calling thread.runStreamed()")
test("EOF on first input exits without calling thread.runStreamed()")
test("second turn calls thread.runStreamed() again on same thread")
test("empty follow-up input exits the REPL")
test("'>' prompt appears on stderr (promptOutput), not stdout")
test("Codex error during a turn goes to errWrite; REPL continues")
test("SIGINT closes readline and exits")
test("SIGTERM closes readline and exits")
test("signal handlers are removed on normal exit")
test("model is passed to startThread() when specified")
test("model is omitted from startThread() when not specified")
test("context is only prepended on the first turn, not follow-up turns")
test("token usage summary displayed after each turn")
```

Use `CodexInteractiveOverrides` (injectable `createCodex`, `input`, `promptOutput`) for all tests — no real Codex SDK calls.

## Existing Test Updates

### tests/cli.test.ts

**Breaking change — `model` field semantics shift:**

Currently `index.ts` resolves the model before the dry-run check, so `json.model` today contains the **resolved** model ID (e.g. `"claude-sonnet-4-20250514"`). After the change, `json.model` is the **raw CLI input** (e.g. `"sonnet"`), and `json.resolvedModel` is the resolved form. Every existing dry-run test that asserts `json.model` against a resolved model string must be updated:

```typescript
// BEFORE (checking resolved model in json.model — will break):
expect(json.model).toBe("claude-sonnet-4-20250514");

// AFTER (raw input in json.model, resolved value in json.resolvedModel):
expect(json.model).toBe("sonnet");
expect(json.provider).toBe("anthropic");
expect(json.resolvedModel).toBe("claude-sonnet-4-20250514");
```

For tests that already check the raw alias (e.g. `expect(json.model).toBe("sonnet")`), only the new `provider` and `resolvedModel` assertions need to be added:

```typescript
// Before:
expect(json.model).toBe("sonnet");

// After:
expect(json.model).toBe("sonnet");           // unchanged — was already raw input
expect(json.provider).toBe("anthropic");
expect(json.resolvedModel).toBe("claude-sonnet-4-20250514");
```

Audit every `json.model` assertion in `tests/cli.test.ts` to determine which category it falls into before editing.

Tests for `resolveModel()` are replaced by tests for `resolveProvider()` in `tests/provider-router.test.ts`. The `resolveModel` import and its direct unit tests are removed from `tests/cli.test.ts`.

### tests/setup.test.ts

Add `@openai/codex-sdk` to the expected dependencies check. Note: `Bun.file().text()` returns a `Promise<string>` — the test must `await` it:

```typescript
test("package.json includes @openai/codex-sdk dependency", async () => {
  const pkg = JSON.parse(await Bun.file("package.json").text());
  expect(pkg.dependencies["@openai/codex-sdk"]).toBeDefined();
});
```

### tests/interactive.test.ts

No changes required — `src/interactive.ts` is not modified. All existing interactive tests must continue to pass.

## Acceptance Criteria

- [ ] `tests/provider-router.test.ts` created with all routing cases covered
- [ ] `tests/codex-stream-adapter.test.ts` created with all event translation cases covered
- [ ] `tests/codex-session.test.ts` created covering session factory behavior
- [ ] `tests/codex-interactive.test.ts` created covering multi-turn REPL behavior
- [ ] Existing `tests/cli.test.ts` updated to assert `provider` + `resolvedModel` in dry-run output
- [ ] Existing `tests/setup.test.ts` updated to check for `@openai/codex-sdk` dependency
- [ ] All existing tests continue to pass after changes (`bun test` exits 0)
- [ ] No test makes a real network call to OpenAI — all Codex SDK calls are mocked
- [ ] Codex SDK mock is scoped per test file, not globally, to avoid contaminating other test files
