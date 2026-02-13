# Agent Instructions Caching

## What This Component Does

Configures all Mastra agent definitions to use Anthropic's prompt caching on their system prompts (instructions). The system prompt is the single largest chunk of static, repeated content sent on every API call, making it the highest-impact target for caching.

## Current Behavior

All four agent factory functions (`createResearchAgent`, `createDiscoveryAgent`, `createPlanningAgent`, `createBuilderAgent`) pass `instructions` as a plain string to the `Agent` constructor. No `providerOptions` are set.

## Required Behavior

Each agent's `instructions` must be converted from a plain string to a Mastra instruction object that includes Anthropic cache control configuration. The instruction object format supports `role`, `content`, and `providerOptions` fields.

## Constraints

- The technology choice is Mastra's `providerOptions` with `anthropic.cacheControl` — this is a decided constraint, not an implementation suggestion
- The cache type is `"ephemeral"` (Anthropic's standard prompt cache)
- All four agent factory functions must be updated
- The discovery agent dynamically appends an output directory suffix to its instructions — this must still work after the conversion
- The planning and builder agents perform `${JOB_ID}` placeholder substitution on their instructions — this must still work after the conversion
- Existing test mocks that pass instructions as strings may need to be updated to match the new instruction object shape

## Inputs / Outputs

- **Input**: System prompt text (string, loaded from markdown files or passed as config)
- **Output**: Mastra instruction object with cache control configuration, passed to `Agent` constructor
