import { Codex } from "@openai/codex-sdk";
import { buildPrompt } from "./session";
import { adaptCodexEvents, classifyOpenAIError } from "./codex-stream-adapter";

export type CodexSessionConfig = {
  prompt: string;
  model?: string;
  context: string[];
};

/**
 * Runs a single Codex agent session, yielding adapted sauna messages.
 * Each call creates a new thread — equivalent to one loop iteration.
 * Not used for interactive mode; that uses runCodexInteractive().
 */
export async function* runCodexSession(
  config: CodexSessionConfig,
): AsyncGenerator<any> {
  const apiKey = Bun.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    yield {
      type: "result",
      subtype: "error_during_execution",
      errors: [
        "OPENAI_API_KEY is not set.\n\nTo fix this:\n" +
          "  1. Get your API key from https://platform.openai.com/api-keys\n" +
          "  2. Create a .env file in your project root:\n" +
          "     echo 'OPENAI_API_KEY=sk-your-key-here' > .env\n" +
          "  3. Or set it in your terminal:\n" +
          "     export OPENAI_API_KEY=sk-your-key-here",
      ],
    };
    return;
  }

  // Guard: Codex may be undefined if the SDK was mocked away or the package is
  // corrupted (missing default export). Show a friendly install message instead
  // of crashing with a TypeError.
  if (typeof Codex !== "function") {
    yield {
      type: "result",
      subtype: "error_during_execution",
      errors: [
        "@openai/codex-sdk is not installed.\n\nTo fix this, run:\n  bun add @openai/codex-sdk",
      ],
    };
    return;
  }

  const fullPrompt = buildPrompt(config.prompt, config.context);
  const codex = new Codex({ apiKey });
  const thread = config.model !== undefined
    ? codex.startThread({ model: config.model })
    : codex.startThread();
  const startTime = Date.now();
  try {
    const { events } = await thread.runStreamed(fullPrompt);
    yield* adaptCodexEvents(events, startTime);
  } catch (err) {
    yield {
      type: "result",
      subtype: "error_during_execution",
      errors: [classifyOpenAIError(err)],
    };
  }
}
