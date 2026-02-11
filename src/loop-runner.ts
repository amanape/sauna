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

const DEFAULT_SAFETY_BUFFER = 5;

export interface UntilDoneConfig {
  agent: Agent;
  message: string;
  readTasksFile: () => Promise<string>;
  safetyLimit?: number;
  onProgress?: (iteration: number, remaining: number) => void;
  onOutput?: (chunk: string) => void;
}

function countPendingTasks(content: string): number {
  return content.split("\n").filter((line) => /^- \[ \]/.test(line)).length;
}

export async function runUntilDone(config: UntilDoneConfig): Promise<void> {
  const { agent, message, readTasksFile, onProgress, onOutput } = config;

  let content = await readTasksFile();
  let remaining = countPendingTasks(content);

  if (remaining === 0) return;

  const safetyLimit =
    config.safetyLimit ?? remaining + DEFAULT_SAFETY_BUFFER;

  for (let i = 1; i <= safetyLimit; i++) {
    if (remaining === 0) return;

    onProgress?.(i, remaining);

    const session = new SessionRunner({ agent });
    const result = await session.sendMessage(message);

    if (result) {
      for await (const chunk of result.textStream) {
        onOutput?.(chunk);
      }
      await result.getFullOutput();
    }

    content = await readTasksFile();
    remaining = countPendingTasks(content);
  }

  throw new Error(`Safety limit reached (${safetyLimit} iterations)`);
}
