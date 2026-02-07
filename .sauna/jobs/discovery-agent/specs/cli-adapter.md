# CLI Adapter

## Overview

The thinnest possible layer. Reads human input from stdin, passes it to the conversation engine, prints the engine's response to stdout. This is the only part that changes when moving to a server.

## Requirements

- Accept CLI arguments:
  - `--codebase <path>` (required): Path to the codebase the agent should explore
  - `--output <path>` (optional, default `./jobs/`): Where to write output files
  - `--provider <name>` (optional, default `anthropic`): Which LLM provider to use
  - `--model <name>` (optional): Model override for the provider
- On start:
  1. Initialize the LLM provider based on args
  2. Initialize tools (file_read, file_search, web_search, write_jtbd, write_spec, session_complete) scoped to the codebase path
  3. Load the jtbd.md system prompt (bundled with the package)
  4. Create the conversation engine with the above
  5. Prompt the human for their initial problem description
- Loop:
  1. Read human input from stdin
  2. Pass to engine via `start()` or `respond()`
  3. Print engine's text response to stdout
  4. If `done` is true, print summary of files written and exit
  5. Otherwise, prompt for next input

## Notes

- API keys come from environment variables (e.g., `ANTHROPIC_API_KEY`). The CLI does not accept them as arguments.
- Use a readline interface or similar for clean input handling (handle Ctrl+C gracefully)
- Print a visual separator between agent responses and the input prompt so the conversation is easy to follow
- When files are written mid-conversation, print a brief note (e.g., `📄 Wrote jobs/discovery-agent/jtbd.md`) so the human knows
- No colors or fancy formatting required for SLC — plain text is fine
