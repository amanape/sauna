# Execution Metrics

## Purpose

Track and display token usage and execution timing so users understand the cost and performance of agent runs.

## Token Usage

### Data Source

Mastra provides token usage at two granularities:

- **Per-step**: `onStepFinish` callback includes `usage` with `inputTokens`, `outputTokens`, `totalTokens`, `reasoningTokens` (optional), `cachedInputTokens` (optional)
- **Per-generation**: `onFinish` callback includes `totalUsage` aggregating all steps in that generation

### Display

**Per agent turn** (after each `sendMessage` / stream completion):
- Show input tokens, output tokens, and total
- Show reasoning tokens if non-zero (relevant for models with extended thinking)
- Show cached input tokens if non-zero (indicates prompt caching savings)

**Cumulative per session** (running total across all turns in a conversation or all iterations in a loop):
- Maintain a running sum of token counts
- Display the cumulative total alongside the per-turn total

**Format**: Tokens should be displayed as compact numbers (e.g., "1,247" not "1247") in dim/gray text, indented with other metadata.

## Duration Timing

### What to Time

- **Per agent turn**: Wall-clock time from `sendMessage()` call to result/stream completion
- **Per tool call**: Wall-clock time from tool-call chunk to corresponding tool-result chunk (in streaming mode), or the delta between consecutive `onStepFinish` calls (in batch mode where individual tool timing is not directly available)

### Display

- Duration shown in human-readable format: milliseconds for fast operations (<1s), seconds with one decimal for longer operations (e.g., "2.3s"), minutes for very long operations (e.g., "1m 23s")
- Displayed alongside the corresponding tool result or turn summary
- Formatted in dim/gray text, inline with other metadata

### Implementation

Timing uses `performance.now()` or equivalent high-resolution timer. The metrics module tracks start times and computes deltas — it does not depend on Mastra providing timing data.

## Constraints

- Token tracking must not accumulate across separate `SessionRunner` instances (each plan/build iteration creates a fresh session). Cumulative tracking applies within a single session or within a single `runConversation` call.
- The metrics module must be injectable and testable — accept timing functions rather than calling `performance.now()` directly, so tests can provide deterministic clocks.
- Display formatting (colors, symbols, indentation) is provided by the terminal formatting spec — the metrics module computes values, the activity reporter formats and writes them.
- Token counts come from Mastra callbacks. If a callback does not include usage data (e.g., some error cases), the metrics module must handle missing data gracefully (skip display, not crash).
