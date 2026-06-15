import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import {
  registerAgentRuntimeAmbientCliPackageTools,
  type AgentRuntimeAmbientCliPackageToolOptions,
} from "./agentRuntimeAmbientCliPackageTools";
import {
  registerAmbientCliPackageUninstallTool,
} from "./agentRuntimeAmbientCliPackageUninstallTools";
import {
  registerAgentRuntimeAmbientWorkflowTools,
  type AgentRuntimeAmbientWorkflowToolOptions,
} from "./agentRuntimeAmbientWorkflowTools";
import {
  registerAgentRuntimeCapabilityBuilderTools,
  type AgentRuntimeCapabilityBuilderToolOptions,
} from "./agentRuntimeCapabilityBuilderTools";
import type { CapabilityBuilderPlanToolInput } from "./agentRuntimeCapabilityBuilderPlanTools";
import {
  registerAgentRuntimePiExtensionSandboxTools,
  type AgentRuntimePiExtensionSandboxEvent,
  type AgentRuntimePiExtensionSandboxPermissionRequest,
  type AgentRuntimePiExtensionSandboxToolOptions,
} from "./agentRuntimePiExtensionSandboxTools";
import {
  registerAgentRuntimePiPrivilegedTools,
  type AgentRuntimePiPrivilegedPermissionRequest,
  type AgentRuntimePiPrivilegedToolOptions,
} from "./agentRuntimePiPrivilegedTools";
import {
  registerAgentRuntimePluginInstallCoreTools,
  type AgentRuntimePluginInstallCoreToolOptions,
} from "./agentRuntimePluginInstallCoreTools";

export interface AgentRuntimePluginToolAssemblyOptions<TPlanInput extends CapabilityBuilderPlanToolInput> {
  pluginInstallCore: AgentRuntimePluginInstallCoreToolOptions;
  capabilityBuilder: AgentRuntimeCapabilityBuilderToolOptions<TPlanInput>;
  ambientCliPackages: AgentRuntimeAmbientCliPackageToolOptions;
  ambientWorkflows: AgentRuntimeAmbientWorkflowToolOptions;
  piPackages: AgentRuntimePiPackageToolOptions;
}

export interface AgentRuntimePiPackageToolOptions
  extends Omit<AgentRuntimePiExtensionSandboxToolOptions, "resolveFirstPartyPluginPermission" | "emit">,
    Omit<AgentRuntimePiPrivilegedToolOptions, "resolveFirstPartyPluginPermission" | "emit"> {
  resolveFirstPartyPluginPermission: (
    input: AgentRuntimePiExtensionSandboxPermissionRequest | AgentRuntimePiPrivilegedPermissionRequest,
  ) => Promise<boolean> | boolean;
  emit: (event: AgentRuntimePiExtensionSandboxEvent) => void;
}

export function createAgentRuntimePluginToolExtension<TPlanInput extends CapabilityBuilderPlanToolInput>(
  options: AgentRuntimePluginToolAssemblyOptions<TPlanInput>,
): ExtensionFactory {
  return (pi) => registerAgentRuntimePluginToolAssembly(pi, options);
}

export function registerAgentRuntimePluginToolAssembly<TPlanInput extends CapabilityBuilderPlanToolInput>(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimePluginToolAssemblyOptions<TPlanInput>,
): void {
  registerAgentRuntimePluginInstallCoreTools(pi, options.pluginInstallCore);
  registerAgentRuntimeCapabilityBuilderTools(pi, options.capabilityBuilder);
  registerAgentRuntimeAmbientCliPackageTools(pi, options.ambientCliPackages);
  registerAgentRuntimeAmbientWorkflowTools(pi, options.ambientWorkflows);
  registerAgentRuntimePiExtensionSandboxTools(pi, options.piPackages);
  registerAgentRuntimePiPrivilegedTools(pi, options.piPackages);
  registerAmbientCliPackageUninstallTool(pi, options.ambientCliPackages);
}
