# Enhanced Tool Tags

## Overview

Tool tags display contextual information (file paths, commands, descriptions) to help users understand agent activity at a glance without verbose output.

## Acceptance Criteria

### Format Pattern
- Tool tags use format: `[ToolName] details` (space-separated, not colon)
- Details are shown on the same line as the tool tag
- Dim ANSI formatting applies to the entire line (both `[ToolName]` and details)

### Tool-Specific Details

**File operations:**
- `[Read] /path/to/file.ts` - Shows the file_path parameter
- `[Write] /path/to/file.ts` - Shows the file_path parameter
- `[Edit] /path/to/file.ts` - Shows the file_path parameter

**Command execution:**
- `[Bash] npm install` - Shows the full command parameter (no truncation)
- `[Bash] find . -name "*.ts" -exec grep -l "function" {} \;` - Long commands shown in full

**Task delegation:**
- `[Task] Explore codebase` - Shows the description parameter
- `[Task] Find config files` - Shows the description parameter

**Other tools:**
- `[Glob] **/*.ts` - Shows the pattern parameter
- `[Grep] function` - Shows the pattern parameter
- Tools without meaningful details: just `[ToolName]`

### Message Display
- Agent messages: No prefix, displayed as-is (current behavior)
- User messages: No prefix, displayed as-is (current behavior)

### No Progress Indicators
- No time-based updates (e.g., "5s...", "10s...")
- No completion indicators (e.g., checkmarks)
- Tool tag displays once when tool starts, then moves on

## Edge Cases

- Tool with no details parameter: Display just `[ToolName]` without trailing space
- Tool with empty string details: Display just `[ToolName]`
- Very long commands: Display in full (no truncation or wrapping)
- Multiline tool arguments: Only show first line or simplified representation

## Constraints

- Maintain existing newline handling (tool tags always on their own line)
- Keep dim ANSI formatting for entire tool display
- No breaking changes to `processMessage()` function signature
