import type { Agent, LLMStepResult } from "@mastra/core/agent";
import type { MessageInput } from "@mastra/core/agent/message-list";

// Derive the onFinish callback type from Agent.generate()'s options parameter.
type GenerateOptions = NonNullable<Parameters<Agent["generate"]>[1]>;
export type OnFinishCallback = GenerateOptions["onFinish"];

export interface SessionRunnerConfig {
  agent: Agent;
  maxSteps?: number;
  onStepFinish?: (step: LLMStepResult) => void;
  onFinish?: OnFinishCallback;
}

export class SessionRunner {
  private agent: Agent;
  private messages: MessageInput[] = [];
  private maxSteps: number;
  private onStepFinish?: (step: LLMStepResult) => void;
  private onFinish?: OnFinishCallback;

  constructor(config: SessionRunnerConfig) {
    this.agent = config.agent;
    this.maxSteps = config.maxSteps ?? 50;
    this.onStepFinish = config.onStepFinish;
    this.onFinish = config.onFinish;
  }

  async sendMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed) return null;

    this.messages.push({ role: "user", content: trimmed });

    const result = await this.agent.generate(this.messages, {
      maxSteps: this.maxSteps,
      providerOptions: {
        anthropic: {
          cacheControl: { type: "ephemeral" },
        },
      },
      ...(this.onStepFinish ? { onStepFinish: this.onStepFinish } : {}),
      ...(this.onFinish ? { onFinish: this.onFinish } : {}),
    });

    this.messages = [...result.messages];

    return result;
  }
}
