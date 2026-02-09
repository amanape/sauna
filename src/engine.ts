// Conversation Engine — core orchestrator
// Traces to: specs/conversation-engine.md

// Inline types — src/types.ts removed during SDK migration

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface ParameterDef {
  type: string;
  description: string;
  required?: boolean;
}

interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ParameterDef>;
  execute(args: Record<string, unknown>): Promise<string>;
}

interface LLMResponse {
  text?: string;
  tool_calls?: ToolCall[];
}

interface LLMProvider {
  complete(messages: Message[], tools?: Tool[]): Promise<LLMResponse>;
}

interface EngineOutput {
  text: string;
  files_written?: string[];
  done: boolean;
}

const MAX_LOOP_ITERATIONS = 50;

export class ConversationEngine {
  private messages: Message[] = [];
  private toolMap: Map<string, Tool>;

  constructor(
    private provider: LLMProvider,
    private tools: Tool[],
    private systemPrompt: string,
    private codebasePath: string,
  ) {
    this.toolMap = new Map(tools.map((t) => [t.name, t]));
  }

  async start(userMessage: string): Promise<EngineOutput> {
    this.messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'user', content: userMessage },
    ];
    return this.runLoop();
  }

  async respond(userMessage: string): Promise<EngineOutput> {
    this.messages.push({ role: 'user', content: userMessage });
    return this.runLoop();
  }

  private async runLoop(): Promise<EngineOutput> {
    const filesWritten: string[] = [];
    let done = false;

    for (let i = 0; i < MAX_LOOP_ITERATIONS; i++) {
      const response = await this.provider.complete(
        [...this.messages],
        this.tools,
      );

      if (response.tool_calls && response.tool_calls.length > 0) {
        // Append assistant message with tool calls
        this.messages.push({
          role: 'assistant',
          content: response.text || '',
          tool_calls: response.tool_calls,
        });

        // Execute each tool call
        for (const toolCall of response.tool_calls) {
          const result = await this.executeTool(toolCall);

          this.messages.push({
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          });

          if (toolCall.name === 'session_complete') {
            done = true;
          }

          if (result.startsWith('Wrote ')) {
            filesWritten.push(result.slice(6));
          }
        }
      } else {
        // Text-only response — return to adapter
        const text = response.text || '';
        this.messages.push({ role: 'assistant', content: text });

        return {
          text,
          files_written: filesWritten.length > 0 ? filesWritten : undefined,
          done,
        };
      }
    }

    // Safety: exceeded max iterations
    return {
      text: 'Error: exceeded maximum tool exection iterations.',
      done: false,
    };
  }

  private async executeTool(toolCall: ToolCall): Promise<string> {
    const tool = this.toolMap.get(toolCall.name);
    if (!tool) {
      return `Error: tool '${toolCall.name}' not found`;
    }

    try {
      return await tool.execute(toolCall.args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return `Error: ${message}`;
    }
  }
}
