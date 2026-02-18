# Agent Session

## Overview

Sauna runs a Claude agent session using the Claude Agent SDK, executing the user's prompt autonomously with full tool access.

## Acceptance Criteria

- Calls the SDK `query()` function with the user's prompt
- Uses `bypassPermissions` permission mode so the agent runs without interactive prompts
- Uses the Claude Code preset system prompt (no custom system prompt)
- Loads user and project settings (`settingSources: ['user', 'project']`) so CLAUDE.md, skills, and user config apply
- When `--model` is provided, the specified model is used; otherwise the SDK default applies
- When `--context` paths are provided, they are prepended to the prompt as path references the agent can navigate to (not file contents)
- Each session is independent (no session resumption between runs)

## Edge Cases

- Authentication is inherited from the Claude Code CLI (subscription login or `ANTHROPIC_API_KEY`); sauna does not manage auth itself
- Network failure mid-session: the SDK's error propagates and sauna prints it
