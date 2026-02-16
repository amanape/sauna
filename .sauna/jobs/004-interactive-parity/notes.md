# Job 004 — Interactive Parity Notes

## Key Decisions

### v1 query() API for multi-turn sessions
The interactive REPL was rewritten from the v2 `unstable_v2_createSession` API to the v1 `query()` API. The v1 API:
- Supports all the same options as `runSession()` (systemPrompt, settingSources, etc.)
- Returns a `Query` object that is both an `AsyncGenerator<SDKMessage>` and has control methods
- Follow-up turns use `query.streamInput()` with `SDKUserMessage` objects
- The `session_id` is extracted from yielded messages (every SDK message carries one)

### Multi-turn flow
1. `query({ prompt: string, options })` starts the session with the first prompt
2. The `Query` async generator yields messages across all turns
3. After a `result` message, the REPL prompts for follow-up input
4. Follow-up input is sent via `query.streamInput()` as an `SDKUserMessage`
5. The generator then yields the next turn's messages
6. Empty input or EOF breaks the loop; `query.close()` cleans up

### Session ID extraction
The `session_id` is available on most SDK message types (`SDKPartialAssistantMessage`, `SDKResultMessage`, etc.). We extract it from any message that carries one, making it available for constructing follow-up `SDKUserMessage` objects.

### Config parity achieved
Interactive options now exactly match non-interactive (`src/session.ts`):
- `systemPrompt: { type: "preset", preset: "claude_code" }`
- `settingSources: ["user", "project"]`
- `permissionMode: "bypassPermissions"`
- `allowDangerouslySkipPermissions: true`
- `includePartialMessages: true`
- Model: only included when `--model` is specified (no hardcoded fallback)

### findClaude() extraction
Moved to `src/claude.ts` — shared by `src/session.ts` and `src/interactive.ts`.

## Testing Notes

### Mock Query pattern
The test mock for `Query` uses an async generator with a promise-based signaling mechanism. Key insight: `streamInput()` may be called before the generator reaches its `await` (because `for-await` calls `.next()` after the loop body completes). The mock handles this with a `pendingSignal` flag.

### Signal handling for graceful cleanup
SIGINT/SIGTERM handlers are registered after creating the `Query` object. The handler calls `rl.close()` and `q.close()` to ensure the readline interface and query are cleaned up. Handlers are removed in the `finally` block to avoid listener leaks.

Testability: `InteractiveOverrides` accepts optional `addSignalHandler`/`removeSignalHandler` functions. In production these default to `process.on`/`process.removeListener`. Tests inject fake implementations that capture the handler and invoke it to simulate signal delivery.

### New tests added
- Config parity verification (systemPrompt, settingSources, permissions, etc.)
- Model omission when `--model` not specified
- Model forwarding when `--model` is specified
- SIGINT calls `q.close()` for graceful cleanup
- SIGTERM calls `q.close()` for graceful cleanup
- Signal handlers are removed after normal REPL exit
