// Public API entry point
// Re-exports from all modules for external consumers

export { DEFAULT_MODEL, getProviderFromModel, getApiKeyEnvVar, validateApiKey } from "./model-resolution";
export { createWorkspace, type WorkspaceOptions } from "./workspace-factory";
export { createDiscoveryAgent, createResearchAgent, type DiscoveryAgentConfig, type ResearchAgentConfig } from "./agent-definitions";
export { SessionRunner, type SessionRunnerConfig } from "./session-runner";
export { parseCliArgs, runConversation, type CliArgs, type ConversationDeps } from "./cli";
export { createMcpClient, buildMcpServerConfigs, validateTavilyApiKey, type McpServerConfigs } from "./mcp-client";
