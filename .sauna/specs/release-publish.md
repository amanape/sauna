# Release Build and Publish

Build platform binaries, generate checksums, upload to GitHub Release, and publish to npm when a release is created.

## Depends On

- `release-please` — this job uses `needs: release-please` and reads its job-level outputs. Both jobs live in the same file: `.github/workflows/release.yml`.
- `npm-package-config` — the package must have the scoped name, `publishConfig`, and `files` fields set before publishing to npm makes sense.

## File

Part of `.github/workflows/release.yml` (the `build-and-publish` job, runs after `release-please`).

## Trigger

Conditional on the `release-please` **job** output:

```yaml
needs: release-please
if: ${{ needs.release-please.outputs.release_created }}
```

Note: uses `needs.release-please.outputs` (job-level), not `steps.release.outputs` (step-level), because this is a separate job.

## Job: `build-and-publish`

Runs on `ubuntu-latest`:

### Build Steps

1. Checkout (with the release tag: `ref: ${{ needs.release-please.outputs.tag_name }}`)
2. Setup Bun
3. `bun install --frozen-lockfile`
4. `bun run build:all` (builds binaries for all platforms into `dist/`)
5. Generate SHA256 checksums for each binary:
   ```bash
   cd dist && sha256sum * > checksums.txt
   ```

### Upload to GitHub Release

Upload `dist/*` (binaries + checksums) to the release created by release-please, using the tag from outputs.

### Publish to npm

Setup npm authentication and publish:

```yaml
- name: Setup npm auth
  run: echo "//registry.npmjs.org/:_authToken=${{ secrets.NPM_TOKEN }}" > .npmrc

- name: Publish to npm
  run: npm publish --provenance --access public
```

Uses `npm publish` directly (available on GitHub Actions runners). The `--provenance` flag requires the workflow-level `id-token: write` permission (defined in the `release-please` spec). The `--access public` flag is required for scoped packages.

### Prerequisites (manual, outside this spec)

- `NPM_TOKEN` must be added as a repository secret in GitHub Settings
- The `@amanape` scope must exist on npmjs.com

## Acceptance Criteria

- [ ] `build-and-publish` job exists in `.github/workflows/release.yml`
- [ ] Job has `needs: release-please`
- [ ] Job condition uses `needs.release-please.outputs.release_created` (not `steps.release`)
- [ ] Checks out with the release tag ref
- [ ] Builds all platform binaries via `bun run build:all`
- [ ] Generates `checksums.txt` with SHA256 hashes
- [ ] Uploads binaries and checksums to the GitHub Release
- [ ] Creates `.npmrc` with `NPM_TOKEN` for authentication
- [ ] Publishes to npm with `npm publish --provenance --access public`
- [ ] Workflow YAML is valid
