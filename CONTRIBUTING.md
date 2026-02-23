# Contributing to sauna

Thanks for your interest in contributing! Here's how to get started.

## Development setup

Requires [Bun](https://bun.sh) (v1.3+).

```bash
git clone https://github.com/amanape/sauna.git
cd sauna
bun install
```

## Running locally

```bash
bun run index.ts "your prompt here"
```

## Testing

```bash
bun test
```

All tests must pass before submitting a PR.

## Building

```bash
# Current platform
bun run build

# All platforms
bun run build:all
```

## Submitting changes

1. Open an issue first to discuss the change
2. Fork the repo and create a branch from `main`
3. Make your changes and add tests if applicable
4. Run `bun test` to verify everything passes
5. Submit a pull request

## Reporting bugs

Open an issue with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Your OS and Bun version

## Code style

- TypeScript, no explicit `any` unless necessary
- Use `Bun.env` instead of `process.env`
- Keep dependencies minimal

## Commit conventions

Commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`

Examples:

```
feat: add session persistence
fix(cli): handle missing config file
docs: update contributing guide
chore: bump dependencies
```

The `description` should be lowercase and not end with a period. Commits that don't match this format will be rejected by the `commit-msg` hook.

## Git hooks

A `commit-msg` hook runs commitlint on every commit to enforce the conventions above. Hooks are activated automatically when you run `bun install` (via the `prepare` script) — no manual setup needed.

## PR workflow

- Target `main` for all pull requests
- PR titles should follow the conventional commit format (used for squash-merge commit messages)
- All CI checks must pass before a PR can be merged

## Release process

Releases are fully automated — contributors do not need to bump versions or edit changelogs.

- release-please monitors `main` for conventional commits and maintains a Release PR with an auto-generated changelog
- Maintainers merge the Release PR to trigger a release
- The release pipeline builds binaries for all platforms, publishes to npm, uploads artifacts to GitHub Releases, and generates SHA256 checksums

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
