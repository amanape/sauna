# Lint Remediation

Fix existing source code to pass strict type-checked ESLint rules.

## Process

1. Run `bun run format` to normalize formatting
2. Run `bun run lint:fix` to auto-fix what ESLint can handle
3. Manually fix remaining errors
4. Verify clean state

## Known Patterns to Address

- **`any` usage in SDK adapters** (`src/providers/claude.ts`): Add inline `eslint-disable-next-line` comments with a `TODO` to properly type SDK messages later
- **`any` in signal handler types** (`src/interactive.ts`): Replace with `unknown` or add inline disable comments
- **Implicit return of non-void** (`index.ts`): Use block body for callbacks that discard return values
- **Auto-fixable issues**: `prefer-nullish-coalescing`, `prefer-optional-chain`, etc. handled by `lint:fix`

## Acceptance Criteria

- [ ] `bun run lint` exits with zero errors
- [ ] `bun test` passes (no regressions from lint fixes)
- [ ] No `eslint-disable` comments in test files (handled by test-lint-policy override instead)
- [ ] Inline disable comments in source files include a `TODO` where applicable
