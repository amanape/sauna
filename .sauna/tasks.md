# SAU-77: Alias Feature — Implementation Plan

## Status Summary

All 8 tasks are complete. The alias feature is fully implemented and tested (211 tests passing across 9 files). All specs in `.sauna/specs/` are satisfied.

---

## Tasks (priority order)

### 1. Add TOML parser dependency
- [x] `bun add smol-toml` — lightweight, zero-dependency TOML parser (spec recommends it) — installed smol-toml@1.6.0

### 2. Implement `src/aliases.ts` — parse, validate, and expand aliases
- [x] `loadAliases(root?: string)` — read and parse `.sauna/aliases.toml`, return a `Record<string, AliasDefinition>` or empty object if file missing
- [x] Define `AliasDefinition` type: `{ prompt: string; model?: string; context?: string[]; count?: number; forever?: boolean; interactive?: boolean }`
- [x] Validate alias names: only `[a-zA-Z0-9_-]`, reject empty
- [x] Validate reserved names: reject `alias`, `help`, `version`, `model`, `m`, `forever`, `count`, `n`, `interactive`, `i`, `context`, `c`
- [x] Validate required fields: `prompt` must exist and be a string
- [x] Validate mutual exclusivity: `forever` + `count`, `interactive` + `forever`/`count`
- [x] Validate `count` is a positive integer when present
- [x] Reject unknown fields (any key not in the schema is an error)
- [x] `expandAlias(alias: AliasDefinition, extraArgs: string[])` — build the expanded argv array: `[prompt, ...aliasFlags, ...extraArgs]`
- [x] Error on positional prompt override: if user passes a positional arg after alias name, reject it

### 3. Implement `src/alias-commands.ts` — CRUD subcommand handlers
- [x] `aliasList(aliases, write)` — print compact table (name, truncated prompt, flags in short notation); print helpful message if no aliases
- [x] `aliasShow(aliases, name, write)` — print full TOML definition for one alias; error if not found
- [x] `aliasSet(name, root?, write?)` — create file if needed, append stub `[name]\nprompt = ""`, reject reserved/duplicate names
- [x] `aliasRm(name, root?, write?)` — remove alias section from file; error if not found
- [x] All handlers write to injected `write` callback for testability (matches existing pattern)

### 4. Register `alias` subcommand in `index.ts`
- [x] Add cleye `command({ name: 'alias', parameters: ['<action>', '[name]'] })` to the `commands` array
- [x] Route `argv.command === 'alias'` to handlers before alias resolution and before normal execution flow
- [x] `sauna alias` (no action) shows help for the alias subcommand

### 5. Implement alias resolution in `index.ts`
- [x] Before cleye parsing: read `process.argv`, check if `argv[2]` matches an alias name
- [x] If match: call `expandAlias()` and pass expanded argv to `cli()` as the third parameter
- [x] If no match: pass through unchanged (current behavior preserved)
- [x] `SAUNA_DRY_RUN=1` prints the resolved config so users can debug alias expansion
- [x] Must skip alias resolution if `argv[2]` is `alias` (subcommand takes priority)

### 6. Write tests — `tests/aliases.test.ts`
- [x] TOML parsing: valid file, missing file (no error), malformed TOML (clear error)
- [x] Schema validation: missing `prompt`, invalid `count`, unknown fields, reserved names, mutual exclusivity
- [x] Alias name validation: valid chars, invalid chars, empty string
- [x] `expandAlias()`: basic expansion, flag override (last wins), context accumulation, positional arg rejection

### 7. Write tests — `tests/alias-commands.test.ts`
- [x] `list`: all aliases displayed, empty state message
- [x] `show`: known alias prints TOML, unknown alias errors
- [x] `set`: creates file, appends stub, rejects reserved names, rejects duplicates
- [x] `rm`: removes alias, errors on unknown name

### 8. Write integration tests — `tests/cli.test.ts` (extend existing)
- [x] `sauna <alias>` expands and runs (via `SAUNA_DRY_RUN=1`)
- [x] `sauna <alias> -n 2` overrides count
- [x] `sauna <alias> -c /extra` appends context
- [x] `sauna <not-an-alias>` falls through unchanged
- [x] Missing `.sauna/aliases.toml` — existing behavior unchanged
- [x] `sauna alias list` routes to alias subcommand, not alias resolution

---

## Files Created/Modified

| File | Action | Notes |
|------|--------|-------|
| `package.json` | modified | added `smol-toml` dependency |
| `src/aliases.ts` | created | parse, validate, expand |
| `src/alias-commands.ts` | created | list, show, set, rm handlers |
| `index.ts` | modified | register subcommand, insert resolution before cleye |
| `tests/aliases.test.ts` | created | unit tests for parsing/validation/expansion |
| `tests/alias-commands.test.ts` | created | unit tests for CRUD handlers |
| `tests/cli.test.ts` | modified | integration tests for alias subcommand and resolution |

## Dependencies

- `smol-toml` (runtime) — TOML parsing
