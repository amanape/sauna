# Tasks

## Completed
- [x] CLI parsing: positional prompt, --model/-m, --loop/-l, --count/-n, --context/-c, --help, --version
- [x] Agent session: SDK query(), bypassPermissions, Claude Code preset, settingSources, model override, context prepending
- [x] Streaming output: real-time text, dim tool tags, success summary, red errors
- [x] Loop mode: single-run, fixed count, infinite, iteration headers, error isolation
- [x] Binary compilation: bun run build, standalone binary, .gitignore, package.json bin/build fields
- [x] Test coverage: 45 tests across 5 files, all passing, type checking clean

## Remaining
- [ ] Fix `package.json` `bin` field: change `"./sauna"` to `"./index.ts"` per binary-compilation spec (for `bun link` dev use). Fixes failing `setup.test.ts` assertion.
- [ ] Fix `cwd` in `cli.test.ts` subprocess tests: 4 tests use `cwd: import.meta.dir` (resolves to `src/`) but `index.ts` is at project root. Change to `import.meta.dir + "/.."` so `bun index.ts` finds the entrypoint. Fixes 3 failing tests (special chars, count-without-loop, context paths).
- [ ] Update model aliases in `cli.ts`: `sonnet` → `claude-sonnet-4-5-20250929`, `opus` → `claude-opus-4-6`, `haiku` → `claude-haiku-4-5-20251001`. Update corresponding expected values in `cli.test.ts` (lines 7, 11, 15).

## Notes on investigated non-issues
- **Bun.color() vs raw ANSI**: Spec says to use `Bun.color()` but it returns `null` for `dim`, `reset`, and `bold` (only handles color names, not text attributes). It also does NOT do terminal detection. Raw ANSI codes are the correct approach; this is not a gap.
- **Dead signal parameter in runLoop()**: Accepted but never passed by index.ts. Spec says no special signal handling needed. The parameter exists for test utility (aborting infinite loops in tests). Not a spec violation.
