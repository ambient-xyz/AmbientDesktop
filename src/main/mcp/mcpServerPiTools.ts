import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { containerRuntimeProbeSummary, probeContainerRuntime, type ContainerRuntimeProbeResult } from "./mcpContainerRuntimeFacade";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "../desktop-tools/desktopToolRegistry";
import {
  mcpGuidedLocalBridgeInstallReviewState,
  mcpGuidedLocalBridgePermissionProfile,
  mcpGuidedLocalBridgePreflightText,
  mcpGuidedLocalBridgePreviewText,
  mcpGuidedLocalBridgeSourceIdentity,
  mcpGuidedLocalBridgeWorkloadName,
  previewGuidedLocalBridge,
  runGuidedLocalBridgePreflight,
  type McpGuidedLocalBridgePreview,
} from "./mcpGuidedLocalBridge";
import { McpToolBridge, mcpToolDescriptorReviewText, type FetchLike, type McpToolDescriptor } from "./mcpToolBridge";
import {
  McpInstallCatalog,
  mcpDefaultCatalogUpdatePreviewText,
  mcpDefaultCapabilityInstallPreviewText,
  mcpInstallPreviewText,
  mcpInstallPreviewReviewState,
  mcpInstallPreviewSecretBindings,
  mcpInstallPreviewSourceIdentity,
  mcpInstalledServersText,
  mcpRemoteMcpProxyPreviewText,
  mcpRegistryInstallPreviewText,
  mcpServerSearchResultsText,
  type McpSecretBinding,
  type McpDefaultCapabilityInstallPreview,
  type McpInstalledServerSummary,
  type McpInstallPreview,
  type McpRemoteMcpProxyPreview,
  type McpRegistryInstallPreview,
  type McpStandardImportPreview,
} from "./mcpInstallCatalog";
import { mcpInstallGateSummary, type McpInstallGateResult } from "./mcpInstallGate";
import { mcpDefaultCatalogDescriptorHash } from "./mcpDefaultCatalog";
import type { ContainerRuntimeImagePullResult, PullContainerRuntimeImageInput } from "./mcpContainerRuntimeFacade";
import type { OciImageResolution } from "./mcpContainerRuntimeFacade";
import { installMcpDefaultCapability as installDefaultMcpCapability } from "./mcpDefaultCapabilityInstaller";
import { type ToolHiveCommandResult, type ToolHiveInstalledServerState, type ToolHiveOperationProgress, type ToolHiveRuntimeService, type ToolHiveRunVolume, type ToolHiveWorkloadSummary } from "./mcpToolRuntimeFacade";
import { parseMcpAutowireCandidate, validateMcpAutowireCandidate } from "./mcpAutowireFacade";
import { storedMcpSecretBindingsForCandidate, storedMcpSecretBindingsForServer } from "./mcpSecretReferences";
import { isSecretReference, redactSensitiveText } from "./mcpSecurityFacade";
import {
  MCP_MANAGED_FILE_EXCHANGE_PURPOSE,
  validateMcpManagedFileExchangeHostAccess,
} from "./mcpManagedFileExchange";
import {
  applyMcpAutowirePlanEdit,
  describeMcpAutowireRuntimeRepair,
  mcpAutowireRuntimeRepairText,
  type McpAutowirePlanRevision,
  type McpAutowirePlanRevisionStore,
  type McpAutowireRuntimeRepairDescribeResult,
} from "./mcpAutowireFacade";
import { backfillMcpAutowirePlanRevisionFromInstalledServer } from "./mcpAutowireFacade";

export interface McpServerPiToolThread {
  id: string;
  collaborationMode: "agent" | "planner";
  permissionMode: string;
}

export interface McpServerPiToolWorkspace {
  path: string;
  name?: string;
}

export interface McpServerInstallApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpServerInstallPreviewForApproval;
  preflight: ToolHiveCommandResult;
  detail: string;
}

type McpServerInstallPreviewForApproval = McpInstallPreview | McpDefaultCapabilityInstallPreview;
type McpPiToolUpdate = (update: { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }) => void;
type InstalledMcpAutowireRevisionRecord = {
  revision: McpAutowirePlanRevision;
  previousActiveRevisionId?: string;
};

export interface McpServerUninstallApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  server: McpInstalledServerSummary;
  detail: string;
}

export interface McpGuidedLocalBridgePreflightApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpGuidedLocalBridgePreview;
  detail: string;
}

export interface McpGuidedLocalBridgeRegisterApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpGuidedLocalBridgePreview;
  detail: string;
}

export interface McpServerPiToolOptions {
  catalog: McpInstallCatalog;
  toolHive: ToolHiveRuntimeService;
  getThread: () => McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  authorizeInstall?: (input: McpServerInstallApprovalInput) => Promise<boolean> | boolean;
  authorizeUninstall?: (input: McpServerUninstallApprovalInput) => Promise<boolean> | boolean;
  authorizeGuidedLocalBridgePreflight?: (input: McpGuidedLocalBridgePreflightApprovalInput) => Promise<boolean> | boolean;
  authorizeGuidedLocalBridgeRegister?: (input: McpGuidedLocalBridgeRegisterApprovalInput) => Promise<boolean> | boolean;
  guidedLocalBridgeFetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
  mcpToolFetchImpl?: FetchLike;
  resolveCandidateRef?: (candidateRef: string) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined;
  containerRuntimeProbe?: () => Promise<ContainerRuntimeProbeResult>;
  installGate?: () => Promise<McpInstallGateResult>;
  defaultCapabilityImageResolver?: (input: { image: string; platform?: NodeJS.Platform | string; arch?: NodeJS.Architecture | string; fetchImpl?: typeof fetch }) => Promise<OciImageResolution>;
  defaultCapabilityImagePuller?: (input: PullContainerRuntimeImageInput) => Promise<ContainerRuntimeImagePullResult>;
  onContainerRuntimeSetupNeeded?: (input: { capabilityId?: "scrapling"; serverId?: string; reason: string }) => void;
  requestMcpSecret?: (input: { serverId?: string; candidateId?: string; candidateRef?: string; displayName?: string; envName: string }) => void;
  planRevisions?: McpAutowirePlanRevisionStore;
  putCandidateRef?: (candidate: Record<string, unknown>, candidateHash?: string) => string | undefined;
  authorizeRuntimeRepair?: (input: McpRuntimeRepairApprovalInput) => Promise<boolean> | boolean;
}

export interface McpRuntimeRepairApprovalInput {
  thread: McpServerPiToolThread;
  workspace: McpServerPiToolWorkspace;
  preview: McpAutowireRuntimeRepairDescribeResult;
  detail: string;
}

