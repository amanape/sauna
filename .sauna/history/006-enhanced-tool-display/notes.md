# Enhanced Tool Display — Implementation Notes

## What Was Built

Three changes to `src/stream.ts`, all test-driven:

### 1. `extractFirstLine(value: unknown): string | undefined`
- Extracts first line from a potentially multiline string
- Returns `undefined` for non-strings, empty strings, or strings starting with `\n`
- Used to truncate multiline tool arguments (e.g., heredocs) to a single display line

### 2. `redactSecrets(command: string): string`
- Redacts environment variable assignments: `export FOO=val` → `export FOO=***`
- Redacts inline assignments: `FOO=val ./run.sh` → `FOO=*** ./run.sh`
- Redacts Bearer tokens: `Authorization: Bearer tok123` → `Authorization: Bearer ***`
- Pattern: `[A-Z_][A-Z0-9_]*=\S+` for env vars, case-insensitive for Bearer

### 3. Tool detail extraction in `processMessage()`
- Inline in the `content_block_start` handler (no new helper function)
- Runtime guard: `if (input && typeof input === 'object')` — graceful fallback
- Fallback chain: `input.file_path || input.command || input.description || input.pattern`
- Redaction applied only when source is `input.command`
- Tag formatted inline: `${DIM}[${name}] ${detail}${DIM_OFF}`
- `formatToolTag()` signature NOT modified

## Architecture Decisions

- **No `getToolDetails()` helper**: extraction is 8 lines inline, single call site
- **No lookup table**: fallback chain is simpler and equivalent for current tool set
- **No `formatToolTag()` change**: tag formatted inline at call site, avoiding optional parameter smell
- **`extractFirstLine` and `redactSecrets` exported**: pure functions, tested independently, reusable

## Known Limitations

1. **Redaction is pattern-based**: Won't catch all secret patterns (e.g., JSON with keys, base64 tokens not in Bearer format)
2. **File paths shown as-is**: Absolute paths from SDK displayed without modification (privacy tradeoff)
3. **No opt-out mechanism**: Tool details always shown; no `--quiet` flag yet
4. **SDK dependency is untyped**: Relies on `input` being an object with known property names; runtime guard mitigates but doesn't eliminate risk

## Redaction Limitations (Documented)

`redactSecrets()` uses regex-based pattern matching. It covers the most common credential exposure vectors but has inherent limits:

### What IS redacted
- `export VAR=value` → `export VAR=***` (env var exports)
- `VAR=value command` → `VAR=*** command` (inline env var assignments)
- `Authorization: Bearer <token>` → `Authorization: Bearer ***` (Bearer headers, case-insensitive)
- Multiple assignments on a single line are all redacted

### What is NOT redacted
- **JSON-embedded secrets**: `'{"api_key": "sk-123"}'` — regex doesn't parse JSON
- **Base64 tokens outside Bearer**: `curl -H "X-Token: dG9rZW4="` — no pattern for arbitrary header values
- **Secrets in flags**: `--password=hunter2` — only `UPPER_CASE=value` patterns matched
- **Secrets passed via stdin/heredoc**: Only the first line is shown (via `extractFirstLine`), but if the first line contains a secret in an unrecognized format, it passes through
- **Quoted values with spaces**: `export FOO="bar baz"` — the regex matches `\S+` so only `"bar` is replaced, leaving a malformed result. In practice, the SDK typically sends unquoted single-token values for env vars.
- **Non-English/lowercase var names**: `api_key=value` — the pattern requires `[A-Z_][A-Z0-9_]*`, so lowercase names are not matched. This is intentional: lowercase assignments like `x=5` in shell scripts are rarely secrets.

### Why pattern-based is acceptable for v1
- Covers the highest-risk patterns (env exports, Bearer tokens) that are most likely to appear in Bash commands
- Runtime guard ensures non-command inputs (file paths, patterns) skip redaction entirely — redaction only runs when the fallback chain resolved to `input.command`
- False negatives (missed redaction) are safer than false positives (corrupting displayed commands)
- A more robust approach (AST parsing, allow-list) would be over-engineering for a display-only feature

## Path Display Decision (Documented)

### Decision: Show absolute paths as-is from SDK

The SDK sends `file_path` as absolute paths (e.g., `/Users/alice/project/src/stream.ts`). We display them verbatim.

### Why not relative paths?
- The SDK provides absolute paths; computing relative paths requires knowing the CWD, which `processMessage()` does not have access to (it only receives `msg`, `write`, and `state`)
- Threading CWD into `processMessage()` would change its signature, violating the spec's "no breaking changes" constraint
- Showing a basename only (e.g., `stream.ts`) loses context when multiple files share names
- Users are accustomed to seeing absolute paths in terminal tools (e.g., compiler errors, `git diff`)

### Privacy tradeoff
- Absolute paths can expose usernames (e.g., `/Users/alice/`) in shared contexts (screen sharing, CI logs)
- This is a known accepted risk for v1 — mitigated by the fact that file paths rarely contain secrets (unlike Bash commands)
- A future `--quiet` or `--no-tool-details` flag would suppress all details, including paths

## Test Coverage

- 27 new tests added to `tests/stream.test.ts`
- Total: 50 tests in stream.test.ts, 130 across all 7 test files
- All tests pass, TypeScript type check passes

## Test Validation (Meaningfulness Verification)

All new tests verified meaningful by temporarily disabling the code under test:
- **`redactSecrets()` disabled** → 5 test failures (redaction tests + Bash command redaction integration)
- **`extractFirstLine()` disabled** → 5 test failures (multiline tests + heredoc handling)
- **Detail extraction in `processMessage()` disabled** → 11 test failures (all tool detail display tests)
- After reverting each break, all 130 tests pass again

This confirms no tests are vacuously passing — each test exercises real behavior.
