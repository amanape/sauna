# Notes — Job 001: sauna-cli

## P0: Dependencies & Package Setup (completed)

### What was done
- Installed `cleye@2.2.1` and `@anthropic-ai/claude-agent-sdk@0.2.42` as runtime dependencies
- Added `"bin": "./index.ts"`, `"version": "0.1.0"`, and `"build"` script to `package.json`
- Added `sauna` binary to `.gitignore`
- Verified `bun run build` compiles a working standalone binary from the placeholder `index.ts`

### Key learnings
- **cleye API**: `cli()` function from `cleye` handles arg parsing. Flags defined with `{ type: String, alias: 'x' }` etc. Repeatable arrays use `{ type: [String] }`. Version is auto-handled when `version` is set in `cli()` config.
- **claude-agent-sdk API**: `query()` returns an `AsyncGenerator<SDKMessage>`. With `includePartialMessages: true`, also yields `stream_event` messages. Key options: `systemPrompt`, `settingSources`, `permissionMode`, `allowDangerouslySkipPermissions`, `model`, `includePartialMessages`.
- **Stream events**: `stream_event.event` is a raw Anthropic `RawMessageStreamEvent` (e.g., `content_block_delta`, `content_block_start`). Full message types: `system`, `stream_event`, `assistant`, `user`, `result`.
- **Result message**: Has `subtype` field — `"success"` includes `result`, `total_cost_usd`, usage stats. Error subtypes include `errors` array.

### Test file
- `setup.test.ts` — 7 tests covering package.json fields, dependency availability, and .gitignore

## P1: CLI Parsing (completed)

### What was done
- Created `cli.ts` with `resolveModel()` function that maps short names (sonnet, opus, haiku) to full model IDs
- Rewrote `index.ts` to use `cleye` for argument parsing with all flags from the spec
- Implemented `SAUNA_DRY_RUN=1` env var for test observability — prints parsed config as JSON and exits
- Shows help and exits non-zero when no prompt is provided

### Architecture decisions
- **Separated `cli.ts` from `index.ts`**: `resolveModel()` is a pure function in `cli.ts` that can be imported and tested directly without subprocess overhead. `index.ts` is the entry point with side effects (process.exit, stdout).
- **`SAUNA_DRY_RUN` env var**: Subprocess tests set this to inspect parsed config without needing the agent SDK. This avoids mocking and tests the real CLI parsing path.
- **Optional `[prompt]` parameter**: Using `[prompt]` (optional) instead of `<prompt>` (required) because cleye's required parameter handling doesn't produce the exit-non-zero behavior we need — we handle it manually with `showHelp()` + `process.exit(1)`.

### Key learnings
- cleye's `cli()` accepts `parameters: ["[prompt]"]` for optional positional args. Access via `argv._.prompt`.
- Repeatable flags use `type: [String]` (array wrapping the type constructor).
- `argv.flags.context` returns `string[] | undefined` for `[String]` typed flags; default to `[]` when undefined.
- JSON.stringify escapes double quotes in strings — tests that check special chars in prompts should parse the JSON output rather than doing substring matching.

### Test file
- `cli.test.ts` — 9 tests: 5 model resolution (direct import), 1 missing prompt (subprocess), 1 special chars (subprocess), 1 count-without-loop (subprocess), 1 context paths (subprocess)

## P2: Agent Session (completed)

### What was done
- Created `session.ts` with two exports: `buildPrompt()` (pure function) and `runSession()` (SDK integration)
- `buildPrompt(prompt, contextPaths)` prepends context paths as `Context: <path>` references, separated by newlines, before the user's prompt. Empty context array returns prompt unchanged.
- `runSession(config)` calls `query()` with the correct SDK options: `claude_code` preset system prompt, `settingSources: ["user", "project"]`, `permissionMode: "bypassPermissions"`, `allowDangerouslySkipPermissions: true`, and optional `model` spread only when provided.
- Wired `runSession` into `index.ts` — drains the async generator with `for await`. P3 will add streaming output handling inside that loop.

### Architecture decisions
- **Separated `session.ts` from `index.ts`**: `buildPrompt()` is a pure function testable via direct import. `runSession()` wraps the SDK call and is testable via `mock.module` to verify options. `index.ts` remains the entry point orchestrator.
- **Mock strategy**: Used `mock.module("@anthropic-ai/claude-agent-sdk")` in `session.test.ts` to intercept `query()` calls and record the arguments. The mock returns a minimal async generator that yields a success result. This is the only file mocking this module, so no process-global interference.
- **Model spread pattern**: `...(config.model ? { model: config.model } : {})` ensures `model` key is completely absent from options when not provided, so the SDK uses its default. Tests verify both presence and absence.

### Key learnings
- `query()` returns an `AsyncGenerator<SDKMessage>` — must be iterated (`for await`) for the call to execute. Just calling `runSession()` without draining the generator does nothing.
- `mock.module()` + dynamic `await import()` pattern: mock must be registered before importing the module that uses the mocked dependency. Static imports of pure functions (like `buildPrompt`) can still use regular imports since they don't touch the mocked dependency.
- SDK `permissionMode` is a separate option from `allowDangerouslySkipPermissions` — both are required for bypass mode.

### Test file
- `session.test.ts` — 7 tests: 3 buildPrompt (direct import), 4 runSession (mock-based: SDK options, model passthrough, model omission, context prepending). All validated with break/verify cycle.

## P3: Streaming Output (completed)

