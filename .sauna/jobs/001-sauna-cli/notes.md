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
