# Alias File Schema

## Overview

Aliases are stored in `.sauna/aliases.toml` at the project root. Each TOML section defines a named alias that expands into a full set of CLI arguments. The file is human-edited and version-controlled.

## File Location

`.sauna/aliases.toml` — project-local only, no global/home-directory aliases.

## Schema

Each top-level TOML key is an alias name. Values are tables with the following fields:

| Field         | Type       | Required | Description                              |
|---------------|------------|----------|------------------------------------------|
| `prompt`      | string     | yes      | The prompt text or path to a prompt file |
| `model`       | string     | no       | Model name or alias (e.g. `sonnet`, `opus`, or full ID) |
| `context`     | string[]   | no       | File/directory paths to include as context |
| `count`       | integer    | no       | Number of loop iterations                |
| `forever`     | boolean    | no       | Run indefinitely until Ctrl+C            |
| `interactive`  | boolean    | no       | Start an interactive multi-turn session  |

### Example

```toml
[build]
prompt = ".sauna/prompts/build.md"
context = [".sauna/specs", ".sauna/tasks.md"]
count = 5

[review]
prompt = ".sauna/prompts/review.md"
model = "opus"
context = ["src/"]

[chat]
prompt = "You are a helpful assistant"
interactive = true
```

## Validation Rules

- Alias names must be non-empty strings containing only `[a-zA-Z0-9_-]`
- Alias names must not collide with built-in command names (`alias`) or flag names (`help`, `version`, `model`, `forever`, `count`, `interactive`, `context`, and their short forms `m`, `n`, `i`, `c`)
- `prompt` is required for every alias
- `forever` and `count` are mutually exclusive (same rule as CLI flags)
- `interactive` cannot combine with `forever` or `count`
- `count` must be a positive integer
- Unknown fields are an error (catch typos early)

## Dependency

Requires a TOML parser as a production dependency (e.g. `smol-toml`).

## Acceptance Criteria

- [ ] `.sauna/aliases.toml` is parsed at startup when the file exists
- [ ] Missing file is not an error (no aliases defined)
- [ ] Malformed TOML produces a clear error message and exits non-zero
- [ ] Schema violations (missing `prompt`, invalid `count`, unknown fields) produce clear error messages
- [ ] Alias name validation rejects invalid names at parse time
- [ ] Built-in name collision is rejected at parse time with a specific error message
- [ ] Mutual exclusivity rules (`forever`/`count`, `interactive`/`forever`|`count`) are enforced

## Files

- `src/aliases.ts` — new module: parse, validate, and return alias definitions
- `.sauna/aliases.toml` — the alias file (created by users, not by code)
