# ESLint Configuration

Set up ESLint v9+ with a flat config using TypeScript strict type-checked and stylistic rules.

## Packages

- `eslint` (v9+)
- `@eslint/js`
- `typescript-eslint`
- `eslint-config-prettier`

## Config File

Create `eslint.config.mjs` at project root using `tseslint.config()` helper.

### Presets

- `eslint.configs.recommended`
- `tseslint.configs.strictTypeChecked`
- `tseslint.configs.stylisticTypeChecked`
- `prettierConfig` (last, to disable conflicting rules)

### Parser Options

- `projectService: true`
- `tsconfigRootDir: import.meta.dirname`

### Global Ignores

- `node_modules/`
- `dist/`
- `coverage/`
- `.sauna/`

## Acceptance Criteria

- [ ] `eslint.config.mjs` exists at project root
- [ ] Uses flat config format (not legacy `.eslintrc`)
- [ ] Includes `strictTypeChecked` preset
- [ ] Includes `stylisticTypeChecked` preset
- [ ] `eslint-config-prettier` is applied last
- [ ] `projectService: true` is set with correct `tsconfigRootDir`
- [ ] Ignored directories are excluded from linting
- [ ] `bun run lint` executes without crashing (lint errors are acceptable)
