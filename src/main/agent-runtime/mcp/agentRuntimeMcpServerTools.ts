import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";

import type {
  AmbientPermissionGrant,
  PermissionGrantScopeKind,
  PermissionRisk,
} from "../../../shared/permissionTypes";
import type { DesktopEvent } from "../../../shared/desktopTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  createMcpAutowireCandidateRefStore,
  createMcpAutowirePiToolDefinitions,
  createMcpAutowirePlanRevisionStore,
} from "../agentRuntimeMcpAutowireFacade";
import { createMcpServerPiToolDefinitions } from "../agentRuntimeMcpFacade";
import { createMcpToolBridgePiToolDefinitions } from "../agentRuntimeMcpFacade";
import { evaluateMcpInstallGate, mcpDefaultCapabilityStatePathForUserData } from "../agentRuntimeMcpFacade";
import type { McpInstallCatalog } from "../agentRuntimeMcpFacade";
import { planMcpPermissionPromptGrant } from "../agentRuntimeMcpFacade";
import type { McpToolBridge } from "../agentRuntimeMcpFacade";
import type { ToolHiveRuntimeService } from "../agentRuntimeToolRuntimeFacade";

export interface AgentRuntimeMcpRuntime {
  mcpUserDataPath: string;
  toolHive: ToolHiveRuntimeService;
  catalog: McpInstallCatalog;
  bridge: McpToolBridge;
}

export interface AgentRuntimeMcpPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface AgentRuntimeMcpServerToolsOptions {
  threadId: string;
  workspace: WorkspaceState;
  model: Model<"openai-completions">;
  apiKey?: string;
  mcpAppVersion?: string;
  getCurrentThread: () => ThreadSummary;
  getThread: (threadId: string) => ThreadSummary;
  createMcpRuntime: (workspace: WorkspaceState) => AgentRuntimeMcpRuntime | undefined;
  listPermissionGrants: () => AmbientPermissionGrant[];
  recordMcpAutowirePlan: () => void;
  resolveFirstPartyPluginPermission: (input: AgentRuntimeMcpPermissionRequest) => Promise<boolean> | boolean;
  emit: (event: DesktopEvent) => void;
}

export function registerAgentRuntimeMcpServerTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AgentRuntimeMcpServerToolsOptions,
): void {
  for (const tool of createAgentRuntimeMcpServerToolDefinitions(options)) {
    pi.registerTool(tool);
  }
}

