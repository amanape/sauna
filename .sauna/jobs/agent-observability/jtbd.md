# Agent Activity Observability

## Problem

When a user runs any sauna subcommand (discover, plan, build, run), they have near-zero visibility into what the agent is doing. The CLI blocks silently during agent execution — no indication of tool calls, file reads, web searches, sub-agent delegation, reasoning, token consumption, or execution timing. The only visible tool activity is a `Wrote path/to/file` message for successful file writes in discover mode. Everything else is a black box.

This means:
- Users can't tell if the agent is stuck, spinning, or making progress
- Users can't verify that the agent is researching before asking questions (a core principle of the discovery prompt)
- Users can't see token/cost accumulation during long autonomous runs (plan, build, run)
- Users can't debug unexpected agent behavior because intermediate steps are invisible
- The discover subcommand returns entire responses as a batch rather than streaming text in real time, making the interactive conversation feel sluggish

## Job to Be Done

When I run a sauna agent, I can see what it's doing in real time — which tools it's calling, what it found, how long things take, and how many tokens it's using — so that I can trust the process, catch problems early, and understand the cost of each run.

## Acceptance Criteria

- [ ] All tool calls (reads, writes, searches, directory listings, MCP tools) are visible across all subcommands
- [ ] Tool results are summarized (success/failure, key details) without dumping raw payloads
- [ ] Sub-agent (researcher) activity shows a summary indicator when active and a one-line result when done
- [ ] The discover subcommand streams agent text output in real time (character by character), not as a batch
- [ ] Tool activity is visible during streaming in discover mode (interleaved with text)
- [ ] A spinner or equivalent indicator shows the agent is working during blocking operations
- [ ] Terminal output uses colors and symbols to visually distinguish event types (tool calls, results, errors, agent text)
- [ ] A `--verbose` flag on all subcommands controls whether full tool arguments and results are shown
- [ ] Token usage (input, output, total) is displayed per agent turn and cumulatively per session
- [ ] Execution duration is shown per tool call and per agent turn
- [ ] Errors and failures are clearly highlighted and distinguishable from successful operations
- [ ] Non-streaming subcommands (plan, build, run) show tool activity via Mastra callbacks without requiring architectural changes to use streaming

## Out of Scope

- Full TUI with panels, layout, and interactive elements (Ink/React) — reserved for a follow-up job
- Structured output rendering (markdown rendering, bordered boxes, clack pipeline UI) — follow-up job
- Log-to-file persistence for post-run review
- Streaming for plan/build/run subcommands (batch mode with callbacks is sufficient)
- OpenTelemetry integration or external tracing exporters
- Custom Mastra logger implementation (the built-in logger is not the mechanism here — callbacks are)

## SLC Scope

The simplest complete solution adds an activity reporter that translates Mastra's existing `onStepFinish`, `onChunk`, and `onFinish` callbacks into formatted terminal output across all subcommands. For discover mode, the session runner switches from `agent.generate()` to `agent.stream()` with `fullStream` iteration. A small set of formatting dependencies (terminal colors, spinners, status symbols) provides visual structure. A `--verbose` flag controls detail level. Token usage and timing are tracked and displayed.

This is sufficient because it transforms the CLI from a black box into a transparent window on agent activity without requiring a full TUI rewrite or external observability infrastructure.

## Related JTBDs

- (Future) `agent-observability-polish/` — structured output, markdown rendering, clack pipeline UI, Ink TUI
