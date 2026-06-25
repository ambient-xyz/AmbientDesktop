import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import type { McpInstalledServerSummary } from "./mcpInstallCatalog";
import { objectInput, optionalString, selectInstalledServer, toolResult, type McpServerPiToolDefinition } from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions, McpServerPiToolWorkspace } from "./mcpServerPiToolTypes";
import type { ToolHiveCommandResult } from "./mcpToolRuntimeFacade";

export function createMcpServerUninstallPiToolDefinition(options: McpServerPiToolOptions): McpServerPiToolDefinition {
  const uninstall = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_uninstall"));
  return {
    ...uninstall,
    parameters: uninstall.parameters as McpServerPiToolDefinition["parameters"],
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("MCP server uninstall is blocked in Planner Mode.");
      const input = objectInput(params);
      const serverId = optionalString(input.serverId);
      const workloadName = optionalString(input.workloadName);
      if (!serverId && !workloadName) throw new Error("serverId or workloadName is required.");

      const servers = await options.catalog.listInstalledServers();
      const selected = selectInstalledServer(servers, { serverId, workloadName });
      const detail = mcpServerUninstallApprovalDetail({ server: selected, workspace: options.workspace });
      const allowed = await (options.authorizeUninstall?.({ thread, workspace: options.workspace, server: selected, detail }) ?? true);
      if (!allowed) throw new Error("MCP server uninstall blocked by Ambient Desktop approval prompt.");

      onUpdate?.({
        content: [
          {
            type: "text",
            text:
              selected.runtimeLane === "guided-local-bridge" || selected.registrySource === "guided-local-bridge"
                ? `Removing guided local bridge registration ${selected.serverId} (${selected.workloadName}).`
                : `Removing MCP server ${selected.serverId} (${selected.workloadName}) through ToolHive.`,
          },
        ],
        details: {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_uninstall",
          status: "removing",
          serverId: selected.serverId,
          workloadName: selected.workloadName,
        },
      });

      if (selected.runtimeLane === "guided-local-bridge" || selected.registrySource === "guided-local-bridge") {
        await options.toolHive.removeInstalledServerState(selected.workloadName);
        return toolResult(mcpGuidedLocalBridgeUnregisterResultText(selected), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_uninstall",
          status: "removed",
          serverId: selected.serverId,
          workloadName: selected.workloadName,
          guidedLocalBridge: true,
        });
      }

      let stopResult: ToolHiveCommandResult | undefined;
      const workloadStatus = selected.workloadStatus?.toLowerCase();
      if (workloadStatus !== "stopped" && workloadStatus !== "exited") {
        stopResult = await options.toolHive.stopWorkload(selected.workloadName, 30);
      }
      const removeResult = await options.toolHive.removeWorkload(selected.workloadName);
      return toolResult(mcpServerUninstallResultText(selected, { stopResult, removeResult }), {
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_server_uninstall",
        status: "removed",
        serverId: selected.serverId,
        workloadName: selected.workloadName,
        stopExitCode: stopResult?.exitCode,
        removeExitCode: removeResult.exitCode,
        durationMs: (stopResult?.durationMs ?? 0) + removeResult.durationMs,
      });
    },
  };
}

export function mcpServerUninstallApprovalDetail(input: {
  server: McpInstalledServerSummary;
  workspace: McpServerPiToolWorkspace;
}): string {
  const guidedLocalBridge = input.server.runtimeLane === "guided-local-bridge" || input.server.registrySource === "guided-local-bridge";
  return [
    `Remove Ambient MCP server ${input.server.serverId}?`,
    "",
    "Removal context:",
    `- Workspace: ${input.workspace.path}`,
    `- Workload: ${input.server.workloadName}`,
    `- Runtime status: ${input.server.workloadStatus ?? "unknown"}`,
    input.server.endpoint ? `- Endpoint: ${input.server.endpoint}` : undefined,
    `- Permission profile: ${input.server.permissionProfilePath}`,
    guidedLocalBridge
      ? "- Action: remove Ambient global MCP registration state only. Ambient will not stop, modify, or uninstall the user-run local software."
      : "- Action: stop the ToolHive workload when running, then remove the ToolHive workload and Ambient installed-server state.",
    "- Secrets: no secret values are displayed or deleted by this action.",
  ]
    .filter(Boolean)
    .join("\n");
}

function mcpServerUninstallResultText(
  server: McpInstalledServerSummary,
  results: { stopResult?: ToolHiveCommandResult; removeResult: ToolHiveCommandResult },
): string {
  return [
    `Removed MCP server ${server.serverId}.`,
    `Workload: ${server.workloadName}`,
    results.stopResult
      ? `Stop command exit code: ${results.stopResult.exitCode}`
      : "Stop command: skipped because workload was reported stopped.",
    `Remove command exit code: ${results.removeResult.exitCode}`,
  ].join("\n");
}

function mcpGuidedLocalBridgeUnregisterResultText(server: McpInstalledServerSummary): string {
  return [
    `Removed guided local bridge registration ${server.serverId}.`,
    `Workload: ${server.workloadName}`,
    "Action: removed Ambient global MCP state only.",
    "Local software was not stopped, modified, or uninstalled.",
  ].join("\n");
}
