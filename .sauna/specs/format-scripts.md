# Format Scripts

Add Prettier CLI scripts to `package.json` for running format checks.

## Scripts

| Script | Command | Purpose |
|---|---|---|
| `format` | `prettier --write .` | Format all files in-place |
| `format:check` | `prettier --check .` | Check formatting without modifying (CI-friendly) |

## Usage

```bash
bun run format        # format in-place
bun run format:check  # check only (exits non-zero if unformatted)
```

## Acceptance Criteria

- [ ] `bun run format` executes Prettier with `--write` flag
- [ ] `bun run format:check` executes Prettier with `--check` flag
- [ ] Both scripts are defined in `package.json` `"scripts"` block
- [ ] Existing `build` and `build:all` scripts are unmodified
