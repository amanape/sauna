/**
 * Interactive multi-turn REPL for sauna CLI.
 *
 * Uses the SDK v2 session APIs to maintain conversation context across turns.
 * The readline prompt is written to stderr so it does not mix with agent output
 * on stdout.
 */
import {
  unstable_v2_createSession,
  type SDKSessionOptions,
} from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "node:readline";
import { processMessage, createStreamState } from "./stream";
import { buildPrompt } from "./session";
import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import type { Readable, Writable } from "node:stream";

function findClaude(): string {
  const which = execSync("which claude", { encoding: "utf-8" }).trim();
  return realpathSync(which);
}

export type InteractiveConfig = {
  prompt?: string;
  model?: string;
  context: string[];
};

/** Optional overrides for testing — inject custom streams or session factory. */
export type InteractiveOverrides = {
  input?: Readable;
  promptOutput?: Writable;
  createSession?: (options: SDKSessionOptions) => any;
};

/**
 * Reads a single line from the readline interface.
 * Returns null on EOF (Ctrl+D) or if the interface is closed.
 */
function readLine(rl: ReturnType<typeof createInterface>): Promise<string | null> {
  return new Promise((resolve) => {
    const onClose = () => resolve(null);
    rl.once("close", onClose);
    try {
      rl.question("", (answer) => {
        rl.removeListener("close", onClose);
        resolve(answer);
      });
    } catch {
      rl.removeListener("close", onClose);
      resolve(null);
    }
  });
}

/**
 * Runs the interactive REPL loop.
 *
 * - Creates a persistent session on the first turn
 * - Context paths are only included in the first prompt
 * - Empty input or Ctrl+D exits cleanly (exit code 0)
 * - Agent errors are printed but do not end the session
 */
export async function runInteractive(
  config: InteractiveConfig,
  write: (s: string) => void,
  overrides?: InteractiveOverrides,
): Promise<void> {
  const sessionOptions: SDKSessionOptions = {
    model: config.model ?? "claude-sonnet-4-20250514",
    pathToClaudeCodeExecutable: findClaude(),
    permissionMode: "bypassPermissions",
  };

  const createSessionFn = overrides?.createSession ?? unstable_v2_createSession;
  const session = createSessionFn(sessionOptions);

  const rl = createInterface({
    input: overrides?.input ?? process.stdin,
    output: overrides?.promptOutput ?? process.stderr,
    prompt: "> ",
  });

  try {
    // Determine first prompt: from CLI arg or first readline input
    let firstInput: string;
    if (config.prompt) {
      firstInput = config.prompt;
    } else {
      rl.prompt();
      const line = await readLine(rl);
      if (line === null || line.trim() === "") {
        return;
      }
      firstInput = line;
    }

    // First turn: include context paths
    const fullPrompt = buildPrompt(firstInput, config.context);
    await session.send(fullPrompt);
    let state = createStreamState();
    try {
      for await (const msg of session.stream()) {
        processMessage(msg, write, state);
      }
    } catch (err: any) {
      write(`\x1b[31merror: ${err.message}\x1b[0m\n`);
    }

    // Subsequent turns: no context paths
    while (true) {
      rl.prompt();
      const input = await readLine(rl);

      // Empty input or EOF exits
      if (input === null || input.trim() === "") {
        break;
      }

      await session.send(input);
      state = createStreamState();
      try {
        for await (const msg of session.stream()) {
          processMessage(msg, write, state);
        }
      } catch (err: any) {
        write(`\x1b[31merror: ${err.message}\x1b[0m\n`);
      }
    }
  } finally {
    rl.close();
    session.close();
  }
}
