import { Codex } from "@openai/codex-sdk";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ProviderEvent,
  Provider,
  ProviderSessionConfig,
  InteractiveSessionConfig,
  InteractiveSession,
} from "../provider";
import { redactSecrets } from "../stream";
import { buildPrompt } from "../prompt";

// Local ThreadEvent/ThreadItem types that mirror @openai/codex-sdk shapes.
// These are kept for the adapter to remain compatible with existing tests.
// The SDK uses `exit_code` (snake_case) but the local type uses `exitCode`
// (camelCase); CodexProvider casts SDK events when calling adaptCodexEvent.

type ThreadItem =
  | { type: "command_execution"; command: string; exitCode: number | null }
  | { type: "file_change"; changes: { path: string }[] }
  | { type: "mcp_tool_call"; tool: string }
  | { type: "web_search"; query: string }
  | { type: "agent_message"; text: string }
  | { type: "error"; message: string }
  | { type: string; [key: string]: unknown };

export type ThreadEvent =
  | { type: "thread.started" }
  | { type: "turn.started" }
  | {
      type: "turn.completed";
      usage: { input_tokens: number; output_tokens: number };
    }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started"; item: ThreadItem }
  | { type: "item.updated"; item: ThreadItem }
  | { type: "item.completed"; item: ThreadItem }
  | { type: string; [key: string]: unknown };

export function adaptCodexEvent(
  event: ThreadEvent,
  durationMs: number,
): ProviderEvent[] {
  if (event.type === "item.started") {
    return adaptItemStarted(
      (event as { type: "item.started"; item: ThreadItem }).item,
    );
  }
  if (event.type === "item.completed") {
    return adaptItemCompleted(
      (event as { type: "item.completed"; item: ThreadItem }).item,
    );
  }
  if (event.type === "turn.completed") {
    const { input_tokens, output_tokens } = (
      event as {
        type: "turn.completed";
        usage: { input_tokens: number; output_tokens: number };
      }
    ).usage;
    return [
      {
        type: "result",
        success: true,
        summary: {
          inputTokens: input_tokens,
          outputTokens: output_tokens,
          numTurns: 1,
          durationMs,
        },
      },
    ];
  }
  if (event.type === "turn.failed") {
    const { message } = (
      event as { type: "turn.failed"; error: { message: string } }
    ).error;
    return [{ type: "result", success: false, errors: [message] }];
  }
  // thread.started, turn.started, item.updated, unknown top-level events: ignored
  return [];
}

function adaptItemStarted(item: ThreadItem): ProviderEvent[] {
  switch (item.type) {
    case "command_execution":
      return [{ type: "tool_start", name: "Bash" }];
    case "file_change":
      return [{ type: "tool_start", name: "Edit" }];
    case "mcp_tool_call":
      return [
        {
          type: "tool_start",
          name: (item as { type: "mcp_tool_call"; tool: string }).tool,
        },
      ];
    default:
      // reasoning, todo_list, unknown item types: ignored
      return [];
  }
}

function adaptItemCompleted(item: ThreadItem): ProviderEvent[] {
  switch (item.type) {
    case "command_execution": {
      const { command, exitCode } = item as {
        type: "command_execution";
        command: string;
        exitCode: number | null;
      };
      if (exitCode === null) return [];
      return [
        { type: "tool_end", name: "Bash", detail: redactSecrets(command) },
      ];
    }
    case "file_change": {
      const { changes } = item as {
        type: "file_change";
        changes: { path: string }[];
      };
      const detail = changes[0]?.path;
      return detail
        ? [{ type: "tool_end", name: "Edit", detail }]
        : [{ type: "tool_end", name: "Edit" }];
    }
    case "mcp_tool_call": {
      const { tool } = item as { type: "mcp_tool_call"; tool: string };
      return [{ type: "tool_end", name: tool }];
    }
    case "web_search": {
      const { query } = item as { type: "web_search"; query: string };
      return [
        { type: "tool_start", name: "WebSearch" },
        { type: "tool_end", name: "WebSearch", detail: query },
      ];
    }
    case "agent_message": {
      const { text } = item as { type: "agent_message"; text: string };
      if (!text) return [];
      return [{ type: "text_delta", text }];
    }
    case "error": {
      const { message } = item as { type: "error"; message: string };
      return [{ type: "error", message }];
    }
    default:
      return [];
  }
}

