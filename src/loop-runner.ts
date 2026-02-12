import type { Agent } from "@mastra/core/agent";
import type { HookResult } from "./hook-executor";
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

const DEFAULT_MAX_HOOK_RETRIES = 3;

export interface UntilDoneConfig {
  agent: Agent;
  message: string;
  readTasksFile: () => Promise<string>;
  safetyLimit?: number;
  hooks?: string[];
  runHooks?: (hooks: string[], cwd: string) => Promise<HookResult>;
  hookCwd?: string;
  maxHookRetries?: number;
  onProgress?: (iteration: number, remaining: number) => void;
  onOutput?: (chunk: string) => void;
  onHookFailure?: (failedCommand: string, attempt: number, maxRetries: number) => void;
}

function countPendingTasks(content: string): number {
  return content.split("\n").filter((line) => /^- \[ \]/.test(line)).length;
}

async function drainStream(
  result: { textStream: ReadableStream<string>; getFullOutput: () => Promise<any> },
  onOutput?: (chunk: string) => void,
): Promise<void> {
  for await (const chunk of result.textStream) {
    onOutput?.(chunk);
  }
  await result.getFullOutput();
}

export async function runUntilDone(config: UntilDoneConfig): Promise<void> {
  const {
    agent,
    message,
    readTasksFile,
    onProgress,
    onOutput,
    hooks,
    runHooks: hookRunner,
    hookCwd,
    onHookFailure,
  } = config;

  const maxHookRetries = config.maxHookRetries ?? DEFAULT_MAX_HOOK_RETRIES;
  const hasHooks = hooks && hooks.length > 0 && hookRunner && hookCwd;

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
      await drainStream(result, onOutput);
    }

    // Run hooks after builder iteration completes
    if (hasHooks) {
      let retries = 0;

      while (retries < maxHookRetries) {
        const hookResult = await hookRunner(hooks, hookCwd);

        if (hookResult.ok) break;

        retries++;
        onHookFailure?.(hookResult.failedCommand, retries, maxHookRetries);

        if (retries >= maxHookRetries) {
          throw new Error(
            `Hook "${hookResult.failedCommand}" failed after ${maxHookRetries} retries (exit code ${hookResult.exitCode})`,
          );
        }

        // Send hook failure output back to the SAME session for the builder to fix
        const feedbackMessage =
          `Hook failed: \`${hookResult.failedCommand}\` (exit code ${hookResult.exitCode})\n\nOutput:\n${hookResult.output}\n\nPlease fix the issue and try again.`;
        const retryResult = await session.sendMessage(feedbackMessage);

        if (retryResult) {
          await drainStream(retryResult, onOutput);
        }
      }
    }

    content = await readTasksFile();
    remaining = countPendingTasks(content);
  }

  throw new Error(`Safety limit reached (${safetyLimit} iterations)`);
}
