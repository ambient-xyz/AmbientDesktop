import { join } from "node:path";
import { containerRuntimeProbeSummary, probeContainerRuntime, type ContainerRuntimeProbeResult } from "./mcpContainerRuntimeFacade";
import { loadDefaultMcpCatalog, type McpDefaultCatalogDescriptor } from "./mcpDefaultCatalog";
import { reconcileMcpDefaultCapabilities, type McpDefaultCapabilitySummary } from "./mcpDefaultCapabilityReconciler";
import type { McpInstallCatalog, McpInstalledServerSummary } from "./mcpInstallCatalog";
import type { ToolHiveRuntimeService } from "./mcpToolRuntimeFacade";

export type McpInstallGateStatus =
  | "ready"
  | "runtime-preflight-failed";

export interface McpInstallGateResult {
  status: McpInstallGateStatus;
  message: string;
  runtimeProbe: ContainerRuntimeProbeResult;
  defaultCapabilities: McpDefaultCapabilitySummary[];
  pendingDefaultCapabilities?: McpDefaultCapabilitySummary[];
  installedServers?: McpInstalledServerSummary[];
  installedServerListError?: string;
}

export interface EvaluateMcpInstallGateOptions {
  toolHive: ToolHiveRuntimeService;
  catalog: McpInstallCatalog;
  defaultCapabilityStatePath: string;
  appVersion: string;
  defaultCatalog?: readonly McpDefaultCatalogDescriptor[];
  containerRuntimeProbe?: () => Promise<ContainerRuntimeProbeResult>;
}

export async function evaluateMcpInstallGate(options: EvaluateMcpInstallGateOptions): Promise<McpInstallGateResult> {
  const runtimeProbe = options.containerRuntimeProbe
    ? await options.containerRuntimeProbe()
    : await probeContainerRuntime({ toolHive: options.toolHive });
  let installedServers: McpInstalledServerSummary[] = [];
  let installedServerListError: string | undefined;
  try {
    installedServers = await options.catalog.listInstalledServers();
  } catch (error) {
    installedServerListError = errorMessage(error);
  }

  const defaultCapabilities = await reconcileMcpDefaultCapabilities({
    statePath: options.defaultCapabilityStatePath,
    runtime: runtimeProbe,
    defaultCatalog: options.defaultCatalog ?? loadDefaultMcpCatalog(),
    installedServers,
    appVersion: options.appVersion,
  });

  if (runtimeProbe.status !== "ready" || !runtimeProbe.toolHive.preflight) {
    return {
      status: "runtime-preflight-failed",
      message: [
        "Custom MCP plugin installs are blocked because the isolated container runtime is not ready.",
        "",
        containerRuntimeProbeSummary(runtimeProbe),
        "",
        "Next: complete the isolated runtime setup from Ambient's MCP Runtime & Web Research settings, then retry the MCP install.",
        "Do not use shell, Docker, Podman, or ToolHive commands to repair this unless the user explicitly asks for manual diagnostics.",
      ].join("\n"),
      runtimeProbe,
      defaultCapabilities,
      ...(installedServers.length ? { installedServers } : {}),
      ...(installedServerListError ? { installedServerListError } : {}),
    };
  }

  const pendingDefaultCapabilities = defaultCapabilities.filter((capability) => capability.status !== "installed");

  return {
    status: "ready",
    message: pendingDefaultCapabilities.length
      ? [
          "Isolated MCP runtime is ready for custom MCP plugin installs.",
          "Default capability setup is pending, but it is not required for this install.",
        ].join(" ")
      : "Isolated MCP runtime is ready for custom MCP plugin installs.",
    runtimeProbe,
    defaultCapabilities,
    ...(pendingDefaultCapabilities.length ? { pendingDefaultCapabilities } : {}),
    ...(installedServers.length ? { installedServers } : {}),
    ...(installedServerListError ? { installedServerListError } : {}),
  };
}

export function mcpDefaultCapabilityStatePathForUserData(userDataPath: string): string {
  return join(userDataPath, "mcp-container-runtime", "default-capabilities.json");
}

export function mcpInstallGateSummary(gate: McpInstallGateResult): string {
  const pendingCapabilityLines = gate.pendingDefaultCapabilities?.map((capability) =>
    `- ${capability.title}: ${capability.status}; next=${defaultCapabilityRepairAction(capability)}; workload=${capability.workloadName}`
  ) ?? [];
  if (gate.status === "ready") {
    return [
      gate.message,
      pendingCapabilityLines.length ? "\nDefault capability diagnostics (non-blocking):" : undefined,
      ...pendingCapabilityLines,
      gate.installedServerListError ? `\nInstalled server state warning: ${gate.installedServerListError}` : undefined,
    ].filter((line) => line !== undefined).join("\n");
  }
  const capabilityLines = gate.defaultCapabilities.map((capability) =>
    `- ${capability.title}: ${capability.status}; next=${defaultCapabilityRepairAction(capability)}; workload=${capability.workloadName}`
  );
  return [
    gate.message,
    capabilityLines.length ? "\nDefault capabilities:" : undefined,
    ...capabilityLines,
    gate.installedServerListError ? `\nInstalled server state warning: ${gate.installedServerListError}` : undefined,
  ].filter((line) => line !== undefined).join("\n");
}

function defaultCapabilityRepairAction(capability: McpDefaultCapabilitySummary): string {
  if (capability.nextAction === "install-runtime") return "complete the isolated container runtime setup, then retry the MCP install.";
  if (capability.nextAction === "approve-default-capability") {
    return capability.serverId
      ? `call ambient_mcp_server_describe with serverId=${capability.serverId}, then ambient_mcp_server_install with serverId=${capability.serverId} after approval`
      : "approve the Ambient default capability install from MCP settings";
  }
  if (capability.nextAction === "install-default-capability") {
    return capability.serverId
      ? `call ambient_mcp_server_install with serverId=${capability.serverId} to repair the managed default capability state`
      : "rerun the Ambient default capability install from MCP settings";
  }
  if (capability.nextAction === "review-descriptor") {
    return capability.serverId
      ? `call ambient_mcp_server_default_update_describe with serverId=${capability.serverId}, then reinstall through ambient_mcp_server_install if the review is accepted`
      : "review the default capability descriptor before reinstalling";
  }
  if (capability.nextAction === "inspect-failure") return "call ambient_mcp_server_list and ambient_mcp_server_diagnostics for the managed default capability state.";
  return "continue the original MCP install; default capability setup is tracked separately";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
