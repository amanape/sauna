# SAU-77: Alias Feature — Implementation Notes

## smol-toml API

The `smol-toml` library provides a lightweight TOML parser:

```ts
import { parse } from "smol-toml";

const result = parse(tomlString); // parses TOML string to JS object
```

## Aliases Module Pattern

The `src/aliases.ts` module implements the core alias functionality:

- **`loadAliases(root?: string)`** — reads `.sauna/aliases.toml` (from the provided root directory or current directory), validates the entire configuration, and returns a `Record<string, AliasDefinition>`. If the file doesn't exist, returns an empty object without error.

- **Validation performed by `loadAliases`:**
  - Alias name validation: only `[a-zA-Z0-9_-]` characters allowed; empty names rejected
  - Reserved names validation: rejects `alias`, `help`, `version`, `model`, `m`, `forever`, `count`, `n`, `interactive`, `i`, `context`, `c`
  - Schema validation: `prompt` field must exist and be a string
  - Unknown fields: any key not in the schema triggers an error
  - Mutual exclusivity: `forever` + `count` cannot coexist; `interactive` + `forever`/`count` cannot coexist
  - `count` validation: must be a positive integer when present

- **`expandAlias(alias: AliasDefinition, extraArgs: string[])`** — builds the expanded argv array from an alias definition and user-provided extra arguments:
  - Order: `[prompt, ...aliasFlags, ...extraArgs]`
  - Flags added from the alias: `-m <model>`, `-c <context>` (may repeat), `-n <count>`, `--forever`, `--interactive`
  - User's extra args appended at the end
  - Last-wins semantics for scalar values (flags in `extraArgs` override alias-defined flags)
  - Accumulation for array-type flags (context paths accumulate with `-c`)

- **`AliasDefinition` type:**
  ```ts
  type AliasDefinition = {
    prompt: string;
    model?: string;
    context?: string[];
    count?: number;
    forever?: boolean;
    interactive?: boolean;
  };
  ```

## Test Tmp Directory Pattern

The test suite uses a temporary directory for file operations, managed with `beforeEach`/`afterEach`:

- **Location:** `tests/.tmp-aliases-test/`
- **Setup (beforeEach):** creates the temp directory before each test
- **Teardown (afterEach):** removes the temp directory and all contents after each test
- **Usage:** pass the temp directory as the `root` argument to functions like `loadAliases(tmpDir)`

## Alias Commands Module (`src/alias-commands.ts`)

The CRUD handlers for the `sauna alias` subcommand:

- **`aliasList(aliases, write)`** — prints a compact table with name, truncated prompt (25 chars), and flags in short CLI notation (`-m`, `-c`, `-n`, `--forever`, `-i`). Prints helpful empty-state message when no aliases exist.
- **`aliasShow(aliases, name, write)`** — uses `smol-toml`'s `stringify()` to output the full TOML definition for a single alias. Throws if not found.
- **`aliasSet(name, root?, write?)`** — creates `.sauna/` directory and `aliases.toml` if needed. Appends a stub `[name]\nprompt = ""`. Validates against reserved names and duplicates (via `loadAliases`).
- **`aliasRm(name, root?, write?)`** — loads all aliases, deletes the target, re-stringifies with `stringify()` and rewrites the file. Throws if not found.

**Key decisions:**
- `aliasRm` uses parse-then-rewrite (via `smol-toml` stringify) rather than regex-based section removal. This is safer but reformats the file — acceptable tradeoff since aliases.toml is small.
- All handlers accept an injected `write` callback for testability, matching the pattern used in `runLoop`, `runInteractive`, etc.
- `smol-toml` exports `stringify(obj)` which serializes JS objects back to TOML format.

## Test captureWrite Pattern

When testing functions that take a `write` callback, use a closure over an array (not a string) to capture output:

```ts
function captureWrite() {
  const lines: string[] = [];
  return {
    lines,
    output: () => lines.join(""),
    write: (s: string) => { lines.push(s); },
  };
}
```

**Why not `let output = ""`?** — Returning `{ output, write }` copies the string value at return time. The `write` closure mutates a different `output` variable, so `cap.output` stays `""`. Using an array or getter function avoids this pitfall.

## TypeScript Configuration Note

The project's `tsconfig.json` includes `"noUncheckedIndexedAccess": true`, which requires explicit type-narrowing for record lookups:

- **Pattern:** Use the `!` non-null assertion operator after verifying key existence
- **Example in tests:**
  ```ts
  const aliases = loadAliases(tmpDir);
  expect(aliases['myalias']).toBeDefined();
  const def = aliases['myalias']!; // verified to exist, use !
  expect(def.prompt).toBe('expected prompt');
  ```
- This pattern ensures type safety while keeping code clear about which lookups are safe.

## Alias Subcommand Registration (Task 4)

Registered `sauna alias <action> [name]` using cleye's `command()`:

```ts
commands: [
  command({
    name: "alias",
    parameters: ["<action>", "[name]"],
  }),
],
```

- `argv.command === "alias"` detects the subcommand
- Routing to handlers is done via a `switch(action)` block that dispatches to `aliasList`, `aliasShow`, `aliasSet`, `aliasRm`
- The subcommand handler catches errors from the alias-commands module and prints them to stderr
- `sauna alias` with no action triggers cleye's built-in help display (missing `<action>` parameter)

## Alias Resolution (Task 5)

Alias resolution runs **before** cleye parsing:

1. Check `process.argv[2]` (the first user arg)
2. Skip if it's `"alias"` (subcommand takes priority) or starts with `-` (it's a flag)
3. Load aliases from `.sauna/aliases.toml` and check if `argv[2]` matches an alias name
4. If matched, call `expandAlias()` with `process.argv.slice(3)` as extra args
5. Pass the expanded argv as cleye's third parameter (`customArgv`)

Key design decision: alias resolution is a **pre-processing step** that transforms argv before cleye sees it. This means cleye's normal flag parsing, validation, and help all work naturally on the expanded argv. No special override logic needed — "last wins" for scalars and accumulation for arrays happen via cleye's native behavior.

## Integration Test Pattern for CLI Process Tests

Process-level tests use `Bun.spawn` with temp directories to test the full CLI:

```ts
const tmpDir = resolve(ROOT, 'tests', '.tmp-cli-test');

function spawnSauna(args: string[]) {
  return Bun.spawn(['bun', resolve(ROOT, 'index.ts'), ...args], {
    cwd: tmpDir,  // Controls where .sauna/aliases.toml is found
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, SAUNA_DRY_RUN: '1' },
  });
}
```

- `cwd: tmpDir` controls where `loadAliases()` looks for `.sauna/aliases.toml`
- `SAUNA_DRY_RUN=1` causes the CLI to print parsed config as JSON and exit — perfect for testing alias expansion without needing a real Claude binary