export function createMcpServerPiToolDefinitions(options: McpServerPiToolOptions): ToolDefinition<any, any, any>[] {
  const search = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_search"));
  const describe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_describe"));
  const importDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_standard_import_describe"));
  const importInstall = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_standard_import_install"));
  const remoteDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_remote_proxy_describe"));
  const remoteInstall = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_remote_proxy_install"));
  const guidedDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_guided_bridge_describe"));
  const guidedPreflight = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_guided_bridge_preflight"));
  const guidedRegister = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_guided_bridge_register"));
  const install = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_install"));
  const list = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_list"));
  const diagnostics = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_diagnostics"));
  const defaultUpdateDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_default_update_describe"));
  const mcpSecretRequest = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_secret_request"));
  const runtimeRepairDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_runtime_repair_describe"));
  const runtimeRepairApply = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_runtime_repair_apply"));
  const uninstall = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_uninstall"));
  return [
    {
      ...search,
      parameters: search.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const query = optionalString(input.query);
        const limit = optionalNumber(input.limit);
        const refresh = optionalBoolean(input.refresh);
        onUpdate?.({
          content: [{ type: "text", text: `Searching ToolHive MCP registry${query ? ` for "${query}"` : ""}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_search",
            status: "searching",
            query,
          },
        });
        const results = await options.catalog.searchRegistryServers({ query, limit, refresh });
        return toolResult(mcpServerSearchResultsText(results), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_search",
          status: "complete",
          query,
          resultCount: results.length,
          servers: results.map((result) => ({
            serverId: result.serverId,
            title: result.title,
            catalogSource: result.catalogSource,
            repositoryUrl: result.repositoryUrl,
            installed: result.installed,
            workloadName: result.workloadName,
            riskHints: result.riskHints,
            nextAction: result.nextAction,
          })),
        });
      },
    },
    {
      ...describe,
      parameters: describe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const serverId = requiredString(input, "serverId");
        const refresh = optionalBoolean(input.refresh);
        const secretBindings = secretBindingsInput(input.secretBindings);
        const runtimeVolumes = runtimeVolumesInput(input.runtimeVolumes);
        onUpdate?.({
          content: [{ type: "text", text: `Building MCP install review for ${serverId}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_describe",
            status: "reviewing",
            serverId,
          },
        });
        const defaultCapabilityId = options.catalog.defaultCapabilityIdForServerId(serverId);
        if (defaultCapabilityId) {
          const preview = await options.catalog.previewDefaultCapabilityInstall({ capabilityId: defaultCapabilityId });
          return toolResult(mcpDefaultCapabilityInstallPreviewText(preview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_describe",
            status: preview.review.blockers.length ? "blocked" : "ready-for-review",
            serverId,
            capabilityId: defaultCapabilityId,
            catalogSource: "ambient-default",
            defaultCapability: true,
            candidateId: preview.candidate.id,
            validationStatus: preview.validation.status,
            blockerCount: preview.review.blockers.length,
            warningCount: preview.review.warnings.length,
            runPlan: preview.runPlan,
            permissionProfile: {
              path: preview.permissionProfile.path,
              sha256: preview.permissionProfile.sha256,
            },
            expectedTools: preview.candidate.validationPlan.expectedTools,
          });
        }
        const preview = await previewRegistryInstallWithStoredSecrets(options, { serverId, refresh, explicitSecretBindings: secretBindings, runtimeVolumes });
        return toolResult(mcpRegistryInstallPreviewText(preview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_describe",
          status: preview.review.blockers.length ? "blocked" : "ready-for-review",
          serverId,
          candidateId: preview.candidate.id,
          validationStatus: preview.validation.status,
          blockerCount: preview.review.blockers.length,
          warningCount: preview.review.warnings.length,
          runPlan: preview.runPlan,
          toolHiveVolumes: preview.toolHiveVolumes,
          permissionProfile: {
            path: preview.permissionProfile.path,
            sha256: preview.permissionProfile.sha256,
          },
          expectedTools: preview.candidate.validationPlan.expectedTools,
        });
      },
    },
    {
      ...list,
      parameters: list.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, _params, _signal, onUpdate) => {
        onUpdate?.({
          content: [{ type: "text", text: "Listing Ambient-managed ToolHive MCP servers." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_list",
            status: "listing",
          },
        });
        const inventory = await options.catalog.listInstalledServerInventory();
        return toolResult(mcpInstalledServersText(inventory.servers, { unmanagedWorkloads: inventory.unmanagedWorkloads }), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_list",
          status: "complete",
          serverCount: inventory.servers.length,
          unmanagedWorkloadCount: inventory.unmanagedWorkloads.length,
          servers: inventory.servers,
          unmanagedWorkloads: inventory.unmanagedWorkloads,
        });
      },
    },
    {
      ...diagnostics,
      parameters: diagnostics.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        const logLines = optionalNumber(input.logLines);
        if (!serverId && !workloadName) throw new Error("serverId or workloadName is required.");
        onUpdate?.({
          content: [{ type: "text", text: "Reading Ambient MCP server diagnostics." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_diagnostics",
            status: "diagnosing",
            serverId,
            workloadName,
          },
        });
        const diagnosticsResult = await mcpServerDiagnostics(options, { serverId, workloadName, logLines });
        return toolResult(mcpServerDiagnosticsText(diagnosticsResult), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_diagnostics",
          status: "complete",
          serverId: diagnosticsResult.server.serverId,
          workloadName: diagnosticsResult.server.workloadName,
          workloadStatus: diagnosticsResult.server.workloadStatus,
          endpoint: diagnosticsResult.server.endpoint,
          installValidationStatus: diagnosticsResult.server.installValidationStatus,
          validationError: diagnosticsResult.server.installValidationError,
          descriptorHash: diagnosticsResult.server.lastKnownToolDescriptorHash,
          descriptorReviewStatus: diagnosticsResult.server.toolDescriptorReviewStatus,
          permissionProfileSha256: diagnosticsResult.permissionProfile?.sha256,
          permissionProfileVerified: diagnosticsResult.permissionProfile?.sha256Verified,
          secretBindingCount: diagnosticsResult.server.secretBindingCount ?? 0,
          logExitCode: diagnosticsResult.logs?.exitCode,
          logRedacted: diagnosticsResult.logs?.redacted,
        });
      },
    },
    {
      ...defaultUpdateDescribe,
      parameters: defaultUpdateDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const serverId = optionalString(input.serverId);
        const workloadName = optionalString(input.workloadName);
        onUpdate?.({
          content: [{ type: "text", text: "Reviewing Ambient MCP default catalog update state." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_default_update_describe",
            status: "reviewing",
            serverId,
            workloadName,
          },
        });
        const preview = await options.catalog.previewDefaultCatalogUpdate({ serverId, workloadName });
        return toolResult(mcpDefaultCatalogUpdatePreviewText(preview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_default_update_describe",
          status: preview.status,
          serverId: preview.serverId,
          workloadName: preview.workloadName,
          currentDescriptorHash: preview.currentDescriptorHash,
          installedDescriptorHash: preview.installedDescriptorHash,
          diffCount: preview.diffs.length,
          diffs: preview.diffs,
          nextAction: preview.nextAction,
        });
      },
    },
    {
      ...importDescribe,
      parameters: importDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const candidateResolution = await candidateOrRefInput(options, input);
        const candidate = candidateResolution.candidate;
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const secretBindings = secretBindingsInput(input.secretBindings);
        onUpdate?.({
          content: [{ type: "text", text: "Building Standard MCP import review." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_describe",
            status: "reviewing",
          },
        });
        const preview = await previewStandardMcpImportWithStoredSecrets(options, {
          candidate,
          candidateRef: candidateResolution.candidateRef,
          expectedCandidateHash,
          explicitSecretBindings: secretBindings,
        });
        const preferredFallback = preview.fallbackRoutes[0];
        const readyForInstall = !preview.review.blockers.length && Boolean(preview.runPlan);
        const standardImportNextToolName = readyForInstall
          ? "ambient_mcp_standard_import_install"
          : preferredFallback?.nextToolName;
        const standardImportNextToolInput = readyForInstall
          ? standardImportInstallNextToolInput(preview, expectedCandidateHash)
          : preferredFallback?.nextToolInput;
        return toolResult(mcpInstallPreviewText(preview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_standard_import_describe",
          status: preview.review.blockers.length
            ? preferredFallback ? "fallback-available" : "blocked"
            : "ready-for-review",
          serverId: preview.serverId,
          candidateId: preview.candidate.id,
          validationStatus: preview.validation.status,
          outcome: preview.review.outcome,
          blockerCount: preview.review.blockers.length,
          warningCount: preview.review.warnings.length,
          fallbackRoutes: preview.fallbackRoutes,
          preferredFallback,
          nextToolName: standardImportNextToolName,
          nextToolInput: standardImportNextToolInput,
          ...(readyForInstall
            ? {
                directInstallNextToolName: "ambient_mcp_standard_import_install",
                directInstallNextToolInput: standardImportNextToolInput,
                doNotSearchForNextTool: true,
              }
            : {}),
          toolHiveRunSource: preview.toolHiveRunSource,
          toolHiveServerArgs: preview.toolHiveServerArgs,
          toolHiveEnvNames: preview.toolHiveEnvVars.map((entry) => entry.name),
          toolHiveVolumes: preview.toolHiveVolumes,
          toolHiveRuntimeImage: preview.toolHiveRuntimeImage,
          imageVerificationPolicy: preview.imageVerificationPolicy,
          runPlan: preview.runPlan,
          permissionProfile: {
            path: preview.permissionProfile.path,
            sha256: preview.permissionProfile.sha256,
          },
          expectedTools: preview.candidate.validationPlan.expectedTools,
        });
      },
    },
    {
      ...importInstall,
      parameters: importInstall.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP Standard import installation is blocked in Planner Mode.");
        const input = objectInput(params);
        const candidateResolution = await candidateOrRefInput(options, input);
        const candidate = candidateResolution.candidate;
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const secretBindings = secretBindingsInput(input.secretBindings);

        onUpdate?.({
          content: [{ type: "text", text: "Previewing Standard MCP import before install approval." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: "previewing",
          },
        });
        const preview = await previewStandardMcpImportWithStoredSecrets(options, {
          candidate,
          candidateRef: candidateResolution.candidateRef,
          expectedCandidateHash,
          explicitSecretBindings: secretBindings,
        });
        const existing = await installedServerForServerId(options.toolHive, preview.serverId);
        const existingCompatibility = existing ? standardImportExistingCompatibility(existing, preview) : undefined;
        const repairExisting = Boolean(existing && existingCompatibility && !existingCompatibility.compatible);
        if (existing && existingCompatibility?.compatible) {
          return toolResult(
            [
              `MCP Standard import ${preview.serverId} is already installed as ToolHive workload ${existing.workloadName} with compatible Ambient runtime shape.`,
              "",
              mcpToolDiscoveryNextAction(preview.serverId, existing.workloadName),
              "Use ambient_mcp_tool_search directly for verification; do not route this next step through ambient_tool_search.",
            ].join("\n"),
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_standard_import_install",
              status: "already-installed",
              serverId: preview.serverId,
              workloadName: existing.workloadName,
              compatibleRuntimeShape: true,
            },
          );
        }
        if (existing && existingCompatibility && !existingCompatibility.compatible) {
          if (!standardImportStateMayBeRepaired(existing, preview)) {
            return toolResult(
              `MCP Standard import install is blocked because ${preview.serverId} already exists with a different Ambient runtime lane or source.\n\nExisting workload: ${existing.workloadName}\nRepair blockers: ${existingCompatibility.reasons.join("; ")}`,
              {
                runtime: "ambient-mcp",
                toolName: "ambient_mcp_standard_import_install",
                status: "blocked",
                blockerKind: "existing-runtime-shape",
                retryable: false,
                serverId: preview.serverId,
                workloadName: existing.workloadName,
                repairReasons: existingCompatibility.reasons,
              },
            );
          }
          onUpdate?.({
            content: [{
              type: "text",
              text: `Repairing Standard MCP import ${preview.serverId}; existing ToolHive state is missing required Ambient runtime shape.`,
            }],
            details: {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_standard_import_install",
              status: "repair-required",
              serverId: preview.serverId,
              workloadName: existing.workloadName,
              repairReasons: existingCompatibility.reasons,
            },
          });
        }
        if (!preview.runPlan || !preview.toolHiveRunSource || preview.review.blockers.length) {
          return toolResult(`MCP Standard import install is blocked.\n\n${mcpInstallPreviewText(preview)}`, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: "blocked",
            blockerKind: "review",
            retryable: false,
            serverId: preview.serverId,
            blockerCount: preview.review.blockers.length,
            warningCount: preview.review.warnings.length,
          });
        }

        onUpdate?.({
          content: [{ type: "text", text: "Checking local ToolHive container runtime before Standard MCP import." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: "preflight",
            serverId: preview.serverId,
          },
        });
        const gate = await evaluateMcpServerInstallGate(options);
        const runtimeProbe = gate.runtimeProbe;
        const preflight = runtimeProbe.toolHive.preflight;
        if (gate.status !== "ready" || !preflight) {
          return toolResult(`MCP Standard import install is blocked.\n\n${mcpInstallGateSummary(gate)}`, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: gate.status,
            blockerKind: "runtime",
            retryable: true,
            doNotUseShell: true,
            serverId: preview.serverId,
            runtimeStatus: runtimeProbe.status,
            detectedRuntime: runtimeProbe.runtime,
            nextAction: runtimeProbe.nextAction,
            preflightMessage: runtimeProbe.message,
            postInstallQueue: runtimeProbe.postInstallQueue,
            defaultCapabilities: gate.defaultCapabilities,
          });
        }

        const sameNameRuntimeConflict = await sameNameStandardImportRuntimeConflict(options.toolHive, preview, existing);
        const detail = [
          mcpServerInstallApprovalDetail({ preview, workspace: options.workspace, preflight: preflight.command }),
          repairExisting && existingCompatibility && existing
            ? [
                "",
                "Repair existing Ambient-managed Standard MCP install:",
                `- Existing workload: ${existing.workloadName}`,
                `- Current run plan workload: ${preview.runPlan.workloadName}`,
                ...existingCompatibility.reasons.map((reason) => `- ${reason}`),
              ].join("\n")
            : undefined,
          sameNameRuntimeConflict
            ? [
                "",
                "Replace existing same-name ToolHive workload:",
                `- Existing workload: ${sameNameRuntimeConflict.name}`,
                sameNameRuntimeConflict.status ? `- Current status: ${sameNameRuntimeConflict.status}` : undefined,
                "- Ambient will stop, remove, and recreate this Ambient-named workload through the reviewed Standard MCP install path if ToolHive reports a name conflict.",
                "- Pi should not call shell, thv, or profile-edit commands to repair this conflict.",
              ].filter(Boolean).join("\n")
            : undefined,
        ].filter(Boolean).join("\n");
        const allowed = await awaitMcpApprovalWithHeartbeat({
          onUpdate,
          toolName: "ambient_mcp_standard_import_install",
          message: `Waiting for Ambient Desktop approval to install Standard MCP import ${preview.serverId}.`,
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: "awaiting-approval",
            stage: "approval",
            serverId: preview.serverId,
            workloadName: preview.runPlan.workloadName,
          },
          authorize: async () => await (options.authorizeInstall?.({ thread, workspace: options.workspace, preview, preflight: preflight.command, detail }) ?? true),
        });
        if (!allowed) throw new Error("MCP Standard import install blocked by Ambient Desktop approval prompt.");

        if (repairExisting && existing && existing.workloadName !== preview.runPlan.workloadName) {
          await removeStaleStandardImportForRepair({
            options,
            existing,
            preview,
            reasons: existingCompatibility?.reasons ?? [],
            onUpdate,
          });
        }

        onUpdate?.({
          content: [{ type: "text", text: `Installing Standard MCP import ${preview.serverId} through ToolHive.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: "installing",
            serverId: preview.serverId,
            workloadName: preview.runPlan.workloadName,
          },
        });
        const standardWorkloadName = preview.runPlan.workloadName;
        let result: ToolHiveCommandResult;
        try {
          result = await options.toolHive.runStandardMcpImport({
            serverId: preview.serverId,
            workloadName: standardWorkloadName,
            sourceRef: preview.toolHiveRunSource,
            registrySource: "standard-mcp-import",
            sourceIdentity: mcpInstallPreviewSourceIdentity(preview),
            installReview: mcpInstallPreviewReviewState(preview, new Date().toISOString()),
            secretBindings: mcpInstallPreviewSecretBindings(preview),
            transport: preview.runPlan.transport,
            proxyMode: "streamable-http",
            serverArgs: preview.toolHiveServerArgs,
            envVars: preview.toolHiveEnvVars,
            volumes: preview.toolHiveVolumes,
            runtimeImage: preview.toolHiveRuntimeImage,
            imageVerificationPolicy: preview.imageVerificationPolicy,
            permissionProfile: preview.permissionProfile.profile,
            onProgress: (progress) =>
              emitMcpToolHiveProgressUpdate({
                onUpdate,
                toolName: "ambient_mcp_standard_import_install",
                serverId: preview.serverId,
                workloadName: standardWorkloadName,
                progress,
              }),
          });
        } catch (error) {
          const recovery = standardImportRuntimeFailureRecovery(preview, errorMessage(error));
          return toolResult(recovery.text, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: "install-failed",
            serverId: preview.serverId,
            workloadName: standardWorkloadName,
            doNotUseShell: true,
            doNotSearchRegistryForSameTarget: true,
            failure: recovery.failure,
            ...(recovery.nextToolName ? { nextToolName: recovery.nextToolName } : {}),
            ...(recovery.nextToolInput ? { nextToolInput: recovery.nextToolInput } : {}),
            ...(recovery.fallbackRoutes.length ? { fallbackRoutes: recovery.fallbackRoutes } : {}),
            permissionProfile: {
              path: preview.permissionProfile.path,
              sha256: preview.permissionProfile.sha256,
            },
          });
        }
        onUpdate?.({
          content: [{ type: "text", text: `Waiting for MCP workload ${preview.runPlan.workloadName} to expose its ToolHive endpoint.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_standard_import_install",
            status: "waiting-for-endpoint",
            serverId: preview.serverId,
            workloadName: preview.runPlan.workloadName,
          },
        });
        const workload = await options.toolHive.waitForAmbientWorkload(preview.runPlan.workloadName, { timeoutMs: 90_000 });
        await options.toolHive.updateInstalledServerEndpoint({
          workloadName: preview.runPlan.workloadName,
          endpoint: workload.endpoint,
        });
        const validation = await validateStandardImportInstallShape({
          options,
          preview,
          validation: await validateInstalledMcpTools({
            options,
            toolName: "ambient_mcp_standard_import_install",
            serverId: preview.serverId,
            workloadName: preview.runPlan.workloadName,
            onUpdate,
            signal,
          }),
        });
        const installRevision = await recordInstalledMcpAutowireRevision({
          options,
          preview,
          workloadName: preview.runPlan.workloadName,
          summary: `Installed Standard MCP import ${preview.serverId} as ToolHive workload ${preview.runPlan.workloadName}.`,
        });
        return toolResult(mcpServerInstallResultTextWithRevision(preview, result, workload, validation, installRevision), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_standard_import_install",
          serverId: preview.serverId,
          workloadName: preview.runPlan.workloadName,
          status: validation.status,
          workloadStatus: workload.status,
          endpoint: workload.endpoint,
          installValidationStatus: validation.status,
          toolCount: validation.toolCount,
          descriptorHash: validation.descriptorHash,
          validationError: validation.error,
          activeRevisionId: installRevision?.revision.revisionId,
          previousActiveRevisionId: installRevision?.previousActiveRevisionId,
          ...(existingCompatibility && !existingCompatibility.compatible ? {
            repairedRuntimeShape: true,
            repairReasons: existingCompatibility.reasons,
          } : {}),
          imageVerificationPolicy: preview.imageVerificationPolicy,
          command: result.command,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          permissionProfile: {
            path: preview.permissionProfile.path,
            sha256: preview.permissionProfile.sha256,
          },
        });
      },
    },
    {
      ...remoteDescribe,
      parameters: remoteDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const secretBindings = secretBindingsInput(input.secretBindings);
        onUpdate?.({
          content: [{ type: "text", text: "Building Remote MCP ToolHive proxy review." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_describe",
            status: "reviewing",
          },
        });
        const preview = await previewRemoteMcpProxyWithStoredSecrets(options, {
          candidate,
          expectedCandidateHash,
          explicitSecretBindings: secretBindings,
        });
        return toolResult(mcpRemoteMcpProxyPreviewText(preview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_remote_proxy_describe",
          status: preview.review.blockers.length ? "blocked" : "ready-for-review",
          serverId: preview.serverId,
          candidateId: preview.candidate.id,
          validationStatus: preview.validation.status,
          outcome: preview.review.outcome,
          blockerCount: preview.review.blockers.length,
          warningCount: preview.review.warnings.length,
          toolHiveRemoteUrl: preview.toolHiveRemoteUrl,
          runPlan: preview.runPlan,
          permissionProfile: {
            path: preview.permissionProfile.path,
            sha256: preview.permissionProfile.sha256,
          },
          expectedTools: preview.candidate.validationPlan.expectedTools,
        });
      },
    },
    {
      ...remoteInstall,
      parameters: remoteInstall.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP Remote proxy installation is blocked in Planner Mode.");
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const secretBindings = secretBindingsInput(input.secretBindings);

        onUpdate?.({
          content: [{ type: "text", text: "Previewing Remote MCP ToolHive proxy before install approval." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_install",
            status: "previewing",
          },
        });
        const preview = await previewRemoteMcpProxyWithStoredSecrets(options, {
          candidate,
          expectedCandidateHash,
          explicitSecretBindings: secretBindings,
        });
        const existing = await installedServerForServerId(options.toolHive, preview.serverId);
        if (existing) {
          return toolResult(
            `Remote MCP proxy ${preview.serverId} is already installed as ToolHive workload ${existing.workloadName}.`,
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_remote_proxy_install",
              status: "already-installed",
              serverId: preview.serverId,
              workloadName: existing.workloadName,
            },
          );
        }
        if (!preview.runPlan || !preview.toolHiveRemoteUrl || preview.review.blockers.length) {
          return toolResult(`Remote MCP proxy install is blocked.\n\n${mcpRemoteMcpProxyPreviewText(preview)}`, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_install",
            status: "blocked",
            blockerKind: "review",
            retryable: false,
            serverId: preview.serverId,
            blockerCount: preview.review.blockers.length,
            warningCount: preview.review.warnings.length,
          });
        }

        onUpdate?.({
          content: [{ type: "text", text: "Checking local ToolHive runtime before Remote MCP proxy install." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_install",
            status: "preflight",
            serverId: preview.serverId,
          },
        });
        const gate = await evaluateMcpServerInstallGate(options);
        const runtimeProbe = gate.runtimeProbe;
        const preflight = runtimeProbe.toolHive.preflight;
        if (gate.status !== "ready" || !preflight) {
          return toolResult(`Remote MCP proxy install is blocked.\n\n${mcpInstallGateSummary(gate)}`, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_install",
            status: gate.status,
            blockerKind: "runtime",
            retryable: true,
            doNotUseShell: true,
            serverId: preview.serverId,
            runtimeStatus: runtimeProbe.status,
            detectedRuntime: runtimeProbe.runtime,
            nextAction: runtimeProbe.nextAction,
            preflightMessage: runtimeProbe.message,
            postInstallQueue: runtimeProbe.postInstallQueue,
            defaultCapabilities: gate.defaultCapabilities,
          });
        }

        const detail = mcpServerInstallApprovalDetail({ preview, workspace: options.workspace, preflight: preflight.command });
        const allowed = await (options.authorizeInstall?.({ thread, workspace: options.workspace, preview, preflight: preflight.command, detail }) ?? true);
        if (!allowed) throw new Error("MCP Remote proxy install blocked by Ambient Desktop approval prompt.");

        onUpdate?.({
          content: [{ type: "text", text: `Installing Remote MCP proxy ${preview.serverId} through ToolHive.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_install",
            status: "installing",
            serverId: preview.serverId,
            workloadName: preview.runPlan.workloadName,
          },
        });
        const result = await options.toolHive.runRemoteMcpProxy({
          serverId: preview.serverId,
          workloadName: preview.runPlan.workloadName,
          remoteUrl: preview.toolHiveRemoteUrl,
          registrySource: "remote-mcp-proxy",
          sourceIdentity: mcpInstallPreviewSourceIdentity(preview),
          installReview: mcpInstallPreviewReviewState(preview, new Date().toISOString()),
          secretBindings: mcpInstallPreviewSecretBindings(preview),
          transport: preview.runPlan.transport as "streamable-http" | "sse",
          proxyMode: "streamable-http",
          permissionProfile: preview.permissionProfile.profile,
        });
        onUpdate?.({
          content: [{ type: "text", text: `Waiting for Remote MCP proxy workload ${preview.runPlan.workloadName} to expose its ToolHive endpoint.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_install",
            status: "waiting-for-endpoint",
            serverId: preview.serverId,
            workloadName: preview.runPlan.workloadName,
          },
        });
        const workload = await options.toolHive.waitForAmbientWorkload(preview.runPlan.workloadName, { timeoutMs: 90_000 });
        await options.toolHive.updateInstalledServerEndpoint({
          workloadName: preview.runPlan.workloadName,
          endpoint: workload.endpoint,
        });
        const validation = await validateInstalledMcpTools({
          options,
          toolName: "ambient_mcp_remote_proxy_install",
          serverId: preview.serverId,
          workloadName: preview.runPlan.workloadName,
          onUpdate,
          signal,
        });
        const installRevision = await recordInstalledMcpAutowireRevision({
          options,
          preview,
          workloadName: preview.runPlan.workloadName,
          summary: `Installed Remote MCP proxy ${preview.serverId} as ToolHive workload ${preview.runPlan.workloadName}.`,
        });
        return toolResult(mcpServerInstallResultTextWithRevision(preview, result, workload, validation, installRevision), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_remote_proxy_install",
          status: validation.status,
          serverId: preview.serverId,
          workloadName: preview.runPlan.workloadName,
          workloadStatus: workload.status,
          endpoint: workload.endpoint,
          installValidationStatus: validation.status,
          toolCount: validation.toolCount,
          descriptorHash: validation.descriptorHash,
          validationError: validation.error,
          activeRevisionId: installRevision?.revision.revisionId,
          previousActiveRevisionId: installRevision?.previousActiveRevisionId,
          command: result.command,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          permissionProfile: {
            path: preview.permissionProfile.path,
            sha256: preview.permissionProfile.sha256,
          },
        });
      },
    },
    {
      ...guidedDescribe,
      parameters: guidedDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const explicitSecretBindings = secretBindingsInput(input.secretBindings);
        onUpdate?.({
          content: [{ type: "text", text: "Building guided local bridge setup review." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_describe",
            status: "reviewing",
          },
        });
        const { preview, secretBindings, secretReview } = await previewGuidedLocalBridgeWithStoredSecrets(options, {
          candidate,
          expectedCandidateHash,
          explicitSecretBindings,
        });
        const blocked = preview.hardBlockers.length || secretReview.blockers.length;
        return toolResult(mcpGuidedLocalBridgePreviewTextWithSecrets(preview, secretReview), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_guided_bridge_describe",
          status: blocked ? "blocked" : "guided-setup-required",
          serverId: preview.serverId,
          candidateId: preview.candidate.id,
          validationStatus: preview.validation.status,
          outcome: preview.validation.outcome,
          hardBlockerCount: preview.hardBlockers.length,
          secretBlockerCount: secretReview.blockers.length,
          secretBindingCount: secretBindings.length,
          missingRequiredSecrets: secretReview.missingRequiredEnvNames,
          warningCount: preview.warnings.length,
          setupCheckpointCount: preview.setupCheckpoints.length,
          bridgeBaseUrl: preview.bridge.bridgeBaseUrl,
          bridgeProbeUrl: preview.bridge.bridgeProbeUrl,
          upstreamAppUrl: preview.bridge.upstreamAppUrl,
          expectedTools: preview.bridge.expectedTools,
        });
      },
    },
    {
      ...guidedPreflight,
      parameters: guidedPreflight.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP guided local bridge preflight is blocked in Planner Mode.");
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const timeoutMs = optionalNumber(input.timeoutMs);
        const preview = previewGuidedLocalBridge({ candidate, expectedCandidateHash });
        if (preview.hardBlockers.length) {
          return toolResult(mcpGuidedLocalBridgePreviewText(preview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_preflight",
            status: "blocked",
            serverId: preview.serverId,
            hardBlockerCount: preview.hardBlockers.length,
          });
        }

        const detail = mcpGuidedLocalBridgePreflightApprovalDetail({ preview, workspace: options.workspace });
        const allowed = await (options.authorizeGuidedLocalBridgePreflight?.({ thread, workspace: options.workspace, preview, detail }) ?? true);
        if (!allowed) throw new Error("MCP guided local bridge preflight blocked by Ambient Desktop approval prompt.");

        onUpdate?.({
          content: [{ type: "text", text: `Checking guided local bridge endpoints for ${preview.candidate.displayName}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_preflight",
            status: "preflight",
            serverId: preview.serverId,
            bridgeProbeUrl: preview.bridge.bridgeProbeUrl,
            upstreamAppUrl: preview.bridge.upstreamAppUrl,
          },
        });
        const result = await runGuidedLocalBridgePreflight({ candidate, expectedCandidateHash, timeoutMs, signal, fetchImpl: options.guidedLocalBridgeFetchImpl });
        return toolResult(mcpGuidedLocalBridgePreflightText(result), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_guided_bridge_preflight",
          status: result.status,
          serverId: result.preview.serverId,
          bridgeProbeUrl: result.preview.bridge.bridgeProbeUrl,
          upstreamAppUrl: result.preview.bridge.upstreamAppUrl,
          checks: result.checks,
        });
      },
    },
    {
      ...guidedRegister,
      parameters: guidedRegister.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP guided local bridge registration is blocked in Planner Mode.");
        const input = objectInput(params);
        const candidate = requiredObject(input, "candidate");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const timeoutMs = optionalNumber(input.timeoutMs);
        const explicitSecretBindings = secretBindingsInput(input.secretBindings);
        const { preview, secretBindings, secretReview } = await previewGuidedLocalBridgeWithStoredSecrets(options, {
          candidate,
          expectedCandidateHash,
          explicitSecretBindings,
        });
        if (preview.hardBlockers.length || secretReview.blockers.length) {
          return toolResult(mcpGuidedLocalBridgePreviewTextWithSecrets(preview, secretReview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "blocked",
            serverId: preview.serverId,
            hardBlockerCount: preview.hardBlockers.length,
            secretBlockerCount: secretReview.blockers.length,
            secretBindingCount: secretBindings.length,
            missingRequiredSecrets: secretReview.missingRequiredEnvNames,
          });
        }

        const existing = await installedServerForServerId(options.toolHive, preview.serverId);
        if (existing) {
          return toolResult(
            `Guided local bridge ${preview.serverId} is already registered as ${existing.workloadName}. Use ambient_mcp_tool_search to refresh/discover tools.`,
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_guided_bridge_register",
              status: "already-registered",
              serverId: preview.serverId,
              workloadName: existing.workloadName,
            },
          );
        }

        const detail = mcpGuidedLocalBridgeRegisterApprovalDetail({ preview, workspace: options.workspace, secretBindings });
        const allowed = await (options.authorizeGuidedLocalBridgeRegister?.({ thread, workspace: options.workspace, preview, detail }) ?? true);
        if (!allowed) throw new Error("MCP guided local bridge registration blocked by Ambient Desktop approval prompt.");

        onUpdate?.({
          content: [{ type: "text", text: `Re-checking guided local bridge endpoints for ${preview.candidate.displayName}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "preflight",
            serverId: preview.serverId,
            bridgeProbeUrl: preview.bridge.bridgeProbeUrl,
          },
        });
        const preflight = await runGuidedLocalBridgePreflight({ candidate, expectedCandidateHash, timeoutMs, signal, fetchImpl: options.guidedLocalBridgeFetchImpl });
        if (preflight.status !== "ready") {
          return toolResult(mcpGuidedLocalBridgePreflightText(preflight), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: preflight.status,
            serverId: preview.serverId,
            checks: preflight.checks,
          });
        }

        const workloadName = mcpGuidedLocalBridgeWorkloadName(preview.serverId);
        const state = await options.toolHive.registerGuidedLocalBridge({
          serverId: preview.serverId,
          workloadName,
          endpoint: preview.bridge.bridgeProbeUrl,
          registrySource: "guided-local-bridge",
          sourceIdentity: mcpGuidedLocalBridgeSourceIdentity(preview),
          installReview: mcpGuidedLocalBridgeInstallReviewState(preview, new Date().toISOString()),
          secretBindings,
          permissionProfile: mcpGuidedLocalBridgePermissionProfile(preview),
        });

        onUpdate?.({
          content: [{ type: "text", text: `Discovering harmless MCP tool descriptors for ${preview.candidate.displayName}.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "discovering-tools",
            serverId: preview.serverId,
            workloadName,
          },
        });
        try {
          const bridge = new McpToolBridge({
            catalog: options.catalog,
            toolHive: options.toolHive,
            workspacePath: options.workspace.path,
            fetchImpl: options.guidedLocalBridgeFetchImpl,
          });
          const review = await bridge.reviewToolDescriptors({ serverId: preview.serverId, workloadName, refresh: true, signal });
          await options.toolHive.updateInstalledServerInstallValidation({ workloadName, status: "ready" });
          return toolResult(mcpGuidedLocalBridgeRegisterResultText(preview, state.workloadName, review.tools.length, mcpToolDescriptorReviewText(review)), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "ready",
            serverId: preview.serverId,
            workloadName,
            endpoint: preview.bridge.bridgeProbeUrl,
            installValidationStatus: "ready",
            toolCount: review.tools.length,
            descriptorHash: review.descriptorHash,
            reviewStatus: review.reviewStatus,
            secretBindingCount: secretBindings.length,
          });
        } catch (error) {
          const message = errorMessage(error);
          await options.toolHive.updateInstalledServerInstallValidation({ workloadName, status: "validation_failed", error: message });
          return toolResult([
            `Registered guided local bridge ${preview.serverId} as ${workloadName}, but tool descriptor discovery failed.`,
            `Endpoint: ${preview.bridge.bridgeProbeUrl}`,
            `Discovery error: ${message}`,
            "Next: verify the user-run bridge is still running and rerun ambient_mcp_tool_search or ambient_mcp_guided_bridge_register after setup is fixed.",
          ].join("\n"), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_guided_bridge_register",
            status: "validation_failed",
            serverId: preview.serverId,
            workloadName,
            endpoint: preview.bridge.bridgeProbeUrl,
            installValidationStatus: "validation_failed",
            error: message,
          });
        }
      },
    },
    {
      ...install,
      parameters: install.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, signal, onUpdate) => {
        const thread = options.getThread();
        if (thread.collaborationMode === "planner") throw new Error("MCP server installation is blocked in Planner Mode.");
        const input = objectInput(params);
        const serverId = requiredString(input, "serverId");
        const refresh = optionalBoolean(input.refresh);
        const secretBindings = secretBindingsInput(input.secretBindings);
        const runtimeVolumes = runtimeVolumesInput(input.runtimeVolumes);

        const existing = await installedServerForServerId(options.toolHive, serverId);
        if (existing) {
          if (runtimeVolumes.length && stableToolHiveRunVolumes(existing.runtimeVolumes ?? []) !== stableToolHiveRunVolumes(runtimeVolumes)) {
            return toolResult(
              [
                `MCP server ${serverId} is already installed as ToolHive workload ${existing.workloadName}, but its reviewed runtime volumes do not match this install request.`,
                "",
                `Installed volumes: ${runtimeVolumesText(existing.runtimeVolumes ?? [])}`,
                `Requested volumes: ${runtimeVolumesText(runtimeVolumes)}`,
                "Uninstall the existing Ambient-managed MCP server, then retry ambient_mcp_server_describe/install with the requested runtimeVolumes. Do not edit ToolHive state or permission profiles directly.",
              ].join("\n"),
              {
                runtime: "ambient-mcp",
                toolName: "ambient_mcp_server_install",
                status: "blocked",
                blockerKind: "existing-runtime-volumes",
                retryable: false,
                serverId,
                workloadName: existing.workloadName,
                requestedRuntimeVolumes: runtimeVolumes,
                installedRuntimeVolumes: existing.runtimeVolumes ?? [],
              },
            );
          }
          return toolResult(
            `MCP server ${serverId} is already installed as ToolHive workload ${existing.workloadName}.`,
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_server_install",
              status: "already-installed",
              serverId,
              workloadName: existing.workloadName,
            },
          );
        }

        const defaultCapabilityId = options.catalog.defaultCapabilityIdForServerId(serverId);
        if (defaultCapabilityId) {
          return installDefaultCapabilityFromServerTool({
            options,
            thread,
            serverId,
            capabilityId: defaultCapabilityId,
            onUpdate,
            signal,
          });
        }

        onUpdate?.({
          content: [{ type: "text", text: `Previewing MCP server ${serverId} before install approval.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_install",
            status: "previewing",
            serverId,
          },
        });
        const preview = await previewRegistryInstallWithStoredSecrets(options, { serverId, refresh, explicitSecretBindings: secretBindings, runtimeVolumes });
        if (!preview.runPlan || preview.review.blockers.length) {
          return toolResult(`MCP server install is blocked.\n\n${mcpRegistryInstallPreviewText(preview)}`, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_install",
            status: "blocked",
            blockerKind: "review",
            retryable: false,
            serverId,
            blockerCount: preview.review.blockers.length,
            warningCount: preview.review.warnings.length,
          });
        }

        onUpdate?.({
          content: [{ type: "text", text: "Checking local ToolHive container runtime before install." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_install",
            status: "preflight",
            serverId,
          },
        });
        const gate = await evaluateMcpServerInstallGate(options);
        const runtimeProbe = gate.runtimeProbe;
        const preflight = runtimeProbe.toolHive.preflight;
        if (gate.status !== "ready" || !preflight) {
          return toolResult(`MCP server install is blocked.\n\n${mcpInstallGateSummary(gate)}`, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_install",
            status: gate.status,
            blockerKind: "runtime",
            retryable: true,
            doNotUseShell: true,
            serverId,
            runtimeStatus: runtimeProbe.status,
            detectedRuntime: runtimeProbe.runtime,
            nextAction: runtimeProbe.nextAction,
            preflightMessage: runtimeProbe.message,
            postInstallQueue: runtimeProbe.postInstallQueue,
            defaultCapabilities: gate.defaultCapabilities,
          });
        }

        const detail = mcpServerInstallApprovalDetail({ preview, workspace: options.workspace, preflight: preflight.command });
        const allowed = await (options.authorizeInstall?.({ thread, workspace: options.workspace, preview, preflight: preflight.command, detail }) ?? true);
        if (!allowed) {
          return toolResult(
            "MCP server install denied by Ambient Desktop approval. No ToolHive changes were made. Do not retry the same install unchanged; revise the reviewed permissions/source or report the denial to the user.",
            {
              runtime: "ambient-mcp",
              toolName: "ambient_mcp_server_install",
              status: "denied",
              retryable: false,
              serverId,
              workloadName: preview.runPlan.workloadName,
              toolHiveVolumes: preview.toolHiveVolumes,
            },
          );
        }

        onUpdate?.({
          content: [{ type: "text", text: `Installing MCP server ${serverId} through ToolHive.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_install",
            status: "installing",
            serverId,
            workloadName: preview.runPlan.workloadName,
          },
        });
        const result = await options.toolHive.runRegistryServer({
          serverId,
          workloadName: preview.runPlan.workloadName,
          registrySource: preview.catalogSource,
          sourceIdentity: mcpInstallPreviewSourceIdentity(preview),
          ...(preview.defaultDescriptor
            ? {
                defaultCatalogDescriptorHash: mcpDefaultCatalogDescriptorHash(preview.defaultDescriptor),
                defaultCatalogReviewedAt: preview.defaultDescriptor.source.reviewedAt,
              }
            : {}),
          installReview: mcpInstallPreviewReviewState(preview, new Date().toISOString()),
          secretBindings: mcpInstallPreviewSecretBindings(preview),
          transport: preview.runPlan.transport,
          permissionProfile: preview.permissionProfile.profile,
          volumes: preview.toolHiveVolumes,
        });
        onUpdate?.({
          content: [{ type: "text", text: `Waiting for MCP workload ${preview.runPlan.workloadName} to expose its ToolHive endpoint.` }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_server_install",
            status: "waiting-for-endpoint",
            serverId,
            workloadName: preview.runPlan.workloadName,
          },
        });
        const workload = await options.toolHive.waitForAmbientWorkload(preview.runPlan.workloadName, { timeoutMs: 90_000 });
        await options.toolHive.updateInstalledServerEndpoint({
          workloadName: preview.runPlan.workloadName,
          endpoint: workload.endpoint,
        });
        const validation = await validateInstalledMcpTools({
          options,
          toolName: "ambient_mcp_server_install",
          serverId,
          workloadName: preview.runPlan.workloadName,
          onUpdate,
          signal,
        });
        const installRevision = await recordInstalledMcpAutowireRevision({
          options,
          preview,
          workloadName: preview.runPlan.workloadName,
          summary: `Installed MCP server ${serverId} as ToolHive workload ${preview.runPlan.workloadName}.`,
        });
        return toolResult(mcpServerInstallResultTextWithRevision(preview, result, workload, validation, installRevision), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_install",
          status: validation.status,
          serverId,
          workloadName: preview.runPlan.workloadName,
          workloadStatus: workload.status,
          endpoint: workload.endpoint,
          installValidationStatus: validation.status,
          toolCount: validation.toolCount,
          descriptorHash: validation.descriptorHash,
          validationError: validation.error,
          activeRevisionId: installRevision?.revision.revisionId,
          previousActiveRevisionId: installRevision?.previousActiveRevisionId,
          command: result.command,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          toolHiveVolumes: preview.toolHiveVolumes,
          permissionProfile: {
            path: preview.permissionProfile.path,
            sha256: preview.permissionProfile.sha256,
          },
        });
      },
    },
    {
      ...runtimeRepairDescribe,
      parameters: runtimeRepairDescribe.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const thread = options.getThread();
        onUpdate?.({
          content: [{ type: "text", text: "Previewing MCP runtime repair from diagnostics." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_runtime_repair_describe",
            status: "previewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const candidateResolution = await runtimeRepairCandidateInput(options, input);
        const result = describeMcpAutowireRuntimeRepair({
          candidate: candidateResolution.candidate,
          candidateRef: candidateResolution.candidateRef,
          parentRevisionId: candidateResolution.parentRevisionId,
          expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? candidateResolution.expectedCandidateHash,
          serverId: candidateResolution.serverId,
          workloadName: candidateResolution.workloadName,
          failureText: optionalString(input.failureText),
          logText: optionalString(input.logText) ?? candidateResolution.installedValidationError,
          reason: optionalString(input.reason),
        });
        return toolResult(mcpAutowireRuntimeRepairText(result), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_runtime_repair_describe",
          status: result.status,
          serverId: result.serverId,
          workloadName: result.workloadName,
          candidateRef: result.candidateRef,
          parentRevisionId: result.parentRevisionId,
          backfilledRevisionId: candidateResolution.backfilledRevisionId,
          operationCount: result.operations.length,
          operations: result.operations,
          detectedIssues: result.detectedIssues,
          editStatus: result.editPreview?.status,
          editedCandidateHash: result.editPreview?.editedCandidateHash,
          permissionExpanding: result.editPreview?.permissionExpanding,
          nextToolName: result.editPreview?.nextToolName,
          nextToolInput: result.editPreview?.nextToolInput,
        });
      },
    },
    {
      ...runtimeRepairApply,
      parameters: runtimeRepairApply.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params, _signal, onUpdate) => {
        const input = objectInput(params);
        const thread = options.getThread();
        onUpdate?.({
          content: [{ type: "text", text: "Previewing MCP runtime repair before approval." }],
          details: {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_runtime_repair_apply",
            status: "previewing",
            threadId: thread.id,
            collaborationMode: thread.collaborationMode,
          },
        });
        const candidateResolution = await runtimeRepairCandidateInput(options, input);
        const preview = describeMcpAutowireRuntimeRepair({
          candidate: candidateResolution.candidate,
          candidateRef: candidateResolution.candidateRef,
          parentRevisionId: candidateResolution.parentRevisionId,
          expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? candidateResolution.expectedCandidateHash,
          serverId: candidateResolution.serverId,
          workloadName: candidateResolution.workloadName,
          failureText: optionalString(input.failureText),
          logText: optionalString(input.logText) ?? candidateResolution.installedValidationError,
          reason: optionalString(input.reason),
        });
        if (!preview.editPreview) {
          return toolResult(mcpAutowireRuntimeRepairText(preview), {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_runtime_repair_apply",
            status: preview.status,
            serverId: preview.serverId,
            workloadName: preview.workloadName,
            backfilledRevisionId: candidateResolution.backfilledRevisionId,
            operationCount: 0,
            detectedIssues: preview.detectedIssues,
          });
        }
        const detail = mcpAutowireRuntimeRepairText(preview);
        const allowed = await (options.authorizeRuntimeRepair?.({ thread, workspace: options.workspace, preview, detail }) ?? true);
        if (!allowed) throw new Error("MCP runtime repair blocked by Ambient Desktop approval prompt.");
        const applyResult = applyMcpAutowirePlanEdit({
          describeResult: preview.editPreview,
          store: options.planRevisions,
          putCandidateRef: (candidate, candidateHash) => options.putCandidateRef?.(candidate, candidateHash),
        });
        if (applyResult.revision && (preview.serverId || preview.workloadName)) {
          options.planRevisions?.recordCandidate({
            candidate: applyResult.editedCandidate ?? preview.editPreview.editedCandidate!,
            source: "runtime-repair",
            summary: optionalString(input.reason) ?? "Applied typed MCP runtime repair plan.",
            candidateRef: applyResult.candidateRef,
            parentRevisionId: applyResult.revision.revisionId,
            serverId: preview.serverId,
            workloadName: preview.workloadName,
            edit: {
              reason: optionalString(input.reason),
              operations: applyResult.operations,
              permissionExpanding: applyResult.permissionExpanding,
              approvalReasons: applyResult.approvalReasons,
            },
          });
        }
        const result = {
          ...preview,
          candidateRef: applyResult.candidateRef,
          applyResult,
        };
        const directRepairInstallHandoff = applyResult.candidateRef
          ? {
              nextToolName: "ambient_mcp_standard_import_install" as const,
              nextToolInput: {
                candidateRef: applyResult.candidateRef,
                ...(applyResult.editedCandidateHash ? { expectedCandidateHash: applyResult.editedCandidateHash } : {}),
              },
            }
          : undefined;
        const resultText = [
          mcpAutowireRuntimeRepairText(result),
          preview.parentRevisionId ? [
            "",
            `Rollback target revision: ${preview.parentRevisionId}`,
            "If the repaired reinstall behaves unexpectedly, use this revision id as the audit target for a future managed rollback flow.",
          ].join("\n") : undefined,
          directRepairInstallHandoff
            ? [
                "",
                "Direct Standard MCP reinstall handoff:",
                `Next tool: ${directRepairInstallHandoff.nextToolName} ${JSON.stringify(directRepairInstallHandoff.nextToolInput)}`,
                "This uses the normal install approval and ToolHive runtime service; do not restart ToolHive or edit profiles directly.",
              ].join("\n")
            : undefined,
        ].filter(Boolean).join("\n");
        return toolResult(resultText, {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_runtime_repair_apply",
          status: applyResult.status,
          serverId: preview.serverId,
          workloadName: preview.workloadName,
          candidateRef: applyResult.candidateRef,
          revisionId: applyResult.revision?.revisionId,
          rollbackRevisionId: preview.parentRevisionId,
          backfilledRevisionId: candidateResolution.backfilledRevisionId,
          editedCandidateHash: applyResult.editedCandidateHash,
          permissionExpanding: applyResult.permissionExpanding,
          operationCount: applyResult.operations.length,
          detectedIssues: preview.detectedIssues,
          nextToolName: applyResult.nextToolName,
          nextToolInput: applyResult.nextToolInput,
          ...(directRepairInstallHandoff ? {
            directRepairNextToolName: directRepairInstallHandoff.nextToolName,
            directRepairNextToolInput: directRepairInstallHandoff.nextToolInput,
          } : {}),
        });
      },
    },
    {
      ...mcpSecretRequest,
      parameters: mcpSecretRequest.parameters as any,
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        const input = objectInput(params);
        const serverId = optionalString(input.serverId);
        const candidateRef = optionalString(input.candidateRef);
        const envName = requiredString(input, "envName");
        const expectedCandidateHash = optionalString(input.expectedCandidateHash);
        const candidate = serverId
          ? (await options.catalog.previewRegistryInstall({ serverId, secretBindings: [] })).candidate
          : parseMcpAutowireCandidate((await candidateOrRefInput(options, input)).candidate);
        const validation = validateMcpAutowireCandidate(candidate);
        if (expectedCandidateHash && validation.candidateHash && expectedCandidateHash !== validation.candidateHash) {
          throw new Error(`Candidate hash mismatch: expected ${expectedCandidateHash}, got ${validation.candidateHash}. Re-run autowire plan or review before requesting the secret.`);
        }
        const requirement = candidate.secrets.find((secret) => secret.name === envName);
        if (!requirement) {
          const target = serverId ?? candidate.id;
          throw new Error(`MCP server "${target}" does not declare env requirement "${envName}".`);
        }
        if (!options.requestMcpSecret) throw new Error("MCP secret request is unavailable in this runtime.");
        options.requestMcpSecret({
          ...(serverId ? { serverId } : {}),
          candidateId: candidate.id,
          ...(candidateRef ? { candidateRef } : {}),
          displayName: candidate.displayName,
          envName: requirement.name,
        });
        return toolResult([
          "MCP secret dialog requested",
          serverId ? `Server: ${serverId}` : `Candidate: ${candidate.displayName}`,
          `Candidate id: ${candidate.id}`,
          candidateRef ? `Candidate ref: ${candidateRef}` : undefined,
          `Env name: ${requirement.name}`,
          "Secret value: never exposed to Pi",
          "Next: after the user saves the secret, retry the MCP describe or install tool. Ambient will attach the saved secret ref automatically.",
        ].filter(Boolean).join("\n"), {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_secret_request",
          status: "requested",
          ...(serverId ? { serverId } : {}),
          candidateId: candidate.id,
          ...(candidateRef ? { candidateRef } : {}),
          envName: requirement.name,
        });
      },
    },
    {
      ...uninstall,
      parameters: uninstall.parameters as any,
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
          content: [{ type: "text", text: selected.runtimeLane === "guided-local-bridge" || selected.registrySource === "guided-local-bridge"
            ? `Removing guided local bridge registration ${selected.serverId} (${selected.workloadName}).`
            : `Removing MCP server ${selected.serverId} (${selected.workloadName}) through ToolHive.` }],
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
    },
  ];
}

async function probeMcpContainerRuntime(options: Pick<McpServerPiToolOptions, "toolHive" | "containerRuntimeProbe">): Promise<ContainerRuntimeProbeResult> {
  return options.containerRuntimeProbe
    ? options.containerRuntimeProbe()
    : probeContainerRuntime({ toolHive: options.toolHive });
}

async function evaluateMcpServerInstallGate(options: Pick<McpServerPiToolOptions, "toolHive" | "containerRuntimeProbe" | "installGate">): Promise<McpInstallGateResult> {
  if (options.installGate) return options.installGate();
  const runtimeProbe = await probeMcpContainerRuntime(options);
  if (runtimeProbe.status !== "ready" || !runtimeProbe.toolHive.preflight) {
    return {
      status: "runtime-preflight-failed",
      message: `Custom MCP plugin installs are blocked because the isolated container runtime is not ready.\n\n${containerRuntimeProbeSummary(runtimeProbe)}`,
      runtimeProbe,
      defaultCapabilities: [],
    };
  }
  return {
    status: "ready",
    message: "Isolated MCP runtime is ready for custom MCP plugin installs.",
    runtimeProbe,
    defaultCapabilities: [],
  };
}

interface McpInstallProtocolValidationResult {
  status: "ready" | "validation_failed";
  toolCount: number;
  descriptorHash?: string;
  error?: string;
}

async function validateInstalledMcpTools(input: {
  options: McpServerPiToolOptions;
  toolName: string;
  serverId: string;
  workloadName: string;
  onUpdate?: McpPiToolUpdate;
  signal?: AbortSignal;
}): Promise<McpInstallProtocolValidationResult> {
  const { options, toolName, serverId, workloadName, onUpdate, signal } = input;
  if (!workloadName.trim()) throw new Error(`Cannot validate MCP install ${serverId} because no workload name was recorded.`);
  onUpdate?.({
    content: [{ type: "text", text: `Validating MCP tool descriptors for ${serverId} with tools/list.` }],
    details: {
      runtime: "ambient-mcp",
      toolName,
      status: "validating-tools",
      serverId,
      workloadName,
    },
  });
  const bridge = new McpToolBridge({
    catalog: options.catalog,
    toolHive: options.toolHive,
    workspacePath: options.workspace.path,
    ...(options.mcpToolFetchImpl ? { fetchImpl: options.mcpToolFetchImpl } : {}),
  });
  try {
    const tools = await bridge.searchTools({ serverId, workloadName, refresh: true, signal });
    if (!tools.length) throw new Error("MCP tools/list returned no tool descriptors.");
    const descriptorHash = commonDescriptorHash(tools);
    await options.toolHive.updateInstalledServerInstallValidation({ workloadName, status: "ready" });
    return {
      status: "ready",
      toolCount: tools.length,
      ...(descriptorHash ? { descriptorHash } : {}),
    };
  } catch (error) {
    const message = errorMessage(error);
    await options.toolHive.updateInstalledServerInstallValidation({ workloadName, status: "validation_failed", error: message });
    return {
      status: "validation_failed",
      toolCount: 0,
      error: message,
    };
  }
}

async function validateStandardImportInstallShape(input: {
  options: McpServerPiToolOptions;
  preview: McpStandardImportPreview;
  validation: McpInstallProtocolValidationResult;
}): Promise<McpInstallProtocolValidationResult> {
  const { options, preview, validation } = input;
  if (validation.status !== "ready" || !preview.runPlan) return validation;

  const state = await options.toolHive.readState();
  const installed = state.installedServers.find((server) => server.workloadName === preview.runPlan!.workloadName) ??
    state.installedServers.find((server) => server.serverId === preview.serverId);
  if (!installed) {
    const error = `Installed MCP state for ${preview.serverId} was not persisted after ToolHive startup.`;
    await options.toolHive.updateInstalledServerInstallValidation({
      workloadName: preview.runPlan.workloadName,
      status: "validation_failed",
      error,
    });
    return { ...validation, status: "validation_failed", error };
  }

  const compatibility = standardImportExistingCompatibility(installed, preview);
  if (compatibility.compatible) {
    const exchangeValidation = await validateStandardImportManagedFileExchange(installed, preview);
    if (exchangeValidation.ok) return validation;
    const error = exchangeValidation.message;
    await options.toolHive.updateInstalledServerInstallValidation({
      workloadName: installed.workloadName,
      status: "validation_failed",
      error,
    });
    return { ...validation, status: "validation_failed", error };
  }

  const error = `Installed MCP state for ${preview.serverId} is missing required Ambient runtime shape: ${compatibility.reasons.join("; ")}. Re-run ambient_mcp_standard_import_install to repair the ToolHive workload before calling tools that need managed file exchange.`;
  await options.toolHive.updateInstalledServerInstallValidation({
    workloadName: installed.workloadName,
    status: "validation_failed",
    error,
  });
  return { ...validation, status: "validation_failed", error };
}

async function validateStandardImportManagedFileExchange(
  installed: ToolHiveInstalledServerState,
  preview: McpStandardImportPreview,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!preview.toolHiveVolumes.some((volume) => volume.purpose === MCP_MANAGED_FILE_EXCHANGE_PURPOSE)) {
    return { ok: true };
  }
  if (!installed.managedFileExchange) {
    return { ok: false, message: `Installed MCP state for ${preview.serverId} is missing Ambient managed MCP file exchange metadata.` };
  }
  const hostAccess = await validateMcpManagedFileExchangeHostAccess(installed.managedFileExchange);
  if (!hostAccess.ok) {
    return {
      ok: false,
      message: `${hostAccess.message} Re-run ambient_mcp_standard_import_install to repair the ToolHive managed file exchange before calling tools with file inputs.`,
    };
  }
  return { ok: true };
}

function commonDescriptorHash(tools: McpToolDescriptor[]): string | undefined {
  const hashes = [...new Set(tools.map((tool) => tool.descriptorHash).filter((hash): hash is string => Boolean(hash)))];
  return hashes.length === 1 ? hashes[0] : undefined;
}

interface McpServerDiagnosticsResult {
  server: McpInstalledServerSummary;
  state?: ToolHiveInstalledServerState;
  permissionProfile?: {
    path: string;
    sha256: string;
    expectedSha256: string;
    sha256Verified: boolean;
    network?: {
      mode: "broad" | "allowlist" | "isolated";
      allowHosts: string[];
      allowPorts: number[];
    };
    filesystem?: {
      workspaceRead: boolean;
      workspaceWrite: boolean;
      extraMountCount: number;
    };
    error?: string;
  };
  logs?: {
    status: "fetched" | "skipped" | "failed";
    exitCode?: number;
    text?: string;
    redacted?: boolean;
    error?: string;
  };
}

async function mcpServerDiagnostics(
  options: McpServerPiToolOptions,
  input: { serverId?: string; workloadName?: string; logLines?: number },
): Promise<McpServerDiagnosticsResult> {
  const servers = await options.catalog.listInstalledServers();
  const server = selectInstalledServer(servers, input);
  const state = (await options.toolHive.readState()).installedServers.find((candidate) => candidate.workloadName === server.workloadName);
  let permissionProfile: McpServerDiagnosticsResult["permissionProfile"];
  try {
    const profile = await options.toolHive.readInstalledServerPermissionProfile(server.workloadName);
    const summary = permissionProfileSummary(profile.profile);
    permissionProfile = {
      path: profile.path,
      sha256: profile.sha256,
      expectedSha256: profile.expectedSha256,
      sha256Verified: profile.sha256Verified,
      ...summary,
    };
  } catch (error) {
    permissionProfile = {
      path: server.permissionProfilePath,
      sha256: "",
      expectedSha256: server.permissionProfileSha256,
      sha256Verified: false,
      error: errorMessage(error),
    };
  }

  let logs: McpServerDiagnosticsResult["logs"];
  const guidedLocal = server.runtimeLane === "guided-local-bridge" || server.registrySource === "guided-local-bridge";
  if (guidedLocal) {
    logs = { status: "skipped", text: "Guided-local bridge endpoints are user-run software; Ambient has no ToolHive workload logs for this registration." };
  } else {
    try {
      const command = await options.toolHive.readWorkloadLogs(server.workloadName, input.logLines ?? 80);
      const raw = [command.stdout, command.stderr].filter(Boolean).join("\n").trim();
      const redacted = truncateDiagnosticText(redactSensitiveText(raw || "(no recent ToolHive logs returned)"), 6_000);
      logs = {
        status: command.exitCode === 0 ? "fetched" : "failed",
        exitCode: command.exitCode,
        text: redacted,
        redacted: redacted !== raw,
        ...(command.exitCode === 0 ? {} : { error: `ToolHive logs exited ${command.exitCode}` }),
      };
    } catch (error) {
      logs = { status: "failed", error: errorMessage(error) };
    }
  }

  return {
    server,
    ...(state ? { state } : {}),
    ...(permissionProfile ? { permissionProfile } : {}),
    ...(logs ? { logs } : {}),
  };
}

function truncateDiagnosticText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated ${value.length - maxChars} chars]`;
}

function permissionProfileSummary(profile: unknown): Pick<NonNullable<McpServerDiagnosticsResult["permissionProfile"]>, "network" | "filesystem"> {
  const record = isPlainRecord(profile) ? profile : {};
  const network = isPlainRecord(record.network) ? record.network : {};
  const outbound = isPlainRecord(network.outbound) ? network.outbound : {};
  const allowHosts = stringArray(outbound.allow_host ?? outbound.allowHost ?? outbound.allow_hosts ?? outbound.allowHosts);
  const allowPorts = numberArray(outbound.allow_port ?? outbound.allowPort ?? outbound.allow_ports ?? outbound.allowPorts);
  const broad = outbound.insecure_allow_all === true || outbound.insecureAllowAll === true;
  const filesystem = isPlainRecord(record.filesystem) ? record.filesystem : {};
  const extraMounts = Array.isArray(filesystem.extraMounts) ? filesystem.extraMounts : [];
  return {
    network: {
      mode: broad ? "broad" : allowHosts.length || allowPorts.length ? "allowlist" : "isolated",
      allowHosts,
      allowPorts,
    },
    filesystem: {
      workspaceRead: filesystem.workspaceRead === true,
      workspaceWrite: filesystem.workspaceWrite === true,
      extraMountCount: extraMounts.length,
    },
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).map((entry) => entry.trim())
    : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is number => Number.isInteger(entry) && entry > 0 && entry <= 65535)
    : [];
}

async function installDefaultCapabilityFromServerTool(input: {
  options: McpServerPiToolOptions;
  thread: McpServerPiToolThread;
  serverId: string;
  capabilityId: "scrapling";
  onUpdate?: McpPiToolUpdate;
  signal?: AbortSignal;
}): Promise<AgentToolResult<Record<string, unknown>>> {
  const { options, thread, serverId, capabilityId, onUpdate, signal } = input;
  onUpdate?.({
    content: [{ type: "text", text: `Previewing Ambient default capability ${capabilityId} before install approval.` }],
    details: {
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "previewing",
      serverId,
      capabilityId,
      defaultCapability: true,
    },
  });
  const preview = await options.catalog.previewDefaultCapabilityInstall({ capabilityId });
  if (!preview.runPlan || !preview.toolHiveRunSource || preview.review.blockers.length) {
    return toolResult(`MCP default capability install is blocked.\n\n${mcpDefaultCapabilityInstallPreviewText(preview)}`, {
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "blocked",
      serverId,
      capabilityId,
      defaultCapability: true,
      blockerCount: preview.review.blockers.length,
      warningCount: preview.review.warnings.length,
    });
  }

  onUpdate?.({
    content: [{ type: "text", text: "Checking isolated ToolHive runtime before Ambient default capability install." }],
    details: {
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "preflight",
      serverId,
      capabilityId,
      defaultCapability: true,
    },
  });
  const gate = await evaluateMcpServerInstallGate(options);
  const runtimeProbe = gate.runtimeProbe;
  const preflight = runtimeProbe.toolHive.preflight;
  if (gate.status !== "ready" || !preflight) {
    options.onContainerRuntimeSetupNeeded?.({
      capabilityId,
      serverId,
      reason: "default-capability-install-runtime-not-ready",
    });
    return toolResult(
      [
        "MCP default capability install is blocked because the isolated container runtime is not ready.",
        "",
        mcpInstallGateSummary(gate),
        "",
        `Next: complete the isolated runtime setup dialog, then call ambient_mcp_server_install again with serverId=${serverId}.`,
      ].join("\n"),
      {
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_server_install",
        status: gate.status,
        blockerKind: "runtime",
        retryable: true,
        doNotUseShell: true,
        serverId,
        capabilityId,
        defaultCapability: true,
        runtimeStatus: runtimeProbe.status,
        detectedRuntime: runtimeProbe.runtime,
        nextAction: runtimeProbe.nextAction,
        preflightMessage: runtimeProbe.message,
        postInstallQueue: runtimeProbe.postInstallQueue,
        defaultCapabilities: gate.defaultCapabilities,
      },
    );
  }

  const detail = mcpServerInstallApprovalDetail({ preview, workspace: options.workspace, preflight: preflight.command });
  const allowed = await (options.authorizeInstall?.({ thread, workspace: options.workspace, preview, preflight: preflight.command, detail }) ?? true);
  if (!allowed) throw new Error("MCP default capability install blocked by Ambient Desktop approval prompt.");

  onUpdate?.({
    content: [{ type: "text", text: `Installing Ambient default capability ${capabilityId} through ToolHive.` }],
    details: {
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_server_install",
      status: "installing",
      serverId,
      capabilityId,
      defaultCapability: true,
      workloadName: preview.runPlan.workloadName,
    },
  });
  const result = await installDefaultMcpCapability({
    capabilityId,
    catalog: options.catalog,
    toolHive: options.toolHive,
    ...(options.defaultCapabilityImageResolver ? { imageResolver: options.defaultCapabilityImageResolver } : {}),
    ...(options.defaultCapabilityImagePuller ? { imagePuller: options.defaultCapabilityImagePuller } : {}),
  });
  const workloadName = result.preview.runPlan?.workloadName ?? result.workload.name;
  const validation = await validateInstalledMcpTools({
    options,
    toolName: "ambient_mcp_server_install",
    serverId,
    workloadName: workloadName ?? "",
    onUpdate,
    signal,
  });
  return toolResult(mcpDefaultCapabilityInstallResultText(result.preview, result.command, result.workload, validation), {
    runtime: "ambient-mcp",
    toolName: "ambient_mcp_server_install",
    status: validation.status,
    serverId,
    capabilityId,
    defaultCapability: true,
    workloadName,
    workloadStatus: result.workload.status,
    endpoint: result.workload.endpoint,
    installValidationStatus: validation.status,
    toolCount: validation.toolCount,
    descriptorHash: validation.descriptorHash,
    validationError: validation.error,
    command: result.command.command,
    exitCode: result.command.exitCode,
    durationMs: result.command.durationMs,
    adoptedExistingWorkload: result.adoptedExistingWorkload,
    permissionProfile: {
      path: result.preview.permissionProfile.path,
      sha256: result.preview.permissionProfile.sha256,
    },
  });
}

export function mcpServerInstallApprovalDetail(input: {
  preview: McpServerInstallPreviewForApproval;
  workspace: McpServerPiToolWorkspace;
  preflight: ToolHiveCommandResult;
}): string {
  const runPlan = input.preview.runPlan;
  const commandShape = runPlan
    ? isDefaultCapabilityInstallPreview(input.preview)
      ? `- Command shape: thv run --name ${runPlan.workloadName} --group ${runPlan.group} --isolate-network --permission-profile ${runPlan.permissionProfilePath} ${input.preview.toolHiveRunSource}${input.preview.toolHiveServerArgs.length ? ` -- ${input.preview.toolHiveServerArgs.join(" ")}` : ""}`
      : input.preview.catalogSource === "standard-mcp-import"
      ? standardImportCommandShape(input.preview as McpStandardImportPreview, runPlan)
      : input.preview.catalogSource === "remote-mcp-proxy"
        ? `- Command shape: thv run --name ${runPlan.workloadName} --group ${runPlan.group} --isolate-network --permission-profile ${runPlan.permissionProfilePath} ${(input.preview as McpRemoteMcpProxyPreview).toolHiveRemoteUrl}`
        : registryInstallCommandShape(input.preview as McpRegistryInstallPreview, runPlan)
    : "- Command shape: unavailable";
  return [
    isDefaultCapabilityInstallPreview(input.preview)
      ? mcpDefaultCapabilityInstallPreviewText(input.preview)
      : mcpInstallPreviewText(input.preview),
    "",
    "Approval context:",
    `- Workspace: ${input.workspace.path}`,
    `- ToolHive runtime preflight: exit ${input.preflight.exitCode}`,
    commandShape,
    "- Secret delivery: Ambient resolves approved refs into short-lived ToolHive env/token files when required.",
    "- Secret values: never exposed to Pi or command arguments.",
  ].join("\n");
}

function registryInstallCommandShape(preview: McpRegistryInstallPreview, runPlan: NonNullable<McpRegistryInstallPreview["runPlan"]>): string {
  const volumes = preview.toolHiveVolumes.length
    ? ` ${preview.toolHiveVolumes.map((volume) => `--volume ${toolHiveVolumeCommandArg(volume)}`).join(" ")}`
    : "";
  return `- Command shape: thv run --name ${runPlan.workloadName} --group ${runPlan.group} --isolate-network --permission-profile ${runPlan.permissionProfilePath}${volumes} ${runPlan.serverId}`;
}

function standardImportCommandShape(preview: McpStandardImportPreview, runPlan: NonNullable<McpStandardImportPreview["runPlan"]>): string {
  const runtimeImage = preview.toolHiveRuntimeImage ? ` --runtime-image ${preview.toolHiveRuntimeImage}` : "";
  const volumes = preview.toolHiveVolumes.length
    ? ` ${preview.toolHiveVolumes.map((volume) => `--volume ${toolHiveVolumeCommandArg(volume)}`).join(" ")}`
    : "";
  const serverArgs = preview.toolHiveServerArgs.length ? ` -- ${preview.toolHiveServerArgs.join(" ")}` : "";
  return `- Command shape: thv run --name ${runPlan.workloadName} --group ${runPlan.group} --isolate-network --permission-profile ${runPlan.permissionProfilePath}${runtimeImage}${volumes} ${preview.toolHiveRunSource}${serverArgs}`;
}

function toolHiveVolumeCommandArg(volume: { hostPath: string; containerPath: string; mode: string }): string {
  const base = `${volume.hostPath}:${volume.containerPath}`;
  return volume.mode === "ro" ? `${base}:ro` : base;
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
  ].filter(Boolean).join("\n");
}

export function mcpGuidedLocalBridgePreflightApprovalDetail(input: {
  preview: McpGuidedLocalBridgePreview;
  workspace: McpServerPiToolWorkspace;
}): string {
  return [
    mcpGuidedLocalBridgePreviewText(input.preview),
    "",
    "Approval context:",
    `- Workspace: ${input.workspace.path}`,
    `- Action: perform bounded GET requests only to ${input.preview.bridge.bridgeProbeUrl}${input.preview.bridge.upstreamAppUrl ? ` and ${input.preview.bridge.upstreamAppUrl}` : ""}.`,
    "- No local software will be installed, launched, modified, or stopped.",
    "- No bridge tools will be called by this preflight.",
  ].join("\n");
}

export function mcpGuidedLocalBridgeRegisterApprovalDetail(input: {
  preview: McpGuidedLocalBridgePreview;
  workspace: McpServerPiToolWorkspace;
  secretBindings?: McpSecretBinding[];
}): string {
  const secretBindings = input.secretBindings ?? [];
  return [
    mcpGuidedLocalBridgePreviewText(input.preview),
    "",
    "Approval context:",
    `- Workspace: ${input.workspace.path}`,
    `- Action: re-check ${input.preview.bridge.bridgeProbeUrl}${input.preview.bridge.upstreamAppUrl ? ` and ${input.preview.bridge.upstreamAppUrl}` : ""}, register this bridge in global Ambient MCP state, then call MCP tools/list for descriptor discovery.`,
    secretBindings.length
      ? `- Secret refs: record approved Ambient secret refs for ${secretBindings.map((binding) => binding.envName).join(", ")}. Values are not shown, logged, or passed to Pi.`
      : "- Secret refs: none bound.",
    "- No local software will be installed, launched, modified, or stopped.",
    "- No non-discovery MCP tools will be called by registration.",
    "- Later MCP tool calls still go through ambient_mcp_tool_call approval and schema validation.",
  ].join("\n");
}

function mcpGuidedLocalBridgeRegisterResultText(
  preview: McpGuidedLocalBridgePreview,
  workloadName: string,
  toolCount: number,
  descriptorReviewText: string,
): string {
  return [
    `Registered guided local bridge ${preview.serverId}.`,
    `Workload: ${workloadName}`,
    `Endpoint: ${preview.bridge.bridgeProbeUrl}`,
    `Discovered tools: ${toolCount}`,
    "Ambient did not install, launch, modify, or stop local software.",
    "",
    descriptorReviewText,
    "",
    mcpToolDiscoveryNextAction(preview.serverId, workloadName),
  ].join("\n");
}

function mcpServerDiagnosticsText(input: McpServerDiagnosticsResult): string {
  const server = input.server;
  const profile = input.permissionProfile;
  const logs = input.logs;
  const secretText = server.secretBindingCount
    ? `${server.secretBindingCount} binding(s)${server.secretBindingEnvNames?.length ? ` env=${server.secretBindingEnvNames.join(",")}` : ""}${server.derivedSecretBindingCount ? ` derived=${server.derivedSecretBindingCount}` : ""}`
    : "none";
  return [
    `MCP server diagnostics for ${server.serverId}.`,
    `Workload: ${server.workloadName}`,
    `Runtime status: ${server.workloadStatus ?? "unknown"}`,
    server.endpoint ? `Endpoint: ${server.endpoint}` : "Endpoint: none",
    `Install validation: ${server.installValidationStatus ?? "unknown"}`,
    server.installValidationError ? `Validation error: ${server.installValidationError}` : undefined,
    `Descriptor snapshot: ${server.lastKnownToolDescriptorHash ?? "none"}`,
    typeof server.lastKnownToolCount === "number" ? `Last known tools: ${server.lastKnownToolCount}` : undefined,
    server.toolDescriptorReviewStatus ? `Descriptor review: ${server.toolDescriptorReviewStatus}` : undefined,
    server.toolDescriptorReviewReason ? `Descriptor review reason: ${server.toolDescriptorReviewReason}` : undefined,
    server.lastToolDiscoveryAt ? `Last tool discovery: ${server.lastToolDiscoveryAt}` : undefined,
    profile ? `Permission profile: ${profile.path}` : undefined,
    profile ? `Permission profile sha256: ${profile.sha256 || "unreadable"} expected=${profile.expectedSha256} verified=${profile.sha256Verified}` : undefined,
    profile?.network ? `Network permission: ${profile.network.mode}${profile.network.allowHosts.length ? ` hosts=${profile.network.allowHosts.join(",")}` : ""}${profile.network.allowPorts.length ? ` ports=${profile.network.allowPorts.join(",")}` : ""}` : undefined,
    profile?.filesystem ? `Filesystem permission: workspaceRead=${profile.filesystem.workspaceRead} workspaceWrite=${profile.filesystem.workspaceWrite} extraMounts=${profile.filesystem.extraMountCount}` : undefined,
    profile?.error ? `Permission profile error: ${profile.error}` : undefined,
    `Secret bindings: ${secretText}`,
    logs ? `Log status: ${logs.status}${typeof logs.exitCode === "number" ? ` exit=${logs.exitCode}` : ""}` : undefined,
    logs?.error ? `Log error: ${logs.error}` : undefined,
    logs?.text ? ["Recent ToolHive logs:", logs.text].join("\n") : undefined,
    "",
    server.installValidationStatus === "validation_failed"
      ? validationFailureNextAction(logs?.text)
      : "Next: use ambient_mcp_tool_search/describe for callable tools, or rerun diagnostics if runtime status changes.",
  ].filter(Boolean).join("\n");
}

function validationFailureNextAction(logText: string | undefined): string {
  if (logText && /arguments are required:\s*file/i.test(logText) && /--mcp\b/i.test(logText)) {
    return [
      "Next: diagnostics indicate the package default CLI ran without its MCP/server-mode switch.",
      "Remove this unhealthy server, rerun ambient_mcp_autowire_plan with the same source, and prefer a Standard MCP candidate that keeps the same package identifier but adds fixed packageArguments [{ type: \"switch\", name: \"--mcp\", isFixed: true }].",
      "If evidence instead requires a different executable or python -m module, use runtime.package.entrypoint and defer to a reviewed custom ToolHive source image when ToolHive cannot encode the override.",
    ].join(" ");
  }
  return "Next: fix the package/runtime issue, reinstall when ready, or remove this server with ambient_mcp_server_uninstall.";
}

type StandardImportRuntimeFailureSourceBuildRoute = {
  kind: "custom-source-build";
  status: "available";
  reason: string;
  evidenceRefs: string[];
  nextToolName: "ambient_mcp_autowire_source_build_describe";
  nextToolInput: Record<string, unknown>;
};

function standardImportRuntimeFailureRecovery(
  preview: McpStandardImportPreview,
  failure: string,
): {
  text: string;
  failure: string;
  nextToolName?: "ambient_mcp_autowire_source_build_describe";
  nextToolInput?: Record<string, unknown>;
  fallbackRoutes: Array<Record<string, unknown>>;
} {
  const sourceBuildRoute = standardImportRuntimeFailureSourceBuildRoute(preview);
  const structuredFallbacks = sourceBuildRoute ? [sourceBuildRoute, ...preview.fallbackRoutes] : preview.fallbackRoutes;
  const exactSourceText = preview.candidate.source.url
    ? `This preserves the requested source ${preview.candidate.source.url}.`
    : "This preserves the reviewed Standard MCP candidate.";
  return {
    text: [
      "Standard MCP import failed inside the managed Ambient ToolHive installer.",
      "",
      failure,
      "",
      sourceBuildRoute
        ? [
            "Managed recovery route:",
            `- preferred next tool: ${sourceBuildRoute.nextToolName} ${JSON.stringify(sourceBuildRoute.nextToolInput)}`,
            `- reason: ${sourceBuildRoute.reason}`,
            `- ${exactSourceText}`,
            "- do not search for or install registry substitutes unless the user explicitly approves changing the requested MCP source.",
            "- do not use shell, raw ToolHive, direct package-manager installs, or local bridge workarounds.",
          ].join("\n")
        : [
            "Managed recovery route: none available from this candidate.",
            "Report the ToolHive package-source failure to the user instead of using shell, raw ToolHive, direct package-manager installs, or local bridge workarounds.",
          ].join("\n"),
    ].join("\n"),
    failure,
    ...(sourceBuildRoute ? {
      nextToolName: sourceBuildRoute.nextToolName,
      nextToolInput: sourceBuildRoute.nextToolInput,
    } : {}),
    fallbackRoutes: structuredFallbacks,
  };
}

function standardImportRuntimeFailureSourceBuildRoute(preview: McpStandardImportPreview): StandardImportRuntimeFailureSourceBuildRoute | undefined {
  const existing = preview.fallbackRoutes.find((route) => route.kind === "custom-source-build");
  if (existing) return existing as unknown as StandardImportRuntimeFailureSourceBuildRoute;
  if (preview.candidate.source.kind !== "github" || !preview.candidate.source.url) return undefined;
  const nextToolInput = {
    ...(preview.candidateRef ? { candidateRef: preview.candidateRef } : { candidate: preview.candidate }),
    ...(preview.validation.candidateHash ? { expectedCandidateHash: preview.validation.candidateHash } : {}),
  };
  return {
    kind: "custom-source-build",
    status: "available",
    reason: "ToolHive could not run the package-backed Standard MCP source; continue through Ambient's reviewed source-build lane for the same GitHub source.",
    evidenceRefs: preview.candidate.evidence.map((entry) => entry.id).slice(0, 20),
    nextToolName: "ambient_mcp_autowire_source_build_describe",
    nextToolInput,
  };
}

function mcpServerInstallResultText(
  preview: McpInstallPreview,
  result: ToolHiveCommandResult,
  workload?: { status?: string; endpoint?: string },
  validation?: McpInstallProtocolValidationResult,
): string {
  const runPlan = preview.runPlan;
  const validationFailed = validation?.status === "validation_failed";
  return [
    validationFailed
      ? `MCP server ${preview.serverId} started but failed MCP protocol validation.`
      : validation?.status === "ready"
        ? `MCP server ${preview.serverId} is ready.`
        : `Installed MCP server ${preview.serverId}.`,
    runPlan ? `Workload: ${runPlan.workloadName}` : undefined,
    workload?.status ? `Runtime status: ${workload.status}` : undefined,
    workload?.endpoint ? `Endpoint: ${workload.endpoint}` : undefined,
    validation ? `Install validation: ${validation.status}` : undefined,
    validation?.toolCount ? `Discovered tools: ${validation.toolCount}` : undefined,
    validation?.descriptorHash ? `Descriptor hash: ${validation.descriptorHash}` : undefined,
    validation?.error ? `Validation error: ${validation.error}` : undefined,
    `ToolHive command: ${result.command}`,
    `Exit code: ${result.exitCode}`,
    `Permission profile: ${preview.permissionProfile.path}`,
    preview.candidate.validationPlan.expectedTools.length
      ? `Expected tools after discovery: ${preview.candidate.validationPlan.expectedTools.join(", ")}`
      : undefined,
    validationFailed
      ? "Next: inspect the server with ambient_mcp_server_list, fix the package/runtime issue, or remove it with ambient_mcp_server_uninstall."
      : mcpToolDiscoveryNextAction(preview.serverId, runPlan?.workloadName),
  ].filter(Boolean).join("\n");
}

function mcpServerInstallResultTextWithRevision(
  preview: McpInstallPreview,
  result: ToolHiveCommandResult,
  workload: { status?: string; endpoint?: string } | undefined,
  validation: McpInstallProtocolValidationResult | undefined,
  installRevision: InstalledMcpAutowireRevisionRecord | undefined,
): string {
  return [
    mcpServerInstallResultText(preview, result, workload, validation),
    installRevision?.previousActiveRevisionId ? [
      "",
      `Previous active Autowire revision: ${installRevision.previousActiveRevisionId}`,
      `Current active Autowire revision: ${installRevision.revision.revisionId}`,
      "Rollback target is recorded for audit; rollback should use a managed Ambient install/repair flow, not raw ToolHive edits.",
    ].join("\n") : undefined,
  ].filter(Boolean).join("\n");
}

function mcpDefaultCapabilityInstallResultText(
  preview: McpDefaultCapabilityInstallPreview,
  result: ToolHiveCommandResult,
  workload?: { status?: string; endpoint?: string },
  validation?: McpInstallProtocolValidationResult,
): string {
  const validationFailed = validation?.status === "validation_failed";
  return [
    validationFailed
      ? `Ambient default capability ${preview.capabilityId} started but failed MCP protocol validation.`
      : validation?.status === "ready"
        ? `Ambient default capability ${preview.capabilityId} is ready.`
        : `Installed Ambient default capability ${preview.capabilityId}.`,
    `Server: ${preview.serverId}`,
    preview.runPlan ? `Workload: ${preview.runPlan.workloadName}` : undefined,
    workload?.status ? `Runtime status: ${workload.status}` : undefined,
    workload?.endpoint ? `Endpoint: ${workload.endpoint}` : undefined,
    validation ? `Install validation: ${validation.status}` : undefined,
    validation?.toolCount ? `Discovered tools: ${validation.toolCount}` : undefined,
    validation?.descriptorHash ? `Descriptor hash: ${validation.descriptorHash}` : undefined,
    validation?.error ? `Validation error: ${validation.error}` : undefined,
    `ToolHive command: ${result.command}`,
    `Exit code: ${result.exitCode}`,
    `Permission profile: ${preview.permissionProfile.path}`,
    preview.candidate.validationPlan.expectedTools.length
      ? `Expected tools after discovery: ${preview.candidate.validationPlan.expectedTools.join(", ")}`
      : undefined,
    validationFailed
      ? "Next: inspect the server with ambient_mcp_server_list, fix the package/runtime issue, or remove it with ambient_mcp_server_uninstall."
      : mcpToolDiscoveryNextAction(preview.serverId, preview.runPlan?.workloadName),
  ].filter(Boolean).join("\n");
}

function mcpToolDiscoveryNextAction(serverId: string, workloadName?: string): string {
  const searchInput = {
    serverId,
    ...(workloadName ? { workloadName } : {}),
    query: "<capability goal>",
    limit: 5,
  };
  return [
    "Next validation hints:",
    `- Search installed tools with ambient_mcp_tool_search ${JSON.stringify(searchInput)}.`,
    "- Describe the selected result with ambient_mcp_tool_describe before calling it; use the exact toolRef as toolName when convenient.",
    "- For install gates or stress tests, run one harmless smoke call that exercises the requested capability, then report whether the server works or has an upstream/runtime blocker.",
  ].join("\n");
}

function isDefaultCapabilityInstallPreview(preview: McpServerInstallPreviewForApproval): preview is McpDefaultCapabilityInstallPreview {
  return "capabilityId" in preview;
}

function mcpServerUninstallResultText(
  server: McpInstalledServerSummary,
  results: { stopResult?: ToolHiveCommandResult; removeResult: ToolHiveCommandResult },
): string {
  return [
    `Removed MCP server ${server.serverId}.`,
    `Workload: ${server.workloadName}`,
    results.stopResult ? `Stop command exit code: ${results.stopResult.exitCode}` : "Stop command: skipped because workload was reported stopped.",
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

async function installedServerForServerId(toolHive: ToolHiveRuntimeService, serverId: string): Promise<ToolHiveInstalledServerState | undefined> {
  const state = await toolHive.readState();
  return state.installedServers.find((server) => server.serverId === serverId);
}

function standardImportExistingCompatibility(
  existing: ToolHiveInstalledServerState,
  preview: McpStandardImportPreview,
): { compatible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if ((existing.registrySource ?? "standard-mcp-import") !== "standard-mcp-import") {
    reasons.push(`installed registry source is ${existing.registrySource ?? "unknown"} instead of standard-mcp-import`);
  }
  if (preview.toolHiveRunSource) {
    const previousSource = existing.sourceIdentity?.toolHiveRunSource;
    if (previousSource && previousSource !== preview.toolHiveRunSource) {
      reasons.push(`installed ToolHive source is ${previousSource} instead of ${preview.toolHiveRunSource}`);
    }
  }
  const desiredVolumes = preview.toolHiveVolumes ?? [];
  if (!toolHiveRunVolumesEqual(existing.runtimeVolumes ?? [], desiredVolumes)) {
    reasons.push("installed runtime volumes do not match the reviewed Standard MCP run plan");
  }
  if (existing.permissionProfileSha256 !== preview.permissionProfile.sha256) {
    reasons.push("installed permission profile does not match the reviewed Standard MCP run plan");
  }
  if (desiredVolumes.some((volume) => volume.purpose === "ambient-mcp-file-exchange") && !existing.managedFileExchange) {
    reasons.push("installed state is missing Ambient managed MCP file exchange metadata");
  }
  return { compatible: reasons.length === 0, reasons };
}

function standardImportStateMayBeRepaired(existing: ToolHiveInstalledServerState, preview: McpStandardImportPreview): boolean {
  if ((existing.registrySource ?? "standard-mcp-import") !== "standard-mcp-import") return false;
  const runtimeLane = existing.sourceIdentity?.runtimeLane;
  if (runtimeLane && runtimeLane !== "standard-mcp-import") return false;
  const previousSource = existing.sourceIdentity?.toolHiveRunSource;
  return !previousSource || !preview.toolHiveRunSource || previousSource === preview.toolHiveRunSource;
}

async function removeStaleStandardImportForRepair(input: {
  options: Pick<McpServerPiToolOptions, "toolHive">;
  existing: ToolHiveInstalledServerState;
  preview: McpStandardImportPreview;
  reasons: string[];
  onUpdate?: McpPiToolUpdate;
}): Promise<void> {
  const { options, existing, preview, reasons, onUpdate } = input;
  onUpdate?.({
    content: [{ type: "text", text: `Removing stale Standard MCP workload ${existing.workloadName} before repairing ${preview.serverId}.` }],
    details: {
      runtime: "ambient-mcp",
      toolName: "ambient_mcp_standard_import_install",
      status: "removing-stale-workload",
      serverId: preview.serverId,
      workloadName: existing.workloadName,
      nextWorkloadName: preview.runPlan?.workloadName,
      repairReasons: reasons,
    },
  });
  try {
    const stop = await options.toolHive.stopWorkload(existing.workloadName, 30);
    if (stop.exitCode !== 0 && !toolHiveRemovalLooksMissing(stop)) {
      throw new Error(`ToolHive stop exited ${stop.exitCode}.`);
    }
  } catch (error) {
    if (!toolHiveRemovalLooksMissing(error)) {
      throw new Error(`Cannot repair ${preview.serverId} because stale ToolHive workload ${existing.workloadName} could not be stopped: ${errorMessage(error)}`);
    }
  }
  try {
    const remove = await options.toolHive.removeWorkload(existing.workloadName);
    if (remove.exitCode === 0 || toolHiveRemovalLooksMissing(remove)) return;
    throw new Error(`ToolHive remove exited ${remove.exitCode}.`);
  } catch (error) {
    if (!toolHiveRemovalLooksMissing(error)) {
      throw new Error(`Cannot repair ${preview.serverId} because stale ToolHive workload ${existing.workloadName} could not be removed: ${errorMessage(error)}`);
    }
    await options.toolHive.removeInstalledServerState(existing.workloadName);
  }
}

async function sameNameStandardImportRuntimeConflict(
  toolHive: ToolHiveRuntimeService,
  preview: McpStandardImportPreview,
  existing?: ToolHiveInstalledServerState,
): Promise<ToolHiveWorkloadSummary | undefined> {
  const workloadName = preview.runPlan?.workloadName;
  if (!workloadName) return undefined;
  if (existing?.workloadName === workloadName) return undefined;
  try {
    return (await toolHive.listAmbientWorkloadSummaries({ all: true }))
      .find((workload) => workload.name === workloadName);
  } catch {
    return undefined;
  }
}

function toolHiveRemovalLooksMissing(value: unknown): boolean {
  const text = typeof value === "string"
    ? value
    : value && typeof value === "object" && "stdout" in value
      ? `${(value as { stdout?: unknown }).stdout ?? ""}\n${(value as { stderr?: unknown }).stderr ?? ""}`
      : errorMessage(value);
  return /\b(?:not found|no such workload|does not exist|unknown workload)\b/i.test(text);
}

function toolHiveRunVolumesEqual(left: ToolHiveRunVolume[], right: ToolHiveRunVolume[]): boolean {
  if (left.length !== right.length) return false;
  return stableToolHiveRunVolumes(left) === stableToolHiveRunVolumes(right);
}

function stableToolHiveRunVolumes(volumes: ToolHiveRunVolume[]): string {
  return JSON.stringify(volumes
    .map((volume) => ({
      hostPath: volume.hostPath.replace(/\/+$/, "") || "/",
      containerPath: volume.containerPath.replace(/\/+$/, "") || "/",
      mode: volume.mode,
      purpose: volume.purpose ?? "",
    }))
    .sort((left, right) => `${left.containerPath}\0${left.hostPath}\0${left.mode}\0${left.purpose}`
      .localeCompare(`${right.containerPath}\0${right.hostPath}\0${right.mode}\0${right.purpose}`)));
}

async function previewRegistryInstallWithStoredSecrets(
  options: Pick<McpServerPiToolOptions, "catalog" | "workspace">,
  input: { serverId: string; refresh?: boolean; explicitSecretBindings: McpSecretBinding[]; runtimeVolumes?: ToolHiveRunVolume[] },
) {
  const preview = await options.catalog.previewRegistryInstall({
    serverId: input.serverId,
    refresh: input.refresh,
    secretBindings: input.explicitSecretBindings,
    runtimeVolumes: input.runtimeVolumes,
  });
  const secretBindings = await storedMcpSecretBindingsForServer(
    options.workspace.path,
    input.serverId,
    preview.candidate,
    input.explicitSecretBindings,
  );
  if (sameSecretBindings(input.explicitSecretBindings, secretBindings)) return preview;
  return options.catalog.previewRegistryInstall({
    serverId: input.serverId,
    refresh: input.refresh,
    secretBindings,
    runtimeVolumes: input.runtimeVolumes,
  });
}

async function previewStandardMcpImportWithStoredSecrets(
  options: Pick<McpServerPiToolOptions, "catalog" | "workspace">,
  input: { candidate: Record<string, unknown>; candidateRef?: string; expectedCandidateHash?: string; explicitSecretBindings: McpSecretBinding[] },
) {
  const preview = await options.catalog.previewStandardMcpImport({
    candidate: input.candidate,
    ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
    expectedCandidateHash: input.expectedCandidateHash,
    secretBindings: input.explicitSecretBindings,
  });
  const secretBindings = await storedMcpSecretBindingsForCandidate(
    options.workspace.path,
    preview.candidate,
    input.explicitSecretBindings,
  );
  if (sameSecretBindings(input.explicitSecretBindings, secretBindings)) return preview;
  return options.catalog.previewStandardMcpImport({
    candidate: input.candidate,
    ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
    expectedCandidateHash: input.expectedCandidateHash,
    secretBindings,
  });
}

function standardImportInstallNextToolInput(preview: McpStandardImportPreview, expectedCandidateHash?: string): Record<string, unknown> {
  const candidateHash = expectedCandidateHash ?? preview.validation.candidateHash;
  return {
    ...(preview.candidateRef ? { candidateRef: preview.candidateRef } : { candidate: preview.candidate }),
    ...(candidateHash ? { expectedCandidateHash: candidateHash } : {}),
  };
}

async function previewRemoteMcpProxyWithStoredSecrets(
  options: Pick<McpServerPiToolOptions, "catalog" | "workspace">,
  input: { candidate: Record<string, unknown>; expectedCandidateHash?: string; explicitSecretBindings: McpSecretBinding[] },
) {
  const preview = await options.catalog.previewRemoteMcpProxy({
    candidate: input.candidate,
    expectedCandidateHash: input.expectedCandidateHash,
    secretBindings: input.explicitSecretBindings,
  });
  const secretBindings = await storedMcpSecretBindingsForCandidate(
    options.workspace.path,
    preview.candidate,
    input.explicitSecretBindings,
  );
  if (sameSecretBindings(input.explicitSecretBindings, secretBindings)) return preview;
  return options.catalog.previewRemoteMcpProxy({
    candidate: input.candidate,
    expectedCandidateHash: input.expectedCandidateHash,
    secretBindings,
  });
}

interface GuidedLocalBridgeSecretReview {
  blockers: string[];
  warnings: string[];
  missingRequiredEnvNames: string[];
  boundEnvNames: string[];
}

async function previewGuidedLocalBridgeWithStoredSecrets(
  options: Pick<McpServerPiToolOptions, "workspace">,
  input: { candidate: Record<string, unknown>; expectedCandidateHash?: string; explicitSecretBindings: McpSecretBinding[] },
) {
  const preview = previewGuidedLocalBridge({
    candidate: input.candidate,
    expectedCandidateHash: input.expectedCandidateHash,
  });
  const secretBindings = await storedMcpSecretBindingsForCandidate(
    options.workspace.path,
    preview.candidate,
    input.explicitSecretBindings,
  );
  return {
    preview,
    secretBindings,
    secretReview: guidedLocalBridgeSecretReview(preview, secretBindings),
  };
}

function guidedLocalBridgeSecretReview(
  preview: McpGuidedLocalBridgePreview,
  secretBindings: McpSecretBinding[],
): GuidedLocalBridgeSecretReview {
  const declaredSecretNames = new Set(preview.candidate.secrets.map((secret) => secret.name));
  const boundEnvNames = secretBindings.map((binding) => binding.envName);
  const boundEnvNameSet = new Set(boundEnvNames);
  const missingRequired = preview.candidate.secrets.filter((secret) => secret.required && !boundEnvNameSet.has(secret.name));
  const unknown = secretBindings.filter((binding) => !declaredSecretNames.has(binding.envName));
  const duplicateEnvNames = [...new Set(boundEnvNames.filter((envName, index) => boundEnvNames.indexOf(envName) !== index))];
  const invalid = secretBindings.filter((binding) => !isSecretReference(binding.secretRef.trim()));
  const blockers = [
    ...missingRequired.map((secret) => `Required guided-local secret ${secret.name} must be captured with ambient_mcp_secret_request before registration; never ask for the value in chat, terminal commands, or bridge scripts.`),
    ...unknown.map((binding) => `Secret binding ${binding.envName} is not declared by guided-local bridge metadata.`),
    ...duplicateEnvNames.map((envName) => `Secret binding ${envName} is duplicated.`),
    ...invalid.map((binding) => `Secret binding ${binding.envName} must use an Ambient-managed secret reference.`),
  ];
  const warnings = preview.candidate.secrets
    .filter((secret) => !secret.required && !boundEnvNameSet.has(secret.name))
    .map((secret) => `Optional guided-local secret ${secret.name} is not bound; registration can proceed, but the user-run bridge may have reduced functionality.`);
  return {
    blockers,
    warnings,
    missingRequiredEnvNames: missingRequired.map((secret) => secret.name),
    boundEnvNames: [...new Set(boundEnvNames)],
  };
}

function mcpGuidedLocalBridgePreviewTextWithSecrets(
  preview: McpGuidedLocalBridgePreview,
  secretReview: GuidedLocalBridgeSecretReview,
): string {
  const declared = preview.candidate.secrets.length
    ? preview.candidate.secrets.map((secret) => `${secret.required ? "Required" : "Optional"} ${secret.name}`).join(", ")
    : "none declared";
  const bound = secretReview.boundEnvNames.length
    ? secretReview.boundEnvNames.join(", ")
    : "none";
  return [
    mcpGuidedLocalBridgePreviewText(preview),
    "",
    "Secret bindings:",
    `- Declared: ${declared}.`,
    `- Bound Ambient refs: ${bound}. Values are not shown and are not passed to Pi.`,
    secretReview.blockers.length ? `Secret blockers:\n${secretReview.blockers.map((item) => `- ${item}`).join("\n")}` : "Secret blockers: none.",
    secretReview.warnings.length ? `Secret warnings:\n${secretReview.warnings.map((item) => `- ${item}`).join("\n")}` : "Secret warnings: none.",
  ].join("\n");
}

function sameSecretBindings(a: McpSecretBinding[], b: McpSecretBinding[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((binding, index) => binding.envName === b[index]?.envName && binding.secretRef === b[index]?.secretRef);
}

function selectInstalledServer(
  servers: McpInstalledServerSummary[],
  input: { serverId?: string; workloadName?: string },
): McpInstalledServerSummary {
  const matches = servers.filter((server) => {
    if (input.serverId && server.serverId !== input.serverId) return false;
    if (input.workloadName && server.workloadName !== input.workloadName) return false;
    return true;
  });
  if (matches.length === 0) throw new Error(`No installed Ambient MCP server matches ${input.serverId ?? input.workloadName}.`);
  if (matches.length > 1) throw new Error("Multiple installed Ambient MCP servers matched; provide both serverId and workloadName.");
  return matches[0];
}

function toolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function requiredObject(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} is required.`);
  return value as Record<string, unknown>;
}

async function candidateOrRefInput(
  options: McpServerPiToolOptions,
  input: Record<string, unknown>,
): Promise<{ candidate: Record<string, unknown>; candidateRef?: string }> {
  const candidate = objectInput(input.candidate);
  if (Object.keys(candidate).length) return { candidate };
  const candidateRef = optionalString(input.candidateRef);
  if (!candidateRef) throw new Error("candidate or candidateRef is required.");
  const resolved = await options.resolveCandidateRef?.(candidateRef);
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new Error(`No reviewed MCP candidate is available for candidateRef ${candidateRef}. The reference may be from an earlier or reset Pi session; rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.`);
  }
  return { candidate: resolved, candidateRef };
}

async function recordInstalledMcpAutowireRevision(input: {
  options: Pick<McpServerPiToolOptions, "planRevisions" | "toolHive">;
  preview: McpInstallPreview;
  workloadName: string;
  summary: string;
}): Promise<InstalledMcpAutowireRevisionRecord | undefined> {
  if (!input.options.planRevisions) return undefined;
  const previousActiveRevisionId = (await input.options.toolHive.readState()).installedServers
    .find((server) => server.workloadName === input.workloadName)
    ?.activeRevisionId;
  const candidateRef = "candidateRef" in input.preview ? input.preview.candidateRef : undefined;
  const revision = input.options.planRevisions.recordCandidate({
    candidate: input.preview.candidate as unknown as Record<string, unknown>,
    source: "install",
    summary: input.summary,
    candidateRef,
    serverId: input.preview.serverId,
    workloadName: input.workloadName,
  });
  if (!revision) return undefined;
  await input.options.toolHive.updateInstalledServerAutowireRevision({
    workloadName: input.workloadName,
    activeRevisionId: revision.revisionId,
    candidateRef: revision.candidateRef,
    candidateHash: revision.candidateHash,
  });
  return {
    revision,
    ...(previousActiveRevisionId ? { previousActiveRevisionId } : {}),
  };
}

async function runtimeRepairCandidateInput(
  options: McpServerPiToolOptions,
  input: Record<string, unknown>,
): Promise<{
  candidate: Record<string, unknown>;
  candidateRef?: string;
  parentRevisionId?: string;
  expectedCandidateHash?: string;
  serverId?: string;
  workloadName?: string;
  installedValidationError?: string;
  backfilledRevisionId?: string;
}> {
  const revisionId = optionalString(input.revisionId);
  if (revisionId) {
    const revision = options.planRevisions?.read(revisionId);
    if (!revision) throw new Error(`No MCP autowire plan revision exists for ${revisionId}.`);
    return runtimeRepairCandidateFromRevision(revision, input);
  }

  const candidate = objectInput(input.candidate);
  if (Object.keys(candidate).length) {
    return {
      candidate,
      candidateRef: optionalString(input.candidateRef),
      expectedCandidateHash: optionalString(input.expectedCandidateHash),
      serverId: optionalString(input.serverId),
      workloadName: optionalString(input.workloadName),
    };
  }

  const candidateRef = optionalString(input.candidateRef);
  if (candidateRef) {
    const resolved = await options.resolveCandidateRef?.(candidateRef);
    const revision = options.planRevisions?.latestForCandidateRef(candidateRef);
    const candidateFromRef = resolved ?? revision?.candidate;
    if (!candidateFromRef || typeof candidateFromRef !== "object" || Array.isArray(candidateFromRef)) {
      throw new Error(`No MCP autowire candidate is available for candidateRef ${candidateRef}. Pass revisionId from ambient_mcp_autowire_plan_revision_list or rerun ambient_mcp_autowire_plan.`);
    }
    return {
      candidate: candidateFromRef as Record<string, unknown>,
      candidateRef,
      parentRevisionId: revision?.revisionId,
      expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? revision?.candidateHash,
      serverId: optionalString(input.serverId) ?? revision?.serverId,
      workloadName: optionalString(input.workloadName) ?? revision?.workloadName,
    };
  }

  const serverId = optionalString(input.serverId);
  const workloadName = optionalString(input.workloadName);
  if (!serverId && !workloadName) throw new Error("runtime repair requires revisionId, candidateRef, candidate, serverId, or workloadName.");
  const state = await options.toolHive.readState();
  const matches = state.installedServers.filter((server) => {
    if (serverId && server.serverId !== serverId) return false;
    if (workloadName && server.workloadName !== workloadName) return false;
    return true;
  });
  if (!matches.length) throw new Error(`No Ambient-managed MCP installed server matches ${serverId ?? workloadName}.`);
  if (matches.length > 1) throw new Error("Multiple installed MCP servers matched runtime repair input; provide both serverId and workloadName.");
  const server = matches[0];
  const candidateHash = server.sourceIdentity?.candidateHash;
  const activeRevision = server.activeRevisionId ? options.planRevisions?.read(server.activeRevisionId) : undefined;
  const matchingActiveRevision = activeRevision && autowireRevisionMatchesInstalledServer(activeRevision, server) ? activeRevision : undefined;
  const revision = matchingActiveRevision ?? (candidateHash ? options.planRevisions?.latestForCandidateHash(candidateHash) : undefined);
  const effectiveRevision = revision ?? await backfillRuntimeRepairInstalledServerRevision(options, server);
  if (!effectiveRevision) {
    throw new Error(`Installed MCP server ${server.serverId} has no recorded Autowire candidate revision available for repair. Rerun ambient_mcp_autowire_plan for the original source, then use ambient_mcp_autowire_plan_edit_describe/apply.`);
  }
  return {
    ...runtimeRepairCandidateFromRevision(effectiveRevision, input),
    serverId: server.serverId,
    workloadName: server.workloadName,
    installedValidationError: server.installValidationError,
    ...(revision ? {} : { backfilledRevisionId: effectiveRevision.revisionId }),
  };
}

function autowireRevisionMatchesInstalledServer(
  revision: McpAutowirePlanRevision,
  server: ToolHiveInstalledServerState,
): boolean {
  if (revision.serverId && revision.serverId !== server.serverId) return false;
  if (revision.workloadName && revision.workloadName !== server.workloadName) return false;
  return true;
}

async function backfillRuntimeRepairInstalledServerRevision(
  options: McpServerPiToolOptions,
  server: ToolHiveInstalledServerState,
): Promise<McpAutowirePlanRevision | undefined> {
  if (!options.planRevisions) return undefined;
  const profile = await options.toolHive.readInstalledServerPermissionProfile(server.workloadName).catch(() => undefined);
  if (!profile) return undefined;
  if (!profile.sha256Verified) return undefined;
  return backfillMcpAutowirePlanRevisionFromInstalledServer({
    server: profile.server,
    permissionProfile: profile.profile,
    store: options.planRevisions,
    putCandidateRef: options.putCandidateRef,
  })?.revision;
}

function runtimeRepairCandidateFromRevision(
  revision: McpAutowirePlanRevision,
  input: Record<string, unknown>,
): {
  candidate: Record<string, unknown>;
  candidateRef?: string;
  parentRevisionId?: string;
  expectedCandidateHash?: string;
  serverId?: string;
  workloadName?: string;
} {
  return {
    candidate: revision.candidate as unknown as Record<string, unknown>,
    candidateRef: optionalString(input.candidateRef) ?? revision.candidateRef,
    parentRevisionId: revision.revisionId,
    expectedCandidateHash: optionalString(input.expectedCandidateHash) ?? revision.candidateHash,
    serverId: optionalString(input.serverId) ?? revision.serverId,
    workloadName: optionalString(input.workloadName) ?? revision.workloadName,
  };
}

async function awaitMcpApprovalWithHeartbeat(input: {
  authorize: () => Promise<boolean> | boolean;
  onUpdate?: McpPiToolUpdate;
  toolName: string;
  message: string;
  details: Record<string, unknown>;
}): Promise<boolean> {
  const startedAt = Date.now();
  let heartbeatCount = 0;
  const emit = () => {
    heartbeatCount += 1;
    const elapsedMs = Math.max(0, Date.now() - startedAt);
    input.onUpdate?.({
      content: [{ type: "text", text: heartbeatCount === 1 ? input.message : `${input.message} (${formatMcpElapsedMs(elapsedMs)} elapsed).` }],
      details: {
        ...input.details,
        elapsedMs,
        heartbeatCount,
      },
    });
  };
  emit();
  const heartbeat = setInterval(emit, 5_000);
  heartbeat.unref?.();
  try {
    return await input.authorize();
  } finally {
    clearInterval(heartbeat);
  }
}

function emitMcpToolHiveProgressUpdate(input: {
  onUpdate?: McpPiToolUpdate;
  toolName: string;
  serverId: string;
  workloadName: string;
  progress: ToolHiveOperationProgress;
}): void {
  input.onUpdate?.({
    content: [{ type: "text", text: input.progress.message }],
    details: {
      runtime: "ambient-mcp",
      toolName: input.toolName,
      status: "installing",
      stage: input.progress.phase,
      serverId: input.serverId,
      workloadName: input.workloadName,
      ...(input.progress.command ? { command: input.progress.command } : {}),
      ...(typeof input.progress.elapsedMs === "number" ? { elapsedMs: input.progress.elapsedMs } : {}),
    },
  });
}

function formatMcpElapsedMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function secretBindingsInput(value: unknown): Array<{ envName: string; secretRef: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((binding) => ({
      envName: requiredString(binding, "envName"),
      secretRef: requiredString(binding, "secretRef"),
    }));
}

function runtimeVolumesInput(value: unknown): ToolHiveRunVolume[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((volume) => {
      const mode = requiredString(volume, "mode");
      if (mode !== "ro" && mode !== "rw") throw new Error("runtimeVolumes.mode must be ro or rw.");
      return {
        hostPath: requiredString(volume, "hostPath"),
        containerPath: requiredString(volume, "containerPath"),
        mode,
        ...(optionalString(volume.purpose) ? { purpose: optionalString(volume.purpose) } : {}),
      };
    });
}

function runtimeVolumesText(volumes: ToolHiveRunVolume[]): string {
  if (!volumes.length) return "none";
  return volumes.map((volume) => `${volume.hostPath} -> ${volume.containerPath}:${volume.mode}`).join("; ");
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
