# SAU-77: Alias Feature — Implementation Plan

## Status Summary

Three specs are fully defined in `.sauna/specs/`. No alias code exists yet. The codebase has no TOML parser dependency. The `alias` subcommand pattern (cleye `command()`) is not yet used anywhere.

---

## Tasks (priority order)

### 1. Add TOML parser dependency
- [ ] `bun add smol-toml` — lightweight, zero-dependency TOML parser (spec recommends it)

### 2. Implement `src/aliases.ts` — parse, validate, and expand aliases
- [ ] `loadAliases(root?: string)` — read and parse `.sauna/aliases.toml`, return a `Record<string, AliasDefinition>` or empty object if file missing
- [ ] Define `AliasDefinition` type: `{ prompt: string; model?: string; context?: string[]; count?: number; forever?: boolean; interactive?: boolean }`
- [ ] Validate alias names: only `[a-zA-Z0-9_-]`, reject empty
- [ ] Validate reserved names: reject `alias`, `help`, `version`, `model`, `m`, `forever`, `count`, `n`, `interactive`, `i`, `context`, `c`
- [ ] Validate required fields: `prompt` must exist and be a string
- [ ] Validate mutual exclusivity: `forever` + `count`, `interactive` + `forever`/`count`
- [ ] Validate `count` is a positive integer when present
- [ ] Reject unknown fields (any key not in the schema is an error)
- [ ] `expandAlias(alias: AliasDefinition, extraArgs: string[])` — build the expanded argv array: `[prompt, ...aliasFlags, ...extraArgs]`
- [ ] Error on positional prompt override: if user passes a positional arg after alias name, reject it

### 3. Implement `src/alias-commands.ts` — CRUD subcommand handlers
- [ ] `aliasList(aliases, write)` — print compact table (name, truncated prompt, flags in short notation); print helpful message if no aliases
- [ ] `aliasShow(aliases, name, write)` — print full TOML definition for one alias; error if not found
- [ ] `aliasSet(name, root?, write?)` — create file if needed, append stub `[name]\nprompt = ""`, reject reserved/duplicate names
- [ ] `aliasRm(name, root?, write?)` — remove alias section from file; error if not found
- [ ] All handlers write to injected `write` callback for testability (matches existing pattern)

### 4. Register `alias` subcommand in `index.ts`
- [ ] Add cleye `command({ name: 'alias', parameters: ['<action>', '[name]'] })` to the `commands` array
- [ ] Route `argv.command === 'alias'` to handlers before alias resolution and before normal execution flow
- [ ] `sauna alias` (no action) shows help for the alias subcommand

### 5. Implement alias resolution in `index.ts`
- [ ] Before cleye parsing: read `process.argv`, check if `argv[2]` matches an alias name
- [ ] If match: call `expandAlias()` and pass expanded argv to `cli()` as the third parameter
- [ ] If no match: pass through unchanged (current behavior preserved)
- [ ] `SAUNA_DRY_RUN=1` prints the resolved config so users can debug alias expansion
- [ ] Must skip alias resolution if `argv[2]` is `alias` (subcommand takes priority)

### 6. Write tests — `tests/aliases.test.ts`
- [ ] TOML parsing: valid file, missing file (no error), malformed TOML (clear error)
- [ ] Schema validation: missing `prompt`, invalid `count`, unknown fields, reserved names, mutual exclusivity
- [ ] Alias name validation: valid chars, invalid chars, empty string
- [ ] `expandAlias()`: basic expansion, flag override (last wins), context accumulation, positional arg rejection

### 7. Write tests — `tests/alias-commands.test.ts`
- [ ] `list`: all aliases displayed, empty state message
- [ ] `show`: known alias prints TOML, unknown alias errors
- [ ] `set`: creates file, appends stub, rejects reserved names, rejects duplicates
- [ ] `rm`: removes alias, errors on unknown name

### 8. Write integration tests — `tests/cli.test.ts` (extend existing)
- [ ] `sauna <alias>` expands and runs (via `SAUNA_DRY_RUN=1`)
- [ ] `sauna <alias> -n 2` overrides count
- [ ] `sauna <alias> -c /extra` appends context
- [ ] `sauna <not-an-alias>` falls through unchanged
- [ ] Missing `.sauna/aliases.toml` — existing behavior unchanged
- [ ] `sauna alias list` routes to alias subcommand, not alias resolution

---

## Files to Create/Modify

| File | Action | Notes |
|------|--------|-------|
| `package.json` | modify | add `smol-toml` dependency |
| `src/aliases.ts` | create | parse, validate, expand |
| `src/alias-commands.ts` | create | list, show, set, rm handlers |
| `index.ts` | modify | register subcommand, insert resolution before cleye |
| `tests/aliases.test.ts` | create | unit tests for parsing/validation/expansion |
| `tests/alias-commands.test.ts` | create | unit tests for CRUD handlers |
| `tests/cli.test.ts` | modify | integration tests for alias resolution |

## Dependencies

- `smol-toml` (runtime) — TOML parsing
