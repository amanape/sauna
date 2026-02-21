# Test File Lint Policy

Define ESLint rule relaxations for test files to accommodate test patterns like mocks, stubs, and untyped fixtures.

## Rationale

Test files in `tests/` heavily use `any` for mock SDK messages, stub providers, and fixture data. The `strictTypeChecked` preset's `no-unsafe-*` family would fire on virtually every test assertion, creating noise without catching real bugs.

## Rules to Disable for `tests/**/*.ts`

| Rule | Reason |
|---|---|
| `@typescript-eslint/no-unsafe-argument` | Tests pass mock objects as arguments |
| `@typescript-eslint/no-unsafe-assignment` | Tests assign untyped mock data |
| `@typescript-eslint/no-unsafe-member-access` | Tests access properties on mock objects |
| `@typescript-eslint/no-unsafe-call` | Tests call methods on mock objects |
| `@typescript-eslint/no-unsafe-return` | Tests return mock data from helpers |
| `@typescript-eslint/no-explicit-any` | Tests use `any` for mock type annotations |
| `@typescript-eslint/no-unused-vars` | Tests may have unused vars in setup helpers |

## Implementation

Add a `files: ["tests/**/*.ts"]` override block in `eslint.config.mjs` with the rules above set to `"off"`.

## Acceptance Criteria

- [ ] Override block exists in `eslint.config.mjs` targeting `tests/**/*.ts`
- [ ] All 7 rules above are set to `"off"` for test files
- [ ] Test files produce no `no-unsafe-*` or `no-explicit-any` errors
- [ ] Source files in `src/` are NOT affected by these relaxations
- [ ] `bun run lint` on test files completes without `any`-related errors
