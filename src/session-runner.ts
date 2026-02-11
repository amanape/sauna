import type { Agent, LLMStepResult } from "@mastra/core/agent";
import type { MessageInput } from "@mastra/core/agent/message-list";

// Derive the onFinish callback type from Agent.stream()'s options parameter.
// MastraOnFinishCallback is not re-exported from @mastra/core's public API,
// but we can extract it from the Agent class's own method signature.
type StreamOptions = NonNullable<Parameters<Agent["stream"]>[1]>;
export type OnFinishCallback = StreamOptions["onFinish"];

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

    const streamResult = await this.agent.stream(this.messages, {
      maxSteps: this.maxSteps,
      ...(this.onStepFinish ? { onStepFinish: this.onStepFinish } : {}),
      ...(this.onFinish ? { onFinish: this.onFinish } : {}),
    });

    const originalGetFullOutput = streamResult.getFullOutput.bind(streamResult);
    const self = this;
    streamResult.getFullOutput = async function () {
      const output = await originalGetFullOutput();
      self.messages = [...output.messages];
      return output;
    };

    return streamResult;
  }
}
