# Binary Compilation

## Overview

Sauna compiles to a standalone executable using Bun's native compiler.

## Acceptance Criteria

- `bun run build` produces a standalone binary named `sauna` in the project root
- The compiled binary runs without requiring Bun or Node.js to be installed
- The binary accepts the same arguments and produces the same behavior as `bun index.ts`
- `package.json` includes a `"build"` script that runs `bun build ./index.ts --compile --outfile sauna`
- `package.json` includes a `"bin"` field pointing to `./index.ts` for development use (`bun link`)

## Edge Cases

- The `sauna` binary in `.gitignore` so it is not committed
