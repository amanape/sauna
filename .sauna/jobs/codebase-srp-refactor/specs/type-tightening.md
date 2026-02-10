# Type Tightening — Replace `any` with Mastra-Exported Types

## What This Component Does

This spec covers the elimination of all lazy `any` types in application code, replacing them with the proper types exported by `@mastra/core`. This makes the codebase safer to extend — a downstream agent or developer gets compile-time feedback when they misuse the API, rather than discovering errors at runtime.

## Requirements

### Specific Replacements

- The message array used in conversation/session logic must be typed as `MastraDBMessage[]` (exported from `@mastra/core` via `FullOutput.messages` / `agent/message-list`), not `any[]`.
- The `onStepFinish` callback parameter must be typed as `LLMStepResult` (exported from `@mastra/core` stream types), not `any`. The step's `toolResults` property is an array of `ToolResultChunk` objects, each with a `payload` containing `toolName` and `result`.
- The `onFinish` callback must be typed as `MastraOnFinishCallback` (exported from `@mastra/core` stream types), not `(event: any) => ...`.
- The `catch` clause variable (`e: any` in `main()`) should use `unknown` with a type guard or type assertion, following TypeScript strict-mode best practices.

### Verification

- `bunx tsc --noEmit` must pass with zero errors after all type replacements.
- No `any` type annotations must remain in application source files under `src/`. (Type assertions like `as any` for test mocks in test files are acceptable where Mastra's types make mocking difficult, but application code must be `any`-free.)

## Constraints

- Types must be imported from `@mastra/core`'s public exports, not from deep internal paths that may change between versions.
- If a Mastra type is not publicly exported and `any` is the only option, document it with a `// TODO:` comment explaining which type is needed and why it's not available. Do not silently leave `any` without explanation.
- Do not create local type aliases that duplicate Mastra types. Import and use the originals.
