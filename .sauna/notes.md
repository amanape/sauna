# Notes — SAU-85: Extend CI (ESLint + Prettier)

## Why these linting choices were made

### `strictTypeChecked` + `stylisticTypeChecked`
We chose the strictest typescript-eslint presets because the codebase is fully typed. Weaker presets would miss real bugs in the SDK adapter code. The upfront remediation cost was acceptable given the long-term safety benefit.

### `eslint-config-prettier` last
Prettier and typescript-eslint share overlapping formatting rules (e.g., `@typescript-eslint/no-extra-semi`). Placing `prettierConfig` last disables all ESLint rules that could conflict with Prettier's output, preventing double-formatting fights in CI.

### `consistent-type-definitions` disabled globally
The codebase uses `type` aliases uniformly for object shapes (e.g., `type ProviderEvent = ...`). Enabling this rule would force a mass rename to `interface` with no correctness benefit and high diff noise.

### Test override block instead of inline `eslint-disable`
Mock objects and stub providers in `tests/` routinely trigger `no-unsafe-*` and `no-explicit-any`. Rather than scatter `eslint-disable` comments through every test file, a single `files: ["tests/**/*.ts"]` override block disables the noisy rules cleanly. Source files in `src/` remain at full strictness.

### `send()` returns `Promise<void>` without `async`
`InteractiveSession.send()` must return `Promise<void>`. Implementing it as `async` triggers `require-await` because the body has no `await`. Solution: non-async method body returning `Promise.resolve()` satisfies both the interface and the linter.

### Block `eslint-disable` in `src/providers/claude.ts`
The Claude Agent SDK returns untyped `any` from `adaptClaudeMessage` and `createMessageChannel`. A block disable (not line-level) is used with a `TODO` comment to surface these when the SDK ships proper types.

## Patterns discovered during remediation

- `while (true)` → needs `// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition`
- Numbers in template literals → `String(n)` to satisfy `restrict-template-expressions`
- Non-null assertions on `Object.keys()` results → inline disable with explanation comment
- Signal handler `args` → type as `unknown[]` instead of `any[]`

## CI workflow structure

Two workflows are intentionally separate:
- `release.yml` — triggered on tag push (`v*`), builds cross-platform binaries, creates GitHub Release. Does not need lint/format gates since those are enforced on the PR that lands the tag commit.
- `ci.yml` — triggered on push/PR to `main`, runs `format:check → lint → test`. Fast feedback loop; no binary builds.

Step order in `ci.yml` is intentional: formatting is cheapest to check, lint is next, tests are slowest. Fast-fail on cheaper checks first.

### `?? []` on array flags is unnecessary with cleye
cleye types `type: [String]` flags as `string[]` (defaults to `[]`), never `undefined`. Using `?? []` triggers `no-unnecessary-condition`. Fix: remove the `?? []`.

### Non-null assertion after `&&`-exit guard
TypeScript doesn't narrow `prompt` to `string` inside a nested else block when the guard is `if (!prompt && !interactive) { process.exit(1) }`. The non-null assertion (`!`) is needed but forbidden by `no-non-null-assertion`. Fix: inline `eslint-disable-next-line` with a TODO, consistent with the project's disable-comment pattern.

## Test count baseline
280 tests across 15 files. Any new test addition should be verified by first making the assertion fail, then reverting.