export function createAgentRuntimeMcpServerToolDefinitions(
  options: AgentRuntimeMcpServerToolsOptions,
): ToolDefinition<any, any, any>[] {
  const { apiKey, model, threadId, workspace } = options;
  const threadContext = () => {
    const thread = options.getCurrentThread();
    return {
      id: thread.id,
      collaborationMode: thread.collaborationMode,
      permissionMode: thread.permissionMode,
    };
  };
  const mcpCandidateRefs = createMcpAutowireCandidateRefStore({
    storagePath: join(workspace.statePath, "mcp", "autowire-candidates", `${safeMcpAutowireThreadSegment(threadId)}.json`),
  });
  const mcpPlanRevisions = createMcpAutowirePlanRevisionStore({
    storagePath: join(workspace.statePath, "mcp", "autowire-plan-revisions.json"),
  });
  const mcpRuntime = options.createMcpRuntime(workspace);
  const autowireTools = createMcpAutowirePiToolDefinitions({
    apiKey,
    model,
    getThread: threadContext,
    workspace,
    candidateRefs: mcpCandidateRefs,
    planRevisions: mcpPlanRevisions,
    onPlanResult: options.recordMcpAutowirePlan,
    authorizePlanEdit: ({ thread, preview, detail }) =>
      options.resolveFirstPartyPluginPermission({
        thread: options.getThread(thread.id),
        workspace,
        toolName: "ambient_mcp_autowire_plan_edit_apply",
        title: `Apply MCP Autowire plan edit for "${preview.originalCandidate.displayName}"?`,
        message:
          "Ambient wants to record a typed MCP Autowire plan edit. This changes the reviewed candidate used for future install/reinstall attempts, but does not directly mutate ToolHive workloads or raw permission profile files.",
        detail,
        grantTargetLabel: `Edit MCP Autowire plan ${preview.originalCandidate.id}`,
        grantTargetIdentity: [
          "ambient_mcp_autowire_plan_edit_apply",
          preview.originalCandidate.id,
          preview.originalCandidateHash,
          preview.operations.map((operation) => operation.op).join(","),
        ].join("\0"),
        requireFreshPrompt: true,
        allowedReason: "MCP Autowire plan edit approved by Ambient permission grant policy.",
        deniedReason: "MCP Autowire plan edit prompt denied or timed out.",
      }),
    sourceBuildUserDataPath: mcpRuntime?.mcpUserDataPath,
  });
  if (!mcpRuntime) {
    return autowireTools;
  }

  const { mcpUserDataPath, toolHive, catalog, bridge } = mcpRuntime;
  return [
    ...autowireTools,
    ...createMcpServerPiToolDefinitions({
      catalog,
      toolHive,
      getThread: threadContext,
      workspace,
      resolveCandidateRef: (candidateRef) => mcpCandidateRefs.getReviewed(candidateRef),
      putCandidateRef: (candidate, candidateHash) => mcpCandidateRefs.put(candidate, candidateHash, "planned"),
      planRevisions: mcpPlanRevisions,
      installGate: () => evaluateMcpInstallGate({
        toolHive,
        catalog,
        defaultCapabilityStatePath: mcpDefaultCapabilityStatePathForUserData(mcpUserDataPath),
        appVersion: options.mcpAppVersion ?? "unknown",
      }),
      onContainerRuntimeSetupNeeded: ({ capabilityId, reason }) => {
        options.emit({
          type: "mcp-container-runtime-setup-needed",
          ...(capabilityId ? { capabilityId } : {}),
          reason,
        });
      },
      requestMcpSecret: ({ serverId, candidateId, candidateRef, displayName, envName }) => {
        options.emit({
          type: "ambient-cli-secret-requested",
          packageName: displayName ?? serverId ?? candidateId ?? candidateRef ?? "MCP server",
          envName,
          ...(serverId ? { mcpServerId: serverId } : {}),
          ...(candidateId ? { mcpCandidateId: candidateId } : {}),
          ...(candidateRef ? { mcpCandidateRef: candidateRef } : {}),
        });
      },
      authorizeRuntimeRepair: ({ thread, preview, detail }) =>
        options.resolveFirstPartyPluginPermission({
          thread: options.getThread(thread.id),
          workspace,
          toolName: "ambient_mcp_runtime_repair_apply",
          title: preview.serverId
            ? `Apply MCP runtime repair for "${preview.serverId}"?`
            : "Apply MCP runtime repair?",
          message:
            "Ambient wants to record typed MCP Autowire repair edits derived from runtime diagnostics. This does not directly edit ToolHive profiles; it creates a reviewed candidate revision for the normal install/reinstall path.",
          detail,
          grantTargetLabel: `Repair MCP runtime ${preview.serverId ?? preview.candidateRef ?? "candidate"}`,
          grantTargetIdentity: [
            "ambient_mcp_runtime_repair_apply",
            preview.serverId ?? "",
            preview.workloadName ?? "",
            preview.candidateRef ?? "",
            preview.operations.map((operation) => operation.op).join(","),
          ].join("\0"),
          requireFreshPrompt: true,
          allowedReason: "MCP runtime repair approved by Ambient permission grant policy.",
          deniedReason: "MCP runtime repair prompt denied or timed out.",
        }),
      authorizeInstall: ({ thread, preview, detail }) => {
        const isDefaultCapability = "capabilityId" in preview;
        const installToolName = preview.catalogSource === "standard-mcp-import"
          ? "ambient_mcp_standard_import_install"
          : preview.catalogSource === "remote-mcp-proxy"
            ? "ambient_mcp_remote_proxy_install"
            : "ambient_mcp_server_install";
        const installRuntimeLabel = isDefaultCapability
          ? "this Ambient default MCP capability"
          : preview.catalogSource === "standard-mcp-import"
          ? "this ToolHive Standard MCP import"
          : preview.catalogSource === "remote-mcp-proxy"
            ? "this ToolHive Remote MCP proxy"
            : "this ToolHive registry MCP server";
        return options.resolveFirstPartyPluginPermission({
          thread: options.getThread(thread.id),
          workspace,
          toolName: installToolName,
          title: `Install MCP server "${preview.candidate.displayName}"?`,
          message:
            `Ambient wants to install and start ${installRuntimeLabel} in the Ambient ToolHive group. Tool-level use remains a separate reviewed MCP bridge step.`,
          detail,
          grantTargetLabel: `Install MCP server ${preview.candidate.displayName}`,
          grantTargetIdentity: [installToolName, preview.serverId, preview.runPlan?.workloadName ?? ""].join("\0"),
          requireFreshPrompt: true,
          allowedReason: "MCP server install approved by Ambient permission grant policy.",
          deniedReason: "MCP server install prompt denied or timed out.",
        });
      },
      authorizeUninstall: ({ thread, server, detail }) =>
        options.resolveFirstPartyPluginPermission({
          thread: options.getThread(thread.id),
          workspace,
          toolName: "ambient_mcp_server_uninstall",
          title: `Remove MCP server "${server.serverId}"?`,
          message:
            "Ambient wants to stop and remove this Ambient-managed ToolHive MCP workload. Secrets are not deleted by this action.",
          detail,
          grantTargetLabel: `Remove MCP server ${server.serverId}`,
          grantTargetIdentity: ["ambient_mcp_server_uninstall", server.serverId, server.workloadName].join("\0"),
          requireFreshPrompt: true,
          allowedReason: "MCP server uninstall approved by Ambient permission grant policy.",
          deniedReason: "MCP server uninstall prompt denied or timed out.",
        }),
      authorizeGuidedLocalBridgePreflight: ({ thread, preview, detail }) =>
        options.resolveFirstPartyPluginPermission({
          thread: options.getThread(thread.id),
          workspace,
          toolName: "ambient_mcp_guided_bridge_preflight",
          title: `Check local MCP bridge for "${preview.candidate.displayName}"?`,
          message:
            "Ambient wants to perform a bounded loopback-only preflight for this user-guided MCP bridge. It will not install, launch, modify, or stop local software and will not call MCP tools.",
          detail,
          grantTargetLabel: `Check local MCP bridge ${preview.candidate.displayName}`,
          grantTargetIdentity: [
            "ambient_mcp_guided_bridge_preflight",
            preview.serverId,
            preview.bridge.bridgeProbeUrl,
            preview.bridge.upstreamAppUrl ?? "",
          ].join("\0"),
          allowedReason: "MCP guided local bridge preflight approved by Ambient permission grant policy.",
          deniedReason: "MCP guided local bridge preflight prompt denied or timed out.",
        }),
      authorizeGuidedLocalBridgeRegister: ({ thread, preview, detail }) =>
        options.resolveFirstPartyPluginPermission({
          thread: options.getThread(thread.id),
          workspace,
          toolName: "ambient_mcp_guided_bridge_register",
          title: `Register local MCP bridge for "${preview.candidate.displayName}"?`,
          message:
            "Ambient wants to register this already-running user-guided local MCP bridge in global MCP state and perform harmless tool descriptor discovery. It will not install, launch, modify, or stop local software.",
          detail,
          grantTargetLabel: `Register local MCP bridge ${preview.candidate.displayName}`,
          grantTargetIdentity: [
            "ambient_mcp_guided_bridge_register",
            preview.serverId,
            preview.bridge.bridgeProbeUrl,
            preview.bridge.upstreamAppUrl ?? "",
          ].join("\0"),
          requireFreshPrompt: true,
          allowedReason: "MCP guided local bridge registration approved by Ambient permission grant policy.",
          deniedReason: "MCP guided local bridge registration prompt denied or timed out.",
        }),
    }),
    ...createMcpToolBridgePiToolDefinitions({
      bridge,
      getThread: threadContext,
      workspace,
      authorizeCall: ({ thread, descriptor, permission, runtimeEnforcement, detail }) => {
        const promptGrant = planMcpPermissionPromptGrant({
          evaluation: permission,
          existingGrants: options.listPermissionGrants(),
          context: {
            threadId: thread.id,
            projectPath: workspace.path,
            workspacePath: workspace.path,
          },
          runtime: {
            publicWebEgressGrantEnforced: runtimeEnforcement.publicWebEgressGrantEnforced,
            reusableScopeLimit: runtimeEnforcement.reusableScopeLimit,
          },
        });
        return options.resolveFirstPartyPluginPermission({
          thread: options.getThread(thread.id),
          workspace,
          toolName: "ambient_mcp_tool_call",
          title: `Call MCP tool "${descriptor.name}"?`,
          message:
            "Ambient wants to call this installed ToolHive-managed MCP tool through the compact MCP bridge. Arguments are schema-validated before execution and large outputs are materialized in the current workspace.",
          detail: promptGrant.detailText ? `${detail}\n${promptGrant.detailText}` : detail,
          reusableScopes: promptGrant.reusableScopes,
          grantTargetLabel: promptGrant.grantTargetLabel,
          grantTargetIdentity: promptGrant.grantTargetIdentity,
          grantConditions: promptGrant.grantConditions,
          allowedReason: "MCP tool call approved by Ambient permission grant policy.",
          deniedReason: "MCP tool call prompt denied or timed out.",
        });
      },
      authorizeReviewAccept: ({ thread, review, detail }) =>
        options.resolveFirstPartyPluginPermission({
          thread: options.getThread(thread.id),
          workspace,
          toolName: "ambient_mcp_tool_review_accept",
          title: `Trust MCP tool descriptors for "${review.server.serverId}"?`,
          message:
            "Ambient wants to mark the current ToolHive MCP tool descriptor snapshot trusted. This clears descriptor drift for this installed server but does not call any downstream tool.",
          detail,
          grantTargetLabel: `Trust MCP tool descriptors ${review.server.serverId}`,
          grantTargetIdentity: ["ambient_mcp_tool_review_accept", review.server.serverId, review.server.workloadName, review.descriptorHash ?? ""].join("\0"),
          requireFreshPrompt: true,
          allowedReason: "MCP tool descriptor review accepted by Ambient permission grant policy.",
          deniedReason: "MCP tool descriptor review prompt denied or timed out.",
        }),
    }),
  ];
}

function safeMcpAutowireThreadSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "thread";
}
