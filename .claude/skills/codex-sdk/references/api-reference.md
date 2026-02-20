# Codex SDK API Reference

Complete API documentation for the OpenAI Codex SDK.

## Codex Class

### Constructor

```typescript
new Codex(options?: CodexOptions)
```

#### CodexOptions

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `apiKey` | `string` | OpenAI API key | From env or auth.json |
| `baseUrl` | `string` | API base URL | `https://api.openai.com` |
| `timeout` | `number` | Request timeout (ms) | `120000` |
| `maxRetries` | `number` | Max retry attempts | `3` |
| `retryDelay` | `number` | Initial retry delay (ms) | `1000` |
| `debug` | `boolean` | Enable debug logging | `false` |
| `authStore` | `string` | Auth credential store | `file` |

### Methods

#### startThread()

```typescript
startThread(options?: ThreadOptions): Thread
```

Creates a new conversation thread.

**ThreadOptions:**

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `model` | `string` | Model to use | `gpt-5.3-codex` |
| `workingDirectory` | `string` | Working directory path | Current directory |
| `additionalDirectories` | `string[]` | Extra context directories | `[]` |
| `skipGitRepoCheck` | `boolean` | Skip Git validation | `false` |
| `systemPrompt` | `string` | Custom system prompt | Model default |
| `temperature` | `number` | Sampling temperature | `0.2` |
| `maxTokens` | `number` | Max response tokens | Model default |
| `reasoning_effort` | `string` | Reasoning level | `medium` |
| `networkAccessEnabled` | `boolean` | Allow web access | `true` |
| `webSearchMode` | `string` | Search mode | `cached` |
| `approvalPolicy` | `string` | Approval mode (`untrusted`, `on-request`, `never`) | `on-request` |
| `sandbox` | `string` | Filesystem access (`read-only`, `workspace-write`, `danger-full-access`) | `workspace-write` |

#### resumeThread()

```typescript
resumeThread(threadId: string, options?: ThreadOptions): Thread
```

Resumes a previously saved thread.

#### forkThread()

```typescript
forkThread(threadId: string, options?: ThreadOptions): Thread
```

Creates a new branch from an existing thread.

#### listThreads()

```typescript
listThreads(options?: ListOptions): Promise<ThreadInfo[]>
```

Lists saved threads.

**ListOptions:**

| Property | Type | Description |
|----------|------|-------------|
| `limit` | `number` | Max results |
| `offset` | `number` | Skip results |
| `orderBy` | `string` | Sort field |
| `order` | `string` | Sort direction |

## Thread Class

### Properties

| Property | Type | Description |
|----------|------|----------|
| `id` | `string` | Thread identifier |
| `messages` | `Message[]` | Conversation history |
| `options` | `ThreadOptions` | Thread configuration |
| `created` | `Date` | Creation timestamp |
| `updated` | `Date` | Last update timestamp |

### Methods

#### run()

```typescript
run(prompt: string, options?: RunOptions): Promise<any>
```

Executes a single conversation turn.

**RunOptions:**

| Property | Type | Description |
|----------|------|-------------|
| `outputSchema` | `object` | JSON Schema for structured output |
| `images` | `string[]` | Image file paths |
| `files` | `string[]` | Additional file paths |
| `temperature` | `number` | Override temperature |
| `maxTokens` | `number` | Override max tokens |
| `stopSequences` | `string[]` | Stop generation sequences |
| `toolsEnabled` | `string[]` | Allowed tools |
| `toolsDisabled` | `string[]` | Blocked tools |

#### runStreamed()

```typescript
runStreamed(prompt: string, options?: RunOptions): Promise<StreamResult>
```

Executes with streaming response.

**StreamResult:**

```typescript
interface StreamResult {
  events: AsyncIterable<StreamEvent>;
  result: Promise<any>;
}
```

#### addMessage()

```typescript
addMessage(role: "user" | "assistant", content: string): void
```

Manually adds a message to thread history.

#### clearMessages()

```typescript
clearMessages(): void
```

Clears conversation history.

#### save()

```typescript
save(): Promise<void>
```

Persists thread to disk.

#### delete()

```typescript
delete(): Promise<void>
```

Deletes saved thread.

## Event Types

### StreamEvent

Base interface for all stream events:

```typescript
interface StreamEvent {
  type: string;
  timestamp: Date;
}
```

### Specific Events

#### item.completed

```typescript
interface ItemCompletedEvent extends StreamEvent {
  type: "item.completed";
  item: any;
  index: number;
}
```

#### tool.call

```typescript
interface ToolCallEvent extends StreamEvent {
  type: "tool.call";
  toolName: string;
  arguments: any;
  toolCallId: string;
}
```

#### tool.result

```typescript
interface ToolResultEvent extends StreamEvent {
  type: "tool.result";
  toolName: string;
  result: any;
  toolCallId: string;
  duration: number;
}
```

#### turn.completed

```typescript
interface TurnCompletedEvent extends StreamEvent {
  type: "turn.completed";
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens?: number;
  };
  duration: number;
}
```

#### file.changed

```typescript
interface FileChangedEvent extends StreamEvent {
  type: "file.changed";
  operation: "create" | "update" | "delete";
  path: string;
  oldContent?: string;
  newContent?: string;
}
```

#### error

