# Agent Configuration Parity

## Overview

Interactive sessions use the same agent configuration as single-shot sessions so the agent has full Claude Code capabilities.

## Acceptance Criteria

- Interactive session includes `systemPrompt: { type: "preset", preset: "claude_code" }` so the agent has all Claude Code tools
- Interactive session includes `settingSources: ["user", "project"]` so CLAUDE.md and user settings are loaded
- Interactive session includes `permissionMode: "bypassPermissions"` with `allowDangerouslySkipPermissions: true`
- Interactive session includes `includePartialMessages: true` for streaming tool/text events
- Model default matches non-interactive path (no hardcoded fallback; defer to SDK default when not specified)
- `findClaude()` is shared between both paths (no duplication)

## Edge Cases

- Custom model via `--model` is forwarded to the session options identically to non-interactive
