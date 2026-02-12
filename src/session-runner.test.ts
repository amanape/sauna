import { test, expect, describe, mock } from "bun:test";
import type { Agent, LLMStepResult } from "@mastra/core/agent";
import type { MessageInput } from "@mastra/core/agent/message-list";
import { SessionRunner } from "./session-runner";

/** Extract the generate options type from Agent.generate()'s second parameter */
type GenerateOptions = NonNullable<Parameters<Agent["generate"]>[1]>;

/** Mock generate function signature matching Agent.generate() */
type MockGenerateFn = (messages: MessageInput[], opts: GenerateOptions) => ReturnType<Agent["generate"]>;

/** Typed accessor for mock call arguments */
function mockCallArgs(fn: ReturnType<typeof mock>, index: number) {
  return fn.mock.calls[index] as unknown as [MessageInput[], GenerateOptions];
}

function makeMockAgent(generateImpl?: MockGenerateFn) {
  const mockGenerate = mock(
    generateImpl ??
    (async () => ({
      text: "Hello from AI",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hello from AI" },
      ],
    })),
  );
  return { generate: mockGenerate } as unknown as Agent;
}

describe("SessionRunner", () => {
  test("sendMessage calls agent.generate and returns the result", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("Hello");

    expect(result).toBeDefined();
    expect(result!.text).toBe("Hello from AI");
    expect(agent.generate).toHaveBeenCalledTimes(1);
  });

  test("sendMessage passes user message in messages array to agent.generate", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    const [messages] = mockCallArgs(agent.generate, 0);
    expect(messages).toContainEqual({ role: "user", content: "Hello" });
  });

  test("accumulates messages across multiple turns", async () => {
    let callCount = 0;
    const agent = makeMockAgent(async (msgs: MessageInput[]) => {
      callCount++;
      return {
        text: `Response ${callCount}`,
        messages: [
          ...msgs,
          { role: "assistant", content: `Response ${callCount}` },
        ],
      };
    });
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("First");
    await runner.sendMessage("Second");

    const [secondMessages] = mockCallArgs(agent.generate, 1);
    expect(secondMessages).toContainEqual({ role: "user", content: "First" });
    expect(secondMessages).toContainEqual({ role: "assistant", content: "Response 1" });
    expect(secondMessages).toContainEqual({ role: "user", content: "Second" });
  });

  test("replaces message array with generate result messages after each turn", async () => {
    const canonicalMessages = [
      { id: "1", role: "user", content: { format: 2, parts: [] } },
      { id: "2", role: "assistant", content: { format: 2, parts: [] } },
    ];
    const agent = makeMockAgent(async () => ({
      text: "OK",
      messages: canonicalMessages,
    }));
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    // Second call should use the canonical messages from generate result, not our raw push
    await runner.sendMessage("Second");
    const [secondMessages] = mockCallArgs(agent.generate, 1);
    expect(secondMessages[0]).toBe(canonicalMessages[0]);
    expect(secondMessages[1]).toBe(canonicalMessages[1]);
  });

  test("skips empty messages without calling agent", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("");
    expect(result).toBeNull();
    expect(agent.generate).not.toHaveBeenCalled();
  });

  test("skips whitespace-only messages without calling agent", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    const result = await runner.sendMessage("   \t\n  ");
    expect(result).toBeNull();
    expect(agent.generate).not.toHaveBeenCalled();
  });

  test("passes maxSteps to agent.generate options", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent, maxSteps: 25 });

    await runner.sendMessage("Hello");

    const [, opts] = mockCallArgs(agent.generate, 0);
    expect(opts.maxSteps).toBe(25);
  });

  test("defaults maxSteps to 50", async () => {
    const agent = makeMockAgent();
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    const [, opts] = mockCallArgs(agent.generate, 0);
    expect(opts.maxSteps).toBe(50);
  });

  test("passes onStepFinish callback to agent.generate options", async () => {
    const onStepFinish = mock(() => {});
    const agent = makeMockAgent(async (_msgs: MessageInput[], opts: GenerateOptions) => {
      opts.onStepFinish!({ toolResults: [] } as LLMStepResult);
      return { text: "OK", messages: [] };
    });
    const runner = new SessionRunner({ agent, onStepFinish });

    await runner.sendMessage("Hello");

    expect(onStepFinish).toHaveBeenCalledTimes(1);
  });

  test("passes onFinish callback to agent.generate options", async () => {
    const onFinish = mock(() => {});
    const agent = makeMockAgent(async (_msgs: MessageInput[], opts: GenerateOptions) => {
      opts.onFinish!({ text: "Done" } as Parameters<NonNullable<GenerateOptions["onFinish"]>>[0]);
      return { text: "Done", messages: [] };
    });
    const runner = new SessionRunner({ agent, onFinish });

    await runner.sendMessage("Hello");

    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  test("does not include onFinish in generate options when not provided", async () => {
    let capturedOpts: GenerateOptions | null = null;
    const agent = makeMockAgent(async (_msgs: MessageInput[], opts: GenerateOptions) => {
      capturedOpts = opts;
      return { text: "OK", messages: [] };
    });
    const runner = new SessionRunner({ agent });

    await runner.sendMessage("Hello");

    expect(capturedOpts!.onFinish).toBeUndefined();
  });

  test("module does not import I/O primitives", async () => {
    const source = await Bun.file(
      new URL("./session-runner.ts", import.meta.url).pathname,
    ).text();
    expect(source).not.toContain("readline");
    expect(source).not.toContain("node:stream");
    expect(source).not.toContain("Readable");
    expect(source).not.toContain("Writable");
    expect(source).not.toContain("process");
    expect(source).not.toContain("stdin");
    expect(source).not.toContain("stdout");
  });
});
