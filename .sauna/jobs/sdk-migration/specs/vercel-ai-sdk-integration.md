# Vercel AI SDK Integration

## Overview

The custom conversation engine, LLM provider, and type system are replaced by the Vercel AI SDK (`ai` package) and its Anthropic provider (`@ai-sdk/anthropic`). The SDK handles the agentic loop (LLM call → tool execution → repeat), provider-specific message/tool translation, and type definitions. The `@anthropic-ai/sdk` direct dependency is removed.

## Requirements

### Agentic Loop

- The SDK's built-in agentic loop replaces the custom conversation engine entirely — no hand-rolled loop that calls the LLM, executes tools, and feeds results back
- The maximum number of tool execution iterations must be capped at 50 (matching current behavior)
- The loop must automatically execute tool calls returned by the model and feed results back until the model produces a text-only response

### Provider

- Anthropic is the only provider, via `@ai-sdk/anthropic`
- The model defaults to `claude-sonnet-4-5-20250929` but is overridable via CLI argument
- The API key is read from the `ANTHROPIC_API_KEY` environment variable

### Multi-Turn Conversation

- The system must support multi-turn conversation across an interactive session — the user sends a message, the agent responds (possibly executing tools), then the user sends another message with full conversation history preserved
- Conversation history (messages) is the session state — there is no separate state object
- The system prompt is loaded from the agent's prompt file and passed as a system-level instruction on every turn

### Agent as Config

- Creating a new agent must require only: a system prompt, a set of tools, and a model choice
- No engine class, provider class, or custom types should need to be written or instantiated to create a new agent

### Tool Integration

- Tools defined with the Vercel AI SDK's tool pattern (Zod schemas) must be passed to the agentic loop and automatically made available to the model
- Tool parameter schemas use Zod with descriptions on every parameter field so the model understands how to invoke them
