# Interactive Mode — OpenAI Provider

## Overview

Implements `--interactive` mode for OpenAI models using Codex thread-based conversation continuation. This is a new file `src/codex-interactive.ts` that mirrors the interface of `src/interactive.ts` but uses the Codex SDK's thread model instead of the Anthropic Agent SDK's message-channel pattern.

## Why a Separate File is Required

The existing `runInteractive()` in `src/interactive.ts` is tightly coupled to the Anthropic Agent SDK's multi-turn architecture:

```
Single query() call → long-lived message channel (AsyncIterable<UserMessage>)
→ SDK drives the conversation turn-by-turn from one end
```

The Codex SDK uses a different model:

```
startThread() → thread object persists between calls
thread.runStreamed("turn 1") → async event stream
thread.runStreamed("turn 2") → new event stream, thread remembers history
```

These are fundamentally different: Anthropic feeds into a single session, Codex uses per-turn calls on a stateful thread. Extending `runInteractive()` to handle both would require significant abstraction at the cost of clarity. A dedicated `src/codex-interactive.ts` is simpler and keeps both implementations easy to reason about independently.

## New File: src/codex-interactive.ts

### Types

```typescript
// WriteFn is not exported from loop.ts — define locally (identical shape)
type WriteFn = (s: string) => void;

export type CodexInteractiveConfig = {
  prompt?: string;     // Optional — if absent, read first input from stdin
  model?: string;
  context: string[];
  // No claudePath — Codex SDK manages its own runtime
};

// CodexThread represents the object returned by codex.startThread()
type CodexThread = {
  runStreamed: (prompt: string) => Promise<{ events: AsyncIterable<any> }>;
};

export type CodexInteractiveOverrides = {
  // For testing: inject mock readline input
  input?: import("stream").Readable;
  // For testing: redirect the ">" prompt output (default: process.stderr)
  promptOutput?: import("stream").Writable;
  // For testing: inject a mock Codex instance
  createCodex?: () => { startThread: (opts?: { model?: string }) => CodexThread };
};
```

### Function Signature

```typescript
export async function runCodexInteractive(
  config: CodexInteractiveConfig,
  write: WriteFn,
  overrides?: CodexInteractiveOverrides,
  errWrite?: WriteFn
): Promise<void>
```

This signature is parallel to `runInteractive()` so `index.ts` can call both with the same shape.

## Conversation Flow

```
1. new Codex()  →  codex.startThread({ model })   [thread created once]
2. readline on stdin  →  prompt ">" written to stderr
3. Read first input (from config.prompt or readline)
4. buildPrompt(firstInput, config.context)         [context prepended once]
5. LOOP:
   a. thread.runStreamed(input)  →  async events
   b. const adaptedEvents = adaptCodexEvents(events, startTime)
   c. for await (const msg of adaptedEvents) → processMessage(msg, write, state, errWrite)
   d. On result message: write ">" prompt to stderr via writePrompt()
   e. Read next line from readline
   f. If empty or EOF: break
   g. Reset StreamState for next turn (createStreamState())
   h. Repeat from (a) with next input
6. Cleanup: close readline, remove signal handlers
```

### First Turn Context

Context paths (`--context`) are prepended to the **first turn only** using `buildPrompt()`. Follow-up turns send the raw user input — the Codex thread already has the context in its conversation history.

### Thread Lifecycle

- The `thread` object is created once at the start of `runCodexInteractive()` and reused for the entire interactive session
- Thread state (conversation history) is maintained automatically by the Codex SDK
- No explicit session ID tracking is needed (unlike `runInteractive()` which must track `session_id` for the message channel)

### Signal Handling

SIGINT and SIGTERM close the readline interface and break the event loop, producing a clean exit. This mirrors the signal handling in `src/interactive.ts`.

**What happens mid-stream:** Unlike the Anthropic interactive path which calls `q.close()` to terminate a long-lived SDK query, the Codex interactive path does not have a direct `.close()` equivalent on the thread. When SIGINT fires during an active `thread.runStreamed()` call, the signal handler calls `rl.close()`. The `readLine()` call (step e in the conversation flow) will resolve `null` on the next result message, causing the outer loop to break. If the signal fires while step (c) `for await (const msg of adaptedEvents)` is running, the loop body will finish processing the current event naturally, then the `result` message handler will call `readLine()`, which resolves `null` (rl is closed) and the loop exits. The async generator from `adaptedEvents` is garbage-collected at that point.

**Signal handler lifecycle:** Register both handlers before entering the loop. Remove both handlers in a `finally` block on normal exit — do not leave dangling signal handlers. This is the same pattern used in `src/interactive.ts`.

### Prompt Output

The `>` prompt is written to stderr (not stdout) to keep stdout clean for piping. Use the existing `writePrompt()` helper from `src/stream.ts`:

```typescript
import { writePrompt } from "./interactive";
// ...
writePrompt(promptOutput, state);
```

> **Note:** `writePrompt` is defined and exported from `src/interactive.ts`, not `src/stream.ts`. Import from `"./interactive"` — not `"./stream"`.

## Integration with index.ts

```typescript
if (interactive) {
  if (provider === "anthropic") {
    await runInteractive({ prompt, model: resolvedModel, context, claudePath: claudePath! }, write, undefined, errWrite);
  } else {
    // provider === "openai"
    await runCodexInteractive({ prompt, model: resolvedModel, context }, write, undefined, errWrite);
  }
}
```

## Acceptance Criteria

- [ ] New file `src/codex-interactive.ts` exists and exports `runCodexInteractive()`
- [ ] `--interactive --model openai:gpt-4o` starts a Codex thread-based REPL
- [ ] `--interactive --model openai:gpt-4o "first prompt"` uses the CLI prompt as the first turn input
- [ ] `--interactive --model openai:gpt-4o` with no prompt reads first input from stdin
- [ ] Empty first input exits immediately without starting a thread
- [ ] Context paths (via `--context`) are prepended to the first turn only
- [ ] Follow-up turns continue the same thread (conversation history is preserved)
- [ ] The `>` prompt appears on stderr, not stdout
- [ ] SIGINT closes the readline and exits cleanly
- [ ] SIGTERM closes the readline and exits cleanly
- [ ] Signal handlers are removed on normal exit
- [ ] Errors from Codex during a turn go to errWrite; the REPL continues to next turn
- [ ] Token usage summary is displayed after each turn (same format as non-interactive mode)
- [ ] `src/interactive.ts` is not modified
- [ ] `CodexInteractiveConfig` type is exported from `src/codex-interactive.ts`

## Edge Cases

- EOF on stdin (Ctrl+D) exits the REPL gracefully, same as `runInteractive()`
- Empty follow-up input exits the REPL (consistent with `runInteractive()`)
- Codex SDK throws during thread creation (not installed, bad API key): catch in the outer try/catch, send to errWrite, return without entering the loop
- `thread.runStreamed()` throws mid-session: catch, send error to errWrite, write the `>` prompt and continue to next user turn (do not exit)
- Very long Codex response: stream events accumulate normally; no timeout is imposed at the interactive layer
