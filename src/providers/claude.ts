import { realpathSync } from "node:fs";
import { execSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Provider, ProviderSessionConfig, ProviderEvent } from "../provider";
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
  return { pendingToolName: undefined, pendingToolJson: "", hasEmittedText: false };
}

/**
 * Converts a single Claude Agent SDK message into zero or more ProviderEvent objects.
 *
 * Pure function — no I/O, no ANSI formatting, no writes. Mutates `state` to track
 * tool accumulation and text emission across a stream of messages.
 */
export function adaptClaudeMessage(msg: any, state: ClaudeAdapterState): ProviderEvent[] {
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

    if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
      const text: string = event.delta.text;
      if (text.length === 0) return [];
      state.hasEmittedText = true;
      return [{ type: "text_delta", text }];
    }

    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
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

    if (event.type === "content_block_stop" && state.pendingToolName !== undefined) {
      const name = state.pendingToolName;
      state.pendingToolName = undefined;

      let detail: string | undefined;
      if (state.pendingToolJson.length > 0) {
        try {
          const input = JSON.parse(state.pendingToolJson);
          if (input && typeof input === "object") {
            const raw =
              input.file_path ?? input.command ?? input.description ?? input.pattern ?? input.query;
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

      const toolEnd: ProviderEvent = detail !== undefined
        ? { type: "tool_end", name, detail }
        : { type: "tool_end", name };
      return [toolEnd];
    }
  }

  // Unknown or unhandled message types — silently ignored
  return [];
}

const CLAUDE_ALIASES: Record<string, string> = {
  sonnet: "claude-sonnet-4-20250514",
  opus: "claude-opus-4-20250514",
  haiku: "claude-haiku-4-20250414",
};

/**
 * Provider implementation for Claude Code.
 *
 * Locates the Claude Code binary via `which claude`, resolves symlinks, and
 * runs single-turn sessions through the Claude Agent SDK. Absorbs the logic
 * from the legacy `src/claude.ts` (findClaude) and `src/session.ts` (runSession).
 */
export const ClaudeProvider: Provider = {
  name: "claude",

  isAvailable(): boolean {
    try {
      const which = execSync("which claude", { encoding: "utf-8" }).trim();
      realpathSync(which);
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

  async *createSession(config: ProviderSessionConfig): AsyncGenerator<ProviderEvent> {
    let claudePath: string;
    try {
      const which = execSync("which claude", { encoding: "utf-8" }).trim();
      claudePath = realpathSync(which);
    } catch {
      throw new Error(
        "Claude Code is not available — install Claude Code and ensure `claude` is in your PATH"
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
};
