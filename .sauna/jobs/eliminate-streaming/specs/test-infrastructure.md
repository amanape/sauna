# Test Infrastructure — Streaming Removal

## What This Component Does

`cli.test.ts` contains the `runConversation` test suite (10 tests) and shared test utilities at the top of the file. The streaming-specific types, helpers, and mock patterns must be replaced with generate-based equivalents that match the patterns already established in `session-runner.test.ts` and `loop-runner.test.ts`.

## Requirements

### Type and Helper Removal

- The `StreamOptions` type alias (derived from `Agent["stream"]`) must be removed
- The `MockStreamFn` type alias must be removed
- The `mockStreamResult` function must be removed entirely — it constructs `ReadableStream` objects and returns a stream-shaped mock
- No `ReadableStream` construction should remain in the test file

### Generate-Based Mock Pattern

- The `runConversation` tests must mock `agent.generate()` instead of `agent.stream()`
- The mock agent object must expose `generate` (not `stream`) matching the pattern in `session-runner.test.ts`
- Mock return values must use the generate shape: `{ text, messages }` — not the stream shape `{ textStream, getFullOutput }`
- The `GenerateOptions` type (derived from `Agent["generate"]`) must be used for typing mock call arguments, matching `session-runner.test.ts`

### makeDeps Refactoring

- The `makeDeps` helper must create a mock agent with `generate` instead of `stream`
- The `streamImpl` override must be renamed to reflect the generate pattern
- The `mockCallArgs` utility must use `GenerateOptions` instead of `StreamOptions`

### Test Coverage Preservation

- All existing behavioral tests must be adapted, not deleted
- Tests verifying `onStepFinish` callback invocation must work through `SessionRunner`'s callback passthrough
- Tests verifying `onFinish` callback passthrough must verify it reaches `agent.generate()` options
- Tests verifying message accumulation across turns must verify that `SessionRunner` is being called with accumulated history
- The "writes result.text to output" behavior replaces the "streams chunks to output" behavior

## Constraints

- Must not introduce any streaming references (`textStream`, `getFullOutput`, `ReadableStream`, `stream`)
- Must not delete tests without replacing them — every existing behavior must have a generate-based equivalent
- The `mockCallArgs` typed accessor pattern from `session-runner.test.ts` should be adopted rather than using `as any` casts
