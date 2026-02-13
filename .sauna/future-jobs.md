# Future Jobs

Jobs identified during discovery but not yet scoped. Pick these up when the prerequisite jobs are done.

## Agent Observability Polish

**Prerequisite**: `jobs/agent-observability/`

Adds structured output formatting on top of the basic visibility layer:

- **@clack/prompts** — Pipeline step UI for plan/build/run phases (`intro()`, `spinner()`, `log.step()`, `outro()`, connected step indicators)
- **marked + marked-terminal** — Render agent markdown responses with syntax highlighting, headings, bold/italic, code blocks
- **boxen** — Bordered sections for tool results, search result summaries, error details
- **Ink + React** (ambitious) — Full TUI with declarative layout, concurrent component rendering, Flexbox via Yoga. This is the Claude Code approach. Consider if the simpler tools prove insufficient.

## Mastra Observability Integration

**Prerequisite**: `jobs/agent-observability/`

Wire up Mastra's built-in logging and tracing infrastructure for developer debugging and production monitoring:

- **PinoLogger** from `@mastra/loggers` — structured framework-level logging at configurable levels (DEBUG/INFO/WARN/ERROR) with categories (AGENT, LLM, TOOL_CALL, WORKSPACE, etc.)
- **AI Tracing** — Structured spans for agent runs, model calls, tool executions. Persist to `.sauna/jobs/<job>/traces/` for post-run review.
- **`--debug` flag** — Enable Mastra's internal logger at DEBUG level for framework diagnostics
- **Exporter integration** — Optional exporters to Langfuse, Langsmith, SigNoz, or any OpenTelemetry provider for teams wanting dashboards
- **Tracing policies** — Control which internal spans are visible vs hidden
