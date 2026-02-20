# Provider Resolution

## Overview

Selects the correct `Provider` instance from an explicit `--provider` flag or by inferring the provider from the model name.

## Acceptance Criteria

- `resolveProvider(providerFlag?: string, modelFlag?: string): Provider` — a pure function that returns the selected provider
- When `--provider claude` is given, the Claude provider is returned regardless of model name
- When `--provider codex` is given, the Codex provider is returned regardless of model name
- When `--provider` is not given and `--model` matches a Claude alias (`sonnet`, `opus`, `haiku`) or starts with `claude-`, the Claude provider is returned
- When `--provider` is not given and `--model` matches a Codex alias (`codex`, `codex-mini`) or starts with `gpt-` or equals `o4-mini`, the Codex provider is returned
- When `--provider` is not given and `--model` is not given, the Claude provider is returned (backward compatibility)
- When `--provider` is not given and `--model` is an unrecognized string, the Claude provider is returned (backward compatibility)
- When `--provider` is an unrecognized value, the function throws with a descriptive error listing valid provider names

## Edge Cases

- `--provider codex --model sonnet`: Codex provider is returned (explicit flag wins); `sonnet` is passed through as a raw model ID (Codex provider won't resolve it as an alias)
- Full model IDs like `claude-sonnet-4-20250514`: prefix match detects `claude-` → Claude provider
- Full model IDs like `gpt-5.2-codex`: prefix match detects `gpt-` → Codex provider

## Constraints

- This function only selects the provider — it does not check `isAvailable()` (that is the CLI's responsibility)
- Provider instances are singletons (one Claude, one Codex)

## File

`src/providers/registry.ts`
