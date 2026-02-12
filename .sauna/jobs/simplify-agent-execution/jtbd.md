# Simplify Agent Execution Model

## Problem

The codebase uses `agent.stream()` for all agent execution — planning, building, and discovery. This requires a `drainStream()` helper in `loop-runner.ts` to fully consume a `ReadableStream<string>` before proceeding, and a monkey-patched `getFullOutput()` in `SessionRunner` to capture message history as a side-effect of stream completion. Every caller must iterate through chunks it doesn't need, then await finalization separately. For the batch phases (planning and building), streaming adds complexity with no benefit — there is no interactive user watching tokens appear in real time.

## Job to Be Done

Batch agent execution (planning and building) uses Mastra's `agent.generate()`, returning the complete result when ready. The streaming code path remains only for the interactive discovery REPL where real-time output matters.

## Acceptance Criteria

- [x] `SessionRunner` calls `agent.generate()` instead of `agent.stream()` and returns the complete output directly
- [x] The `getFullOutput()` monkey-patch in `SessionRunner` is removed — message history is captured from the generate result
- [x] `drainStream()` is deleted from `loop-runner.ts`
- [x] `runFixedCount()` and `runUntilDone()` receive the agent's response without dealing with streaming primitives
- [x] The `onOutput` streaming callback is removed from `FixedCountConfig` and `UntilDoneConfig`
- [x] The interactive discovery REPL (`runConversation` in `cli.ts`) retains streaming for real-time terminal output
- [x] All existing tests pass — 141 pass, 2 skip, 0 fail

## Out of Scope

- Changing agent prompt content or agent definitions
- Modifying loop runner iteration logic (fixed-count, until-done semantics)
- Modifying hook execution or retry semantics
- CLI argument parsing changes

## SLC Scope

Change `SessionRunner.sendMessage()` to call `agent.generate()` and return the full result. Remove `drainStream()` and the `onOutput` callback from both loop runner configs. The discovery REPL already calls `agent.stream()` directly in `runConversation()` — it can keep its own streaming path unchanged since it doesn't go through `SessionRunner` for streaming purposes.

## Related JTBDs

- `.sauna/jobs/cli-and-cycle-orchestration/` — shared activity — the CLI subcommands consume the simplified SessionRunner
- `.sauna/jobs/planning-and-building-agents/` — refines — simplifies the execution model established there
