# Dead Code Cleanup — Remove Unused Imports and Stale Comments

## What This Component Does

This spec covers the removal of dead imports and stale traceability comments that reference completed JTBDs. These are small hygiene items that, left uncleaned, mislead the next reader (human or AI) about what the code depends on and what specs govern it.

## Requirements

### Dead Imports

- `src/output-constrained-filesystem.ts` must remove the unused `normalize` import from `node:path` (only `posix` is used).
- `src/output-constrained-filesystem.ts` must remove the unused type imports `FileStat` and `FileEntry` from `@mastra/core/workspace`.

### Stale Comments

- `src/cli.ts` (or its successor modules after decomposition) must remove the comment `// Traces to: specs/cli-simplification.md` — that spec belongs to a completed JTBD.
- `src/output-constrained-filesystem.ts` must remove the comment `// Traces to: specs/agent-framework-and-workspace.md, specs/discovery-agent.md` — those specs belong to completed JTBDs.

### TODO Comment

- `src/cli.ts` contains a TODO comment on line 44 (`// TODO: Why pass the entire env instead of just the key?`). After the env-decoupling refactor, this TODO should be resolved or removed — the design decision will be clear from the parameter signature.

## Constraints

- Only remove imports and comments that are verifiably dead or stale. Do not remove comments that document current behavior or open questions about current code.
- If a "Traces to" comment references a spec that is still active, leave it in place.
