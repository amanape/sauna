# CLI Subcommand Interface — Tasks

## P0 — Core subcommand infrastructure

- [x] Replace `parseCliArgs()` with subcommand-aware parser that extracts subcommand from first positional arg and delegates flag parsing per subcommand — `parseArgs` from `node:util`, strict mode (spec: subcommand-interface.md § Dispatch, Shared Flags)
- [x] Add `--iterations <n>` flag accepted by `plan` and `run` subcommands, validated as positive integer; reject zero/negative (spec: jtbd.md § acceptance criteria, subcommand-interface.md § Shared Flags)
- [x] Extract shared setup (API key validation, MCP client, workspace, researcher agent) from `main()` into a reusable helper that all subcommand handlers call (spec: subcommand-interface.md § Shared Setup) — implemented as `initEnvironment()` in `src/init-environment.ts`; `main()` refactored to use it
- [x] Implement `discover` handler: accepts `--codebase`, `--output`, `--model`; creates discovery agent, calls `runConversation()` (spec: subcommand-interface.md § Subcommands, Dispatch) — implemented inline in `main()` switch case
- [x] Implement `plan` handler: accepts `--codebase`, `--job`, `--iterations`, `--model`; creates planner agent, calls `runFixedCount()` directly (spec: subcommand-interface.md § Subcommands, Dispatch) — extracted into `handlePlan()` in `src/handlers.ts`; `main()` dispatches to it; tested in `handlers.test.ts`
- [x] Implement `build` handler: accepts `--codebase`, `--job`, `--model`; creates builder agent, loads hooks, calls `runUntilDone()` directly (spec: subcommand-interface.md § Subcommands, Dispatch) — extracted into `handleBuild()` in `src/handlers.ts`; `main()` dispatches to it separately from `run`; tested in `handlers.test.ts` (8 tests)
- [x] Implement `run` handler: accepts `--codebase`, `--job`, `--iterations`, `--model`; calls plan then build sequentially via `runJobPipeline()` or both handlers (spec: subcommand-interface.md § Subcommands, Dispatch) — extracted into `handleRun()` in `src/handlers.ts`; `main()` dispatches to it; tested in `handlers.test.ts` (6 tests)
- [x] Update `main()` to parse subcommand from first positional arg and dispatch to the correct handler (spec: subcommand-interface.md § Dispatch)

## P1 — Help and error handling

- [x] Show usage listing all subcommands when invoked with no subcommand or `--help` (spec: subcommand-interface.md § Help and Errors) — `parseCliArgs` returns `HelpResult` with usage text; `main()` prints it and returns; 4 tests in `cli.test.ts`; `ParseResult` and `HelpResult` types exported
- [x] Show per-subcommand flag help when a subcommand is followed by `--help` (spec: subcommand-interface.md § Help and Errors) — `SUBCOMMAND_HELP` record in `cli.ts` holds per-subcommand usage text; `parseCliArgs` intercepts `--help` in flagArgs before dispatching to parsers; 7 tests in `cli.test.ts`
- [ ] Produce clear error message naming the missing flag when required flags are absent — cover `--codebase` for all, `--job` for plan/build/run (spec: subcommand-interface.md § Help and Errors)

## P2 — Tests

- [x] Rewrite `parseCliArgs` tests for subcommand-aware parsing: each subcommand's required/optional flags, unknown flag rejection, `--iterations` validation (spec: subcommand-interface.md § Shared Flags)
- [x] Add tests for `--help` output at root level and per-subcommand (spec: subcommand-interface.md § Help and Errors) — root-level tests (4) and per-subcommand tests (7) in `cli.test.ts`
- [ ] Add tests for each subcommand handler dispatching to the correct agent and loop runner (spec: subcommand-interface.md § Dispatch)
- [x] Update `main()` startup validation tests to work with new subcommand interface — currently tests in `cli.test.ts` invoke `index.ts` with flat flags (spec: subcommand-interface.md § Dispatch)

## P3 — Type and export updates

- [x] Update `CliArgs` type to a discriminated union with subcommand discriminant and per-subcommand flag sets (spec: subcommand-interface.md § Subcommands)
- [x] Update barrel exports in `src/index.ts` for any new public types or functions added (spec: constraints)
