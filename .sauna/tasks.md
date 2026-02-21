# Tasks

Ordered by dependency chain — each step builds on the previous.

## 1. Install tooling packages
- [ ] `bun add -d eslint @eslint/js typescript-eslint eslint-config-prettier prettier`

## 2. Prettier configuration (`prettier-config.md`)
- [ ] Create `.prettierrc` with: `singleQuote: false`, `semi: true`, `trailingComma: "all"`, `tabWidth: 2`, `useTabs: false`, `bracketSpacing: true`, `arrowParens: "always"`, `endOfLine: "lf"`
- [ ] Create `.prettierignore` with: `node_modules`, `dist`, `coverage`, `bun.lock`, `.sauna`
- [ ] Verify `bunx prettier --check .` runs without crashing

## 3. ESLint configuration (`eslint-config.md`)
- [ ] Create `eslint.config.mjs` using `tseslint.config()` helper
- [ ] Include presets: `eslint.configs.recommended`, `tseslint.configs.strictTypeChecked`, `tseslint.configs.stylisticTypeChecked`, `prettierConfig` (last)
- [ ] Set parser options: `projectService: true`, `tsconfigRootDir: import.meta.dirname`
- [ ] Add global ignores: `node_modules/`, `dist/`, `coverage/`, `.sauna/`
- [ ] Disable `@typescript-eslint/consistent-type-definitions` globally
- [ ] Verify `bunx eslint .` runs without crashing (lint errors acceptable)

## 4. Test file lint policy (`test-lint-policy.md`)
- [ ] Add `files: ["tests/**/*.ts"]` override block in `eslint.config.mjs`
- [ ] Disable all 7 rules: `no-unsafe-argument`, `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return`, `no-explicit-any`, `no-unused-vars`
- [ ] Verify test files produce no `no-unsafe-*` or `no-explicit-any` errors
- [ ] Verify `src/` files are NOT affected by these relaxations

## 5. Lint & format scripts (`lint-scripts.md`, `format-scripts.md`)
- [ ] Add `"lint": "eslint ."` to `package.json` scripts
- [ ] Add `"lint:fix": "eslint . --fix"` to `package.json` scripts
- [ ] Add `"format": "prettier --write ."` to `package.json` scripts
- [ ] Add `"format:check": "prettier --check ."` to `package.json` scripts
- [ ] Verify existing `build` and `build:all` scripts are unmodified

## 6. Lint remediation (`lint-remediation.md`)
- [ ] Run `bun run format` to normalize formatting
- [ ] Run `bun run lint:fix` to auto-fix what ESLint can handle
- [ ] Fix remaining errors manually:
  - [ ] `src/providers/claude.ts` — `any` usage in SDK adapters → inline `eslint-disable-next-line` + `TODO`
  - [ ] `src/interactive.ts` — `any` in signal handler types → `unknown` or inline disable + `TODO`
  - [ ] `index.ts` — implicit return of non-void → block body for callbacks
- [ ] Verify `bun run lint` exits with zero errors
- [ ] Verify `bun test` passes (no regressions)
- [ ] Verify no `eslint-disable` comments in test files
- [ ] Verify inline disable comments in `src/` include a `TODO`
