# Error Handling

## Overview
Clear, helpful error messages for all provider-related failures. A non-technical user should be able to read the error and know exactly what to do to fix it. All errors must go through the `errWrite` callback (stderr), consistent with the existing error handling pattern in the codebase.

## Error Scenarios

### Missing API Key
```
$ bun run index.ts --model openai:gpt-4o "hello"

error: OPENAI_API_KEY is not set.

To fix this:
  1. Get your API key from https://platform.openai.com/api-keys
  2. Create a .env file in your project root:
     echo 'OPENAI_API_KEY=sk-your-key-here' > .env
  3. Or set it in your terminal:
     export OPENAI_API_KEY=sk-your-key-here
```

### Invalid API Key
```
error: OpenAI authentication failed. Your API key may be invalid or expired.

Check your key at https://platform.openai.com/api-keys
```

### Unknown Provider
```
$ bun run index.ts --model google:gemini "hello"

error: Unknown provider "google".

Available providers:
  anthropic  (models: sonnet, opus, haiku)
  openai     (models: gpt-4o, o1)
```

### Unknown Model Alias
```
$ bun run index.ts --model gpt-5 "hello"

error: Unknown model "gpt-5".

Available models:
  Anthropic: sonnet, opus, haiku
  OpenAI:    gpt-4o, o1

Or use the full model ID with provider prefix:
  --model openai:gpt-5
```

> **Scope note:** This error only applies to strings that include a **colon-prefixed provider** (e.g. `openai:gpt-5`) where the model ID is not recognized, OR in the future if alias validation is added. For bare strings with no colon that are not in the alias table (e.g. `claude-opus-4-20250514`), `resolveProvider()` silently routes to `anthropic` and passes them through unchanged for backward compatibility — no error is shown.

### Rate Limit Hit
```
error: OpenAI rate limit reached. Waiting before next attempt.

Tip: Use a different model or wait a moment before retrying.
```

### Network Error
```
error: Could not connect to OpenAI API. Check your internet connection.
```

### Codex SDK Not Installed

```
$ bun run index.ts --model openai:gpt-4o "hello"

error: @openai/codex-sdk is not installed.

To fix this, run:
  bun add @openai/codex-sdk
```

This error is thrown when `import { Codex } from "@openai/codex-sdk"` fails at runtime (module not found). It should be caught in `src/codex-session.ts` and `src/codex-interactive.ts` and surfaced through `errWrite`.

### Claude Not Found (existing — preserve)
```
error: claude not found on $PATH — install Claude Code and ensure `claude` is in your PATH
```

This existing error from `src/claude.ts` must continue to work exactly as it does now. It is only triggered for Anthropic provider sessions — it is never called for OpenAI models.

## Acceptance Criteria

- [ ] Missing OPENAI_API_KEY shows step-by-step fix instructions to stderr
- [ ] Invalid API key shows clear auth error with link to fix
- [ ] Unknown provider lists all valid providers and their models to stderr
- [ ] Unknown model alias lists all valid aliases across all providers to stderr
- [ ] Rate limit errors are caught and displayed clearly
- [ ] Network errors are caught and displayed clearly
- [ ] Codex SDK not installed shows install command on stderr
- [ ] All errors allow the loop to continue to the next iteration (no crashes)
- [ ] Error messages use consistent formatting with existing Claude errors (red ANSI text)
- [ ] All error output goes to stderr via errWrite, never to stdout
- [ ] Existing Claude error messages (findClaude failures) are unchanged
- [ ] `findClaude()` errors are never triggered for OpenAI model selections

## Edge Cases

- API key is set but empty string: treat as missing
- API key has leading/trailing whitespace: trim before use
- Multiple errors in same session: show all, not just first
- `resolveProvider()` errors (unknown provider/alias) are fatal — they call `errWrite` and `process.exit(1)` rather than allowing the loop to continue
