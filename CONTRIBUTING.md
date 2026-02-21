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

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
