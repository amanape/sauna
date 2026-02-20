# Model Alias Resolution

## Overview

Each provider maps short human-friendly model names to full model IDs, with unknown names passed through unchanged.

## Acceptance Criteria

- Claude provider aliases:
  - `sonnet` → `claude-sonnet-4-20250514`
  - `opus` → `claude-opus-4-20250514`
  - `haiku` → `claude-haiku-4-20250414`
- Codex provider aliases:
  - `codex` → `gpt-5.2-codex`
  - `codex-mini` → `codex-mini-latest`
- Unknown alias names are returned unchanged (pass-through)
- `undefined` model input returns `undefined` (SDK default applies)
- `knownAliases()` returns the full alias map for each provider (used by help text and validation)
- Model resolution happens after provider selection — the selected provider's `resolveModel()` is called, not a global function
- The existing `src/cli.ts` `resolveModel()` function is replaced by provider-scoped resolution

## Edge Cases

- A Claude alias passed to the Codex provider (e.g., `--provider codex --model sonnet`): `sonnet` passes through as-is since Codex doesn't recognize it
- Empty string model: treated as `undefined`

## Constraints

- Alias maps are hardcoded constants per provider (not configurable)
- `src/cli.ts` is either deleted or reduced to a thin re-export from the provider registry

## Files

Each provider owns its aliases in its own file (`src/providers/claude.ts`, `src/providers/codex.ts`)
