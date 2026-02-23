import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type {
  Provider,
  ProviderSessionConfig,
  ProviderEvent,
  InteractiveSessionConfig,
  InteractiveSession,
} from "../provider";
import { buildPrompt } from "../prompt";
import { redactSecrets, extractFirstLine } from "../stream";

/** Mutable state threaded through adaptClaudeMessage calls for a single session. */
export type ClaudeAdapterState = {
  /** Tool name from the most recent content_block_start tool_use, waiting for content_block_stop. */
  pendingToolName: string | undefined;
  /** Accumulated input_json_delta fragments for the pending tool. */
  pendingToolJson: string;
  /** Whether at least one non-empty text_delta has been emitted this session. */
  hasEmittedText: boolean;
};

/** Creates a fresh ClaudeAdapterState — call once per session. */
export function createClaudeAdapterState(): ClaudeAdapterState {
  return {
    pendingToolName: undefined,
    pendingToolJson: "",
    hasEmittedText: false,
  };
}

/**
 * Converts a single Claude Agent SDK message into zero or more ProviderEvent objects.
 *
 * Pure function — no I/O, no ANSI formatting, no writes. Mutates `state` to track
 * tool accumulation and text emission across a stream of messages.
 */
/* eslint-disable
   @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/restrict-plus-operands
   -- TODO: add proper types for Claude Agent SDK messages */
export function adaptClaudeMessage(
  msg: any,
  state: ClaudeAdapterState,
): ProviderEvent[] {
  if (msg.type === "result") {
    const events: ProviderEvent[] = [];

    if (msg.subtype === "success") {
      // Fallback: if no streaming text was emitted but result contains text, emit it now
      if (!state.hasEmittedText && msg.result) {
        events.push({ type: "text_delta", text: msg.result });
      }
      events.push({
        type: "result",
        success: true,
        summary: {
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          numTurns: msg.num_turns,
          durationMs: msg.duration_ms,
        },
      });
    } else {
      events.push({ type: "result", success: false, errors: msg.errors ?? [] });
    }

    return events;
  }

  if (msg.type === "stream_event") {
    const event = msg.event;

    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta"
    ) {
      const text: string = event.delta.text;
      if (text.length === 0) return [];
      state.hasEmittedText = true;
      return [{ type: "text_delta", text }];
    }

    if (
      event.type === "content_block_start" &&
      event.content_block?.type === "tool_use"
    ) {
      // Abandon any incomplete prior tool accumulation
      state.pendingToolName = event.content_block.name;
      state.pendingToolJson = "";
      return [{ type: "tool_start", name: event.content_block.name }];
    }

    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "input_json_delta" &&
      state.pendingToolName !== undefined
    ) {
      state.pendingToolJson += event.delta.partial_json;
      return [];
    }

    if (
      event.type === "content_block_stop" &&
      state.pendingToolName !== undefined
    ) {
      const name = state.pendingToolName;
      state.pendingToolName = undefined;

      let detail: string | undefined;
      if (state.pendingToolJson.length > 0) {
        try {
          const input = JSON.parse(state.pendingToolJson);
          if (input && typeof input === "object") {
            const raw =
              input.file_path ??
              input.command ??
              input.description ??
              input.pattern ??
              input.query;
            detail = extractFirstLine(raw);
            if (detail !== undefined && input.command !== undefined) {
              detail = redactSecrets(detail);
            }
          }
        } catch {
          // Malformed JSON — emit bare tool_end
        }
      }

      state.pendingToolJson = "";

      const toolEnd: ProviderEvent =
        detail !== undefined
          ? { type: "tool_end", name, detail }
          : { type: "tool_end", name };
      return [toolEnd];
    }
  }

  // Unknown or unhandled message types — silently ignored
  return [];
}
/* eslint-enable
   @typescript-eslint/no-explicit-any,
   @typescript-eslint/no-unsafe-member-access,
   @typescript-eslint/no-unsafe-assignment,
   @typescript-eslint/restrict-plus-operands */

