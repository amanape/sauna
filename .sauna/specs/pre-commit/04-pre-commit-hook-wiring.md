# Pre-commit hook wiring

## Topic
The git pre-commit hook triggers lint-staged via simple-git-hooks.

## Acceptance Criteria

- [ ] `simple-git-hooks.pre-commit` in `package.json` is set to `bunx lint-staged`
- [ ] `simple-git-hooks.commit-msg` in `package.json` remains `bunx commitlint --edit $1`
- [ ] `.git/hooks/pre-commit` exists after running `bunx simple-git-hooks`
- [ ] `.git/hooks/pre-commit` contains `lint-staged`
- [ ] `.git/hooks/commit-msg` still contains `commitlint`

## Verify
```sh
bunx simple-git-hooks            # exits 0
grep lint-staged .git/hooks/pre-commit   # match
grep commitlint .git/hooks/commit-msg    # match
```
