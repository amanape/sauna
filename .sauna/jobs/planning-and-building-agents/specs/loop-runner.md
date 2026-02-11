# Loop Runner

## What This Component Does

Infrastructure for executing agents in iterative loops. Supports two strategies: fixed-count (run N times) for the planner, and until-done (run until no pending tasks remain) for the builder. Each iteration gets a fresh session to avoid context window bloat across tasks.

## Requirements

### Iteration Strategies

- The runner must support a "fixed-count" strategy: execute the agent N times, where N is configurable
- The runner must support an "until-done" strategy: execute the agent repeatedly until a completion condition is met
- For the builder, the completion condition is: no lines matching `- [ ]` exist in `.sauna/jobs/<job-id>/tasks.md`
- A safety limit must cap the total number of iterations for the until-done strategy to prevent runaway execution
- The safety limit must be configurable, with a sensible default (e.g., pending task count + buffer)

### Session Management

- Each iteration must start a fresh `SessionRunner` session (new conversation context)
- The initial message for each iteration must orient the agent to its job (e.g., provide the job ID and instructions to begin)
- The agent must stream its output during execution (same streaming pattern as the discovery agent)

### Job Resolution

- The job must be specified via a `--job <slug>` CLI flag
- The slug must resolve to `.sauna/jobs/<slug>/` for specs and tasks
- The runner must verify the job directory exists before starting

### Output

- The runner must report iteration progress (e.g., "Iteration 3/10", "5 tasks remaining")
- The runner must report when all iterations are complete or all tasks are done

## Constraints

- Must use the existing `SessionRunner` class for agent execution
- Must not maintain conversation state across iterations (fresh session each time)
- Must not modify agent behavior — the loop runner is pure orchestration
