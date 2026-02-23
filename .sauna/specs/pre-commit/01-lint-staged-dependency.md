# lint-staged dependency

## Topic
lint-staged is installed as a dev dependency.

## Acceptance Criteria

- [ ] `lint-staged` appears in `devDependencies` in `package.json`
- [ ] `bun.lock` contains a resolved entry for `lint-staged`

## Verify
```sh
bunx lint-staged --version  # exits 0, prints version
```
