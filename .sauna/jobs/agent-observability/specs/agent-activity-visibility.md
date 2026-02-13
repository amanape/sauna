# Agent Activity Visibility

## Purpose

A module that receives Mastra agent execution callbacks and translates them into human-readable terminal output. This is the core observability layer — it decides what to show, how to summarize it, and where to write it.

## Inputs

The module receives data from three Mastra callback hooks available on both `agent.generate()` and `agent.stream()`:

### onStepFinish

Fires after each execution step. Provides:
- `toolCalls[]` — array of tool invocations, each with `payload.toolName` and `payload.args`
- `toolResults[]` — array of tool results, each with `payload.toolName`, `payload.result`, and `payload.isError`
- `reasoningText` — the model's reasoning/thinking text (if available)
- `usage` — token counts: `inputTokens`, `outputTokens`, `totalTokens`, `reasoningTokens`, `cachedInputTokens`
- `finishReason` — why the step ended: `'stop'`, `'tool-calls'`, `'length'`, `'error'`

### onFinish

Fires once when the entire generation completes. Provides:
- `steps[]` — all LLMStepResult objects from the execution
- `totalUsage` — aggregated token counts across all steps
- `error` — error information if the generation failed

### onChunk (for real-time tool-call-start visibility)

Fires for every chunk during generation. Key chunk types:
- `tool-call` — a tool invocation is starting (has `toolName`, `args`)
- `tool-result` — a tool has returned
- `tool-error` — a tool execution failed

## Outputs

Formatted lines written to a `Writable` stream (typically `process.stdout`). The module does not own the stream — it receives it via injection.

## Behaviors

### Tool Call Display

Every tool call must be displayed with:
- The tool name (cleaned of prefixes like `mastra_workspace_` for readability)
- A one-line summary appropriate to the tool type

Tool-type-specific summaries:
- **File read**: show the file path
- **File write**: show the file path and success/failure
- **Directory listing**: show the directory path
- **Web search**: show the search query
- **MCP tools**: show the tool name and a brief arg summary
- **Sub-agent delegation**: show "Delegating to researcher..." with a summary when complete

### Tool Result Display

Every tool result must be displayed with:
- A success/failure indicator
- A one-line summary of the result (not the full payload)
- For errors: the error message

### Verbosity Levels

The module must support two modes controlled by a boolean:

**Normal mode** (default):
- Tool name + one-line summary for each call
- Success/failure indicator for each result
- Sub-agent delegation indicator
- Token usage and timing (from execution metrics spec)

**Verbose mode** (`--verbose`):
- Everything in normal mode, plus:
- Full tool call arguments (JSON, truncated to a reasonable length)
- Full tool result payloads (JSON, truncated)
- Reasoning/thinking text if present
- Per-step finish reason

### Sub-Agent Activity

When the agent delegates to the researcher sub-agent (via Mastra's agent-as-tool mechanism), the reporter must:
- Show that the researcher is active (e.g., "Researcher investigating...")
- Show a one-line summary when the researcher returns
- NOT show the researcher's individual tool calls (that would be full tool-by-tool mode, which is out of scope)

### Error Handling

- Tool errors (`isError: true` on result, or `tool-error` chunks) must be visually distinct from successes
- Generation-level errors from `onFinish` must be displayed prominently
- The reporter must never throw — logging failures should be swallowed (the agent's work is more important than display)

## Constraints

- The module must be injectable and testable — accept a `Writable` output stream and a verbosity flag, no direct `process.stdout` references
- The module must not import CLI-specific code (argument parsing, readline, etc.)
- Tool name cleaning logic (stripping prefixes, humanizing names) must be a pure function for easy testing
- Output must be safe for terminals that don't support ANSI codes (degrade gracefully if colors are stripped)
- The module must work with both `generate()` callbacks (plan/build/run) and `stream()` callbacks (discover) — same reporter, different invocation contexts
