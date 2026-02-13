// Public API entry point
// Re-exports from all modules for external consumers

export { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
export { createWorkspace, type WorkspaceOptions } from "./workspace-factory";
export { createDiscoveryAgent, createResearchAgent, createPlanningAgent, createBuilderAgent, type DiscoveryAgentConfig, type ResearchAgentConfig, type PlanningAgentConfig, type BuilderAgentConfig } from "./agent-definitions";
export { SessionRunner, type SessionRunnerConfig, type OnFinishCallback, type StreamingResult } from "./session-runner";
export { runFixedCount, runUntilDone, type FixedCountConfig, type UntilDoneConfig } from "./loop-runner";
export { runJobPipeline, type JobPipelineDeps } from "./job-pipeline";
export { initEnvironment, type InitEnvironmentConfig, type Environment } from "./init-environment";
export { parseCliArgs, runConversation, type CliArgs, type ParseResult, type HelpResult, type Subcommand, type DiscoverArgs, type PlanArgs, type BuildArgs, type RunArgs, type ConversationDeps, type StreamingChunkCallback } from "./cli";
export { createMcpClient, buildMcpServerConfigs, validateTavilyApiKey, type McpServerConfigs } from "./mcp-client";
export { loadHooks } from "./hooks-loader";
export { runHooks, type HookResult, type HookSuccess, type HookFailure } from "./hook-executor";
export { handlePlan, handleBuild, handleRun, type HandlePlanDeps, type HandleBuildDeps, type HandleRunDeps } from "./handlers";
