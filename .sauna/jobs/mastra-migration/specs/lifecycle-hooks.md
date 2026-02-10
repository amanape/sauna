# Lifecycle Hooks

## What This Component Does

Lifecycle hooks allow agents to execute custom logic at specific points during their execution. This spec covers the hook infrastructure needed for the current migration and the foundation for future agents.

## Requirements

### Completion Hook ("Done" Hook)

- Agents must support a completion hook that fires when the agent finishes its task.
- The completion hook must receive the agent's final output (text result, any generated artifacts, tool call history).
- This hook is primarily for future autonomous agents (build agent, etc.) that run without human interaction — it enables post-completion logic such as validation, notifications, status updates, or triggering downstream agents.
- The discovery agent does not require a completion hook now, but the infrastructure must be in place so future agents can use it without framework changes.

### Step Finish Hook

- Agents must support a per-step callback that fires after each agentic step (tool call + result cycle).
- This is needed for the discovery agent to surface file write events to the user in real time (the current `onStepFinish` behavior that detects "Wrote <path>" messages).

### Future Extensibility

- The hook system must be extensible to support pre-tool and post-tool hooks in the future (e.g., blocking certain tool calls, auditing tool usage).
- This extensibility is a structural requirement — the framework must not preclude adding these hooks later — but implementing pre-tool or post-tool hooks is not required now.

## Constraints

- Hooks must not require modifying the agent framework's core code to add new hook types. They should be configurable per agent at definition time.
- The "done" hook is the only hook that must be fully functional for this migration. The step-finish hook carries forward from existing behavior. All other hooks are future concerns.
