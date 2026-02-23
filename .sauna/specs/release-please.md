# Release Please Automation

Configure release-please to automatically create and maintain Release PRs with changelog entries when conventional commits land on `main`.

## Depends On

None (no prerequisites). However, this spec defines one of two jobs in `.github/workflows/release.yml`. The other job is defined in `release-publish`.

## File

Replace `.github/workflows/release.yml`.

## Trigger

- `push` to `main`

## Permissions

Workflow-level permissions (shared by both jobs in this file):

```yaml
permissions:
  contents: write
  pull-requests: write
  id-token: write
```

## Job: `release-please`

Uses `googleapis/release-please-action@v4`:

```yaml
- uses: googleapis/release-please-action@v4
  id: release
  with:
    release-type: node
```

### Job-Level Outputs

The step outputs must be promoted to job-level outputs so the downstream `build-and-publish` job (defined in `release-publish` spec) can reference them via `needs.release-please.outputs`:

- `release_created` — boolean, true when a Release PR is merged
- `tag_name` — the git tag (e.g., `v0.5.0`)

```yaml
outputs:
  release_created: ${{ steps.release.outputs.release_created }}
  tag_name: ${{ steps.release.outputs.tag_name }}
```

Release-please automatically:
- Parses conventional commit messages since last release
- Creates/updates a Release PR with changelog and version bump
- On merge, creates a GitHub Release with release notes

## Acceptance Criteria

- [ ] `.github/workflows/release.yml` contains a `release-please` job
- [ ] Uses `googleapis/release-please-action@v4`
- [ ] `release-type` is `node`
- [ ] Triggers on push to `main`
- [ ] Has `contents: write`, `pull-requests: write`, and `id-token: write` permissions
- [ ] Step outputs are promoted to job-level outputs (`release_created`, `tag_name`)
- [ ] Workflow YAML is valid
