# 003 Distribution - Tasks

## P0: Version Embedding

- [ ] Replace `Bun.file("package.json").json()` in `index.ts` with a static `import pkg from "./package.json"`
- [ ] Verify `bun index.ts --version` still prints the correct version in dev
- [ ] Verify `bun run build && ./sauna --version` prints the correct version from a compiled binary
- [ ] Update `tests/setup.test.ts` if the version-reading approach affects existing assertions

## P1: Cross-Platform Compilation

- [ ] Add a `build:all` script to `package.json` that compiles for all six targets (darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64, windows-arm64)
- [ ] Output binaries to a `dist/` directory (already in `.gitignore`)
- [ ] Windows targets use `.exe` extension
- [ ] Verify `bun run build` (local dev) is unchanged

## P2: Automated Releases

- [ ] Create `.github/workflows/release.yml` triggered on `v*` tags
- [ ] Workflow installs Bun, installs dependencies, runs `bun test`
- [ ] Workflow runs `build:all` to produce all six binaries
- [ ] Workflow creates a GitHub Release with the tag name as title and attaches all binaries
- [ ] Workflow uses `softprops/action-gh-release` or `gh release create` for the release step
