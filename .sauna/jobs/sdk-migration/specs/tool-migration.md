# Tool Migration

## Overview

The current six tools are reduced to three. The remaining tools are redefined using the Vercel AI SDK's tool pattern with Zod parameter schemas. Tools that are no longer needed are removed entirely.

## Tool Inventory

| Current Tool | Disposition | Rationale |
|-------------|------------|-----------|
| `file_read` | **Keep, redefine** | Core capability — reading codebase files |
| `file_search` | **Remove** | Not required |
| `web_search` | **Keep, redefine** | Core capability — external context |
| `write_jtbd` | **Replace** | Consolidated into general-purpose file write |
| `write_spec` | **Replace** | Consolidated into general-purpose file write |
| `session_complete` | **Remove** | The SDK's agentic loop naturally ends when the model stops calling tools; no explicit signal needed |

## Tool Requirements

### file_read

- Accepts a file path relative to the codebase root and returns the file's text contents
- Must sandbox reads to the configured codebase directory — reject any path that resolves outside it
- Must return a clear error message if the path points to a directory, a nonexistent file, or an unreadable file
- Parameter schema uses Zod with a description on the path parameter

### file_write

- Replaces both `write_jtbd` and `write_spec` with a single general-purpose file writer
- Accepts a relative file path and string content
- Writes to the configured output directory, creating parent directories as needed
- Overwrites existing files (the agent may be asked to revise output)
- Must sandbox writes to the output directory — reject any path that resolves outside it
- Must return a confirmation string in the format `"Wrote <relative-path>"` so the CLI can detect and display file writes to the user
- Parameter schema uses Zod with descriptions on both the path and content parameters

### web_search

- Accepts a search query string and returns formatted results (title, snippet, URL)
- The actual search backend is injected — the tool wraps a configurable search function, same pattern as today
- Must return a clear message when no results are found
- Must return a clear error message if the search function fails or the query is empty
- Parameter schema uses Zod with a description on the query parameter

## General Tool Requirements

- All tools are defined using the Vercel AI SDK tool pattern with Zod parameter schemas
- Each tool is a factory function that accepts runtime configuration (codebase path, output path, or search function) and returns a tool definition
- Every Zod parameter field has a `.describe()` call providing context for the model
- Each tool has tests covering: happy path, error/edge cases, and parameter validation
