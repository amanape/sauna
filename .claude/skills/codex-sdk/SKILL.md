---
name: codex-sdk
description: This skill should be used when the user asks to "use Codex SDK", "integrate OpenAI Codex", "build with Codex", "create a code review with Codex", "use GPT-5.3-Codex", "stream Codex responses", "structured output with Codex", "thread management with Codex", "automate coding with Codex", or mentions "@openai/codex-sdk", "Codex CLI", "agentic coding", "runStreamed", or "thread persistence". Provides comprehensive guidance for OpenAI's agentic coding assistant SDK.
---

# OpenAI Codex SDK

OpenAI Codex is a locally-run agentic coding assistant that enables building, fixing, and understanding code through AI assistance. The TypeScript SDK provides programmatic access to Codex's capabilities through a thread-based conversation model.

## Quick Start

Install the SDK:

```bash
bun add @openai/codex-sdk
```

Basic usage:

```typescript
import { Codex } from '@openai/codex-sdk';

const codex = new Codex();
const thread = codex.startThread();

// Execute single turn
const result = await thread.run('Diagnose and fix the CI failures');
console.log(result);

// Continue conversation
const nextTurn = await thread.run('Implement the fix');
```

## Core Concepts

### Thread-Based Architecture

Codex uses threads to manage conversations with the agent:

- **startThread()** - Begin new conversation
- **run()** - Execute single turn, get complete response
- **runStreamed()** - Stream responses with intermediate events
- **resumeThread()** - Resume saved conversation
- **forkThread()** - Branch conversation

### Thread Persistence

Threads persist to `~/.codex/sessions` for recovery:

```typescript
// Save thread ID
const threadId = thread.id;

// Later, resume conversation
const resumedThread = codex.resumeThread(threadId);
const result = await resumedThread.run('Continue the task');
```

### Model Selection

Configure model in thread options:

```typescript
const thread = codex.startThread({
  model: 'gpt-5.3-codex', // Latest, most capable — recommended default
  // Or: "gpt-5.3-codex-spark" — text-only, 1000+ tokens/s (ChatGPT Pro only, no vision)
  // Or: "gpt-5.1-codex-max" — long-horizon agentic tasks
  // Or: "gpt-5.2-codex" — previous generation
});
```

## Key Features

### Structured Output

Use JSON Schema for reliable structured responses:

```typescript
const schema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { enum: ['error', 'warning', 'info'] },
          message: { type: 'string' },
        },
      },
    },
    verdict: { enum: ['pass', 'needs_changes'] },
  },
};

const result = await thread.run('Review this code', {
  outputSchema: schema,
});
```

### Streaming Responses

Get real-time feedback with `runStreamed()`:

```typescript
const { events } = await thread.runStreamed('Analyze repository status', {
  outputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      status: { enum: ['ok', 'action_required'] },
    },
  },
});

for await (const event of events) {
  switch (event.type) {
    case 'item.completed':
      console.log('Item:', event.item);
      break;
    case 'tool.call':
      console.log('Tool called:', event.toolName);
      break;
    case 'turn.completed':
      console.log('Usage stats:', event.usage);
      break;
  }
}
```

### Image and File Support

Attach images for visual analysis:

```typescript
const result = await thread.run('Analyze this UI screenshot', {
  images: ['/path/to/screenshot.png'],
});
```

Configure working directory and additional context:

```typescript
const thread = codex.startThread({
  workingDirectory: '/path/to/project',
  additionalDirectories: ['/path/to/tests', '/path/to/config'],
});
```

## Configuration Options

### Thread Options

| Option                 | Purpose                | Values                                                  |
| ---------------------- | ---------------------- | ------------------------------------------------------- |
| `model`                | Model selection        | `gpt-5.3-codex` (default), `gpt-5.3-codex-spark`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, etc. |
| `workingDirectory`     | Working directory      | Path string                                             |
| `skipGitRepoCheck`     | Disable Git validation | Boolean                                                 |
| `outputSchema`         | Structured output      | JSON Schema object                                      |
| `reasoning_effort`     | Reasoning intensity    | `low`, `medium`, `high`                                 |
| `networkAccessEnabled` | Enable web access      | Boolean                                                 |
| `webSearchMode`        | Search mode            | `cached`, `live`                                        |
| `approvalPolicy`       | Approval requirements  | `untrusted`, `on-request`, `never`                      |
| `sandbox`              | Filesystem access mode | `read-only`, `workspace-write`, `danger-full-access`    |

### Authentication

Codex supports multiple authentication methods:

1. **ChatGPT Login** - Browser OAuth flow
2. **API Key** - Set `OPENAI_API_KEY` or `CODEX_API_KEY` environment variable, or pass `apiKey` to the constructor
3. **Device Code** - Headless environments (beta)

Credentials cache in `~/.codex/auth.json` or OS credential store.

## Common Use Cases

### Code Review Automation

```typescript
const review = await thread.run(
  'Review for correctness, performance, security, and maintainability',
  {
    outputSchema: {
      properties: {
        findings: { type: 'array' },
        verdict: { enum: ['pass', 'needs_changes'] },
      },
    },
  },
);
```

### CI/CD Integration

Use headless mode with structured output:

```typescript
const result = await thread.run('Fix failing tests', {
  outputSchema: {
    properties: {
      fixed: { type: 'boolean' },
      changes: { type: 'array' },
    },
  },
});

if (result.fixed) {
  // Proceed with deployment
}
```

### Multi-Agent Workflows

Run Codex as MCP server:

```bash
codex mcp-server
```

Then use `codex()` and `codex-reply()` tools in Agents SDK.

## Error Handling

Handle common error scenarios:

```typescript
try {
  const result = await thread.run(prompt);
} catch (error) {
  if (error.code === 'rate_limit_exceeded') {
    // Implement exponential backoff
  }
  if (error.code === 'context_window_exceeded') {
    // Handle context overflow
  }
}
```

Built-in retry logic handles transient errors automatically.

## Best Practices

1. **Thread Reuse** - Call `run()` repeatedly on same thread for context
2. **Structured Output** - Use schemas for reliable JSON parsing
3. **Error Recovery** - Implement retries with exponential backoff
4. **Security** - Store API keys securely, enable MFA
5. **Model Selection** - Use GPT-5.3-Codex for most tasks
6. **Context Management** - Specify relevant directories
7. **Streaming** - Use `runStreamed()` for long operations

## Additional Resources

### Reference Files

For detailed patterns and advanced usage:

- **`references/advanced-patterns.md`** - Advanced Codex patterns and techniques
- **`references/api-reference.md`** - Complete API documentation
- **`references/migration-guide.md`** - Migrating from other tools to Codex

### Example Files

Working examples in `examples/`:

- **`examples/code-review.ts`** - Automated code review implementation
- **`examples/streaming-output.ts`** - Real-time streaming example
- **`examples/multi-agent.ts`** - Multi-agent workflow with Agents SDK

### Scripts

Utility scripts in `scripts/`:

- **`scripts/validate-schema.ts`** - Validate JSON Schema definitions
- **`scripts/test-auth.ts`** - Test authentication setup
