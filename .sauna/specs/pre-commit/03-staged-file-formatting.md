# Staged file formatting

## Topic
Prettier auto-formats staged files.

## Acceptance Criteria

- [ ] `lint-staged` config maps `*.{ts,mts}` to `prettier --write`
- [ ] `lint-staged` config maps `*.{json,md,yml,yaml,mjs}` to `prettier --write`
- [ ] A staged file with formatting violations is corrected in place
- [ ] After correction, the file passes `prettier --check`
- [ ] Unstaged files are untouched

## Verify
```sh
# mis-format a staged file, then:
bunx lint-staged          # file should be reformatted
prettier --check <file>   # exits 0
```
