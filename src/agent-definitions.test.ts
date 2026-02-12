import { test, expect, describe } from "bun:test";
import { createPlanningAgent, createBuilderAgent, type PlanningAgentConfig, type BuilderAgentConfig } from "./agent-definitions";
import { createResearchAgent } from "./agent-definitions";
import { createWorkspace } from "./workspace-factory";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import * as z from "zod";

/** Stub MCP tools record matching ToolsInput for agent definition tests */
const stubMcpTools = {
  tavily_web_search: createTool({
    id: "tavily_web_search",
    description: "Search the web",
    inputSchema: z.object({ query: z.string() }),
    async execute({ query }) { return `results for ${query}`; },
  }),
  context7_lookup: createTool({
    id: "context7_lookup",
    description: "Look up library documentation",
    inputSchema: z.object({ library: z.string() }),
    async execute({ library }) { return `docs for ${library}`; },
  }),
};

function makeBuilderConfig(overrides?: Partial<BuilderAgentConfig>): BuilderAgentConfig {
  const workspace = createWorkspace(import.meta.dirname);
  const researcher = createResearchAgent({ tools: stubMcpTools, workspace });
  return {
    tools: stubMcpTools,
    workspace,
    researcher,
    jobId: "my-job",
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<PlanningAgentConfig>): PlanningAgentConfig {
  const workspace = createWorkspace(import.meta.dirname);
  const researcher = createResearchAgent({ tools: stubMcpTools, workspace });
  return {
    tools: stubMcpTools,
    workspace,
    researcher,
    jobId: "my-job",
    ...overrides,
  };
}

describe("createPlanningAgent", () => {
  test("returns an Agent with id 'planner'", async () => {
    const agent = await createPlanningAgent(makeConfig());
    expect(agent).toBeInstanceOf(Agent);
    expect(agent.id).toBe("planner");
    expect(agent.name).toBe("planner");
  });

  test("substitutes ${JOB_ID} in the system prompt with jobId", async () => {
    const agent = await createPlanningAgent(makeConfig({ jobId: "test-job-42" }));
    const instructions = await agent.getInstructions({});
    expect(instructions).toContain(".sauna/jobs/test-job-42/");
    expect(instructions).not.toContain("${JOB_ID}");
  });

  test("injects the researcher as a sub-agent", async () => {
    const config = makeConfig();
    const agent = await createPlanningAgent(config);
    const agents = await agent.listAgents({});
    expect(agents).toHaveProperty("researcher");
    expect(agents.researcher).toBe(config.researcher);
  });
});

describe("createBuilderAgent", () => {
  test("returns an Agent with id 'builder'", async () => {
    const agent = await createBuilderAgent(makeBuilderConfig());
    expect(agent).toBeInstanceOf(Agent);
    expect(agent.id).toBe("builder");
    expect(agent.name).toBe("builder");
  });

  test("substitutes ${JOB_ID} in the system prompt with jobId", async () => {
    const agent = await createBuilderAgent(makeBuilderConfig({ jobId: "test-job-42" }));
    const instructions = await agent.getInstructions({});
    expect(instructions).toContain(".sauna/jobs/test-job-42/");
    expect(instructions).not.toContain("${JOB_ID}");
  });

  test("injects the researcher as a sub-agent", async () => {
    const config = makeBuilderConfig();
    const agent = await createBuilderAgent(config);
    const agents = await agent.listAgents({});
    expect(agents).toHaveProperty("researcher");
    expect(agents.researcher).toBe(config.researcher);
  });
});
