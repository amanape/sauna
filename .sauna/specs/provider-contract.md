# Provider Contract

## Overview

Shared type definitions that establish the contract all providers must implement.

## Acceptance Criteria

- A `Provider` interface is exported with: `name: string`, `isAvailable(): boolean`, `resolveModel(alias): string | undefined`, `knownAliases(): Record<string, string>`, `createSession(config): AsyncGenerator<ProviderEvent>`
- A `ProviderSessionConfig` type is exported with: `prompt: string`, `model?: string`, `context: string[]`
- A `ProviderEvent` discriminated union is exported with exactly these variants:
  - `{ type: 'text_delta'; text: string }` — streaming text from the agent
  - `{ type: 'tool_start'; name: string }` — a tool invocation has begun
  - `{ type: 'tool_end'; name: string; detail?: string }` — a tool invocation has completed
  - `{ type: 'result'; success: boolean; summary: SummaryInfo; errors?: string[] }` — turn/session complete
  - `{ type: 'error'; message: string }` — non-result error
- `SummaryInfo` is re-exported or co-located (already exists in `stream.ts`)
- No provider-specific types leak into the contract (no Claude SDK types, no Codex SDK types)
- The file has zero runtime dependencies (types only)

## Constraints

- All types use `export type` (not `export interface`) to match project conventions
- Discriminant field is always `type` for consistency with both SDK event schemas

## File

`src/provider.ts`
