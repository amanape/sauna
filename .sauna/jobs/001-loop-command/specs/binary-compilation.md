# Binary Compilation

## Overview

Compile the sauna CLI into a standalone executable binary using `bun build --compile` so it can be run as `sauna` without requiring Bun to be installed at runtime.

## Acceptance Criteria

- Running `bun build --compile` produces a single executable binary named `sauna`
- The compiled binary runs on the host platform (macOS arm64 for the developer's machine)
- Running `./sauna loop "hello" --iterations 1` from the compiled binary behaves identically to `bun run index.ts loop "hello" --iterations 1`
- A `build` script in `package.json` runs the compile command (e.g. `bun run build`)
- The compiled binary is added to `.gitignore`

## Edge Cases

- Dependencies that use native modules (if any) are bundled correctly
- The binary size is reasonable (checked but no hard limit for v1)

## Constraints

- Target the current host platform only (no cross-compilation in v1)
- The entrypoint for compilation is the main CLI file
