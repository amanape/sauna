# Version Embedding

## Overview

The CLI version is baked into the compiled binary at build time, so it reports the correct version regardless of where the binary is installed.

## Acceptance Criteria

- `sauna --version` prints the version from `package.json` when run as a compiled binary in any directory
- The version is resolved at compile time via a static import, not read from the filesystem at runtime
- `bun index.ts --version` continues to work identically during development

## Edge Cases

- Binary moved to a different directory still reports the correct version (no dependency on adjacent `package.json`)
