# Cross-Platform Compilation

## Overview

Build scripts produce standalone binaries for every supported OS and architecture combination using Bun's cross-compilation targets.

## Acceptance Criteria

- A single build command produces binaries for all six targets:
  - `sauna-darwin-arm64` (macOS Apple Silicon)
  - `sauna-darwin-x64` (macOS Intel)
  - `sauna-linux-x64` (Linux x64)
  - `sauna-linux-arm64` (Linux ARM)
  - `sauna-windows-x64.exe` (Windows x64)
  - `sauna-windows-arm64.exe` (Windows ARM)
- Each binary is a standalone executable that runs without Bun or Node.js installed
- The local `bun run build` script still produces a single binary for the current platform (no regression)

## Edge Cases

- Windows binaries have the `.exe` extension
- Binary names include the platform and architecture to avoid filename collisions
