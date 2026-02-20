# Provider Resolution

## Overview

Selects the correct `Provider` instance from an explicit `--provider` flag or by inferring the provider from the model name.

## Acceptance Criteria

- When `--provider claude` is given, the Claude provider is selected regardless of model name
- When `--provider codex` is given, the Codex provider is selected regardless of model name
- When `--provider` is not given and `--model` matches a Claude alias (`sonnet`, `opus`, `haiku`) or starts with `claude-`, the Claude provider is selected
- When `--provider` is not given and `--model` matches a Codex alias (`codex`, `codex-mini`) or starts with `gpt-` or equals `o4-mini`, the Codex provider is selected
- When `--provider` is not given and `--model` is not given, the Claude provider is selected (backward compatibility)
- When `--provider` is not given and `--model` is an unrecognized string, the Claude provider is selected (backward compatibility)
- When `--provider` is an unrecognized value, the CLI exits with a descriptive error listing valid providers
- The selected provider's `isAvailable()` is checked after resolution; if `false`, the CLI exits with a provider-specific error message (e.g., "install Claude Code" or "set OPENAI_API_KEY")
- Resolution is a pure function: `resolveProvider(providerFlag?: string, modelFlag?: string): Provider`

## Edge Cases

- `--provider codex --model sonnet`: Codex provider is used (explicit flag wins), and `sonnet` is passed through as a raw model ID (Codex provider won't resolve it as an alias)
- Full model IDs like `claude-sonnet-4-20250514`: prefix match detects `claude-` → Claude provider
- Full model IDs like `gpt-5.2-codex`: prefix match detects `gpt-` → Codex provider

## File

`src/providers/registry.ts`
