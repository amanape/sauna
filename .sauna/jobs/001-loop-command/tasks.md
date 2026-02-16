# Tasks: 001-loop-command

## P0 — Core (must exist for `sauna loop "prompt"` to work end-to-end)

- [ ] Install `cleye` and `@anthropic-ai/claude-agent-sdk` via `bun install`
- [ ] Implement CLI entry point with `cleye`: `loop` subcommand, positional `<prompt>`, `--iterations N`/`-n N` (default 1), `--model <opus|sonnet|haiku>`/`-m` (default sonnet), help text on no subcommand (exit 0), error on unknown subcommand (exit 1)
- [ ] Validate CLI flags: `--iterations` must be a positive integer >= 1 (reject `0`, negative, non-numeric); `--model` must be one of `opus|sonnet|haiku` (error listing valid models); missing prompt exits 1
- [ ] Implement prompt resolution: `.md` suffix + file exists → read via `Bun.file()`; `.md` + missing file → error exit 1; non-`.md` suffix → inline text; trim whitespace; empty after trim → error exit 1
- [ ] Check `ANTHROPIC_API_KEY` env var before first iteration; error exit 1 if missing
- [ ] Implement agent loop: call SDK `query()` N times sequentially (fresh session each), stream output to stdout in real time, print `--- Iteration X/N ---` header before each, print `Completed M/N iterations` summary after all

## P1 — Error handling and signals

- [ ] Handle iteration errors: catch per-iteration, print error to stderr, continue remaining iterations, exit 1 at end if any failed
- [ ] Handle Ctrl+C (SIGINT): abort current iteration, print summary of completed iterations, exit 0

## P2 — Polish, build, and tests

- [ ] Add `"build": "bun build --compile ./index.ts --outfile sauna"` script to `package.json`; add `sauna` to `.gitignore`
- [ ] Write `bun:test` tests for CLI argument parsing (valid args, defaults, missing prompt, `--iterations 0`, `--iterations abc`, unknown `--model`, unknown flags, prompt with dashes)
- [ ] Write `bun:test` tests for prompt resolution (inline text, `.md` file read, missing `.md` error, empty/whitespace-only file error, paths with spaces, non-`.md` path treated as inline)
- [ ] Write `bun:test` tests for agent loop execution (mock SDK `query()`, verify N sequential calls, error continuation, summary output, exit codes)
