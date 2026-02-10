# Sub-Agent Support

## What This Component Does

The discovery agent must be able to spawn sub-agents that perform autonomous research and work, then return results to the parent agent. Sub-agents run without human interaction and have access to the same workspace tools as the parent.

## Requirements

### Spawning

- The discovery agent must be able to delegate tasks to one or more sub-agents during a conversation turn.
- Sub-agent delegation must be available as a tool that the discovery agent can invoke — the LLM decides when to delegate, not hardcoded logic.
- Each sub-agent invocation starts with a fresh context (the sub-agent does not inherit the parent's conversation history).
- The parent agent receives the sub-agent's final output as a text summary.

### Sub-Agent Capabilities

- Sub-agents must have access to the same workspace tools as the parent: file read, file write, file edit, directory listing, shell execution, and web search.
- Sub-agents must be able to perform multi-step agentic work (tool calling across multiple steps) before returning their result.
- Sub-agents must have a configurable step limit to prevent runaway execution.

### Isolation

- Sub-agent execution must not pollute the parent agent's conversation context with intermediate tool calls and results — only the final summary is returned.
- Multiple sub-agents should be able to run concurrently if the parent delegates multiple tasks.

## Constraints

- Sub-agents do not interact with the human. They are fully autonomous.
- Sub-agent nesting (a sub-agent spawning its own sub-agents) is not required.
