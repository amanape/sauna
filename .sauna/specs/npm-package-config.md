# npm Package Configuration

Update `package.json` fields so the package can be published to npm as a scoped public package.

## Depends On

None (no prerequisites). However, `commit-msg-hook` and `commitlint-config` also modify `package.json` — coordinate to avoid overwriting each other's changes.

## Also Modifies

`package.json` — renames `name`, changes `bin`, adds `files`, `engines`, `publishConfig`, `bugs`, and two scripts. Other specs that modify `package.json`: `commitlint-config`, `commit-msg-hook`.

## Fields to Add or Change

| Field | Value | Rationale |
|---|---|---|
| `name` | `"@amanape/sauna"` | Scoped package under org |
| `bin` | `{ "sauna": "./index.ts" }` | Named bin entry for npm; points to TS source (Bun runs TS natively) |
| `files` | `["src/", "index.ts", "README.md", "LICENSE"]` | Whitelist published files to keep package small |
| `engines` | `{ "bun": ">=1.2.0" }` | Declare minimum Bun version (informational — npm does not enforce `engines.bun`) |
| `publishConfig` | `{ "access": "public" }` | Required for scoped packages to be public |
| `bugs` | `{ "url": "https://github.com/amanape/sauna/issues" }` | Link to issue tracker |

## Scripts to Add

| Script | Command | Purpose |
|---|---|---|
| `test` | `"bun test"` | Convenience alias; also used by `prepublishOnly` |
| `prepublishOnly` | `"bun test && bun run lint"` | Safety gate before npm publish |

## Fields to Preserve

All existing fields (`version`, `description`, `author`, `license`, `homepage`, `repository`, `keywords`, `module`, `type`, `scripts.build`, `scripts.build:all`, `scripts.lint`, `scripts.lint:fix`, `scripts.format`, `scripts.format:check`, `dependencies`, `devDependencies`, `peerDependencies`) must remain unchanged.

## Acceptance Criteria

- [ ] `name` is `"@amanape/sauna"`
- [ ] `bin` is `{ "sauna": "./index.ts" }`
- [ ] `files` array includes `"src/"`, `"index.ts"`, `"README.md"`, `"LICENSE"`
- [ ] `engines.bun` is `">=1.2.0"`
- [ ] `publishConfig.access` is `"public"`
- [ ] `bugs.url` points to `https://github.com/amanape/sauna/issues`
- [ ] `scripts.test` is `"bun test"`
- [ ] `scripts.prepublishOnly` is `"bun test && bun run lint"`
- [ ] All pre-existing fields and scripts are unmodified
- [ ] `package.json` is valid JSON
