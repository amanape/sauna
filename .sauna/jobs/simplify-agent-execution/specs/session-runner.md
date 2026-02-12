# Session Runner — Generate-Based Execution

## What This Component Does

The `SessionRunner` manages multi-turn agent conversations for batch execution. It accumulates message history and sends it with each call. This spec replaces the current streaming-based execution with Mastra's `agent.generate()` method.

## Requirements

### Core Behavior

- `sendMessage()` must call `agent.generate()` with the accumulated message history and return the complete result
- The generate result includes the full message list; the session's internal message array must be replaced with it (same semantic as today, without the monkey-patch)
- `sendMessage()` must return the agent's response directly — no stream object, no deferred finalization

### Interface Changes

- The return type of `sendMessage()` changes from a stream result object to the generate output (or a simplified subset of it)
- The `onStepFinish` and `onFinish` callbacks must be passed through to `generate()` options if Mastra supports them on generate; if not, they must be removed from `SessionRunnerConfig`

### What Does Not Change

- Constructor shape (agent, maxSteps)
- Empty-message guard (return null for blank input)
- Message accumulation pattern (push user message, call agent, replace messages from result)

## Constraints

- Must not introduce streaming for batch paths — the entire point is to simplify
- Must not change the SessionRunner's role as a stateful conversation wrapper
- Must verify that Mastra's `agent.generate()` supports `maxSteps` for multi-step tool use before implementation
