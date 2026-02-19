/**
 * Codex stream adapter — translates @openai/codex-sdk ThreadEvents into
 * the same message shapes that processMessage() in src/stream.ts already
 * consumes, so the Codex path reuses all existing formatting logic.
 *
 * Real SDK event types (ThreadEvent union from @openai/codex-sdk):
 *   thread.started, turn.started, turn.completed, turn.failed,
 *   item.started, item.updated, item.completed, error
 *
 * ThreadItem subtypes handled:
 *   agent_message → text_delta
 *   command_execution → tool_use sequence (name="Bash", detail=command)
 *   file_change → tool_use sequence (name="Write", detail=file path)
 *   mcp_tool_call → tool_use sequence (name=item.tool)
 *   reasoning, web_search, todo_list, error → silently skipped
 */

/**
 * Classifies an OpenAI SDK error and returns a human-readable message.
 * Detects auth errors (401), rate limits (429), and network errors.
 * Falls back to the original error message for unrecognized errors.
 */
export function classifyOpenAIError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);

  const msg = err.message;
  const status = (err as any).status;
  const code = (err as any).code;

  // Auth error: HTTP 401 or message patterns
  if (
    status === 401 ||
    /incorrect api key/i.test(msg) ||
    /invalid api key/i.test(msg) ||
    /api key.*invalid/i.test(msg) ||
    /api key.*expired/i.test(msg) ||
    /authentication.*failed/i.test(msg) ||
    /\bunauthorized\b/i.test(msg)
  ) {
    return (
      "OpenAI authentication failed. Your API key may be invalid or expired.\n\n" +
      "Check your key at https://platform.openai.com/api-keys"
    );
  }

  // Rate limit: HTTP 429 or message patterns
  if (
    status === 429 ||
    /rate.?limit/i.test(msg) ||
    /too many requests/i.test(msg)
  ) {
    return (
      "OpenAI rate limit reached. Waiting before next attempt.\n\n" +
      "Tip: Use a different model or wait a moment before retrying."
    );
  }

  // Network error: connection error codes or specific fetch failure patterns
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ETIMEDOUT" ||
    code === "EHOSTUNREACH" ||
    /ECONNREFUSED/.test(msg) ||
    /ENOTFOUND/.test(msg) ||
    /fetch failed/i.test(msg) ||
    /failed to fetch/i.test(msg)
  ) {
    return "Could not connect to OpenAI API. Check your internet connection.";
  }

  return msg;
}

export async function* adaptCodexEvents(
  events: AsyncIterable<any>,
  startTime: number,
): AsyncGenerator<any> {
  let turnCompleted = false;

  try {
    for await (const event of events) {
      if (event.type === "item.completed") {
        const item = event.item;
        if (!item) continue;

        if (item.type === "agent_message" && typeof item.text === "string") {
          yield {
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: item.text },
            },
          };
        } else if (item.type === "command_execution") {
          const cmd: string = item.command ?? "";
          yield {
            type: "stream_event",
            event: {
              type: "content_block_start",
              content_block: { type: "tool_use", name: "Bash" },
            },
          };
          if (cmd.length > 0) {
            yield {
              type: "stream_event",
              event: {
                type: "content_block_delta",
                delta: {
                  type: "input_json_delta",
                  partial_json: JSON.stringify({ command: cmd }),
                },
              },
            };
          }
          yield {
            type: "stream_event",
            event: { type: "content_block_stop" },
          };
        } else if (item.type === "file_change") {
          const paths: string = (item.changes ?? [])
            .map((c: { path: string }) => c.path)
            .join(", ");
          yield {
            type: "stream_event",
            event: {
              type: "content_block_start",
              content_block: { type: "tool_use", name: "Write" },
            },
          };
          if (paths.length > 0) {
            yield {
              type: "stream_event",
              event: {
                type: "content_block_delta",
                delta: {
                  type: "input_json_delta",
                  partial_json: JSON.stringify({ file_path: paths }),
                },
              },
            };
          }
          yield {
            type: "stream_event",
            event: { type: "content_block_stop" },
          };
        } else if (item.type === "mcp_tool_call") {
          yield {
            type: "stream_event",
            event: {
              type: "content_block_start",
              content_block: {
                type: "tool_use",
                name: item.tool ?? "mcp_tool",
              },
            },
          };
          yield {
            type: "stream_event",
            event: { type: "content_block_stop" },
          };
        }
        // reasoning, web_search, todo_list, error — silently skipped
      } else if (event.type === "turn.completed") {
        turnCompleted = true;
        yield {
          type: "result",
          subtype: "success",
          usage: {
            input_tokens: event.usage?.input_tokens ?? 0,
            output_tokens: event.usage?.output_tokens ?? 0,
          },
          num_turns: 1,
          duration_ms: Date.now() - startTime,
        };
      } else if (event.type === "turn.failed") {
        yield {
          type: "result",
          subtype: "error_during_execution",
          errors: [event.error?.message ?? "Turn failed"],
        };
        return;
      } else if (event.type === "error") {
        yield {
          type: "result",
          subtype: "error_during_execution",
          errors: [event.message ?? "Unknown error"],
        };
        return;
      }
      // thread.started, turn.started, item.started, item.updated — silently skipped
    }
  } catch (err) {
    yield {
      type: "result",
      subtype: "error_during_execution",
      errors: [classifyOpenAIError(err)],
    };
    return;
  }

  if (!turnCompleted) {
    yield {
      type: "result",
      subtype: "success",
      usage: { input_tokens: 0, output_tokens: 0 },
      num_turns: 1,
      duration_ms: Date.now() - startTime,
    };
  }
}
