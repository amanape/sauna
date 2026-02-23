# Commitlint CI Workflow

GitHub Actions workflow that lints all commit messages in a pull request against the Conventional Commits spec.

## Depends On

- `commitlint-config` — the workflow runs `bunx commitlint`, which requires `commitlint.config.ts` and the commitlint packages in `devDependencies`.

## File

Create `.github/workflows/commitlint.yml`.

## Trigger

- `pull_request` targeting `main` branch

## Job

Single job on `ubuntu-latest`:

1. Checkout with full history (`fetch-depth: 0`)
2. Setup Bun
3. Install dependencies (`bun install --frozen-lockfile`)
4. Run commitlint from PR base to PR head:
   ```
   bunx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
   ```

## Acceptance Criteria

- [ ] `.github/workflows/commitlint.yml` exists
- [ ] Triggers on `pull_request` to `main`
- [ ] Checks out with `fetch-depth: 0` (full history needed for commit range)
- [ ] Uses `--frozen-lockfile` on install
- [ ] Lints the full commit range from base to head
- [ ] Workflow YAML is valid (no syntax errors)
