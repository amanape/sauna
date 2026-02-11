# Agent Definitions

## What This Component Does

Factory functions that create the planning and builder Mastra agents. These follow the same pattern as the existing `createDiscoveryAgent()` and `createResearchAgent()` — accepting configuration, wiring up tools and workspace, and returning configured `Agent` instances.

## Requirements

### Planning Agent

- A `createPlanningAgent()` factory function must exist, returning a Mastra `Agent`
- The agent must use the existing `.sauna/prompts/plan.md` as its system prompt
- The system prompt must have `${JOB_ID}` substituted with the actual job slug at creation time
- The agent must receive shared MCP tools (web search, documentation lookup) and workspace access
- The agent must receive the shared researcher sub-agent (see Shared Researcher below)
- The agent must have full filesystem read/write access (no output constraint)

### Builder Agent

- A `createBuilderAgent()` factory function must exist, returning a Mastra `Agent`
- The agent must use the existing `.sauna/prompts/build.md` as its system prompt
- The system prompt must have `${JOB_ID}` substituted with the actual job slug at creation time
- The agent must receive shared MCP tools and workspace access
- The agent must receive the shared researcher sub-agent (see Shared Researcher below)
- The agent must have full filesystem read/write access
- The agent must have access to shell execution (for running tests, type-checking, git operations) via the workspace sandbox

### Shared Researcher

- The existing `createResearchAgent()` must be a shared utility used by all agents (discovery, planner, builder) — not duplicated per agent
- Each agent factory must accept the researcher as a parameter rather than creating its own
- The researcher agent handles codebase exploration, file reading, and code searching on behalf of the parent agent

### Workspace Simplification

- `OutputConstrainedFilesystem` must be removed from the codebase (source and tests)
- `createWorkspace()` must no longer wrap the filesystem with output constraints
- All agents (including discovery) use `LocalFilesystem` directly with full codebase access

## Constraints

- Must follow the existing agent factory pattern (injectable config, returns `Agent`)
- Must not modify the content of `plan.md` or `build.md` prompts
- Agent IDs must be distinct (e.g., `"planner"`, `"builder"`)
