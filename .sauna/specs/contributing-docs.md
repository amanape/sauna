# Contributing Documentation Update

Update `CONTRIBUTING.md` with commit convention requirements and release process information.

## Depends On

Content in this spec must be consistent with the actual configuration defined in `commitlint-config`, `commit-msg-hook`, and `release-please`.

## File

Update existing `CONTRIBUTING.md`.

## Sections to Add

### Commit Conventions

Document the Conventional Commits format:
- Required format: `type(scope): description`
- Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`
- Examples of valid commit messages (e.g., `feat: add session persistence`, `fix(cli): handle missing config file`)
- Note that commits are validated by a git hook automatically

### Git Hooks

Explain:
- `commit-msg` hook runs commitlint on every commit
- Hooks are activated automatically by `bun install` (via `prepare` script)
- No manual setup needed for contributors

### PR Workflow

Document:
- PRs should target `main`
- PR titles should follow conventional commit format (for squash merges)
- CI must pass before merge

### Release Process

Explain how releases work for contributors' awareness:
- release-please monitors `main` for conventional commits
- A Release PR is maintained automatically with changelog
- Maintainers merge the Release PR to trigger a release
- Contributors do not need to bump versions or edit changelogs

## Sections to Preserve

All existing sections (Development setup, Running locally, Testing, Building, Submitting changes, Reporting bugs, Code style, License) must be preserved. New sections are additions, placed after "Code style" and before "License".

## Acceptance Criteria

- [ ] `CONTRIBUTING.md` has a "Commit conventions" section with format and examples
- [ ] `CONTRIBUTING.md` has a "Git hooks" section explaining automatic setup
- [ ] `CONTRIBUTING.md` has a "PR workflow" section
- [ ] `CONTRIBUTING.md` has a "Release process" section
- [ ] All pre-existing sections are preserved and unmodified
- [ ] Instructions are accurate for a Bun-based project (no npm/yarn references)
