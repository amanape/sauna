import type { Agent } from "@mastra/core/agent";
import { SessionRunner } from "./session-runner";

export interface FixedCountConfig {
  agent: Agent;
  iterations: number;
  message: string;
  onProgress?: (current: number, total: number) => void;
  onOutput?: (chunk: string) => void;
}

export async function runFixedCount(config: FixedCountConfig): Promise<void> {
  const { agent, iterations, message, onProgress, onOutput } = config;

  if (iterations < 1) {
    throw new Error("iterations must be at least 1");
  }

  for (let i = 1; i <= iterations; i++) {
    onProgress?.(i, iterations);

    const session = new SessionRunner({ agent });
    const result = await session.sendMessage(message);

    if (result) {
      for await (const chunk of result.textStream) {
        onOutput?.(chunk);
      }
      await result.getFullOutput();
    }
  }
}
