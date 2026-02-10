# Discovery Agent

## What This Component Does

The discovery agent is the primary interactive agent. It conducts JTBD interviews with a human, researches codebases and the web, and writes structured spec files. It is the only agent that communicates directly with the user via stdin/stdout.

## Requirements

### Behavior

- The discovery agent must be defined as a Mastra Agent with its own identity, model configuration, and system prompt.
- Its system prompt must be loaded from `.sauna/prompts/discovery.md` — the existing prompt content must not change.
- The agent must operate interactively: read user input from stdin, generate a response (potentially calling tools across multiple steps), and write the response to stdout.
- The agent must maintain conversation history across turns within a session (multi-turn conversation).
- The agent must be able to call tools autonomously across multiple steps within a single turn (agentic loop) before responding to the user.

### Tools

- The discovery agent must have access to all workspace tools: file read, file write, file edit, directory listing, shell execution, and web search.
- When the agent writes spec files, the write path must be relative to the configured output directory.
- File write events (when the agent creates or updates a spec file) should be surfaced to the user in real time, not only after the full response completes.

### Model

- The default model is Claude Sonnet (`claude-sonnet-4-5-20250929`).
- The model must be overridable via a `--model` CLI argument.
- The provider must be overridable (e.g., switching to OpenAI or Google models).

### CLI Interface

- The CLI must accept `--codebase <path>` (required) to specify the codebase directory for the workspace filesystem.
- The CLI must accept `--output <path>` (optional, default `./jobs/`) to specify the output directory for generated specs.
- The CLI must accept `--model <id>` (optional) to override the default model.
- The CLI must validate that the required API key environment variable is set before starting the agent.

## Constraints

- This is the only human-in-the-loop agent. All other agents (future) will be autonomous.
- The agent must work with Bun's stdin/stdout, not a web server or HTTP interface.
