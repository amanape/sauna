import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  LLMResponse,
  Message,
  ToolDefinition,
} from '../types.ts';

export interface AnthropicConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
}

/** Extract the system message content from the message array, if present. */
export function extractSystemMessage(messages: Message[]): string | undefined {
  return messages.find((m) => m.role === 'system')?.content;
}

/** Translate our generic Message[] to Anthropic's message format. */
export function translateMessages(
  messages: Message[],
): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'tool') {
      // Tool results are sent as user messages with tool_result content blocks
      result.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id!,
            content: msg.content,
          },
        ],
      });
    } else if (msg.role === 'assistant') {
      // Assistant messages always use content blocks so tool_use can coexist with text
      const content: Anthropic.ContentBlockParam[] = [];

      if (msg.content) {
        content.push({
          type: 'text',
          text: msg.content,
        } as Anthropic.ContentBlockParam);
      }

      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.args,
          } as Anthropic.ContentBlockParam);
        }
      }

      result.push({ role: 'assistant', content });
    } else {
      // User messages pass through as plain strings
      result.push({ role: 'user', content: msg.content });
    }
  }

  return result;
}

/** Translate our generic ToolDefinition[] to Anthropic's tool format. */
export function translateTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => {
    const properties: Record<string, { type: string; description: string }> =
      {};
    const required: string[] = [];

    for (const [name, def] of Object.entries(t.parameters)) {
      properties[name] = { type: def.type, description: def.description };
      if (def.required) {
        required.push(name);
      }
    }

    return {
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties,
        required,
      },
    };
  });
}

/** Map an Anthropic API response to our generic LLMResponse. */
export function mapResponse(
  response:
    | Anthropic.Message
    | {
        content: readonly {
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }[];
        stop_reason: string;
      },
): LLMResponse {
  let text: string | undefined;
  const toolCalls: LLMResponse['tool_calls'] = [];

  for (const block of response.content) {
    if (block.type === 'text') {
      text = block.text as string;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id as string,
        name: block.name as string,
        args: block.input as Record<string, unknown>,
      });
    }
    // Skip thinking blocks and other unknown types
  }

  return {
    text: text || undefined,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private temperature: number;

  constructor(config: AnthropicConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? 'claude-sonnet-4-5-20250929';
    this.temperature = config.temperature ?? 0.7;
  }

  async complete(
    messages: Message[],
    tools?: ToolDefinition[],
  ): Promise<LLMResponse> {
    const system = extractSystemMessage(messages);
    const anthropicMessages = translateMessages(messages);
    const anthropicTools = tools ? translateTools(tools) : undefined;

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 4096,
      temperature: this.temperature,
      messages: anthropicMessages,
    };

    if (system) {
      params.system = system;
    }

    if (anthropicTools && anthropicTools.length > 0) {
      params.tools = anthropicTools;
    }

    const response = await this.client.messages.create(params);
    return mapResponse(response);
  }
}
