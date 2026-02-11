# Builder Hooks

## What This Component Does

A validation gate system that runs between builder iterations. Hooks are shell commands defined in a shared configuration file. All hooks must pass before the builder can move to the next task. When hooks fail, the failure output is fed back to the builder's current session so it can fix the issue.

## Requirements

### Configuration

- Hooks must be defined in `.sauna/hooks.json` at the project root
- The configuration must be a list of shell commands to execute in order
- Each hook entry must include the command to run
- Hooks are shared across all jobs (not per-job)
- If `.sauna/hooks.json` does not exist or is empty, the builder proceeds without validation gates

### Execution

- After the builder completes a task (stream finishes), all hooks must run in order
- Each hook is a shell command executed in the codebase working directory
- A hook passes if its exit code is 0; any non-zero exit code is a failure
- Hook execution must stop at the first failure (no need to run remaining hooks)
- Hook stdout and stderr must be captured for feedback to the builder

### Failure Handling

- When a hook fails, its output (stdout + stderr) must be sent back to the builder as a new message in the same session
- The builder must then attempt to fix the issue (same task, same conversation context)
- After the builder responds, hooks run again from the beginning
- A configurable max retry count must limit how many fix attempts the builder gets per task
- When max retries are exhausted, the pipeline must halt with an error indicating which hook failed and on which task

### Retry Semantics

- Retries happen within the same session (conversation context preserved — the builder knows what it tried)
- Only hook failures trigger retries; if the builder's own stream completes normally, hooks run
- The retry counter resets for each new task

## Constraints

- Must not modify or interpret hook commands — execute them as-is
- Must not run hooks for the planning agent (builder-only)
- Hook failure output must be presented to the builder clearly, including which command failed and its output
