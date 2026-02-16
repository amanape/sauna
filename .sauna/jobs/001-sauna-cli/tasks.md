# Tasks

## P0: Dependencies & Package Setup
- [ ] Install `cleye` and `@anthropic-ai/claude-agent-sdk` as runtime dependencies
- [ ] Add `"bin": "./index.ts"` and `"build": "bun build ./index.ts --compile --outfile sauna"` script to package.json
- [ ] Add `sauna` to `.gitignore`

## P1: CLI Parsing
- [ ] Implement CLI arg parsing in `index.ts` using `cleye`: positional prompt, `--model`/`-m` (string), `--loop`/`-l` (boolean), `--count`/`-n` (number), `--context`/`-c` (repeatable string array), version from package.json
- [ ] Implement model short-name resolution (`sonnet`→`claude-sonnet-4-20250514`, `opus`→`claude-opus-4-20250514`, `haiku`→`claude-haiku-4-20250414`); pass unrecognized values through as-is
- [ ] Print help and exit non-zero when no prompt is provided
- [ ] Write tests for CLI parsing: missing prompt exits non-zero, model resolution, special chars preserved, `--count` without `--loop` ignored, multiple `--context` paths

## P2: Agent Session
- [ ] Implement agent session that calls `query()` from `@anthropic-ai/claude-agent-sdk` with: `systemPrompt: { type: "preset", preset: "claude_code" }`, `settingSources: ["user", "project"]`, `allowDangerouslySkipPermissions: true`, and optional `model`
- [ ] Prepend `--context` paths as path references to the prompt string before passing to `query()`
- [ ] Write tests for agent session: context path prepending, model passthrough, session independence

## P3: Streaming Output
- [ ] Implement streaming via `includePartialMessages: true`; write `text_delta` chunks to stdout with `process.stdout.write()`; detect `tool_use` blocks in assistant messages and print dim `[ToolName]` tags using `Bun.color()`
- [ ] On `result` message with `subtype: "success"`: print dim summary line with `usage` token totals, `num_turns`, and `duration_ms`
- [ ] On `result` message with error subtype: print red error with subtype and `errors` array using `Bun.color()`
- [ ] Write tests for streaming output: tool name tag formatting, summary line format, error display format

## P4: Loop Mode
- [ ] Implement loop mode: `--loop` runs infinitely; `--loop --count N` runs N iterations; `--count 0` exits immediately; fresh `query()` call per iteration
- [ ] Print dim loop headers (`loop N` infinite, `loop N / X` fixed count); no header in single-run mode
- [ ] Catch and display errors per iteration without halting subsequent iterations
- [ ] Write tests for loop mode: iteration count, `--count 0` behavior, header formatting, error resilience

## P5: Binary Compilation
- [ ] Verify `bun run build` produces a working standalone `sauna` binary
- [ ] Write smoke test: `./sauna` with no args prints help and exits non-zero
