# Lint Remediation

Fix existing source code to pass strict type-checked ESLint rules.

## Expected Issues

### `src/providers/claude.ts` — `any` in SDK adapter

The Claude SDK adapter uses `any` for untyped SDK messages in:
- `adaptClaudeMessage(msg: any, state)` parameter
- `createMessageChannel()` internals (`resolve`, `pending`, `Promise<any>`)

**Fix**: Add inline `eslint-disable-next-line` comments for `@typescript-eslint/no-explicit-any` and `no-unsafe-*` rules at each location. Include a `TODO` to properly type SDK messages in the future.

### `src/interactive.ts` — `any` in signal handler types

Signal handler callbacks use `(...args: any[]) => void`.

**Fix**: Replace with `(...args: unknown[]) => void` or add inline disable comments.

### `index.ts` — void expression in write callback

`const write = (s: string) => process.stdout.write(s)` implicitly returns `boolean` but is typed as `void`.

**Fix**: Use block body: `const write = (s: string) => { process.stdout.write(s); };`

### Global — `consistent-type-definitions` rule

The codebase uses `type` everywhere for object shapes. The `stylisticTypeChecked` preset prefers `interface`.

**Fix**: Disable `@typescript-eslint/consistent-type-definitions` globally in `eslint.config.mjs` to avoid mass churn. The codebase is consistent in its use of `type`.

### Auto-fixable issues

Run `bun run lint:fix` to handle issues ESLint can auto-fix (e.g., `prefer-nullish-coalescing`, `prefer-optional-chain`).

## Acceptance Criteria

- [ ] `bun run lint` exits with zero errors
- [ ] `bun run format:check` exits with zero errors
- [ ] `bun test` passes (no regressions from lint fixes)
- [ ] No `eslint-disable` comments in test files (handled by test-lint-policy override)
- [ ] Inline disable comments in source files include a `TODO` for future improvement where applicable
- [ ] `consistent-type-definitions` is disabled globally if the codebase uses `type` throughout
