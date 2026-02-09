# CLI Simplification

## Overview

The CLI adapter becomes a thin layer that parses arguments, wires up the Vercel AI SDK, and runs a readline loop. The conversation engine intermediary is removed — the CLI interacts with the SDK directly.

## Requirements

### Arguments

- `--codebase <path>` (required): Path to the codebase the agent explores
- `--output <path>` (optional, default `./jobs/`): Where output files are written
- `--model <name>` (optional): Model override for the Anthropic provider
- The `--provider` argument is removed (Anthropic only for now)
- Missing `--codebase` must produce a clear error message

### Startup

- The CLI must initialize the three tools (file read, file write, web search) scoped to the appropriate paths
- The system prompt must be loaded from the bundled discovery prompt file
- The API key must come from the `ANTHROPIC_API_KEY` environment variable — a missing key must produce a clear error before any LLM call

### Conversation Loop

- The CLI reads user input via readline, passes it to the Vercel AI SDK's agentic text generation along with the full conversation history, and prints the model's text response
- Conversation history accumulates across turns — each turn's messages (including tool calls and results) are preserved for subsequent turns
- Empty input lines are ignored
- Ctrl+C exits the session cleanly

### File Write Notifications

- When a tool writes a file during a turn, the CLI must print a notification to the user as the write happens (not batched at the end of the turn)
- The notification format is a line showing the relative path of the written file

### Session Completion

- The session ends when the user exits (Ctrl+C or EOF)
- No programmatic "done" detection is required — the user reviews the written files and decides when they're satisfied
