# Multi-turn Session Management

## Overview

Follow-up turns work within a single long-lived query process using the v1 `query()` API and `streamInput()`.

## Acceptance Criteria

- First turn starts a v1 `query()` session with the full prompt (including context paths)
- After each agent turn completes (result message), the REPL prompts for next input on stderr
- Follow-up input is sent via `query.streamInput()` using a properly constructed `SDKUserMessage`
- The agent maintains full conversation context across turns (single process, no re-spawn)
- Empty input or EOF exits the session and calls `query.close()`
- Agent errors on one turn do not end the session

## Edge Cases

- Session ID extraction from result messages for constructing follow-up `SDKUserMessage` objects
- Graceful cleanup on unexpected process termination
