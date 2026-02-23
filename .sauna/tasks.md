# Release Pipeline — Implementation Tasks

Gap analysis comparing `.sauna/specs/*` against current source. Ordered by dependency graph (foundations first, dependents after, docs last).

---

## Foundation (no dependencies)

- [ ] **commitlint-config** — Install `@commitlint/cli` + `@commitlint/config-conventional` as devDependencies; create `commitlint.config.ts` extending `@commitlint/config-conventional`. Currently: neither package installed, no config file exists.

- [ ] **npm-package-config** — Update `package.json`: rename `name` to `@amanape/sauna`, change `bin` to `{ "sauna": "./index.ts" }`, add `files`, `engines`, `publishConfig`, `bugs` fields, add `scripts.test` and `scripts.prepublishOnly`. Currently: `name` is `"sauna"`, `bin` is `"./sauna"`, all other fields missing.

- [ ] **ci-pipeline** — Replace single-job `.github/workflows/ci.yml` with four-job pipeline: `lint`, `typecheck`, `test` (OS matrix), `build` (gated on the other three). Add concurrency group, use `--frozen-lockfile`. Currently: single `check` job, no typecheck, no matrix, no concurrency, no frozen lockfile.

## Depends on commitlint-config

- [ ] **commit-msg-hook** — Install `simple-git-hooks` as devDependency; add `simple-git-hooks.commit-msg` config and `scripts.prepare` to `package.json`; run `bunx simple-git-hooks` to activate. Currently: none of this exists.

- [ ] **commitlint-ci** — Create `.github/workflows/commitlint.yml` triggered on PRs to `main`; checkout with full history, install with `--frozen-lockfile`, lint commit range from base to head. Currently: file does not exist.

## Depends on release-please + npm-package-config

- [ ] **release-please** — Rewrite `.github/workflows/release.yml` to use `googleapis/release-please-action@v4` triggered on push to `main`; add `pull-requests: write` and `id-token: write` permissions; promote step outputs (`release_created`, `tag_name`) to job-level outputs. Currently: release.yml is tag-triggered using `softprops/action-gh-release` — entirely different architecture.

- [ ] **release-publish** — Add `build-and-publish` job to `release.yml` gated on `needs.release-please.outputs.release_created`; checkout release tag, build all platforms, generate SHA256 checksums, upload to GitHub Release, publish to npm with `--provenance --access public`. Currently: partial (uploads dist/* but no checksums, no npm publish, no release-please integration).

## Standalone

- [ ] **dependabot** — Create `.github/dependabot.yml` for `npm` ecosystem, weekly schedule, with `production` and `dev` dependency groups. Currently: file does not exist.

- [ ] **pr-template** — Create `.github/pull_request_template.md` with What/Why/Testing sections and a checklist. Currently: file does not exist.

## Documentation (last — depends on accurate config)

- [ ] **contributing-docs** — Add four sections to `CONTRIBUTING.md` after "Code style" and before "License": Commit conventions, Git hooks, PR workflow, Release process. Preserve all existing sections. Currently: file exists but lacks these sections.
