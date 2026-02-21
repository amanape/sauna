# Prettier Configuration

Set up Prettier with formatting rules that match the existing source code style.

## Config File

Create `.prettierrc` at project root.

### Rules

| Rule | Value | Rationale |
|---|---|---|
| `singleQuote` | `false` | Source files use double quotes |
| `semi` | `true` | All files use semicolons |
| `trailingComma` | `"all"` | Existing code uses trailing commas |
| `tabWidth` | `2` | All files use 2-space indentation |
| `useTabs` | `false` | Spaces throughout |
| `bracketSpacing` | `true` | Standard object spacing |
| `arrowParens` | `"always"` | Consistent arrow function parens |
| `endOfLine` | `"lf"` | macOS/Linux project |

## Ignore File

Create `.prettierignore` at project root.

### Ignored Paths

- `node_modules`
- `dist`
- `coverage`
- `bun.lock`
- `.sauna`

## Package

- `prettier`

## Acceptance Criteria

- [ ] `.prettierrc` exists at project root with all rules above
- [ ] `.prettierignore` exists at project root with all ignored paths
- [ ] `prettier` is installed as a devDependency
- [ ] `bunx prettier --check .` runs without crashing
- [ ] Formatting rules match existing source code style (no unnecessary churn in `src/`)
