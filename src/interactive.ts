/**
 * Interactive multi-turn REPL for sauna CLI.
 *
 * Provider-agnostic: drives the conversation via the InteractiveSession
 * contract rather than the Claude SDK directly. Any provider that implements
 * createInteractiveSession() can power the REPL loop.
 *
 * The readline prompt is written to stderr so it does not mix with agent
 * output on stdout.
 */
import { createInterface } from "node:readline";
import {
  processProviderEvent,
  createStreamState,
  type StreamState,
} from "./stream";
import type { Provider, InteractiveSession } from "./provider";
import type { Readable, Writable } from "node:stream";

const BOLD_GREEN = "\x1b[1;32m";
const RESET = "\x1b[0m";

/** Writes a bold green "> " prompt to the output stream.
 *  Inserts a newline first if the last output didn't end with one. */
export function writePrompt(output: Writable, state: StreamState): void {
  if (!state.lastCharWasNewline) {
    output.write("\n");
  }
  output.write(`${BOLD_GREEN}> ${RESET}`);
}

export type InteractiveConfig = {
  prompt?: string;
  model?: string;
  context: string[];
  provider: Provider;
};

/** Optional overrides for testing — inject custom streams or session. */
export type InteractiveOverrides = {
  input?: Readable;
  promptOutput?: Writable;
  session?: InteractiveSession;
  addSignalHandler?: (
    signal: string,
    handler: (...args: any[]) => void,
  ) => void;
  removeSignalHandler?: (
    signal: string,
    handler: (...args: any[]) => void,
  ) => void;
};

/**
 * Reads a single line from the readline interface.
 * Returns null on EOF (Ctrl+D) or if the interface is closed.
 */
function readLine(
  rl: ReturnType<typeof createInterface>,
): Promise<string | null> {
  return new Promise((resolve) => {
    const onClose = () => { resolve(null); };
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
 * - Creates an InteractiveSession via config.provider (or uses overrides.session)
 * - First user input is sent via session.send(); events are streamed via session.stream()
 * - Follow-up turns repeat the send/stream pattern until empty input or EOF
 * - Empty input or Ctrl+D exits cleanly (exit code 0)
 * - SIGINT/SIGTERM call session.close() for graceful cleanup
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
    prompt: "",
  });

  const promptOutput = overrides?.promptOutput ?? process.stderr;

  const session =
    overrides?.session ??
    config.provider.createInteractiveSession({
      model: config.model,
      context: config.context,
    });

  // Register signal handlers for graceful cleanup on SIGINT/SIGTERM
  const addSignal =
    overrides?.addSignalHandler ??
    ((sig: string, fn: (...args: any[]) => void) => process.on(sig, fn));
  const removeSignal =
    overrides?.removeSignalHandler ??
    ((sig: string, fn: (...args: any[]) => void) =>
      process.removeListener(sig, fn));

  const onSignal = () => {
    rl.close();
    session.close();
  };
  addSignal("SIGINT", onSignal);
  addSignal("SIGTERM", onSignal);

  try {
    // Determine first user message: from CLI arg or first readline input
    let firstInput: string;
    if (config.prompt) {
      firstInput = config.prompt;
    } else {
      const initialState = createStreamState();
      writePrompt(promptOutput, initialState);
      const line = await readLine(rl);
      if (line === null || line.trim() === "") {
        return;
      }
      firstInput = line;
    }

    await session.send(firstInput);

    let state = createStreamState();

    // REPL loop: stream one turn, prompt for input, repeat
    while (true) {
      for await (const event of session.stream()) {
        processProviderEvent(event, write, state, errWrite);
      }

      writePrompt(promptOutput, state);
      const input = await readLine(rl);

      // Empty input or EOF exits cleanly
      if (input === null || input.trim() === "") break;

      state = createStreamState();
      await session.send(input);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errTarget = errWrite ?? write;
    errTarget(`\x1b[31merror: ${message}\x1b[0m\n`);
  } finally {
    removeSignal("SIGINT", onSignal);
    removeSignal("SIGTERM", onSignal);
    rl.close();
    session.close();
  }
}
