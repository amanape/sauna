# Session Runner — Transport-Agnostic Conversation Logic

## What This Component Does

The session runner encapsulates the turn-by-turn interaction between a caller and an agent. It manages the ephemeral message array (accumulating user and assistant messages across turns), calls `agent.stream()`, processes step-finish callbacks (e.g., detecting file writes), and yields the streamed response. It does not know or care whether the caller is a readline loop, a web endpoint, or an automated test harness.

## Requirements

### Core Behavior

- The session runner must accept a user message (string), append it to the running message history, call `agent.stream()` with the accumulated messages, and return the streamed response.
- The session runner must replace its internal message array with the messages from `getFullOutput()` after each turn, preserving the existing behavior where the full conversation history (including tool calls/results) is carried forward.
- The session runner must be stateful within a session (it holds the message array) but must not persist state beyond the session lifetime. Sessions are ephemeral and disposable.
- The session runner must support an `onStepFinish` callback that the caller can use to observe step results (e.g., file write notifications). The callback must receive properly typed step results, not `any`.
- The session runner must support an optional `onFinish` callback that is passed through to `agent.stream()`.
- The session runner must skip empty/whitespace-only user messages without calling the agent.

### Interface Shape

- The session runner must expose a method for submitting a single user turn and getting back the stream result. It must not own the I/O loop — the caller decides when and how to send messages.
- The session runner must expose the `maxSteps` configuration for the agent stream call.
- The session runner must be constructable with an `Agent` instance and optional configuration (maxSteps, callbacks).

### Type Safety

- The message array must be typed using Mastra's `MastraDBMessage` type (from `@mastra/core` stream output types), not `any[]`.
- The `onStepFinish` callback parameter must be typed using Mastra's `LLMStepResult` type, not `any`.
- The `onFinish` callback must be typed using Mastra's `MastraOnFinishCallback` type, not `any`.

## Constraints

- The session runner must not import any Node.js stream, readline, or I/O modules.
- The session runner must not reference `process` in any form.
- The session runner must not be aware of CLI arguments, environment variables, or transport details.
- No session persistence, resumption, or cross-session history. The message array lives in memory for the duration of the session and is garbage collected when the session runner is discarded.
