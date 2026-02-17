# Notes

## Context

The CLI currently displays tool calls as `[ToolName]` in dim text without any context about what the tool is operating on. This makes it hard for users to understand what's happening when they glance at the output.

User feedback:
- `[Task]` is too vague - doesn't show what the subagent is doing
- Want to see file paths for Read/Write/Edit operations
- Want to see commands for Bash operations
- Want to keep output concise - no verbose progress updates
- Messages (agent/user) should remain unprefixed

## Key Decisions

### Format: `[ToolName] details` (space-separated)
- User preference for space separator over colon
- Example: `[Read] /some/file.ts` not `[Read: /some/file.ts]`

### No Progress Indicators
- SDK provides `tool_progress` messages with `elapsed_time_seconds`
- User explicitly rejected time-based updates ("too verbose and polluting")
- Keep it simple: display once when tool starts, then move on

### No Completion Indicators
- No checkmarks or status symbols
- Tool tag appears, work happens, output continues
- Completion is implied by subsequent output

### Message Prefixes
- Agent messages: No prefix (current behavior maintained)
- User messages: No prefix (current behavior maintained)
- Reason: Prefixes look awkward on multiline text, and context makes it clear who's speaking

## Implementation Strategy

### Extract Tool Details from SDK Events

The `content_block_start` event provides:
```typescript
event.content_block = {
  type: "tool_use",
  id: "toolu_...",
  name: "Read",  // Tool name
  input: {        // Tool parameters (varies by tool)
    file_path: "/path/to/file.ts",
    // ... other params
  }
}
```

### Tool Parameter Mapping

| Tool | Parameter to Display | Field Name |
|------|---------------------|------------|
| Read | File path | `input.file_path` |
| Write | File path | `input.file_path` |
| Edit | File path | `input.file_path` |
| Bash | Command | `input.command` |
| Task | Description | `input.description` |
| Glob | Pattern | `input.pattern` |
| Grep | Pattern | `input.pattern` |

### Fallback Behavior

If the expected parameter is missing or empty:
- Display just `[ToolName]` without details
- No error, no placeholder text

## Testing Approach

### Unit Tests (stream.test.ts)

Test `formatToolTag()` with various detail scenarios:
- With file path: `formatToolTag("Read", "/path/to/file.ts")` → `[2m[Read] /path/to/file.ts[22m`
- With command: `formatToolTag("Bash", "npm install")` → `[2m[Bash] npm install[22m`
- No details: `formatToolTag("Read")` → `[2m[Read][22m`
- Empty details: `formatToolTag("Read", "")` → `[2m[Read][22m`

Test `processMessage()` with `content_block_start` events containing tool inputs:
- Mock SDK message with `tool_use` content block including `input` object
- Verify formatted output includes details
- Verify output collection has expected format

### Integration Testing

Manual verification with real agent sessions:
- Run `bun index.ts "read a file and summarize it"`
- Verify `[Read] /path/to/file.ts` appears in output
- Run `bun index.ts "install dependencies"`
- Verify `[Bash] npm install` (or `bun install`) appears in output
- Run interactive mode and verify `>` prompt works (user reported it may not show)

## Related Files

- `/Users/stephanpsaras/Desktop/Projects/sauna-cli.SAU-62/src/stream.ts` - Main formatting logic
- `/Users/stephanpsaras/Desktop/Projects/sauna-cli.SAU-62/tests/stream.test.ts` - Test coverage
- `/Users/stephanpsaras/Desktop/Projects/sauna-cli.SAU-62/.sauna/jobs/001-sauna-cli/notes.md` - Original implementation notes, line 80-82 documents SDK event structure