/**
 * Simple async message channel. Push user messages to feed the query;
 * the query reads from the channel's async iterator on each turn.
 * Moved here from interactive.ts — owned by the Claude provider.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition -- TODO: type the message channel properly */
export function createMessageChannel() {
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
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unnecessary-condition */

const CLAUDE_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-haiku-4-20250414",
};

/**
 * Locates the `claude` binary on PATH, returning its resolved real path.
 * Uses `where` on Windows and `which` on Unix.
 * `where` can return multiple lines; we take the first match.
 */
function findClaudeBinary(): string {
  const cmd = process.platform === "win32" ? "where claude" : "which claude";
  const raw = execSync(cmd, { encoding: "utf-8" }).trim();
  const first = raw.split(/\r?\n/)[0];
  return realpathSync(first);
}

/**
 * Provider implementation for Claude Code.
 *
 * Locates the Claude Code binary on PATH, resolves symlinks, and
 * runs single-turn sessions through the Claude Agent SDK. Absorbs the logic
 * from the legacy `src/claude.ts` (findClaude) and `src/session.ts` (runSession).
 */
export const ClaudeProvider: Provider = {
  name: "claude",

  isAvailable(): boolean {
    try {
      findClaudeBinary();
      return true;
    } catch {
      return false;
    }
  },

  resolveModel(alias?: string): string | undefined {
    if (!alias) return undefined;
    return CLAUDE_ALIASES[alias] ?? alias;
  },

  knownAliases(): Record<string, string> {
    return CLAUDE_ALIASES;
  },

  async *createSession(
    config: ProviderSessionConfig,
  ): AsyncGenerator<ProviderEvent> {
    let claudePath: string;
    try {
      claudePath = findClaudeBinary();
    } catch {
      throw new Error(
        "Claude Code is not available — install Claude Code and ensure `claude` is in your PATH",
      );
    }

    const fullPrompt = buildPrompt(config.prompt, config.context);
    const state = createClaudeAdapterState();

    const stream = query({
      prompt: fullPrompt,
      options: {
        pathToClaudeCodeExecutable: claudePath,
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        ...(config.model ? { model: config.model } : {}),
      },
    });

    for await (const msg of stream) {
      for (const event of adaptClaudeMessage(msg, state)) {
        yield event;
      }
    }
  },

  createInteractiveSession(
    config: InteractiveSessionConfig,
  ): InteractiveSession {
    let claudePath: string;
    try {
      claudePath = findClaudeBinary();
    } catch {
      throw new Error(
        "Claude Code is not available — install Claude Code and ensure `claude` is in your PATH",
      );
    }

    const messages = createMessageChannel();
    let isFirstSend = true;
    let sessionId: string | undefined;

    const q = query({
      prompt: messages,
      options: {
        pathToClaudeCodeExecutable: claudePath,
        systemPrompt: { type: "preset", preset: "claude_code" },
        settingSources: ["user", "project"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        includePartialMessages: true,
        ...(config.model ? { model: config.model } : {}),
      },
    });

    return {
      send(message: string): Promise<void> {
        const content = isFirstSend
          ? buildPrompt(message, config.context)
          : message;
        isFirstSend = false;
        messages.push({
          type: "user",
          message: { role: "user", content },
          session_id: sessionId ?? "",
          parent_tool_use_id: null,
        });
        return Promise.resolve();
      },

      async *stream(): AsyncGenerator<ProviderEvent> {
        const state = createClaudeAdapterState();
        // Must use manual q.next() instead of for-await-of. A for-await-of
        // loop calls q.return() when exited via `return`, which permanently
        // closes the query generator and breaks subsequent turns.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
          const { value: msg, done } = await q.next();
          if (done) return;
          if ("session_id" in msg && typeof msg.session_id === "string") {
            sessionId = msg.session_id;
          }
          for (const event of adaptClaudeMessage(msg, state)) {
            yield event;
          }
          if (msg.type === "result") {
            return;
          }
        }
      },

      close(): void {
        q.close();
      },
    };
  },
};
