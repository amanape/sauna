import { test, expect, describe } from "bun:test";
import { createPlanningAgent, type PlanningAgentConfig } from "./agent-definitions";
import { createTools } from "./tool-factory";
import { createWorkspace } from "./workspace-factory";
import { Agent } from "@mastra/core/agent";

function makeConfig(overrides?: Partial<PlanningAgentConfig>): PlanningAgentConfig {
  const workspace = createWorkspace(import.meta.dirname);
  const tools = createTools({ workspace });
  const researcher = new Agent({
    id: "researcher",
    name: "researcher",
    instructions: "stub",
    model: "openai:gpt-4o",
    tools,
    workspace,
  });
  return {
    tools,
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
