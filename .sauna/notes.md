# Notes

## ci-pipeline (2026-02-23)

- Replaced single `check` job with four jobs: `lint`, `typecheck`, `test`, `build`.
- `test` uses an OS matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`) because we ship binaries for all three platforms.
- `build` is a gate-only check — artifacts are not uploaded here (that happens in the release workflow).
- `bun install --frozen-lockfile` is required in all jobs to ensure reproducible installs in CI.
- Concurrency group `ci-${{ github.ref }}` cancels stale in-progress runs when a new push arrives on the same branch/PR.

## npm-package-config (2026-02-23)

- `package.json` `bin` changed from a string (`"./sauna"`) to an object (`{ "sauna": "./index.ts" }`). This is required for npm to install the binary correctly for scoped packages.
- `files` array controls what gets published to npm — only `src/`, `index.ts`, `README.md`, and `LICENSE` are included (keeps the package lean).
- `engines.bun` is informational for consumers but is enforced by `npm install` on newer npm versions.
- `publishConfig.access: "public"` is required for any scoped (`@org/pkg`) package on the public npm registry — without it, publish defaults to private and fails.
- `prepublishOnly` runs `bun test && bun run lint` before every `npm publish`, acting as a local safety gate before the CI-enforced release.

## commitlint-ci (2026-02-23)

- Created `.github/workflows/commitlint.yml` triggered on `pull_request` to `main`.
- `fetch-depth: 0` is required so the full commit history is available for `--from base.sha`.
- Lints range `base.sha..head.sha` using `bunx commitlint` — catches every commit in a PR, not just the PR title.
- `--verbose` surfaces which rule each commit violated, making failure messages actionable.

## release-please + release-publish (2026-02-23)

- Rewrote `.github/workflows/release.yml` from a tag-triggered `softprops/action-gh-release` workflow into a two-job release-please pipeline.
- Trigger changed from `push: tags: v*` to `push: branches: main` — release-please drives tags, not the engineer.
- `release-please` job uses `googleapis/release-please-action@v4` with `release-type: node`; promotes `release_created` and `tag_name` step outputs to job-level so the downstream job can reference them via `needs.release-please.outputs`.
- `build-and-publish` job is gated on `needs.release-please.outputs.release_created`; checks out the release tag ref so binaries are built from the exact tagged commit.
- `sha256sum * > checksums.txt` (run inside `dist/`) produces a single `checksums.txt` alongside the binaries; all are uploaded together via `softprops/action-gh-release@v2`.
- `npm publish --provenance --access public` requires `id-token: write` (set at workflow level) for SLSA provenance and `--access public` because `@amanape/sauna` is a scoped package.
- `NPM_TOKEN` must be added as a GitHub repository secret manually — outside the scope of this workflow file.

## test-sync for release-please (2026-02-23)

- `setup.test.ts` "P2: automated releases" block had 6 stale tests written for the old tag-triggered, single-`release`-job workflow.
- After `release-please` rewrite: trigger is `push.branches: [main]`, jobs are `release-please` and `build-and-publish`.
- Updated tests: trigger assertion checks `workflow.on.push.branches`; step lookups use `workflow.jobs["build-and-publish"].steps`.
- Replaced `"workflow runs tests"` (no such step in the new workflow or its spec) with `"build-and-publish job is gated on release_created output"`.
- Root cause: tests were not updated when the release workflow was rewritten. Keep release workflow tests in sync with actual job names and trigger structure.

## commit-msg-hook (2026-02-23)

- `simple-git-hooks@2.13.1` installed as devDependency; activates via `prepare` script (`bunx simple-git-hooks`) which runs automatically on `bun install`.
- `simple-git-hooks.commit-msg` in `package.json` runs `bunx commitlint --edit $1` — prevents non-conventional commit messages before they reach CI.
- The `simple-git-hooks` config block must sit at the top level of `package.json` (not inside `devDependencies`); `bunx simple-git-hooks` reads it and writes `.git/hooks/commit-msg`.
- Fixed a pre-existing regression: `tests/setup.test.ts` was checking `pkg.bin === "./sauna"` (old string format) but the `npm-package-config` task had changed `bin` to `{ "sauna": "./index.ts" }`. Updated the assertion to `toEqual({ sauna: "./index.ts" })`.
