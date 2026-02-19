/**
 * Interactive multi-turn REPL for the OpenAI Codex provider.
 *
 * Starts a single Codex thread and reuses it across turns —
 * Codex maintains conversation history internally via the thread object.
 * The readline prompt is written to stderr (or overrides.promptOutput) so it
 * does not mix with agent output on stdout.
 */
import { Codex } from "@openai/codex-sdk";
import { createInterface } from "node:readline";
import { processMessage, createStreamState } from "./stream";
import { writePrompt } from "./interactive";
import { buildPrompt } from "./session";
import { adaptCodexEvents, classifyOpenAIError } from "./codex-stream-adapter";
import type { Readable, Writable } from "node:stream";

export type CodexInteractiveConfig = {
  prompt?: string;
  model?: string;
  context: string[];
};

export type CodexInteractiveOverrides = {
  input?: Readable;
  promptOutput?: Writable;
  createCodex?: () => { startThread(opts?: any): any };
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
 * Runs the Codex interactive REPL.
 *
 * - Creates a single Codex thread, reused across all turns
 * - Applies context via buildPrompt() on the first turn only
 * - Empty input or Ctrl+D exits cleanly
 * - Agent errors are printed but do not end the session
 */
export async function runCodexInteractive(
  config: CodexInteractiveConfig,
  write: (s: string) => void,
  overrides?: CodexInteractiveOverrides,
  errWrite?: (s: string) => void,
): Promise<void> {
  const apiKey = Bun.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    const target = errWrite ?? write;
    target(
      "error: OPENAI_API_KEY is not set.\n\nTo fix this:\n" +
        "  1. Get your API key from https://platform.openai.com/api-keys\n" +
        "  2. Create a .env file in your project root:\n" +
        "     echo 'OPENAI_API_KEY=sk-your-key-here' > .env\n" +
        "  3. Or set it in your terminal:\n" +
        "     export OPENAI_API_KEY=sk-your-key-here\n",
    );
    return;
  }

  // Guard: Codex may be undefined if the SDK was mocked away or the package is
  // corrupted (missing default export). Show a friendly install message instead
  // of crashing with a TypeError.
  if (!overrides?.createCodex && typeof Codex !== "function") {
    const target = errWrite ?? write;
    target(
      "error: @openai/codex-sdk is not installed.\n\nTo fix this, run:\n  bun add @openai/codex-sdk\n",
    );
    return;
  }
  const createCodexFn = overrides?.createCodex ?? (() => new Codex({ apiKey }));
  const codex = createCodexFn();
  const thread = config.model !== undefined
    ? codex.startThread({ model: config.model })
    : codex.startThread();

  const promptOutput = overrides?.promptOutput ?? process.stderr;
  const rl = createInterface({
    input: overrides?.input ?? process.stdin,
    output: promptOutput,
    prompt: "",
  });

  const addSignal = overrides?.addSignalHandler ??
    ((sig: string, fn: (...args: any[]) => void) => process.on(sig, fn));
  const removeSignal = overrides?.removeSignalHandler ??
    ((sig: string, fn: (...args: any[]) => void) => process.removeListener(sig, fn));

  const onSignal = () => { rl.close(); };
  addSignal("SIGINT", onSignal);
  addSignal("SIGTERM", onSignal);

  try {
    // Determine first input: from config or readline
    let firstInput: string;
    if (config.prompt) {
      firstInput = config.prompt;
    } else {
      const initialState = createStreamState();
      writePrompt(promptOutput, initialState);
      const line = await readLine(rl);
      if (line === null || line.trim() === "") {
        rl.close();
        return;
      }
      firstInput = line;
    }

    // First turn uses buildPrompt to prepend context
    let input = buildPrompt(firstInput, config.context);

    while (true) {
      const startTime = Date.now();
      const { events } = await thread.runStreamed(input);
      const state = createStreamState();

      for await (const msg of adaptCodexEvents(events, startTime)) {
        processMessage(msg, write, state, errWrite);
      }

      // Prompt for next input
      writePrompt(promptOutput, state);
      const nextLine = await readLine(rl);

      if (nextLine === null || nextLine.trim() === "") {
        break;
      }

      // Subsequent turns: raw input only (no context prepended)
      input = nextLine;
    }
  } catch (err) {
    const message = classifyOpenAIError(err);
    const target = errWrite ?? write;
    target(`\x1b[31merror: ${message}\x1b[0m\n`);
  } finally {
    removeSignal("SIGINT", onSignal);
    removeSignal("SIGTERM", onSignal);
    rl.close();
  }
}
