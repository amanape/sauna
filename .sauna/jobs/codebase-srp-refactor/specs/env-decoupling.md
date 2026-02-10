# Environment Decoupling — Remove Direct `process.env` Access from Business Logic

## What This Component Does

This spec covers removing all direct `process.env` access from business logic functions, replacing it with explicit parameter passing. This makes the functions testable without environment mutation, reusable in web server contexts where configuration may come from a different source, and honest about their dependencies.

## Requirements

### Specific Changes

- `validateApiKey` must accept an environment record (e.g., `Record<string, string | undefined>`) as a parameter instead of reading `process.env` directly. The caller (CLI `main()` or a future web server bootstrap) is responsible for passing in the environment.
- `createTools` already accepts an optional `searchFn` parameter, but its default path calls `resolveSearchFn(process.env ...)`. The `process.env` access must be pushed to the caller. `createTools` must require either a `searchFn` or have the caller resolve it before calling.
- `resolveSearchFn` already accepts an `env` parameter — this is correct and needs no change.
- The only place `process.env`, `process.argv`, `process.stdin`, `process.stdout`, and `process.exit` should appear is in the CLI adapter's `main()` function (the composition root) and in test files.

### Verification

- A grep for `process\.env` across `src/` must return hits only in the CLI adapter's `main()` function (or equivalent composition root).
- A grep for `process\.` (stdin, stdout, exit, argv) across `src/` must return hits only in the CLI adapter module.
- All existing tests must continue to pass. Tests that currently mutate `process.env` (like the `validateApiKey` tests) should be updated to pass environment records as parameters instead.

## Constraints

- Do not introduce a configuration object, config file parser, or dependency injection framework. Simple parameter passing is sufficient.
- Do not change the external behavior of any function — only how it receives its dependencies.
