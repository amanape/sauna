# Migration Guide: Moving to Codex SDK

This guide helps migrate from other tools to the OpenAI Codex SDK.

## From OpenAI Chat Completions API

### Key Differences

| Feature | Chat Completions | Codex SDK |
|---------|------------------|-----------|
| Purpose | General chat | Agentic coding |
| Tools | Manual function calling | Built-in file/web tools |
| State | Stateless | Thread persistence |
| Context | Manual management | Automatic with directories |
| Output | Text/JSON | Structured + file operations |

### Migration Example

**Before (Chat Completions):**

```typescript
import OpenAI from "openai";

const openai = new OpenAI();

async function reviewCode(code: string) {
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content: "You are a code reviewer."
      },
      {
        role: "user",
        content: `Review this code:\n\n${code}`
      }
    ],
    functions: [
      {
        name: "submit_review",
        description: "Submit code review",
        parameters: {
          type: "object",
          properties: {
            verdict: {
              type: "string",
              enum: ["approve", "request_changes"]
            },
            comments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  line: { type: "number" },
                  message: { type: "string" }
                }
              }
            }
          }
        }
      }
    ],
    function_call: { name: "submit_review" }
  });

  return JSON.parse(
    response.choices[0].message.function_call.arguments
  );
}
```

**After (Codex SDK):**

```typescript
import { Codex } from "@openai/codex-sdk";

const codex = new Codex();

async function reviewCode(code: string) {
  const thread = codex.startThread();

  return await thread.run(
    `Review this code:\n\n${code}`,
    {
      outputSchema: {
        type: "object",
        properties: {
          verdict: {
            type: "string",
            enum: ["approve", "request_changes"]
          },
          comments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                line: { type: "number" },
                message: { type: "string" }
              }
            }
          }
        }
      }
    }
  );
}
```

### Benefits of Migration

1. **Simpler API** - No manual function calling setup
2. **Thread persistence** - Conversation history maintained
3. **Built-in tools** - File operations, web access included
4. **Better typing** - Structured output with schemas
5. **Streaming support** - Real-time progress updates

## From Claude Agent SDK

### Key Differences

| Aspect | Claude Agent SDK | Codex SDK |
|--------|------------------|-----------|
| Focus | System operations | Code generation/analysis |
| Tools | Bash, file ops | ApplyPatch, code-specific |
| Models | Claude models | GPT-5.x-Codex models |
| Deployment | Terminal/IDE | Terminal/IDE/Cloud |

### Use Cases Comparison

**Use Claude Agent SDK when:**
- Building system automation
- Terminal operations
- General file management
- Infrastructure tasks

**Use Codex SDK when:**
- Code generation/modification
- Code review automation
- Debugging assistance
- Refactoring tasks

### Parallel Usage Pattern

Many projects benefit from using both:

```typescript
import { Codex } from "@openai/codex-sdk";
import { ClaudeAgent } from "@anthropic/agent-sdk";

// Use Codex for code generation
async function generateCode(spec: string) {
  const codex = new Codex();
  const thread = codex.startThread();

  return await thread.run(
    `Generate TypeScript code based on: ${spec}`
  );
}

// Use Claude for system setup
async function setupEnvironment() {
  const claude = new ClaudeAgent();

  await claude.run("Install dependencies and configure build");
}
```

## From GitHub Copilot

### Key Differences

| Feature | GitHub Copilot | Codex SDK |
|---------|----------------|-----------|
| Integration | IDE only | Programmatic API |
| Suggestions | Inline autocomplete | Full implementations |
| Context | Current file | Entire project |
| Automation | Interactive only | Fully automatable |

### Building Copilot-like Features

Create custom IDE integration:

```typescript
// VS Code extension example
import * as vscode from 'vscode';
import { Codex } from "@openai/codex-sdk";

class CodexCompletionProvider {
  private codex = new Codex();
  private thread = this.codex.startThread();

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position
  ) {
    const linePrefix = document
      .lineAt(position)
      .text.substr(0, position.character);

    const completion = await this.thread.run(
      `Complete this code: ${linePrefix}`,
      {
        outputSchema: { type: "string" },
        maxTokens: 150
      }
    );

    return [{
      insertText: completion,
      range: new vscode.Range(position, position)
    }];
  }
}
```

## From Cursor/Windsurf AI

### Enhanced Automation

While Cursor/Windsurf provide IDE AI features, Codex SDK enables automation:

