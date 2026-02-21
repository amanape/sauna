# Tasks

All SAU-85 tasks complete. See `.sauna/notes.md` for implementation learnings.

> Note: Two residual lint errors in `index.ts` were fixed post-completion (line 105 unnecessary `?? []`, line 202 `no-non-null-assertion`).

## Completed
- [x] Install tooling packages (eslint, prettier, typescript-eslint, eslint-config-prettier)
- [x] Prettier config (`.prettierrc`, `.prettierignore`)
- [x] ESLint flat config (`eslint.config.mjs`, strict type-checked + stylistic + prettier)
- [x] Test lint policy (override block disabling unsafe-* rules for `tests/**/*.ts`)
- [x] Lint & format scripts in `package.json`
- [x] Lint remediation — `bun run lint` exits with 0 errors, 280 tests pass
- [x] CI workflow — `.github/workflows/ci.yml` runs format:check → lint → test on push/PR to main
