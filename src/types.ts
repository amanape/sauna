// Shared types for the Discovery Agent
// Traces to: all specs (llm-provider.md, tool-system.md, conversation-engine.md, output-writer.md)

// --- Message types ---

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface Message {
  role: MessageRole;
  content: string;
  /** Present on assistant messages that include tool invocations */
  tool_calls?: ToolCall[];
  /** Present on tool-result messages to correlate with the originating call */
  tool_call_id?: string;
}

// --- Tool call types ---

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

// --- Tool definition types (passed to LLM) ---

export interface ParameterDef {
  type: string;
  description: string;
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ParameterDef>;
}

// --- Tool interface (definition + execution) ---

export interface Tool extends ToolDefinition {
  execute(args: Record<string, unknown>): Promise<string>;
}

// --- LLM provider types ---

export interface LLMResponse {
  text?: string;
  tool_calls?: ToolCall[];
}

export interface LLMProvider {
  complete(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}

// --- Engine output ---

export interface EngineOutput {
  /** Message to display to the human */
  text: string;
  /** Files written during this turn (if any) */
  files_written?: string[];
  /** Whether the agent considers the session complete */
  done: boolean;
}
