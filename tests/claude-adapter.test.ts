import { describe, test, expect } from "bun:test";
import { adaptClaudeMessage, createClaudeAdapterState } from "../src/providers/claude";

// Helpers to build fake SDK messages
function streamEvent(event: object) {
  return { type: "stream_event", event };
}

function textDeltaMsg(text: string) {
  return streamEvent({ type: "content_block_delta", delta: { type: "text_delta", text } });
}

function toolStartMsg(name: string) {
  return streamEvent({ type: "content_block_start", content_block: { type: "tool_use", name } });
}

function jsonDeltaMsg(partial_json: string) {
  return streamEvent({ type: "content_block_delta", delta: { type: "input_json_delta", partial_json } });
}

function toolStopMsg() {
  return streamEvent({ type: "content_block_stop" });
}

function resultSuccessMsg(overrides: object = {}) {
  return {
    type: "result",
    subtype: "success",
    usage: { input_tokens: 100, output_tokens: 50 },
    num_turns: 2,
    duration_ms: 1234,
    result: "",
    ...overrides,
  };
}

function resultFailureMsg(errors: string[] = ["something went wrong"]) {
  return { type: "result", subtype: "error", errors };
}

describe("adaptClaudeMessage", () => {
  describe("text_delta", () => {
    test("maps content_block_delta text_delta to text_delta event", () => {
      const state = createClaudeAdapterState();
      const events = adaptClaudeMessage(textDeltaMsg("hello"), state);
      expect(events).toEqual([{ type: "text_delta", text: "hello" }]);
      expect(state.hasEmittedText).toBe(true);
    });

    test("skips empty text_delta strings", () => {
      const state = createClaudeAdapterState();
      const events = adaptClaudeMessage(textDeltaMsg(""), state);
      expect(events).toEqual([]);
      expect(state.hasEmittedText).toBe(false);
    });
  });

  describe("tool_start", () => {
    test("maps content_block_start tool_use to tool_start event", () => {
      const state = createClaudeAdapterState();
      const events = adaptClaudeMessage(toolStartMsg("Read"), state);
      expect(events).toEqual([{ type: "tool_start", name: "Read" }]);
      expect(state.pendingToolName).toBe("Read");
    });

    test("abandoned tool accumulation reset on new content_block_start", () => {
      const state = createClaudeAdapterState();
      // First tool start without stop
      adaptClaudeMessage(toolStartMsg("Read"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"file_path":'), state);
      // Second tool start abandons first
      const events = adaptClaudeMessage(toolStartMsg("Bash"), state);
      expect(events).toEqual([{ type: "tool_start", name: "Bash" }]);
      expect(state.pendingToolName).toBe("Bash");
      expect(state.pendingToolJson).toBe("");
    });
  });

  describe("input_json_delta", () => {
    test("accumulates JSON fragments without emitting events", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Read"), state);
      const events = adaptClaudeMessage(jsonDeltaMsg('{"file_path":'), state);
      expect(events).toEqual([]);
      expect(state.pendingToolJson).toBe('{"file_path":');
    });

    test("accumulates multiple JSON fragments", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Read"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"file_p'), state);
      adaptClaudeMessage(jsonDeltaMsg('ath": "/foo"}'), state);
      expect(state.pendingToolJson).toBe('{"file_path": "/foo"}');
    });
  });

  describe("tool_end (content_block_stop)", () => {
    test("emits tool_end with file_path detail", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Read"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"file_path": "/src/main.ts"}'), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events).toEqual([{ type: "tool_end", name: "Read", detail: "/src/main.ts" }]);
      expect(state.pendingToolName).toBeUndefined();
      expect(state.pendingToolJson).toBe("");
    });

    test("detail extraction fallback chain: command over description", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Bash"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"command": "ls -la", "description": "list files"}'), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events[0]).toMatchObject({ type: "tool_end", name: "Bash", detail: "ls -la" });
    });

    test("detail extraction fallback chain: description over pattern", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Glob"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"description": "find files", "pattern": "*.ts"}'), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events[0]).toMatchObject({ type: "tool_end", name: "Glob", detail: "find files" });
    });

    test("detail extraction fallback chain: pattern over query", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Glob"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"pattern": "*.ts", "query": "typescript files"}'), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events[0]).toMatchObject({ type: "tool_end", name: "Glob", detail: "*.ts" });
    });

    test("detail extraction fallback chain: query as last resort", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Search"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"query": "find providers"}'), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events[0]).toMatchObject({ type: "tool_end", name: "Search", detail: "find providers" });
    });

    test("only uses first line of detail", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Read"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"file_path": "/foo/bar\\nsecond line"}'), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events[0]).toMatchObject({ type: "tool_end", name: "Read", detail: "/foo/bar" });
    });

    test("redacts secrets in command detail", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Bash"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"command": "API_KEY=secret curl http://example.com"}'), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events[0]).toMatchObject({
        type: "tool_end",
        name: "Bash",
        detail: "API_KEY=*** curl http://example.com",
      });
    });

    test("emits tool_end without detail on malformed JSON", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Read"), state);
      adaptClaudeMessage(jsonDeltaMsg("{not valid json"), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events).toEqual([{ type: "tool_end", name: "Read" }]);
    });

    test("emits tool_end without detail when no JSON accumulated", () => {
      const state = createClaudeAdapterState();
      adaptClaudeMessage(toolStartMsg("Bash"), state);
      const events = adaptClaudeMessage(toolStopMsg(), state);
      expect(events).toEqual([{ type: "tool_end", name: "Bash" }]);
    });

    test("multiple consecutive tool blocks each get own cycle", () => {
      const state = createClaudeAdapterState();

      adaptClaudeMessage(toolStartMsg("Read"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"file_path": "/a.ts"}'), state);
      const end1 = adaptClaudeMessage(toolStopMsg(), state);

      adaptClaudeMessage(toolStartMsg("Bash"), state);
      adaptClaudeMessage(jsonDeltaMsg('{"command": "ls"}'), state);
      const end2 = adaptClaudeMessage(toolStopMsg(), state);

      expect(end1).toEqual([{ type: "tool_end", name: "Read", detail: "/a.ts" }]);
      expect(end2).toEqual([{ type: "tool_end", name: "Bash", detail: "ls" }]);
    });
  });

  describe("result", () => {
    test("maps success result to result event with summary", () => {
      const state = createClaudeAdapterState();
      state.hasEmittedText = true; // already emitted text
      const events = adaptClaudeMessage(resultSuccessMsg(), state);
      expect(events).toEqual([
        {
          type: "result",
          success: true,
          summary: { inputTokens: 100, outputTokens: 50, numTurns: 2, durationMs: 1234 },
        },
      ]);
    });

    test("maps failure result to result event with errors", () => {
      const state = createClaudeAdapterState();
      const events = adaptClaudeMessage(resultFailureMsg(["auth failed"]), state);
      expect(events).toEqual([{ type: "result", success: false, errors: ["auth failed"] }]);
    });

    test("fallback: emits text_delta before result when no text was emitted and result.result has text", () => {
      const state = createClaudeAdapterState();
      // hasEmittedText is false (default)
      const events = adaptClaudeMessage(
        resultSuccessMsg({ result: "here is the answer" }),
        state
      );
      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({ type: "text_delta", text: "here is the answer" });
      expect(events[1]).toMatchObject({ type: "result", success: true });
    });

    test("no fallback text when text was already emitted", () => {
      const state = createClaudeAdapterState();
      state.hasEmittedText = true;
      const events = adaptClaudeMessage(
        resultSuccessMsg({ result: "here is the answer" }),
        state
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "result", success: true });
    });

    test("no fallback text when result.result is empty", () => {
      const state = createClaudeAdapterState();
      const events = adaptClaudeMessage(resultSuccessMsg({ result: "" }), state);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: "result", success: true });
    });
  });

  describe("unknown message types", () => {
    test("silently ignores unknown message types", () => {
      const state = createClaudeAdapterState();
      const events = adaptClaudeMessage({ type: "system", data: {} }, state);
      expect(events).toEqual([]);
    });

    test("silently ignores unknown stream_event types", () => {
      const state = createClaudeAdapterState();
      const events = adaptClaudeMessage(streamEvent({ type: "message_start" }), state);
      expect(events).toEqual([]);
    });
  });
});
