# Notes — Job 003: Distribution

## Version Embedding (P0) — Completed

**Problem**: `index.ts` used `await Bun.file("package.json").json()` to read the version at runtime. This works in dev (`bun index.ts`) because the CWD contains `package.json`, but fails for compiled binaries moved to other directories.

**Solution**: Replaced with `import pkg from "./package.json"`. Bun's bundler resolves this at compile time, inlining the JSON into the binary. The version is now baked in regardless of where the binary runs.

**Changes**:
- `index.ts`: Replaced runtime `Bun.file()` read with static `import pkg from "./package.json"` (line 7)
- `tests/setup.test.ts`: Added test that copies the binary to `/tmp` and verifies `--version` output matches `package.json` version

**Why this approach**: Static imports are resolved by Bun's bundler during `bun build --compile`, meaning the JSON content is embedded in the binary. No runtime filesystem access needed. Existing tests in `setup.test.ts` that read `package.json` via `Bun.file()` are unaffected — they validate the source package.json, not the import mechanism.

## Cross-Platform Compilation (P1) — Completed

**Problem**: Need to compile the CLI for multiple OS/arch combinations so users on different platforms can download pre-built binaries.

**Solution**: Added a `build:all` script to `package.json` that cross-compiles for five targets using Bun's `--target` flag. Binaries are output to `dist/` (already in `.gitignore`).

**Targets** (five, not six):
- `bun-darwin-arm64` → `dist/sauna-darwin-arm64`
- `bun-darwin-x64` → `dist/sauna-darwin-x64`
- `bun-linux-x64` → `dist/sauna-linux-x64`
- `bun-linux-arm64` → `dist/sauna-linux-arm64`
- `bun-windows-x64` → `dist/sauna-windows-x64.exe`

**Why five targets, not six**: The original spec listed `windows-arm64`, but Bun does not support `bun-windows-arm64` as a compile target. Only `bun-windows-x64` (and its `-baseline`/`-modern` variants) are supported. Windows ARM64 users can run x64 binaries via emulation.

**Changes**:
- `package.json`: Added `build:all` script with chained `bun build --compile --target=...` commands for all five targets
- `tests/setup.test.ts`: Added P1 test suite — verifies script exists, references correct targets, outputs to `dist/`, produces all binaries (60s timeout for cross-compilation), and confirms existing `build` script is unchanged

**Why this approach**: Bun's `--compile --target=<target>` flag enables cross-compilation from any platform. Chaining with `&&` ensures the build fails fast if any target fails. The existing `build` script remains untouched for local dev.

## Automated Releases (P2) — Completed

**Problem**: Need an automated way to build and publish release binaries when a version tag is pushed, so users can download platform-specific binaries from GitHub Releases.

**Solution**: Created `.github/workflows/release.yml` — a GitHub Actions workflow triggered on `v*` tags that builds all platform binaries and publishes them as a GitHub Release.

**Workflow steps**:
1. Checkout code (`actions/checkout@v4`)
2. Install Bun (`oven-sh/setup-bun@v2`)
3. Install dependencies (`bun install`)
4. Run tests (`bun test`) — fails fast if tests are broken
5. Build all platforms (`bun run build:all`) — produces five binaries in `dist/`
6. Create GitHub Release (`softprops/action-gh-release@v2`) — attaches all `dist/*` binaries

**Key decisions**:
- `softprops/action-gh-release@v2` was chosen over `gh release create` because it handles release creation and asset upload in a single step with glob support
- `permissions: contents: write` is required for the action to create releases and upload assets
- The workflow runs on `ubuntu-latest` — Bun's cross-compilation handles all target platforms from a single runner
- Tests run before building so broken code never produces a release

**Changes**:
- `.github/workflows/release.yml`: New workflow file
- `tests/setup.test.ts`: Added P2 test suite — parses the YAML and verifies: file exists, triggers on v* tags, installs Bun, installs dependencies, runs tests, runs build:all, and creates a release with dist/ binaries attached
- `package.json`: Added `yaml` as a dev dependency for YAML parsing in tests

**Why test a workflow file**: GitHub Actions workflows can't be run locally, but parsing the YAML and asserting on its structure ensures the workflow won't silently break during refactoring — if someone removes the test step or changes the trigger, tests catch it immediately.