```typescript
// Automated refactoring pipeline
async function refactorCodebase() {
  const codex = new Codex();
  const thread = codex.startThread({
    workingDirectory: process.cwd()
  });

  // Analyze codebase
  const analysis = await thread.run(
    "Analyze codebase for refactoring opportunities",
    {
      outputSchema: {
        type: "object",
        properties: {
          opportunities: {
            type: "array",
            items: {
              type: "object",
              properties: {
                file: { type: "string" },
                type: { type: "string" },
                description: { type: "string" },
                priority: { type: "number" }
              }
            }
          }
        }
      }
    }
  );

  // Apply refactorings
  for (const opp of analysis.opportunities) {
    if (opp.priority > 7) {
      await thread.run(
        `Apply ${opp.type} refactoring to ${opp.file}`
      );
    }
  }
}
```

## From Custom LLM Integrations

### Before: Manual Tool Implementation

```typescript
// Complex manual setup
class CodeReviewer {
  private llm: CustomLLM;

  async review(filePath: string) {
    // Manual file reading
    const content = fs.readFileSync(filePath, 'utf8');

    // Manual prompt construction
    const prompt = this.buildPrompt(content);

    // Manual LLM call
    const response = await this.llm.complete(prompt);

    // Manual parsing
    return this.parseResponse(response);
  }

  private buildPrompt(code: string): string {
    // Complex prompt engineering
  }

  private parseResponse(response: string): any {
    // Error-prone parsing
  }
}
```

### After: Codex SDK

```typescript
// Simple and robust
const codex = new Codex();
const thread = codex.startThread();

async function review(filePath: string) {
  return await thread.run(
    `Review the code in ${filePath}`,
    {
      outputSchema: {
        type: "object",
        properties: {
          issues: { type: "array" },
          verdict: { type: "string" }
        }
      }
    }
  );
}
```

## Migration Checklist

### Phase 1: Setup

- [ ] Install Codex SDK: `npm install @openai/codex-sdk`
- [ ] Configure authentication (API key or ChatGPT login)
- [ ] Test basic functionality
- [ ] Familiarize with thread model

### Phase 2: Identify Use Cases

- [ ] List current AI/LLM integrations
- [ ] Identify code-specific tasks
- [ ] Map to Codex capabilities
- [ ] Plan migration priority

### Phase 3: Implement Core Features

- [ ] Replace code generation logic
- [ ] Migrate code analysis features
- [ ] Update review automation
- [ ] Add structured output schemas

### Phase 4: Enhance with Codex Features

- [ ] Add thread persistence
- [ ] Implement streaming for UX
- [ ] Use image analysis for screenshots
- [ ] Enable web search for docs

### Phase 5: Optimize

- [ ] Implement caching
- [ ] Add retry logic
- [ ] Monitor token usage
- [ ] Profile performance

## Common Pitfalls

### 1. Over-Engineering Prompts

❌ **Don't:**
```typescript
const complexPrompt = `
You are an expert code reviewer with 20 years experience...
[500 lines of instructions]
Please review this code...
`;
```

✅ **Do:**
```typescript
const result = await thread.run(
  "Review this code for bugs and security issues",
  { outputSchema: reviewSchema }
);
```

### 2. Ignoring Thread State

❌ **Don't:**
```typescript
// Creating new thread for each call
async function analyze() {
  const thread1 = codex.startThread();
  await thread1.run("Analyze file A");

  const thread2 = codex.startThread();
  await thread2.run("Now analyze file B"); // Lost context!
}
```

✅ **Do:**
```typescript
// Reuse thread for context
async function analyze() {
  const thread = codex.startThread();
  await thread.run("Analyze file A");
  await thread.run("Now analyze file B"); // Has context
}
```

### 3. Not Using Structured Output

❌ **Don't:**
```typescript
const result = await thread.run("Review code");
// Attempt to parse free-form text
const verdict = result.match(/verdict: (\w+)/)?.[1];
```

✅ **Do:**
```typescript
const result = await thread.run("Review code", {
  outputSchema: {
    properties: {
      verdict: { enum: ["pass", "fail"] }
    }
  }
});
// Guaranteed structure
console.log(result.verdict);
```

## Support Resources

- **Documentation**: https://developers.openai.com/codex/
- **Examples**: https://github.com/openai/codex-examples
- **Community**: https://community.openai.com/c/codex
- **Migration Help**: codex-migration@openai.com