# Provider Contract

## Overview

Shared type definitions that establish the contract all providers must implement.

## Acceptance Criteria

- A `Provider` interface is exported with:
  - `name: string` — human-readable identifier (e.g., `"claude"`, `"codex"`)
  - `isAvailable(): boolean` — returns whether the provider can run (never throws)
  - `resolveModel(alias?: string): string | undefined` — maps short names to full model IDs
  - `knownAliases(): Record<string, string>` — returns the full alias map for help text
  - `createSession(config: ProviderSessionConfig): AsyncGenerator<ProviderEvent>` — runs a single-turn session
- A `ProviderSessionConfig` type is exported with: `prompt: string`, `model?: string`, `context: string[]`
- A `ProviderEvent` discriminated union is exported with exactly these variants:
  - `{ type: 'text_delta'; text: string }` — streaming text from the agent
  - `{ type: 'tool_start'; name: string }` — a tool invocation has begun
  - `{ type: 'tool_end'; name: string; detail?: string }` — a tool invocation has completed
  - `{ type: 'result'; success: true; summary: SummaryInfo }` — successful turn/session complete (summary always present)
  - `{ type: 'result'; success: false; errors?: string[] }` — failed turn/session complete (no summary; failures lack SDK usage data)
  - `{ type: 'error'; message: string }` — non-result error
- A `SummaryInfo` type is exported with: `inputTokens: number`, `outputTokens: number`, `numTurns: number`, `durationMs: number`
- `SummaryInfo` moves from `stream.ts` to this file; `stream.ts` imports it from here
- No provider-specific types leak into the contract (no Claude SDK types, no Codex SDK types)
- The file has zero runtime dependencies (types only)

## Constraints

- All types use `export type` to match project conventions
- Discriminant field is always `type` for consistency with both SDK event schemas

## File

`src/provider.ts`