```typescript
interface ErrorEvent extends StreamEvent {
  type: "error";
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

## Tools

### Available Tools

Codex agents have access to these built-in tools:

| Tool | Purpose | Parameters |
|------|---------|------------|
| `Read` | Read file contents | `path: string` |
| `Write` | Write file | `path: string, content: string` |
| `ApplyPatch` | Apply unified diff | `path: string, patch: string` |
| `Search` | Search files | `query: string, path?: string` |
| `ListFiles` | List directory | `path: string` |
| `RunCommand` | Execute command | `command: string` |
| `WebSearch` | Search web | `query: string` |
| `WebFetch` | Fetch URL | `url: string` |

### Tool Control

Enable/disable specific tools:

```typescript
const result = await thread.run("Task", {
  toolsEnabled: ["Read", "Write", "Search"],
  toolsDisabled: ["RunCommand", "WebSearch"]
});
```

## Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `rate_limit_exceeded` | Too many requests | Retry with backoff |
| `context_window_exceeded` | Context too large | Summarize/split |
| `invalid_request` | Bad request format | Fix parameters |
| `authentication_failed` | Auth error | Check credentials |
| `model_not_found` | Invalid model | Use valid model |
| `timeout` | Request timeout | Retry request |
| `internal_error` | Server error | Retry later |

## Models

### Available Models

| Model | Description | Notes |
|-------|-------------|-------|
| `gpt-5.3-codex` | Most capable agentic coding model, best reasoning | Recommended default |
| `gpt-5.3-codex-spark` | Near-instant real-time coding iteration (text-only) | ChatGPT Pro only; no vision |
| `gpt-5.2-codex` | Advanced engineering model | Superseded by 5.3 |
| `gpt-5.1-codex-max` | Long-horizon agentic coding tasks | Extended task support |
| `gpt-5.1-codex` | Extended coding tasks | Superseded by 5.1-max |
| `gpt-5.1-codex-mini` | Cost-effective coding variant | Smaller/faster |
| `gpt-5-codex` | Long-running agentic coding | Replaced by 5.1-codex |
| `gpt-5-codex-mini` | Cost-effective smaller variant | Older generation |

### Model Capabilities

| Feature | gpt-5.3-codex | gpt-5.3-codex-spark | gpt-5.2-codex |
|---------|---------------|---------------------|---------------|
| Code generation | ✓ | ✓ | ✓ |
| Code analysis | ✓ | ✓ | ✓ |
| Vision (images) | ✓ | ✗ (text-only) | ✓ |
| Web access | ✓ | ✓ | ✓ |
| File operations | ✓ | ✓ | ✓ |
| Structured output | ✓ | ✓ | ✓ |
| Reasoning effort | ✓ | Limited | ✓ |

> **Note:** `gpt-5.3-codex-spark` is a research preview limited to ChatGPT Pro users. It is optimized for speed (1000+ tokens/s) but does not support image inputs.

## Configuration Files

### config.toml

Global configuration:

```toml
[general]
model = "gpt-5.3-codex"
temperature = 0.2
debug = false

[auth]
method = "api_key"  # or "chatgpt", "device_code"
store = "file"      # or "keychain", "environment"

[network]
timeout = 120000
max_retries = 3
retry_delay = 1000

[[models]]
name = "my-codex"
model_type = "codex"
base_url = "https://custom.api.com"
api_key = "${CUSTOM_API_KEY}"
```

### auth.json

Authentication storage:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 1234567890,
  "scope": "...",
  "token_type": "Bearer"
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Primary API key |
| `CODEX_API_KEY` | Alternative API key (takes precedence over `OPENAI_API_KEY`) |
| `CODEX_CONFIG` | Config file path |
| `CODEX_HOME` | Data directory |
| `CODEX_DEBUG` | Enable debug |
| `CODEX_MODEL` | Default model |
| `HTTPS_PROXY` | Proxy URL |
| `NO_PROXY` | Proxy bypass |

## Type Definitions

### Message

```typescript
interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
  files?: string[];
  timestamp: Date;
  tokens?: number;
}
```

### ThreadInfo

```typescript
interface ThreadInfo {
  id: string;
  created: Date;
  updated: Date;
  messageCount: number;
  model: string;
  title?: string;
  summary?: string;
}
```

### Usage

```typescript
interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  reasoning_tokens?: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
}
```

## JSON Schema Support

### Basic Schema

```typescript
const schema = {
  type: "object",
  properties: {
    name: { type: "string" },
    age: { type: "number", minimum: 0 },
    email: {
      type: "string",
      format: "email"
    }
  },
  required: ["name", "email"]
};
```

### Advanced Features

```typescript
const schema = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["active", "inactive", "pending"]
    },
    tags: {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      uniqueItems: true
    },
    metadata: {
      type: "object",
      additionalProperties: { type: "string" }
    },
    priority: {
      type: "integer",
      minimum: 1,
      maximum: 10
    }
  },
  allOf: [
    { required: ["status"] }
  ],
  anyOf: [
    { required: ["tags"] },
    { required: ["priority"] }
  ]
};
```

### Schema Validation

Codex validates outputs against schemas:

```typescript
try {
  const result = await thread.run(prompt, { outputSchema: schema });
  // Result guaranteed to match schema
} catch (error) {
  if (error.code === "schema_validation_failed") {
    console.error("Output didn't match schema:", error.details);
  }
}
```