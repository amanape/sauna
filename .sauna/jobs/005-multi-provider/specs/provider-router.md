# Provider Router

## Overview
A routing layer that parses the `--model` flag, determines which provider to use, and dispatches to the correct SDK. This replaces the current `resolveModel()` function in `src/cli.ts` with a more capable `resolveProvider()` function that returns both provider and model.

## Current Code to Replace
Currently `src/cli.ts` contains:
```typescript
const MODEL_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-haiku-4-20250414",
};

export function resolveModel(model: string | undefined): string | undefined {
  if (model === undefined) return undefined;
  return MODEL_ALIASES[model] ?? model;
}
```

This must be expanded to handle provider:model colon syntax and OpenAI aliases.

## How Routing Works

### Step 1: Parse the model string
The model flag value is parsed to extract provider and model:

```
"openai:gpt-4o"      → provider: "openai",    model: "gpt-4o"
"anthropic:sonnet"   → provider: "anthropic", model: "sonnet"  (then resolve alias)
"sonnet"             → provider: "anthropic", model: "sonnet"  (alias lookup)
"gpt-4o"             → provider: "openai",    model: "gpt-4o"  (alias lookup)
"opus"               → provider: "anthropic", model: "opus"    (alias lookup)
undefined            → provider: "anthropic", model: undefined  (use default)
```

### Step 2: Resolve alias to full model ID
After determining the provider, resolve any alias:

```
Anthropic aliases:
  sonnet → claude-sonnet-4-20250514
  opus   → claude-opus-4-20250514
  haiku  → claude-haiku-4-20250414

OpenAI aliases:
  gpt-4o → gpt-4o
  o1     → o1
```

If the model string is not a known alias, pass it through as-is **and default the provider to `"anthropic"`**. This preserves backward compatibility: users who previously used `--model claude-opus-4-20250514` (a full Anthropic model ID, no alias) continue to work without adding a prefix.

**Rule of thumb for bare strings (no colon):**
1. Check alias table — if found, use the alias's provider and resolved model ID.
2. If NOT in the alias table, default to `provider: "anthropic"` and pass the string through unchanged as `model`. Do NOT error.
3. The "unknown alias" error only fires when the bare string matches NEITHER the alias table NOR looks like any known model ID pattern — that determination is impossible at routing time, so in practice: bare strings with no colon always route to anthropic without error.

### Step 3: Return resolved provider info
The function should return a typed object:

```typescript
type ResolvedProvider = {
  provider: "anthropic" | "openai";
  model: string | undefined;
};
```

### Function Signature

```typescript
export function resolveProvider(
  model: string | undefined,
  errWrite?: (s: string) => void
): ResolvedProvider
```

`errWrite` defaults to `(s) => process.stderr.write(s)` when not provided. On unrecognized provider or alias, `resolveProvider()` calls `errWrite` with a formatted error message then calls `process.exit(1)`. It never throws — callers do not need a try/catch.

### Integration with index.ts

Currently `index.ts` calls `resolveModel()` on line 46 and passes the result to sessions. After this change, the dispatch logic becomes:

```typescript
// 1. Resolve provider (replaces resolveModel)
const { provider, model: resolvedModel } = resolveProvider(cli.flags.model, errWrite);

// 2. Resolve claude path only when needed
const claudePath = provider === "anthropic" ? findClaude() : undefined;

// 3. SAUNA_DRY_RUN output includes provider info
if (Bun.env.SAUNA_DRY_RUN === "1") {
  console.log(JSON.stringify({ prompt, model: cli.flags.model, provider, resolvedModel, forever, count, interactive, context }));
  process.exit(0);
}

// 4. Dispatch to provider-specific session or interactive handler
if (interactive) {
  if (provider === "anthropic") {
    await runInteractive({ prompt, model: resolvedModel, context, claudePath: claudePath! }, write, undefined, errWrite);
  } else {
    await runCodexInteractive({ prompt, model: resolvedModel, context }, write, undefined, errWrite);
  }
} else {
  const sessionFactory = provider === "anthropic"
    ? () => runSession({ prompt: prompt!, model: resolvedModel, context, claudePath: claudePath! })
    : () => runCodexSession({ prompt: prompt!, model: resolvedModel, context });
  const ok = await runLoop({ forever, count }, sessionFactory, write, abort.signal, errWrite);
  if (!ok) process.exit(1);
}
```

Key points:
- `findClaude()` is only called when provider is `"anthropic"` — OpenAI sessions do not require the `claude` binary
- `resolveProvider()` is called **before** the `SAUNA_DRY_RUN` check so the dry-run output includes resolved provider info
- If `resolveProvider()` throws (unknown provider or alias), it must call `errWrite` and `process.exit(1)` — the dry-run never fires

### SAUNA_DRY_RUN Output Format

The dry-run JSON output is extended to include the resolved provider and model:

```json
{
  "prompt": "hello",
  "model": "openai:gpt-4o",
  "provider": "openai",
  "resolvedModel": "gpt-4o",
  "forever": false,
  "count": null,
  "interactive": false,
  "context": []
}
```

For Claude models:
```json
{
  "prompt": "hello",
  "model": "sonnet",
  "provider": "anthropic",
  "resolvedModel": "claude-sonnet-4-20250514",
  "forever": false,
  "count": null,
  "interactive": false,
  "context": []
}
```

The `model` field remains the raw CLI input; `resolvedModel` is the fully resolved model ID after alias expansion.

## Acceptance Criteria

- [ ] "openai:gpt-4o" correctly returns provider "openai" and model "gpt-4o"
- [ ] "anthropic:sonnet" correctly returns provider "anthropic" and resolved model ID `claude-sonnet-4-20250514`
- [ ] "anthropic:claude-opus-4-20250514" (explicit prefix + full model ID) returns provider "anthropic" and model passed through as-is
- [ ] "sonnet" (no prefix) correctly returns provider "anthropic" via alias lookup
- [ ] "gpt-4o" (no prefix) correctly returns provider "openai" via alias lookup
- [ ] No model specified defaults to provider "anthropic" with undefined model
- [ ] Unrecognized provider prefix shows error to stderr listing valid providers
- [ ] Full model IDs with no prefix (e.g. "claude-opus-4-20250514") route to provider "anthropic" and pass through unchanged (backward compat — no error)
- [ ] `resolveModel()` is replaced by `resolveProvider()` in both `src/cli.ts` and `index.ts`
- [ ] `SAUNA_DRY_RUN=1` output includes `provider` and `resolvedModel` fields
- [ ] `findClaude()` is not called when provider is "openai"
- [ ] `runCodexSession` / `runCodexInteractive` are called when provider is "openai"

## Edge Cases

- Empty model string: treat as undefined, use default provider
- Model string with multiple colons (e.g. "openai:gpt-4o:latest"): split on first colon only, remainder of string is the model ID
- Unrecognized string with no colon prefix and not in any alias table: default to `provider: "anthropic"`, pass through as-is (backward compat — do NOT error)
- `resolveProvider()` must call `errWrite` (with fallback to `process.stderr.write`) and `process.exit(1)` on failure — it must not throw unhandled exceptions into `index.ts`
- `resolveProvider()` accepts an optional second `errWrite` parameter so it is fully testable without spawning a subprocess
