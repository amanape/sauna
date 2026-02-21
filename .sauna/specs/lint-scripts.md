# Lint Scripts

Add ESLint CLI scripts to `package.json` for running lint checks.

## Scripts

| Script | Command | Purpose |
|---|---|---|
| `lint` | `eslint .` | Check for lint errors (read-only) |
| `lint:fix` | `eslint . --fix` | Auto-fix lint errors where possible |

## Usage

```bash
bun run lint        # check
bun run lint:fix    # auto-fix
```

## Acceptance Criteria

- [ ] `bun run lint` executes ESLint against the project
- [ ] `bun run lint:fix` executes ESLint with `--fix` flag
- [ ] Both scripts are defined in `package.json` `"scripts"` block
- [ ] Existing `build` and `build:all` scripts are unmodified
