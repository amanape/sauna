# Alias Management

## Overview

The `sauna alias` subcommand provides basic CRUD operations for aliases. Since aliases live in a human-readable TOML file, the subcommand is intentionally minimal — the file itself is the primary editing interface.

## Subcommands

### `sauna alias list`

Print all defined aliases in a compact table format.

```
build   .sauna/prompts/build.md   -c .sauna/specs -c .sauna/tasks.md -n 5
review  .sauna/prompts/review.md  -m opus -c src/
chat    You are a helpful assi…   -i
```

- Alias name left-aligned
- Remaining flags shown in short CLI notation
- If no aliases defined (or no file), print: `No aliases defined. Create .sauna/aliases.toml to get started.`

### `sauna alias show <name>`

Print the full definition of a single alias in TOML format.

```
[build]
prompt = ".sauna/prompts/build.md"
context = [".sauna/specs", ".sauna/tasks.md"]
count = 5
```

- If alias not found, print error and exit non-zero

### `sauna alias set <name>`

Create a minimal alias entry in `.sauna/aliases.toml` and print the file path for editing.

```bash
$ sauna alias set deploy
Created alias "deploy" in .sauna/aliases.toml
Edit the file to configure it:

  [deploy]
  prompt = ""
```

- Creates the file if it doesn't exist
- Appends a new section with an empty `prompt` field
- If the alias already exists, print error: `Alias "deploy" already exists. Edit .sauna/aliases.toml directly to modify it.`
- Validates the name against reserved names before writing

### `sauna alias rm <name>`

Remove an alias from `.sauna/aliases.toml`.

- If alias not found, print error and exit non-zero
- Print confirmation: `Removed alias "deploy" from .sauna/aliases.toml`

## Registration with cleye

Use cleye's native `command()` to register the `alias` subcommand:

```ts
import { cli, command } from 'cleye';

const argv = cli({
  // ... existing config
  commands: [
    command({
      name: 'alias',
      parameters: ['<action>', '[name]'],
    }),
  ],
});
```

When `argv.command === 'alias'`, route to the alias handler instead of the normal execution flow.

**Important:** The `alias` subcommand must be checked **before** alias resolution. If the user runs `sauna alias list`, we should not try to expand `alias` as an alias name.

## Acceptance Criteria

- [ ] `sauna alias list` prints all aliases in a readable table
- [ ] `sauna alias list` with no file prints a helpful message
- [ ] `sauna alias show <name>` prints the full TOML definition
- [ ] `sauna alias show <name>` with unknown name errors
- [ ] `sauna alias set <name>` creates the file if needed and appends a stub entry
- [ ] `sauna alias set <name>` rejects reserved names
- [ ] `sauna alias set <name>` rejects duplicate names
- [ ] `sauna alias rm <name>` removes the alias from the file
- [ ] `sauna alias rm <name>` with unknown name errors
- [ ] `sauna alias` with no action prints help for the alias subcommand
- [ ] `sauna alias` subcommand is checked before alias expansion in the argv pipeline

## Files

- `index.ts` — register `alias` command with cleye, route to handler
- `src/alias-commands.ts` — new module: `list`, `show`, `set`, `rm` handlers
- `src/aliases.ts` — shared: loading, parsing, writing the TOML file
