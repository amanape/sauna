## P0
- [ ] Rewrite `src/interactive.ts` to use v1 `query()` API instead of v2 `unstable_v2_createSession` — unblocks all config parity items
- [ ] Add `systemPrompt`, `settingSources`, `allowDangerouslySkipPermissions`, `includePartialMessages` to interactive session options (matching non-interactive path)
- [ ] Remove hardcoded model default `"claude-sonnet-4-20250514"` — defer to SDK default when `--model` not specified, matching non-interactive path
- [ ] Implement follow-up turns via `query.streamInput()` with properly constructed `SDKUserMessage` objects (extract `session_id` from result messages)
- [ ] Extract `findClaude()` into a shared module imported by both `src/session.ts` and `src/interactive.ts`

## P1
- [ ] Handle graceful cleanup on unexpected process termination (SIGINT/SIGTERM) by calling `query.close()`
- [ ] Update `InteractiveOverrides` type and `tests/interactive.test.ts` mocks to match v1 `query()` + `streamInput()` API
