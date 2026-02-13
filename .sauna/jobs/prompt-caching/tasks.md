# Prompt Caching — Tasks

## Priority 1: Core Implementation

- [x] Convert `createResearchAgent` instructions from plain string to instruction object `{ role: "system", content, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }` (spec: agent-instructions-caching)
- [x] Convert `createDiscoveryAgent` instructions to instruction object; apply dynamic output-directory suffix to `content` before wrapping (spec: agent-instructions-caching)
- [x] Convert `createPlanningAgent` instructions to instruction object; apply `${JOB_ID}` substitution to `content` before wrapping (spec: agent-instructions-caching)
- [ ] Convert `createBuilderAgent` instructions to instruction object; apply `${JOB_ID}` substitution to `content` before wrapping (spec: agent-instructions-caching)
- [ ] Add `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }` to `agent.generate()` options in `SessionRunner.sendMessage()`, merged alongside existing `maxSteps`/`onStepFinish`/`onFinish` (spec: generate-call-caching)

## Priority 2: Test Updates

- [ ] Update `agent-definitions.test.ts` — `getInstructions()` now returns an instruction object; adapt `toContain` assertions to check the `content` field (spec: agent-instructions-caching) (note: planning agent tests already updated; builder agent tests remain)
- [x] Update `cli.test.ts` — discovery agent tests that call `getInstructions()` and assert plain strings must handle the instruction object shape (spec: agent-instructions-caching) (note: research agent tests already updated)
- [ ] Update `session-runner.test.ts` — mock expectations for `agent.generate()` options must accept the additional `providerOptions` field (spec: generate-call-caching)
- [ ] Run `bun test` and confirm all tests pass (spec: jtbd acceptance criteria)
