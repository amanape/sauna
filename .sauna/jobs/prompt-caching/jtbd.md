# Enable Anthropic Prompt Caching

## Problem

All four agents (researcher, discovery, planning, builder) send full input tokens on every API call with no caching. In multi-turn and multi-step workflows, the same system prompts, tool definitions, and conversation history prefixes are re-processed from scratch each turn. This results in ~4M tokens consumed per session at full input token pricing. The primary pain is cost.

Currently, agent instructions are passed as plain strings to the Mastra `Agent` constructor, and `.generate()` calls pass no `providerOptions`. There is zero caching configuration anywhere in the codebase.

## Job to Be Done

When a developer runs any subcommand (discover, plan, build, run), the Anthropic API should cache and reuse previously processed input tokens — system prompts, tool definitions, and conversation history prefixes — so that repeated content is billed at the cached token rate (~90% discount) instead of the full input token rate.

## Acceptance Criteria

- [ ] All agent system prompts (instructions) are configured with Anthropic prompt caching via Mastra's `providerOptions`
- [ ] All `.generate()` call sites pass `providerOptions` to enable caching on conversation content
- [ ] Existing tests continue to pass — caching config must not break mock-based tests
- [ ] The solution is Anthropic-specific; no need to handle other providers gracefully

## Out of Scope

- Logging or structured output of cache hit/miss metrics (verification will be done manually via Anthropic dashboard)
- Latency optimization (cost is the sole driver)
- Support for non-Anthropic providers
- Changes to the Mastra Memory system or message history persistence
- Adding observability/tracing infrastructure

## SLC Scope

The simplest complete solution is:

1. Convert agent `instructions` from plain strings to Mastra instruction objects with `providerOptions.anthropic.cacheControl`
2. Pass `providerOptions` with cache control to `.generate()` calls
3. Ensure tests still pass

This is sufficient because Anthropic handles the actual caching mechanics (TTL, cache invalidation, billing) — the application only needs to opt in by setting the right flags.
