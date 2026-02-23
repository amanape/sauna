# Staged TypeScript linting

## Topic
ESLint auto-fix runs on staged TypeScript files.

## Acceptance Criteria

- [ ] `lint-staged` config maps `*.{ts,mts}` to `eslint --fix`
- [ ] A staged `.ts` file with a fixable lint violation is corrected automatically
- [ ] A staged `.ts` file with an unfixable lint error causes a non-zero exit from lint-staged
- [ ] Unstaged `.ts` files are untouched

## Verify
```sh
# introduce a fixable violation in a .ts file, stage it, then:
bunx lint-staged  # file should be auto-fixed
```
