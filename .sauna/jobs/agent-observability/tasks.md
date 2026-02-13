# Agent Observability — Tasks

## Completed

- [x] Install `ansis`, `nanospinner`, and `figures` as dependencies — terminal-formatting.md
- [x] Create `src/terminal-formatting.ts`: color helpers, symbol constants, indentation utilities, duration formatter, ANSI degradation — terminal-formatting.md
- [x] Create `src/execution-metrics.ts`: per-turn token tracking, cumulative session totals, wall-clock timing — execution-metrics.md
- [x] Create `src/activity-reporter.ts`: accepts Writable stream + verbosity flag, consumes onStepFinish, writes formatted lines — agent-activity-visibility.md
- [x] Implement tool-type-specific one-line summaries (file read/write, directory listing, web search, MCP tools, sub-agent) — agent-activity-visibility.md
- [x] Implement tool name cleaning as a pure function (strip MCP prefixes) — agent-activity-visibility.md
- [x] Implement verbose mode: full tool args/results as truncated JSON, reasoning text, finish reason — verbosity-control.md
- [x] Display per-turn and cumulative token usage after each agent turn, per-tool-call duration inline — execution-metrics.md
- [x] Add spinner that activates during blocking operations and stops before other output — terminal-formatting.md
- [x] Add `--verbose` flag to all four subcommands in parseArgs — verbosity-control.md
- [x] Wire activity reporter + metrics into runConversation (discover) via onStepFinish — agent-activity-visibility.md
- [x] Wire activity reporter + metrics into plan/build/run handlers via callbacks — agent-activity-visibility.md
- [x] Add streaming mode to SessionRunner (agent.stream, fullStream iteration, getFullOutput) — discover-streaming.md
- [x] Update runConversation for streaming: text-delta output, tool chunk routing via onChunk, usage extraction — discover-streaming.md
- [x] Handle text/tool interleaving during streaming (newlines, mid-line detection, trailing newline) — discover-streaming.md
- [x] Add onChunk handler to ActivityReporter for streaming chunk display — agent-activity-visibility.md
- [x] Enable streaming in discover mode in main() — discover-streaming.md
- [x] Tests for terminal formatting module — terminal-formatting.md
- [x] Tests for execution metrics module — execution-metrics.md
- [x] Tests for activity reporter (normal, verbose, tool summaries, tool name cleaning, sub-agent, onChunk) — agent-activity-visibility.md
- [x] Tests for --verbose flag parsing across all four subcommands — verbosity-control.md
- [x] Tests for SessionRunner streaming mode — discover-streaming.md
- [x] Add `onFinish` handler to ActivityReporter interface and implementation; display generation-level errors with `colors.error` (bold red); hook it up in discover's `runConversation` call and in plan/build/run handlers — agent-activity-visibility.md
- [x] Tests for `onFinish` handler: generation-level error display (Error, string, object with message), no-error happy path, error swallowing on malformed data, spinner pause during error display, failure symbol in output — agent-activity-visibility.md
- [x] Display stream errors to the user (formatted, not swallowed) in `handleStreamingTurn`'s catch block in `cli.ts` — discover-streaming.md

## Remaining — Priority 1 (spec compliance gaps)
- [x] Call `spinner.update()` from the reporter's `onChunk` handler when `tool-call` chunks arrive (e.g. "Calling web_search…") — terminal-formatting.md

## Remaining — Priority 2 (visual polish per spec)

- [x] Use `colors.yellow` instead of `colors.cyan` for sub-agent/researcher tool calls in both `onStepFinish` and `onChunk` paths — agent-activity-visibility.md, terminal-formatting.md
- [ ] Show "Researcher investigating…" spinner text while researcher sub-agent is active — agent-activity-visibility.md
- [ ] Use `colors.error` (bold red) for tool error messages instead of plain `colors.red` in both `summarizeToolResult` and the `onChunk` tool-error handler — agent-activity-visibility.md

## Remaining — Priority 3 (tests for new work)

- [x] Tests for stream error display in `handleStreamingTurn` — discover-streaming.md
- [x] Tests for spinner text updates on tool-call chunks — terminal-formatting.md, agent-activity-visibility.md
- [x] Tests for yellow sub-agent coloring — agent-activity-visibility.md
- [ ] Tests for researcher active indicator — agent-activity-visibility.md
