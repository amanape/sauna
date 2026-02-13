# Generate Call Caching

## What This Component Does

Configures all `.generate()` call sites to pass Anthropic cache control via `providerOptions`, enabling caching of conversation history prefixes and tool definitions beyond just the system prompt.

## Current Behavior

The `SessionRunner.sendMessage()` method calls `this.agent.generate(this.messages, options)` where `options` includes only `maxSteps`, `onStepFinish`, and `onFinish`. No `providerOptions` are passed. This means conversation history and tool definitions are re-processed at full cost on every turn.

## Required Behavior

The `.generate()` call must include `providerOptions` with Anthropic cache control configuration. This enables Anthropic to cache the conversation message prefix (all messages before the latest user message) and tool definitions across turns within a session.

## Constraints

- The technology choice is Mastra's `providerOptions` with `anthropic.cacheControl` on the `.generate()` call
- The cache type is `"ephemeral"`
- `SessionRunner` is the single call site for `.generate()` — this is the only place that needs to change
- The `providerOptions` must be merged with existing options (`maxSteps`, `onStepFinish`, `onFinish`), not replace them
- Existing test mocks for `agent.generate()` may need to accept the additional `providerOptions` field in the options argument

## Inputs / Outputs

- **Input**: Existing generate options (maxSteps, callbacks) plus new providerOptions
- **Output**: Generate call with merged options including cache control
