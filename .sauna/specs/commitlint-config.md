# Commitlint Configuration

Install commitlint and configure it to enforce Conventional Commits syntax on commit messages.

## Depends On

None (no prerequisites).

## Also Modifies

`package.json` — adds `@commitlint/cli` and `@commitlint/config-conventional` to `devDependencies`. Other specs that modify `package.json`: `commit-msg-hook`, `npm-package-config`.

## Packages

- `@commitlint/cli`
- `@commitlint/config-conventional`

Both installed as devDependencies.

## Config File

Create `commitlint.config.ts` at project root.

### Preset

- Extends `@commitlint/config-conventional`

This enforces the format: `type(scope): description` where `type` is one of `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`.

## Acceptance Criteria

- [ ] `@commitlint/cli` is in `devDependencies`
- [ ] `@commitlint/config-conventional` is in `devDependencies`
- [ ] `commitlint.config.ts` exists at project root
- [ ] Config extends `@commitlint/config-conventional`
- [ ] `echo "feat: valid message" | bunx commitlint` exits 0
- [ ] `echo "bad message" | bunx commitlint` exits non-zero
