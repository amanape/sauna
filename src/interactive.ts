/**
 * Interactive multi-turn REPL for sauna CLI.
 *
 * Uses the v1 query() API with an AsyncIterable prompt for multi-turn
 * conversations, matching the same agent configuration as the non-interactive
 * path. The readline prompt is written to stderr so it does not mix with
 * agent output on stdout.
 */
import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { createInterface } from "node:readline";
import { processMessage, createStreamState } from "./stream";
import { buildPrompt } from "./session";
import type { Readable, Writable } from "node:stream";

export type InteractiveConfig = {
  prompt?: string;
  model?: string;
  context: string[];
  claudePath: string;
};

/** Options passed to query() — mirrors the non-interactive session options. */
export type QueryOptions = Parameters<typeof query>[0]["options"];

/** Optional overrides for testing — inject custom streams or query factory. */
export type InteractiveOverrides = {
  input?: Readable;
  promptOutput?: Writable;
  createQuery?: (params: { prompt: AsyncIterable<any>; options: QueryOptions }) => Query;
  addSignalHandler?: (signal: string, handler: (...args: any[]) => void) => void;
  removeSignalHandler?: (signal: string, handler: (...args: any[]) => void) => void;
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
 * Simple async message channel. Push user messages to feed the query;
 * the query reads from the channel's async iterator on each turn.
 */
function createMessageChannel() {
  let resolve: ((msg: any) => void) | null = null;
  const pending: any[] = [];

  return {
    push(msg: any) {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r(msg);
      } else {
        pending.push(msg);
      }
    },
    async *[Symbol.asyncIterator]() {
      while (true) {
        let msg;
        if (pending.length > 0) {
          msg = pending.shift();
        } else {
          msg = await new Promise<any>((r) => {
            resolve = r;
          });
        }
        if (msg === null) return;
        yield msg;
      }
    },
  };
}

/**
 * Runs the interactive REPL loop.
 *
 * - Starts a v1 query() session with an AsyncIterable prompt for multi-turn
 * - Extracts session_id from result messages for follow-up turns
 * - Follow-up input is pushed to the message channel, which the query reads
 * - Empty input or Ctrl+D exits cleanly (exit code 0)
 * - Agent errors are printed but do not end the session
 */
export async function runInteractive(
  config: InteractiveConfig,
  write: (s: string) => void,
  overrides?: InteractiveOverrides,
  errWrite?: (s: string) => void,
): Promise<void> {
  const rl = createInterface({
    input: overrides?.input ?? process.stdin,
    output: overrides?.promptOutput ?? process.stderr,
    prompt: "> ",
  });

  // Determine first prompt: from CLI arg or first readline input
  let firstInput: string;
  if (config.prompt) {
    firstInput = config.prompt;
  } else {
    rl.prompt();
    const line = await readLine(rl);
    if (line === null || line.trim() === "") {
      rl.close();
      return;
    }
    firstInput = line;
  }

  // Build the full first prompt with context paths
  const fullPrompt = buildPrompt(firstInput, config.context);

  // Query options matching non-interactive session path
  const options: QueryOptions = {
    pathToClaudeCodeExecutable: config.claudePath,
    systemPrompt: { type: "preset", preset: "claude_code" },
    settingSources: ["user", "project"],
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    ...(config.model ? { model: config.model } : {}),
  };

  // Create message channel for multi-turn input — push first message immediately
  const messages = createMessageChannel();
  messages.push({
    type: "user",
    message: { role: "user", content: fullPrompt },
    session_id: "",
    parent_tool_use_id: null,
  });

  const createQueryFn = overrides?.createQuery ?? query;
  const q = createQueryFn({ prompt: messages, options });

  // Register signal handlers for graceful cleanup on SIGINT/SIGTERM
  const addSignal = overrides?.addSignalHandler ?? ((sig: string, fn: (...args: any[]) => void) => process.on(sig, fn));
  const removeSignal = overrides?.removeSignalHandler ?? ((sig: string, fn: (...args: any[]) => void) => process.removeListener(sig, fn));

  const onSignal = () => {
    rl.close();
    q.close();
  };
  addSignal("SIGINT", onSignal);
  addSignal("SIGTERM", onSignal);

  try {
    let sessionId: string | undefined;
    let state = createStreamState();

    // Process all messages across turns from the query generator
    for await (const msg of q) {
      // Extract session_id from any message that carries one
      if ("session_id" in msg && typeof msg.session_id === "string") {
        sessionId = msg.session_id;
      }

      processMessage(msg, write, state, errWrite);

      // After a result message, prompt for follow-up input
      if (msg.type === "result") {
        rl.prompt();
        const input = await readLine(rl);

        // Empty input or EOF exits
        if (input === null || input.trim() === "") {
          break;
        }

        // Reset stream state and push follow-up message to the channel
        state = createStreamState();
        messages.push({
          type: "user",
          message: { role: "user", content: input },
          session_id: sessionId ?? "",
          parent_tool_use_id: null,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errTarget = errWrite ?? write;
    errTarget(`\x1b[31merror: ${message}\x1b[0m\n`);
  } finally {
    removeSignal("SIGINT", onSignal);
    removeSignal("SIGTERM", onSignal);
    rl.close();
    q.close();
  }
}
