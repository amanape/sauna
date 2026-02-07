# Conversation Engine

## Overview

The core orchestrator. It manages the back-and-forth between the human, the LLM, and the tools. It doesn't know about CLI or servers — it communicates through an interface adapter.

## Requirements

- Accept configuration at construction: LLM provider, registered tools, system prompt (the jtbd.md content), and the codebase base path
- Expose a simple interface that the adapter (CLI or future server) interacts with:
  - `start(userMessage: string)`: Kick off the session with the human's initial problem description
  - `respond(userMessage: string)`: Send the human's next message
  - Both return an `EngineOutput` indicating what happened
- Internally, manage a `messages` array that grows over the session — this is the conversation state
- Run a loop on each call:
  1. Send messages + tool definitions to LLM
  2. If LLM returns tool calls → execute them, append results to messages, go to 1
  3. If LLM returns text → return it to the adapter for display to human
- The engine does NOT read from stdin or write to stdout — it returns data and the adapter handles I/O

## Interface Shape

```typescript
interface EngineOutput {
  /** Message to display to the human */
  text: string;
  /** Files written during this turn (if any) */
  files_written?: string[];
  /** Whether the agent considers the session complete */
  done: boolean;
}
```

## Notes

- The `messages` array is the session state. No separate state object needed.
- The engine should detect when the LLM writes files (via a file_write tool) and include the paths in `EngineOutput.files_written` so the adapter can inform the human
- The `done` flag is set when the LLM signals completion — how it signals this is a prompt engineering detail, not an engine concern. A simple convention: the LLM calls a `session_complete` tool (a no-op tool whose invocation means "I'm done").
- The system prompt (jtbd.md) is prepended as the first system message. The engine doesn't interpret it — the LLM does.
