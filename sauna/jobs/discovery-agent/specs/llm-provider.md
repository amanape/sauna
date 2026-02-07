# LLM Provider Interface

## Overview

A minimal abstraction that lets the discovery engine talk to any LLM without knowing which one. The engine calls `complete()`, the provider handles the API specifics.

## Requirements

- Define an `LLMProvider` interface with a single `complete(messages, tools?)` method
- `messages` is an array of `{ role, content }` objects
- `tools` is an optional array of tool definitions (name, description, parameters)
- Return type includes the assistant's text response and any tool calls it wants to make
- Implement one concrete provider to start (Anthropic or OpenAI — whichever you test with first)
- Provider is instantiated with config (API key, model name, temperature) passed in — not read from environment directly by the provider

## Interface Shape

```typescript
interface LLMProvider {
  complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}

interface LLMResponse {
  text?: string;
  tool_calls?: ToolCall[];
}
```

## Notes

- Do NOT abstract streaming, token counting, or retry logic yet — add when needed
- Each provider implementation translates the generic tool definitions into the provider's format (Anthropic's `tools` vs OpenAI's `functions`)
- The provider does not know about the discovery domain — it's pure LLM plumbing
