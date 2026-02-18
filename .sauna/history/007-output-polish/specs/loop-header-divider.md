# Loop Header Divider

## Problem

The loop iteration header (`loop n / N`) is rendered in dim text and blends into the surrounding agent output. When running `--count` or `--forever` mode, it's hard to tell where one iteration ends and the next begins.

## Current Behavior

`formatLoopHeader()` in `src/stream.ts:36-38` wraps the label in `\x1b[2m` (dim). Output looks like:

```
...agent output from iteration 1...
loop 2 / 5
...agent output from iteration 2...
```

The dim text is easily missed.

## Desired Behavior

The loop header should be a **full-width horizontal divider** with the label centered, using **bold** text. Example at 40 columns:

```
───────── loop 2 / 5 ─────────
```

- The divider character is `─` (U+2500, box-drawing horizontal).
- The label is **bold** (`\x1b[1m`), not dim.
- Padding: one space on each side of the label text.
- The total line width matches the terminal width.
- When stdout is not a TTY (piped), fall back to a fixed width (e.g., 40) or just the bold label without divider bars.

## Implementation

- Read terminal width from `process.stdout.columns` (returns `number | undefined`).
- Accept an optional `columns` parameter in `formatLoopHeader()` for testability — defaults to `process.stdout.columns ?? 40`.
- Calculate left/right bar lengths: `(columns - label.length - 2) / 2` (the 2 accounts for the spaces around the label).
- If the total is odd, give the extra character to the right side.
- Apply bold ANSI codes to the entire line.

## Acceptance Criteria

- [ ] `formatLoopHeader(2, 5)` at 40 columns produces a bold line: `───────── loop 2 / 5 ──────────`
- [ ] `formatLoopHeader(1)` (infinite mode) at 40 columns produces: `──────────── loop 1 ────────────`
- [ ] When `columns` is smaller than the label + 4 (label + 2 spaces + minimum 1 bar each side), fall back to just the bold label with no bars
- [ ] Non-TTY fallback: when `process.stdout.columns` is undefined and no explicit columns passed, uses 40
- [ ] Existing tests updated; no regressions in `bun test`

## Files

- `src/stream.ts` — modify `formatLoopHeader()`
- `tests/stream.test.ts` — update/add tests
