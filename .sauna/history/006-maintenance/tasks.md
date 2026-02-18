# 006-maintenance tasks

## P0 — Outdated model aliases need updating

- [ ] Verify current Claude model IDs with Anthropic's latest releases (src/cli.ts)
- [ ] Update model aliases in src/cli.ts (currently using Feb 2025 versions)
- [ ] Update test expectations in tests/cli.test.ts, tests/interactive.test.ts, tests/session.test.ts

## P1 — Documentation missing critical usage information

- [ ] Add usage examples to README.md with all CLI flags
- [ ] Document available model aliases and how to use them
- [ ] Document the three modes: single-run, loop (--count/--forever), and interactive REPL
- [ ] Document exit codes (0 for success, 1 for errors)
- [ ] Document permission bypass behavior (always runs with bypassPermissions)
- [ ] Add example prompts showing common use cases

## P2 — Permission control not configurable

- [ ] Consider adding --strict-permissions flag to allow permission prompts (currently hardcoded bypass)
- [ ] Update documentation to explain permission behavior
- [ ] Add tests for permission flag if implemented

## P3 — SDK message types lack type safety

- [ ] Define proper TypeScript types for SDK message shapes instead of using `any`
- [ ] Update processMessage() in stream.ts to use typed messages
- [ ] Ensure compatibility with Claude Agent SDK wire format

## P4 — Test infrastructure cleanup

- [ ] Consider refactoring signal handler testing to use subprocess isolation
- [ ] Remove addSignalHandler/removeSignalHandler injection points from InteractiveOverrides
- [ ] Update tests to use cleaner patterns without production code pollution

## P5 — Model alias maintenance strategy

- [ ] Design a mechanism to keep model aliases in sync with upstream releases
- [ ] Consider environment variable overrides for model aliases
- [ ] Add documentation for updating model aliases

## P6 — Integration test coverage

- [ ] Add integration tests with real Claude Agent SDK (currently all mocked)
- [ ] Add stress tests for rapid SIGINT handling
- [ ] Add tests for very large --count values
- [ ] Test actual binary behavior beyond unit tests