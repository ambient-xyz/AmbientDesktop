export { AmbientPluginHost } from "./pluginHost";
export type {
  AmbientPluginMcpOptions,
  PluginMcpLaunchPlan,
  PluginMcpRuntimeSnapshot,
  PluginMcpToolInvocation,
  PluginMcpToolInvocationResult,
  PluginMcpToolRegistration,
} from "./pluginHost";

export {
  discoverAgentRuntimeSkillPaths,
  pluginStateReaderFromStore,
} from "./runtime-tools/agentRuntimePluginDiscovery";
export type { AgentRuntimePluginDiscoveryStore } from "./runtime-tools/agentRuntimePluginDiscovery";
export {
  createPluginMcpToolExtension,
} from "./runtime-tools/agentRuntimePluginMcpTools";
export type { PluginMcpToolExtensionOptions } from "./runtime-tools/agentRuntimePluginMcpTools";
export {
  ensurePluginMcpToolTrusted,
} from "./runtime-tools/agentRuntimePluginMcpTrust";
export type {
  EnsurePluginMcpToolTrustedInput,
  EnsurePluginMcpToolTrustedOptions,
  PluginMcpTrustPermissionRequest,
  PluginMcpTrustedPermissionAuditInput,
  ResolvePluginMcpTrustPermissionInput,
} from "./runtime-tools/agentRuntimePluginMcpTrust";
