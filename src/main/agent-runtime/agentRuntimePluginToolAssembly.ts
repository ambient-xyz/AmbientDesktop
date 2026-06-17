import type { ExtensionAPI, ExtensionFactory } from "@mariozechner/pi-coding-agent";

import {
  registerAgentRuntimeAmbientCliPackageTools,
  type AgentRuntimeAmbientCliPackageToolOptions,
} from "./ambient-cli-package/agentRuntimeAmbientCliPackageTools";
import {
  registerAmbientCliPackageUninstallTool,
} from "./ambient-cli-package/agentRuntimeAmbientCliPackageUninstallTools";
import {
  registerAgentRuntimePiExtensionSandboxTools,
  type AgentRuntimePiExtensionSandboxEvent,
  type AgentRuntimePiExtensionSandboxPermissionRequest,
  type AgentRuntimePiExtensionSandboxToolOptions,
} from "./pi-package-tools/agentRuntimePiExtensionSandboxTools";
import {
  registerAgentRuntimePiPrivilegedTools,
  type AgentRuntimePiPrivilegedPermissionRequest,
  type AgentRuntimePiPrivilegedToolOptions,
} from "./pi-package-tools/agentRuntimePiPrivilegedTools";
import {
  registerAgentRuntimeAmbientWorkflowTools,
  type AgentRuntimeAmbientWorkflowToolOptions,
} from "./ambient-workflow/agentRuntimeAmbientWorkflowTools";
import {
  registerAgentRuntimeCapabilityBuilderTools,
  type AgentRuntimeCapabilityBuilderToolOptions,
} from "../capability-builder/agentRuntimeCapabilityBuilderTools";
import type { CapabilityBuilderPlanToolInput } from "../capability-builder/agentRuntimeCapabilityBuilderPlanTools";
import {
  registerAgentRuntimePluginInstallCoreTools,
  type AgentRuntimePluginInstallCoreToolOptions,
} from "../plugins/runtime-tools/agentRuntimePluginInstallCoreTools";

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
