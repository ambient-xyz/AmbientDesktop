import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import {
  mcpInstallPreviewReviewState,
  mcpInstallPreviewSecretBindings,
  mcpInstallPreviewSourceIdentity,
  mcpRemoteMcpProxyPreviewText,
  type McpSecretBinding,
} from "./mcpInstallCatalog";
import { mcpInstallGateSummary } from "./mcpInstallGate";
import { storedMcpSecretBindingsForCandidate } from "./mcpSecretReferences";
import {
  evaluateMcpServerInstallGate,
  installedServerForServerId,
  mcpServerInstallApprovalDetail,
  mcpServerInstallResultTextWithRevision,
  objectInput,
  optionalString,
  recordInstalledMcpAutowireRevision,
  requiredObject,
  sameSecretBindings,
  secretBindingsInput,
  toolResult,
  validateInstalledMcpTools,
  type McpServerPiToolDefinition,
} from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions } from "./mcpServerPiToolTypes";

export function createMcpRemoteProxyPiToolDefinitions(options: McpServerPiToolOptions): McpServerPiToolDefinition[] {
  const remoteDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_remote_proxy_describe"));
  const remoteInstall = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_remote_proxy_install"));
  return [
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
          return toolResult(`Remote MCP proxy ${preview.serverId} is already installed as ToolHive workload ${existing.workloadName}.`, {
            runtime: "ambient-mcp",
            toolName: "ambient_mcp_remote_proxy_install",
            status: "already-installed",
            serverId: preview.serverId,
            workloadName: existing.workloadName,
          });
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
        const allowed = await (options.authorizeInstall?.({
          thread,
          workspace: options.workspace,
          preview,
          preflight: preflight.command,
          detail,
        }) ?? true);
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
          content: [
            {
              type: "text",
              text: `Waiting for Remote MCP proxy workload ${preview.runPlan.workloadName} to expose its ToolHive endpoint.`,
            },
          ],
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
  ];
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
  const secretBindings = await storedMcpSecretBindingsForCandidate(options.workspace.path, preview.candidate, input.explicitSecretBindings);
  if (sameSecretBindings(input.explicitSecretBindings, secretBindings)) return preview;
  return options.catalog.previewRemoteMcpProxy({
    candidate: input.candidate,
    expectedCandidateHash: input.expectedCandidateHash,
    secretBindings,
  });
}
