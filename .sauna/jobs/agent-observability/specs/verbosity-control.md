# Verbosity Control

## Purpose

A `--verbose` flag on all subcommands that controls the detail level of agent activity output. Normal mode shows concise summaries; verbose mode shows full details.

## Behavior

### Normal Mode (default, no flag)

- Tool name + one-line summary per call (e.g., "read_file(src/auth.ts)")
- Success/failure symbol per result
- Sub-agent summary line
- Token usage and timing per turn
- Streaming text in discover mode
- Iteration progress in plan/build/run modes

### Verbose Mode (`--verbose`)

Everything in normal mode, plus:
- Full tool call arguments as formatted JSON (truncated at a configurable max length to prevent terminal flooding)
- Full tool result payloads as formatted JSON (same truncation)
- Reasoning/thinking text from the model if present
- Per-step finish reason (stop, tool-calls, length, error)
- Per-step token breakdown (not just per-turn aggregate)

## CLI Integration

### Flag Parsing

The `--verbose` flag must be accepted by all subcommands: discover, plan, build, run. It is a boolean flag with no value (presence means true, absence means false).

The flag must be added to each subcommand's `parseArgs` options and included in the corresponding args type (DiscoverArgs, PlanArgs, BuildArgs, RunArgs).

### Propagation

The verbose flag must flow from parsed CLI args through to the activity reporter module. Each callsite that creates an activity reporter passes the boolean. The reporter uses it to decide what to include in output.

## Constraints

- The verbose flag must not change the agent's behavior — only the display. No additional tool calls, no different prompts, no changed maxSteps.
- Verbose JSON output must be truncated to prevent unbounded terminal output. A reasonable default (e.g., 500 characters per payload) should be used. The exact limit does not need to be user-configurable.
- The flag name is `--verbose` (not `-v`, not `--debug`, not `--log-level`). A short alias is not required.
