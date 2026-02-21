# CLI Interactive Provider Wiring

## Overview

The CLI entry point (`index.ts`) passes the resolved provider to `runInteractive()` instead of hardcoding Claude, enabling interactive mode for all providers.

## Acceptance Criteria

### Removed
- `import { realpathSync } from "node:fs"` (only used in the removed Claude path block)
- `import { execSync } from "node:child_process"` (only used in the removed Claude path block)
- The `if (provider.name === "codex" && interactive)` guard that blocks Codex from interactive mode
- The Claude path resolution block (`which claude` + `realpathSync`) inside the interactive branch

### Changed
- `runInteractive()` is called with `{ prompt, model, context, provider }` instead of `{ prompt, model, context, claudePath }`

### Preserved (no regression)
- Provider resolved via `resolveProvider()` before the interactive branch
- `provider.isAvailable()` checked before the interactive branch
- `--interactive` mutual exclusivity with `--count` and `--forever`
- Non-interactive loop path unchanged
- Dry-run JSON output includes `interactive` and `provider` fields

### Tests (`tests/cli.test.ts`)
- The test for `--provider codex --interactive` now verifies success in dry-run mode: exit 0, JSON includes `provider: "codex"` and `interactive: true`

## Dependencies

- Depends on `interactive-repl-abstraction` (`runInteractive` must accept `provider` instead of `claudePath` before `index.ts` can pass it)
- Should be implemented last — it is the final integration step

## Files

- `index.ts` (modified)
- `tests/cli.test.ts` (modified)
