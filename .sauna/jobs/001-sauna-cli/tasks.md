# Tasks

## Completed
- [x] CLI parsing: positional prompt, --model/-m, --loop/-l, --count/-n, --context/-c, --help, --version
- [x] Agent session: SDK query(), bypassPermissions, Claude Code preset, settingSources, model override, context prepending
- [x] Streaming output: real-time text, dim tool tags, success summary, red errors
- [x] Loop mode: single-run, fixed count, infinite, iteration headers, error isolation
- [x] Binary compilation: bun run build, standalone binary, .gitignore, package.json bin/build fields
- [x] Test coverage: 45 tests across 5 files, all passing, type checking clean

## Remaining
- [ ] Update model aliases in cli.ts: `opus` maps to `claude-opus-4-20250514` but latest is `claude-opus-4-6`; review `sonnet` and `haiku` aliases for currency as well

## Notes on investigated non-issues
- **Bun.color() vs raw ANSI**: Spec says to use `Bun.color()` but it returns `null` for `dim`, `reset`, and `bold` (only handles color names, not text attributes). It also does NOT do terminal detection. Raw ANSI codes are the correct approach; this is not a gap.
- **Dead signal parameter in runLoop()**: Accepted but never passed by index.ts. Spec says no special signal handling needed. The parameter exists for test utility (aborting infinite loops in tests). Not a spec violation.
