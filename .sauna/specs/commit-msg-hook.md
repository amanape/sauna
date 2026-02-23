# Commit Message Git Hook

Set up simple-git-hooks to run commitlint on every local commit, preventing non-conventional commit messages before they reach CI.

## Depends On

- `commitlint-config` — the hook invokes `bunx commitlint`, which requires the commitlint packages and config to be present.

## Also Modifies

`package.json` — adds `simple-git-hooks` to `devDependencies`, adds `simple-git-hooks` config block, adds `scripts.prepare`. Other specs that modify `package.json`: `commitlint-config`, `npm-package-config`.

## Package

- `simple-git-hooks` (devDependency)

## Configuration

Add to `package.json`:

### `simple-git-hooks` block

```json
{
  "simple-git-hooks": {
    "commit-msg": "bunx commitlint --edit $1"
  }
}
```

### `prepare` script

```json
{
  "scripts": {
    "prepare": "bunx simple-git-hooks"
  }
}
```

The `prepare` script runs automatically after `bun install`, activating the git hooks for all contributors.

## Activation

Run `bunx simple-git-hooks` once after configuration to install the hook into `.git/hooks/commit-msg`.

## Acceptance Criteria

- [ ] `simple-git-hooks` is in `devDependencies`
- [ ] `package.json` has `simple-git-hooks.commit-msg` set to `"bunx commitlint --edit $1"`
- [ ] `package.json` has `scripts.prepare` set to `"bunx simple-git-hooks"`
- [ ] `.git/hooks/commit-msg` exists after running `bunx simple-git-hooks`
- [ ] `git commit --allow-empty -m "bad message"` is rejected by the hook
- [ ] `git commit --allow-empty -m "chore: valid message"` succeeds