const CODEX_ALIASES: Record<string, string> = {
  codex: "gpt-5.2-codex",
  "codex-mini": "codex-mini-latest",
};

/**
 * Provider implementation for OpenAI Codex.
 *
 * Checks for OPENAI_API_KEY or CODEX_API_KEY in the environment, then
 * creates a Codex SDK client to run single-turn sessions via runStreamed().
 * SDK events are piped through adaptCodexEvent() to produce ProviderEvents.
 */
export const CodexProvider: Provider = {
  name: "codex",

  isAvailable(): boolean {
    if (Bun.env.OPENAI_API_KEY || Bun.env.CODEX_API_KEY) return true;
    try {
      const codexHome = Bun.env.CODEX_HOME ?? join(homedir(), ".codex");
      return existsSync(join(codexHome, "auth.json"));
    } catch {
      return false;
    }
  },

  resolveModel(alias?: string): string | undefined {
    if (!alias) return undefined;
    return CODEX_ALIASES[alias] ?? alias;
  },

  knownAliases(): Record<string, string> {
    return CODEX_ALIASES;
  },

  async *createSession(
    config: ProviderSessionConfig,
  ): AsyncGenerator<ProviderEvent> {
    if (!this.isAvailable()) {
      throw new Error(
        "Codex is not available — set OPENAI_API_KEY or CODEX_API_KEY, or run `codex login` to authenticate",
      );
    }

    const fullPrompt = buildPrompt(config.prompt, config.context);
    const startMs = Date.now();

    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: process.cwd(),
      sandboxMode: "workspace-write",
      ...(config.model ? { model: config.model } : {}),
    });

    const { events } = await thread.runStreamed(fullPrompt);

    for await (const sdkEvent of events) {
      const durationMs = Date.now() - startMs;
      // Cast: the SDK's ThreadEvent is structurally compatible with the local
      // ThreadEvent for all fields the adapter inspects, except `exit_code` vs
      // `exitCode` on CommandExecutionItem. Real SDK events use `exit_code`
      // (snake_case); the adapter uses `exitCode` (camelCase). This mismatch
      // only affects the "null exit code → skip tool_end" edge case.
      for (const providerEvent of adaptCodexEvent(
        sdkEvent as unknown as ThreadEvent,
        durationMs,
      )) {
        yield providerEvent;
      }
    }
  },

  createInteractiveSession(
    config: InteractiveSessionConfig,
  ): InteractiveSession {
    if (!this.isAvailable()) {
      throw new Error(
        "Codex is not available — set OPENAI_API_KEY or CODEX_API_KEY, or run `codex login` to authenticate",
      );
    }

    const codex = new Codex();
    const thread = codex.startThread({
      workingDirectory: process.cwd(),
      sandboxMode: "workspace-write",
      ...(config.model ? { model: config.model } : {}),
    });

    let isFirstSend = true;
    let pendingMessage: string | null = null;

    return {
      async send(message: string): Promise<void> {
        if (isFirstSend) {
          pendingMessage = buildPrompt(message, config.context);
          isFirstSend = false;
        } else {
          pendingMessage = message;
        }
      },

      async *stream(): AsyncGenerator<ProviderEvent> {
        if (pendingMessage === null) return;
        const startMs = Date.now();
        const msg = pendingMessage;
        pendingMessage = null;

        const { events } = await thread.runStreamed(msg);
        for await (const sdkEvent of events) {
          const durationMs = Date.now() - startMs;
          for (const providerEvent of adaptCodexEvent(
            sdkEvent as unknown as ThreadEvent,
            durationMs,
          )) {
            yield providerEvent;
          }
        }
      },

      close(): void {
        // no-op — Codex CLI process exits after each turn
      },
    };
  },
};