### What was done
- Created `stream.ts` with pure formatting functions and a `processMessage` handler
- `formatToolTag(name)` — wraps tool name in dim ANSI brackets: `\x1b[2m[Name]\x1b[22m`
- `formatSummary(info)` — dim line with total tokens (input + output), turn count (singular/plural), and duration in seconds
- `formatError(subtype, errors)` — red error line with subtype header and indented error details
- `processMessage(msg, write)` — dispatches SDK messages: writes `text_delta` text, prints dim tool tags on `content_block_start` for `tool_use`, prints summary on success result, prints error on error result. Ignores all other message types.
- Added `includePartialMessages: true` to `session.ts` query options so `stream_event` messages are yielded
- Wired `processMessage` into `index.ts` loop body with `process.stdout.write` as the write callback

### Architecture decisions
- **Pure formatting + write callback pattern**: `processMessage` accepts a `write: (s: string) => void` callback instead of writing directly to `process.stdout`. This decouples formatting logic from I/O, making tests deterministic — test collects output in an array instead of mocking stdout. In production, `index.ts` passes `(s) => process.stdout.write(s)`.
- **Raw ANSI codes instead of `Bun.color()`**: The spec mentions `Bun.color()` but raw ANSI escape codes (`\x1b[2m` for dim, `\x1b[31m` for red) are simpler, have no runtime dependency, and are directly testable with regex. `Bun.color()` is more useful for converting color names to hex/ansi — for static ANSI formatting, raw codes are standard practice.
- **Tool detection via `content_block_start`**: Rather than waiting for the completed `assistant` message, tool names are detected from `stream_event` with `event.type === "content_block_start"` and `event.content_block.type === "tool_use"`. This prints the tool tag immediately as the agent starts using the tool, before the tool completes.

### Key learnings
- SDK `stream_event` messages wrap raw Anthropic API events in `msg.event`. The event types are: `content_block_start`, `content_block_delta`, `content_block_stop`, `message_start`, `message_delta`, `message_stop`.
- `text_delta` arrives in `content_block_delta` events where `delta.type === "text_delta"` and `delta.text` contains the token chunk.
- Tool use starts with `content_block_start` where `content_block.type === "tool_use"` — the `name` field gives the tool name immediately (e.g., "Read", "Bash", "Edit").
- `SDKResultSuccess.usage` has `input_tokens` and `output_tokens` (snake_case from the API). `SDKResultError` has `errors: string[]` array and error-specific subtypes like `error_during_execution`, `error_max_turns`.

### Test file
- `stream.test.ts` — 12 tests: formatToolTag (1 ANSI verification), formatSummary (3: token count/turns/duration, sub-second duration, singular turn), formatError (3: subtype+messages, multiple errors, empty errors), processMessage (5: text_delta, tool tag, success summary, error display, unrelated messages ignored). All validated with break/verify cycle.

## P4: Loop Mode (completed)

### What was done
- Added `formatLoopHeader()` to `stream.ts`: formats dim headers as `loop N` (infinite) or `loop N / X` (fixed count)
- Created `loop.ts` with `runLoop()` function that orchestrates single-run vs loop mode
- `runLoop()` accepts a session factory and write callback — no direct SDK or stdout dependency, fully testable
- Wired `runLoop` into `index.ts`, replacing the previous single-run session drain loop
- Infinite mode uses `AbortSignal` to break the loop (process default SIGINT handling suffices)

### Architecture decisions
- **Separated `loop.ts` from `index.ts`**: Loop orchestration is a distinct concern. `runLoop()` accepts dependencies (session factory, write callback, optional AbortSignal) making it testable without mocking the SDK or process.stdout.
- **Session factory pattern**: Instead of passing config and having `runLoop` call `runSession` directly, `index.ts` passes `() => runSession({...})`. This inverts the dependency — `loop.ts` only knows about async generators, not the SDK.
- **AbortSignal for infinite mode testing**: Infinite loops are testable by passing an AbortController signal that aborts after N iterations. In production, no signal is passed — SIGINT terminates the process directly.
- **Error isolation via try/catch per iteration**: Each iteration's session is wrapped in try/catch. Errors are formatted with red ANSI and printed, then the next iteration proceeds.

### Key learnings
- `for (let i = 1; i <= 0; i++)` naturally does zero iterations, so the `count === 0` early return is defensive clarity, not strictly necessary.
- The `processMessage` callback pattern from P3 composes cleanly with the loop — `runLoop` calls `processMessage` for each SDK message within each iteration.
- AbortSignal is checked both before starting an iteration and after completing one, ensuring clean termination.

### Test file
- `loop.test.ts` — 8 tests: formatLoopHeader (2: infinite mode, fixed count), runLoop (6: single-run no header, count 3 with headers, count 0 zero iterations, count 1 with header, error resilience, infinite mode with abort). All validated with break/verify cycle.

## P5: Binary Compilation (completed)

### What was done
- Verified `bun run build` produces a working `sauna` binary (~200ms compile time)
- Added 2 smoke tests to `setup.test.ts`: binary existence check and no-args-prints-help-exits-non-zero
- Tests use `beforeAll` to build the binary once before the P5 suite runs

### Architecture decisions
- **Tests in `setup.test.ts`**: Binary compilation tests belong alongside P0 setup tests since both concern the project build infrastructure. A `beforeAll` builds the binary fresh before the P5 describe block.
- **Subprocess-based smoke test**: Uses `Bun.spawn(["./sauna"])` to run the compiled binary as a subprocess, capturing stdout and exit code. This tests the actual compiled artifact, not the source via `bun index.ts`.

### Key learnings
- `bun build ./index.ts --compile --outfile sauna` bundles 9 modules and compiles in ~200ms
- The compiled binary correctly inherits cleye's help/version behavior and all flag parsing
- `Bun.spawn` with `stdout: "pipe"` captures output; `await proc.exited` returns the exit code

### Test file
- `setup.test.ts` — 9 tests total: 7 P0 setup tests + 2 P5 binary compilation tests (binary exists, no-args smoke test). All validated with break/verify cycle.
