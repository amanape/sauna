# Implementation Tasks

Gap analysis comparing `.sauna/specs/*` against current source. Ordered by dependency graph (foundations first, dependents after, docs last).

---

## Pre-commit hooks (new — all unimplemented)

### Foundation

- [x] **lint-staged-dependency** — Install `lint-staged` as devDependency. Done: `lint-staged@16.2.7` installed as devDependency, bun.lock updated. Tests at `tests/pre-commit-hook.test.ts`.

### Depends on lint-staged-dependency

- [x] **staged-typescript-linting** — Add `lint-staged` config mapping `*.{ts,mts}` to `eslint --fix`. Done: `"lint-staged"` key added to `package.json` with `"*.{ts,mts}": ["eslint --fix", "prettier --write"]`. Tests at `tests/pre-commit-hook.test.ts`.

- [x] **staged-file-formatting** — Add `lint-staged` config mapping `*.{ts,mts}` to `prettier --write` and `*.{json,md,yml,yaml,mjs}` to `prettier --write`. Done: combined into the same `lint-staged` config block as staged-typescript-linting; `"*.{json,md,yml,yaml,mjs}": ["prettier --write"]` added. Tests at `tests/pre-commit-hook.test.ts`.

### Depends on lint-staged config + simple-git-hooks

- [x] **pre-commit-hook-wiring** — Add `simple-git-hooks.pre-commit: "bunx lint-staged"` to `package.json` (alongside existing `commit-msg`); re-run `bunx simple-git-hooks` to install the hook. Done: `"pre-commit": "bunx lint-staged"` added to `simple-git-hooks` in `package.json`; `bunx simple-git-hooks` run — hook installed at `.git/hooks/pre-commit`. Tests at `tests/pre-commit-hook.test.ts`. All 297 tests pass.

---

## Release Pipeline (all complete)

### Foundation (no dependencies)

- [x] **commitlint-config** — Install `@commitlint/cli` + `@commitlint/config-conventional` as devDependencies; create `commitlint.config.ts` extending `@commitlint/config-conventional`. Done: packages installed at v20.4.2, `commitlint.config.ts` created.

- [x] **npm-package-config** — Update `package.json`: renamed `name` to `@amanape/sauna`, changed `bin` to `{ "sauna": "./index.ts" }`, added `files`, `engines`, `publishConfig`, `bugs` fields, added `scripts.test` and `scripts.prepublishOnly`. Done.

- [x] **ci-pipeline** — Replace single-job `.github/workflows/ci.yml` with four-job pipeline: `lint`, `typecheck`, `test` (OS matrix), `build` (gated on the other three). Add concurrency group, use `--frozen-lockfile`. Done: four jobs added, OS matrix for test (ubuntu/macos/windows), concurrency group cancels stale runs, all jobs use --frozen-lockfile.

### Depends on commitlint-config

- [x] **commit-msg-hook** — Install `simple-git-hooks` as devDependency; add `simple-git-hooks.commit-msg` config and `scripts.prepare` to `package.json`; run `bunx simple-git-hooks` to activate. Currently: none of this exists. Done: `simple-git-hooks@2.13.1` installed as devDependency, `simple-git-hooks.commit-msg` config added to package.json, `prepare` script added. Hook activated at `.git/hooks/commit-msg`. Tests at `tests/commit-msg-hook.test.ts`. Also fixed pre-existing `setup.test.ts` bin-field assertion to match the updated `bin` object format.

- [x] **commitlint-ci** — Create `.github/workflows/commitlint.yml` triggered on PRs to `main`; checkout with full history, install with `--frozen-lockfile`, lint commit range from base to head. Done: workflow created, YAML validated, lints `base.sha..head.sha` with `--verbose`.

### Depends on release-please + npm-package-config

- [x] **release-please** — Rewrite `.github/workflows/release.yml` to use `googleapis/release-please-action@v4` triggered on push to `main`; add `pull-requests: write` and `id-token: write` permissions; promote step outputs (`release_created`, `tag_name`) to job-level outputs. Done: release.yml rewritten; trigger changed from tag-push to push-to-main; `release-please` job uses `googleapis/release-please-action@v4` with `release-type: node`; job-level outputs wired; YAML validated.

- [x] **release-publish** — Add `build-and-publish` job to `release.yml` gated on `needs.release-please.outputs.release_created`; checkout release tag, build all platforms, generate SHA256 checksums, upload to GitHub Release, publish to npm with `--provenance --access public`. Done: `build-and-publish` job added to same release.yml; checks out release tag, runs `bun install --frozen-lockfile`, `bun run build:all`, generates `checksums.txt` via `sha256sum`, uploads `dist/*` to GitHub Release, writes `.npmrc` with `NPM_TOKEN`, publishes with `npm publish --provenance --access public`.

### Standalone

- [x] **dependabot** — Create `.github/dependabot.yml` for `npm` ecosystem, weekly schedule, with `production` and `dev` dependency groups. Done: `.github/dependabot.yml` created; `npm` ecosystem, weekly schedule, production and dev dependency groups.

- [x] **pr-template** — Create `.github/pull_request_template.md` with What/Why/Testing sections and a checklist. Done: `.github/pull_request_template.md` created with What/Why/Testing sections and checklist for `bun test`, `bun run lint`, `bun run format:check`.

### Documentation (last — depends on accurate config)

- [x] **contributing-docs** — Add four sections to `CONTRIBUTING.md` after "Code style" and before "License": Commit conventions, Git hooks, PR workflow, Release process. Preserve all existing sections. Done: all four sections added; existing sections untouched; content consistent with commitlint-config, commit-msg-hook, and release-please specs.

- [x] **test-sync** — Fix 6 stale `setup.test.ts` tests in the "P2: automated releases" describe block that tested the old tag-triggered single-job workflow. Updated to match the release-please two-job structure: trigger check now asserts `push.branches` contains `main`; step lookups now target `build-and-publish` job; replaced `"workflow runs tests"` (not in spec) with `"build-and-publish job is gated on release_created output"`. All 286 tests pass.
