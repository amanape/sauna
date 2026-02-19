# Codex Session

## Overview
A new session module that wraps the OpenAI Codex TypeScript SDK (`@openai/codex-sdk`), mirroring the existing Claude session architecture. This allows sauna's loop and interactive systems to work with Codex sessions identically to how they work with Claude sessions.

## Architecture

### Current Claude Session Pattern (to mirror)
```typescript
// src/session.ts (existing — do not modify)
import { query } from "@anthropic-ai/claude-agent-sdk";

export function runSession(config: SessionConfig) {
  const fullPrompt = buildPrompt(config.prompt, config.context);
  return query({
    prompt: fullPrompt,
    options: {
      pathToClaudeCodeExecutable: config.claudePath,
      systemPrompt: { type: "preset", preset: "claude_code" },
      ...
    },
  });
}
```

### New Codex Session Pattern (to create)
```typescript
// src/codex-session.ts (new file)
import { Codex } from "@openai/codex-sdk";

export function runCodexSession(config: CodexSessionConfig) {
  const codex = new Codex();
  const thread = codex.startThread();
  // Must return an AsyncGenerator compatible with runLoop()
  // Must yield messages compatible with processMessage() in stream.ts
}
```

### Key Requirement: AsyncGenerator Interface
The existing loop system (`src/loop.ts`) calls `createSession()` which returns an `AsyncGenerator<any>`. The loop then iterates with `for await (const msg of session)` and passes each message to `processMessage()`.

The Codex session MUST conform to this same interface. This means:
- It must be an async generator or return an async iterable
- Messages it yields should be compatible with `processMessage()` in `src/stream.ts`
- OR: `processMessage()` should be extended to handle Codex message formats
- Token usage, duration, and turn count must be available for the summary display

### CodexSessionConfig Type

```typescript
// src/codex-session.ts
export type CodexSessionConfig = {
  prompt: string;
  model?: string;
  context: string[];
  // No claudePath — Codex SDK manages its own runtime
};
```

### Message Format: Adapt to sauna's Existing Format

`runCodexSession()` must yield messages in sauna's existing internal format — the same shape that `processMessage()` in `src/stream.ts` already handles. It does NOT yield raw Codex SDK events.

This is done by composing with `adaptCodexEvents()` from `src/codex-stream-adapter.ts`:

```typescript
export async function* runCodexSession(config: CodexSessionConfig): AsyncGenerator<any> {
  const fullPrompt = buildPrompt(config.prompt, config.context);
  const codex = new Codex();
  const thread = codex.startThread(config.model ? { model: config.model } : {});
  const startTime = Date.now();
  const { events } = await thread.runStreamed(fullPrompt);
  yield* adaptCodexEvents(events, startTime);
}
```

The adaptation layer (`src/codex-stream-adapter.ts`) is documented in a separate spec. The key point is that `loop.ts` and `stream.ts` are completely unmodified — they process Codex output via the same `processMessage()` path as Claude output.

### Token Usage Mapping

Codex SDK's `turn.completed` event provides:
```typescript
event.usage = { input_tokens: number, cached_input_tokens: number, output_tokens: number }
```

These map directly to sauna's `SummaryInfo` fields:
- `event.usage.input_tokens` → `inputTokens`
- `event.usage.output_tokens` → `outputTokens`
- `event.usage.cached_input_tokens` → ignored (sauna's summary display does not use it)
- `num_turns` is always `1` per `runCodexSession()` call (each call is one loop iteration)
- `duration_ms` is computed as `Date.now() - startTime`

The adapted `result` message:
```typescript
{
  type: "result",
  subtype: "success",
  result: "",
  usage: { input_tokens: ..., output_tokens: ... },
  num_turns: 1,
  duration_ms: Date.now() - startTime,
}
```

### Interactive Mode is Handled Separately

`runCodexSession()` is a **single-turn** session factory used by `runLoop()`. It is NOT used for `--interactive` mode.

Interactive mode for OpenAI uses Codex thread continuations, which requires keeping the `thread` object alive between user turns. This is implemented in `src/codex-interactive.ts` (see `interactive-openai.md`). The `index.ts` dispatch routes `--interactive` with an OpenAI provider to `runCodexInteractive()`, not `runCodexSession()`.

### OPENAI_API_KEY Validation

Before creating the `Codex` instance in `runCodexSession()`, check that `Bun.env.OPENAI_API_KEY` is set and non-empty (after trimming). If missing or empty, yield a `result/error_during_execution` message with a clear error text (the exact message format is specified in `error-handling.md`) — do NOT throw.

```typescript
const apiKey = Bun.env.OPENAI_API_KEY?.trim();
if (!apiKey) {
  yield {
    type: "result",
    subtype: "error_during_execution",
    errors: ["OPENAI_API_KEY is not set.\n\nTo fix this:\n  1. Get your API key from https://platform.openai.com/api-keys\n  2. Add to .env: OPENAI_API_KEY=sk-your-key-here"],
  };
  return;
}
```

> **Important:** `errors` must be `string[]`, not an array of objects. `processMessage()` passes `msg.errors` directly to `formatError(subtype, errors: string[])` which iterates the array as plain strings. Passing `{ type, text }` objects would produce `[object Object]` in the output.

The same check applies at the start of `runCodexInteractive()` — perform the check before creating the thread. On failure, call `errWrite` with the error message and return without entering the REPL loop.

### Dependency
Add `@openai/codex-sdk` to `package.json` dependencies:
```json
"dependencies": {
  "@anthropic-ai/claude-agent-sdk": "^0.2.42",
  "@openai/codex-sdk": "latest",
  "cleye": "^2.2.1"
}
```

## Acceptance Criteria

- [ ] New file `src/codex-session.ts` exists
- [ ] `@openai/codex-sdk` added to package.json dependencies
- [ ] `runCodexSession()` function creates a Codex SDK instance and runs prompts
- [ ] Codex sessions return an AsyncGenerator yielding messages in sauna's existing internal format
- [ ] The returned AsyncGenerator is compatible with `runLoop()` in `src/loop.ts` without modifying `loop.ts`
- [ ] Context paths are prepended to prompts using `buildPrompt()` from `src/session.ts`
- [ ] Token usage (input/output) is captured from `turn.completed` event and included in the adapted `result` message
- [ ] Session duration is tracked from call start to `turn.completed` and included in the adapted `result` message
- [ ] Errors from Codex SDK are adapted to `{ type: "result", subtype: "error", errors: [...] }` messages
- [ ] `OPENAI_API_KEY` is validated (non-empty after trim) at the start of `runCodexSession()` before creating the Codex instance
- [ ] Missing or empty `OPENAI_API_KEY` yields a `result/error_during_execution` message and returns without calling the SDK
- [ ] `runCodexSession()` is NOT used for interactive mode — interactive mode uses `src/codex-interactive.ts`
- [ ] `CodexSessionConfig` type is exported from `src/codex-session.ts`

## Edge Cases

- Codex SDK not installed: show clear error asking user to run `bun add @openai/codex-sdk`
- Codex session times out: catch and show helpful error
- Codex returns empty response: handle gracefully, show message to user
- Network error during Codex session: catch and display, allow next loop iteration to proceed
- `config.model` is `undefined` or empty: pass empty options `{}` to `startThread()` (do not pass `{ model: undefined }` — use `config.model ? { model: config.model } : {}` to let the SDK use its default)
