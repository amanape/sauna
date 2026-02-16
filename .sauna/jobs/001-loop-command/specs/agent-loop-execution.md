# Agent Loop Execution

## Overview

Execute the Claude Agent SDK `query()` function N times sequentially, each in a fresh session, streaming agent output to the terminal in real time.

## Acceptance Criteria

- The agent runs exactly N times where N is the `--iterations` value
- Each iteration starts a new session (no `resume` parameter passed)
- Agent output (text responses and tool use activity) streams to stdout in real time during each iteration
- A header line is printed before each iteration (e.g. `--- Iteration 1/5 ---`) so the user can distinguish runs
- The agent runs with `permissionMode: "bypassPermissions"` (fully autonomous)
- The specified `--model` value is passed to the SDK's `model` option
- The working directory for the agent is the user's current working directory (`process.cwd()`)
- If an iteration fails (SDK throws an error), the error is printed to stderr and execution continues to the next iteration
- After all iterations complete, a final summary line is printed (e.g. `Completed 5/5 iterations`)
- Changes made by the agent persist on disk between iterations (no git reset or rollback)
- The process exits with code 0 if all iterations succeed, or code 1 if any iteration failed

## Edge Cases

- User presses Ctrl+C during an iteration: the current iteration is aborted and the process exits cleanly (no orphaned child processes)
- SDK connection failure (e.g. no API key set): a clear error message is shown before the first iteration starts
- An iteration that produces no output still counts as completed

## Constraints

- Uses `@anthropic-ai/claude-agent-sdk` as the agent runtime
- No parallel execution of iterations — they run strictly sequentially
