# Enhanced Tool Display -- Implementation Tasks

## Priority-Ordered Implementation Tasks

- [ ] Create a `getToolDetails(name, input)` helper function in `src/stream.ts` that maps tool names to relevant parameters (file_path for Read/Write/Edit, command for Bash, description for Task, pattern for Glob/Grep)
- [ ] Update `formatToolTag(name, details?)` signature to accept optional details string and produce `[ToolName] details` format (space-separated)
- [ ] Ensure dim ANSI formatting wraps the entire line including details (extend DIM_OFF to come after details string)
- [ ] Handle edge case: empty string details -- treat empty string same as undefined (no trailing space after `[ToolName]`)
- [ ] Handle edge case: multiline tool arguments -- extract only first line of multi-line values before passing to `formatToolTag`
- [ ] Update the `content_block_start` branch in `processMessage()` to extract `event.content_block.input`, call `getToolDetails()`, and pass result to `formatToolTag()`
- [ ] Update existing `formatToolTag` unit tests in `tests/stream.test.ts` to cover new details parameter (with details, without details, empty string)
- [ ] Add unit tests for `getToolDetails()` covering each tool mapping (Read, Write, Edit, Bash, Task, Glob, Grep) plus unknown tool names
- [ ] Update `processMessage` stateful tests that assert exact output strings to account for new format when input contains relevant parameters
- [ ] Verify no signature changes to `processMessage()` -- confirm `content_block.input` is already present in event payload
- [ ] Run `bun test` and confirm all tests pass after implementation

## Implementation Notes

### Scope
- Changes confined to `src/stream.ts` and `tests/stream.test.ts`
- No changes needed in `src/loop.ts`, `src/interactive.ts`, or other files
- `processMessage()` signature remains unchanged (per spec constraint)

### Key Technical Details
- `event.content_block.input` object is already available in SDK event payload
- Current format: `[ToolName]` with dim formatting
- Target format: `[ToolName] details` with dim formatting for entire line
- Tools without meaningful details display just `[ToolName]`

### Tool-to-Parameter Mapping
- Read, Write, Edit → `file_path`
- Bash → `command` (full command, no truncation)
- Task → `description`
- Glob, Grep → `pattern`
- Other tools → no details (undefined)
