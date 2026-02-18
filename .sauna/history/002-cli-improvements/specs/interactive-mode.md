# Interactive Mode

## Overview

Sauna supports a multi-turn conversation mode where the user and agent exchange messages in a REPL-style loop.

## Acceptance Criteria

- `--interactive` / `-i` flag enables interactive mode
- Default behavior (no `-i`) remains one-shot: prompt in, agent runs, exit
- First turn uses the CLI prompt; subsequent turns read from a `> ` readline prompt
- The agent maintains conversation context across turns (session is resumed, not restarted)
- Context paths (`--context`) are only applied on the first turn
- Empty input (just pressing Enter) exits the session
- Ctrl+C or Ctrl+D exits the session
- `--interactive` combined with `--count` or `--forever` exits with a non-zero code and an error message (mutually exclusive)
- The readline prompt is written to stderr so it does not mix with agent output on stdout

## Edge Cases

- Agent errors on one turn do not end the session; the user can try another prompt
- First turn with context paths: context is prepended to the prompt; subsequent turns do not re-send context
