# Discover Streaming

## Purpose

The discover subcommand currently uses `agent.generate()` which blocks until the entire response is ready, then dumps it all at once. This spec covers switching discover mode to `agent.stream()` so that agent text appears character by character and tool activity is visible in real time as it happens.

Plan, build, and run subcommands remain on `agent.generate()` with enhanced callbacks — only discover changes.

## Current Architecture

`runConversation()` creates a `SessionRunner` that calls `agent.generate()` per user message. The result is written to `deps.output` as a single `result.text + "\n"` call. Tool activity is observed via `onStepFinish` callback. Message history is managed by replacing `this.messages` with `result.messages` after each turn.

## Required Changes

### SessionRunner

SessionRunner must support a streaming mode in addition to its current batch mode. In streaming mode:
- It calls `agent.stream()` instead of `agent.generate()`
- It iterates the `fullStream` property to yield chunks in real time
- After streaming completes, it calls `getFullOutput()` to retrieve the canonical message history (`.messages`) for multi-turn continuity
- The message accumulation pattern (push user message, replace with response messages) must be preserved

### runConversation

The conversation loop must handle streaming output:
- `text-delta` chunks are written to the output stream immediately (character by character)
- `tool-call`, `tool-result`, and `tool-error` chunks are passed to the activity reporter (from the agent-activity-visibility spec) for formatted display
- `step-finish` and `finish` chunks provide usage data to the execution metrics display
- After each full response, message history is updated from `getFullOutput()`

### Interleaving Text and Tool Activity

When the agent calls a tool mid-response, the text stream pauses and tool activity appears. When the tool returns and the agent continues generating text, streaming resumes. The output must handle this gracefully:
- Tool activity lines appear on their own lines, visually distinct from streaming text
- If text was mid-line when a tool call starts, a newline should be inserted before the tool activity
- When text resumes after a tool call, it starts on a new line

## Behaviors

### Real-Time Text Output

Agent text must appear as it generates — the user sees characters/words appear progressively, not a wall of text after a delay. This is the primary UX improvement for discover mode.

### Tool Visibility During Streaming

Tool calls that happen during streaming (the agent pauses text to use a tool, then continues) must be visible between text segments. The activity reporter handles formatting; this spec defines that the streaming loop must route tool chunks to the reporter.

### Error Handling

- If the stream errors, the error must be displayed and the conversation loop must continue (not crash)
- Partial text already written to output before an error should remain visible
- The readline interface must remain functional after stream errors

### Multi-Turn Message Continuity

After streaming completes, `getFullOutput()` returns the full output including `.messages`. These messages must replace the session's message array, identical to how `generate()` results are handled today. This ensures the agent has correct conversation history for subsequent turns.

## Constraints

- Only the discover subcommand uses streaming — plan/build/run stay on `generate()`
- The streaming path must support the same `onStepFinish` observations as the batch path (Mastra's `stream()` also supports `onStepFinish` in its options)
- The `SessionRunner` must remain testable — mock agents can return mock stream objects
- The `fullStream` is a `ReadableStream<ChunkType>` iterable with `for await...of`
