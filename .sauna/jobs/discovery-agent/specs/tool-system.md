# Tool System

## Overview

The discovery agent needs to take actions beyond conversation — reading files, searching code, searching the web. Tools are functions the LLM can call during the conversation loop. The system should be simple to extend with new tools later (MCPs, plugins).

## Requirements

- Define a `Tool` interface: name, description, parameter schema, and an `execute()` function
- Tools are registered with the engine at startup — the engine passes their definitions to the LLM and executes them when called
- SLC tools to implement:
  - **file_read**: Read a file at a given path, return its contents
  - **file_search**: Search/grep across the codebase for a pattern, return matching file paths and lines
  - **web_search**: Search the web for a query, return results (title, snippet, URL)
- Tool execution is synchronous from the engine's perspective (async under the hood is fine, but the loop awaits the result before continuing)

## Interface Shape

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ParameterDef>;
  execute(args: Record<string, unknown>): Promise<string>;
}
```

## Notes

- `execute()` returns a string — the LLM consumes text. No need for structured return types yet.
- Tools should be scoped to a base directory (the `--codebase` path) to prevent reading arbitrary files
- Web search implementation can wrap a search API or start as a simple fetch + scrape — whatever gets you testing fastest
- The tool registry is just an array. No plugin loader, no dynamic discovery. Add tools by pushing to the array at startup.
