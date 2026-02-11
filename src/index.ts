// Public API entry point
// Re-exports from all modules for external consumers

export { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
export { createTools, resolveSearchFn } from "./tool-factory";
export { createWorkspace, type WorkspaceOptions } from "./workspace-factory";
export { createDiscoveryAgent, createResearchAgent, createPlanningAgent, createBuilderAgent, type DiscoveryAgentConfig, type ResearchAgentConfig, type PlanningAgentConfig, type BuilderAgentConfig } from "./agent-definitions";
export { SessionRunner, type SessionRunnerConfig } from "./session-runner";
export { runFixedCount, runUntilDone, type FixedCountConfig, type UntilDoneConfig } from "./loop-runner";
export { runJobPipeline, type JobPipelineDeps } from "./job-pipeline";
export { parseCliArgs, runConversation, type CliArgs, type ConversationDeps } from "./cli";
export { loadHooks } from "./hooks-loader";
export { runHooks, type HookResult, type HookSuccess, type HookFailure } from "./hook-executor";
