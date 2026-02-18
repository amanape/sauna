# Alias Resolution

## Overview

When the user runs `sauna build -n 2 -c /extra`, the CLI must recognize `build` as an alias, expand it into its stored arguments, merge CLI overrides, and then hand the result to cleye for normal parsing.

## Resolution Flow

Resolution happens **before** cleye parses argv:

1. Read `process.argv` — check if `argv[2]` (the first non-node/non-script arg) matches an alias name
2. If no match, pass argv to cleye unchanged (current behavior)
3. If match found, expand the alias:
   a. Replace the alias name with the alias's `prompt` value as the positional argument
   b. Inject default flags from the alias definition (`--model`, `--count`, `--forever`, `--interactive`)
   c. Inject `--context` entries from the alias definition
   d. Append any remaining CLI arguments the user passed after the alias name
4. Pass the expanded argv to cleye via its third parameter (custom argv)

### Example Expansion

Given alias:
```toml
[build]
prompt = ".sauna/prompts/build.md"
context = [".sauna/specs", ".sauna/tasks.md"]
count = 5
```

| User types | Expanded argv |
|---|---|
| `sauna build` | `sauna .sauna/prompts/build.md -c .sauna/specs -c .sauna/tasks.md -n 5` |
| `sauna build -n 2` | `sauna .sauna/prompts/build.md -c .sauna/specs -c .sauna/tasks.md -n 5 -n 2` |
| `sauna build -c /extra` | `sauna .sauna/prompts/build.md -c .sauna/specs -c .sauna/tasks.md -n 5 -c /extra` |
| `sauna build -n 2 -c /extra` | `sauna .sauna/prompts/build.md -c .sauna/specs -c .sauna/tasks.md -n 5 -n 2 -c /extra` |

## Override Semantics

No special override logic is needed. The expansion places alias defaults **before** the user's CLI args in the argv array. Cleye's native parsing handles the rest:

- **Scalar flags** (`--model`, `--count`, `--forever`, `--interactive`): last value wins. User's `-n 2` after the alias's `-n 5` naturally overrides it.
- **Array flags** (`--context` / `-c`): accumulates all values. Alias contexts come first, user's `-c` entries append.
- **Prompt**: Locked to alias definition. The positional argument slot is filled by the alias's `prompt`. If the user passes a positional argument after the alias name, it is an error.

## Edge Cases

- `sauna build --help` — should show help for the main CLI (alias expands, cleye handles `--help` naturally)
- `sauna build "extra prompt"` — error: aliases don't accept positional prompt overrides
- Alias file doesn't exist — no aliases available, `sauna build` falls through to cleye as a normal positional prompt (current behavior)
- Alias file exists but `build` is not defined — same, falls through to cleye

## Detection Heuristic

To distinguish "is this an alias name or a prompt?":

1. Check if `.sauna/aliases.toml` exists
2. If yes, parse it and check if `argv[2]` matches an alias key
3. If yes, treat it as an alias invocation
4. If no, pass through unchanged

This means if a user has an alias named `build` and also wants to use the literal prompt `"build"`, they must remove the alias. This is acceptable — alias names should be intentional.

## Acceptance Criteria

- [ ] `sauna <alias>` expands and runs with the alias's prompt and default flags
- [ ] `sauna <alias> -n 2` overrides the alias's `count`
- [ ] `sauna <alias> -c /extra` appends to the alias's context list
- [ ] `sauna <alias> -m opus` overrides the alias's model
- [ ] `sauna <alias> "extra"` produces an error (no positional override)
- [ ] `sauna <not-an-alias>` falls through to normal cleye parsing
- [ ] Missing `.sauna/aliases.toml` is handled gracefully (no aliases, no error)
- [ ] Alias expansion is transparent — `SAUNA_DRY_RUN=1` prints the resolved config so users can debug
- [ ] Existing behavior is unchanged when no alias file exists

## Files

- `index.ts` — insert alias resolution before cleye parsing
- `src/aliases.ts` — `loadAliases()` and `expandAlias()` functions
