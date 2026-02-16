# 003 Distribution - Tasks

## P0: Version Embedding ✅

- [x] Replace `Bun.file("package.json").json()` in `index.ts` with a static `import pkg from "./package.json"`
- [x] Verify `bun index.ts --version` still prints the correct version in dev
- [x] Verify `bun run build && ./sauna --version` prints the correct version from a compiled binary
- [x] Added test: binary reports correct version when run from a different directory (no adjacent package.json)

## P1: Cross-Platform Compilation ✅

- [x] Add a `build:all` script to `package.json` that compiles for five targets (darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64) — **Note**: `windows-arm64` is not a supported Bun compile target; only five targets are built
- [x] Output binaries to a `dist/` directory (already in `.gitignore`)
- [x] Windows target uses `.exe` extension
- [x] Verify `bun run build` (local dev) is unchanged
- [x] Added tests: verify `build:all` script exists, references all targets, outputs to `dist/`, produces all binaries, and existing `build` script is unchanged

## P2: Automated Releases ✅

- [x] Create `.github/workflows/release.yml` triggered on `v*` tags
- [x] Workflow installs Bun, installs dependencies, runs `bun test`
- [x] Workflow runs `build:all` to produce all five binaries
- [x] Workflow creates a GitHub Release with the tag name as title and attaches all binaries
- [x] Workflow uses `softprops/action-gh-release@v2` for the release step
- [x] Added tests: verify workflow file exists, triggers on v* tags, installs Bun, installs dependencies, runs tests, runs build:all, and creates a release with dist/ binaries attached
