# Agent Observability — Tasks

## Priority 1: Foundation

- [x] Install `ansis`, `nanospinner`, and `figures` as dependencies — terminal-formatting.md
- [x] Create `src/terminal-formatting.ts`: color helpers (cyan/green/red/yellow/dim), symbol constants (tick/cross/pointer/spinner), indentation utilities, duration formatter (ms/s/m rules), graceful ANSI degradation — terminal-formatting.md
- [x] Create `src/execution-metrics.ts`: per-turn token tracking (input/output/total/reasoning/cached), cumulative session totals, `performance.now()` wall-clock timing, formatted display strings — execution-metrics.md

## Priority 2: Core Observability

- [x] Create `src/activity-reporter.ts`: accepts `Writable` stream + verbosity flag, consumes `onStepFinish` data, writes formatted lines via terminal formatting module — agent-activity-visibility.md
- [x] Implement tool-type-specific one-line summaries: file read/write → path, directory listing → path, web search → query, MCP tools → name + args, sub-agent → status + one-line result — agent-activity-visibility.md
- [x] Implement tool name cleaning as a pure function (strip `mastra_workspace_` and similar prefixes) — agent-activity-visibility.md
- [x] Implement verbose mode in activity reporter: full tool args/results as truncated JSON (~500 chars), reasoning text, per-step finish reason — verbosity-control.md
- [x] Display per-turn and cumulative token usage after each agent turn, and per-tool-call duration inline — execution-metrics.md
- [x] Add spinner (nanospinner) that activates during blocking agent operations, updates text with current activity, stops before other output — terminal-formatting.md

## Priority 3: CLI Integration

- [x] Add `--verbose` boolean flag to DiscoverArgs, PlanArgs, BuildArgs, RunArgs in `src/cli.ts` parseArgs — verbosity-control.md
- [x] Wire activity reporter + metrics into `runConversation` (discover) via existing `onStepFinish`/`onFinish` callbacks — agent-activity-visibility.md
- [x] Wire activity reporter + metrics into plan/build/run handlers via callbacks in loop-runner and job-pipeline — agent-activity-visibility.md

## Priority 4: Discover Streaming

- [x] Add streaming mode to `SessionRunner`: call `agent.stream()`, iterate `fullStream`, call `getFullOutput()` for message history — discover-streaming.md
- [x] Update `runConversation` to handle streaming: write `text-delta` chunks immediately, route tool chunks via `onChunk` callback, extract usage from `step-finish`/`finish` — discover-streaming.md
- [x] Handle text/tool interleaving during streaming: insert newline before tool activity if mid-line, resume text on new line after tool activity, trailing newline after stream completes — discover-streaming.md

## Priority 5: Testing

- [x] Tests for terminal formatting module: color helpers, symbol constants, duration formatting, graceful degradation — terminal-formatting.md
- [x] Tests for execution metrics module: token accumulation, timing, missing data handling — execution-metrics.md
- [x] Tests for activity reporter: normal vs verbose output, tool-type summaries, tool name cleaning, sub-agent display, stream injection — agent-activity-visibility.md
- [x] Tests for `--verbose` flag parsing across all four subcommands — verbosity-control.md
- [x] Tests for SessionRunner streaming mode: fullStream iteration, message history via getFullOutput, error handling — discover-streaming.md

## Remaining

- [x] Add `onChunk` handler to `ActivityReporter` interface and `createActivityReporter()` that formats `tool-call`, `tool-result`, and `tool-error` streaming chunks for display — agent-activity-visibility.md
- [x] Add tests for activity reporter `onChunk` handler: tool-call/tool-result/tool-error chunk formatting, spinner pause during chunk output, verbose vs normal mode — agent-activity-visibility.md
- [ ] Enable streaming in discover mode: pass `streaming: true` and `onChunk: reporter.onChunk` to `runConversation()` in `main()` discover case (`src/cli.ts:412-425`) — discover-streaming.md
