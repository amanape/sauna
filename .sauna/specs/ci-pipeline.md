# CI Pipeline

Replace the existing single-job CI workflow with a multi-job pipeline that tests across all supported platforms.

## Depends On

None (no prerequisites).

## File

Replace `.github/workflows/ci.yml`.

## Trigger

- `push` to `main`
- `pull_request` to `main`

## Concurrency

Cancel in-progress runs for the same branch/PR:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

## Jobs

### `lint`

Runs on `ubuntu-latest`:

1. Checkout
2. Setup Bun
3. `bun install --frozen-lockfile`
4. `bun run format:check`
5. `bun run lint`

### `typecheck`

Runs on `ubuntu-latest`:

1. Checkout
2. Setup Bun
3. `bun install --frozen-lockfile`
4. `bunx tsc --noEmit`

### `test`

Runs on OS matrix: `ubuntu-latest`, `macos-latest`, `windows-latest` (we ship binaries for all three).

1. Checkout
2. Setup Bun
3. `bun install --frozen-lockfile`
4. `bun test`

### `build`

Runs on `ubuntu-latest`. Depends on `lint`, `typecheck`, and `test` all passing (`needs: [lint, typecheck, test]`).

1. Checkout
2. Setup Bun
3. `bun install --frozen-lockfile`
4. `bun run build`

Build is a gate check only; artifacts are not uploaded here (that happens in the release workflow).

## Acceptance Criteria

- [ ] `.github/workflows/ci.yml` has four jobs: `lint`, `typecheck`, `test`, `build`
- [ ] `lint` runs `format:check` and `lint` on ubuntu
- [ ] `typecheck` runs `bunx tsc --noEmit` on ubuntu
- [ ] `test` runs on `ubuntu-latest`, `macos-latest`, `windows-latest`
- [ ] `build` depends on all three other jobs (`needs: [lint, typecheck, test]`)
- [ ] All jobs use `bun install --frozen-lockfile`
- [ ] Concurrency group cancels stale runs
- [ ] Triggers on push to `main` and PRs to `main`
- [ ] Workflow YAML is valid
