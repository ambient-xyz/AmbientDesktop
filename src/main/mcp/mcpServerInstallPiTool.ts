import type { AgentToolResult } from "@mariozechner/pi-coding-agent";
import { mcpDefaultCatalogDescriptorHash } from "./mcpDefaultCatalog";
import { installMcpDefaultCapability as installDefaultMcpCapability } from "./mcpDefaultCapabilityInstaller";
import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import {
  mcpDefaultCapabilityInstallPreviewText,
  mcpInstallPreviewReviewState,
  mcpInstallPreviewSecretBindings,
  mcpInstallPreviewSourceIdentity,
  mcpRegistryInstallPreviewText,
  type McpDefaultCapabilityInstallPreview,
} from "./mcpInstallCatalog";
import { mcpInstallGateSummary } from "./mcpInstallGate";
import {
  evaluateMcpServerInstallGate,
  installedServerForServerId,
  mcpServerInstallApprovalDetail,
  mcpServerInstallResultTextWithRevision,
  mcpToolDiscoveryNextAction,
  objectInput,
  optionalBoolean,
  previewRegistryInstallWithStoredSecrets,
  recordInstalledMcpAutowireRevision,
  requiredString,
  runtimeVolumesInput,
  runtimeVolumesText,
  secretBindingsInput,
  toolResult,
  validateInstalledMcpTools,
  type McpInstallProtocolValidationResult,
  type McpPiToolUpdate,
  type McpServerPiToolDefinition,
} from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions, McpServerPiToolThread } from "./mcpServerPiToolTypes";
import type { ToolHiveCommandResult, ToolHiveRunVolume } from "./mcpToolRuntimeFacade";

export function createMcpServerInstallPiToolDefinition(options: McpServerPiToolOptions): McpServerPiToolDefinition {
  const install = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_server_install"));
  return {
    ...install,
    parameters: install.parameters as McpServerPiToolDefinition["parameters"],
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
        return toolResult(`MCP server ${serverId} is already installed as ToolHive workload ${existing.workloadName}.`, {
          runtime: "ambient-mcp",
          toolName: "ambient_mcp_server_install",
          status: "already-installed",
          serverId,
          workloadName: existing.workloadName,
        });
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
      const preview = await previewRegistryInstallWithStoredSecrets(options, {
        serverId,
        refresh,
        explicitSecretBindings: secretBindings,
        runtimeVolumes,
      });
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
      const allowed = await (options.authorizeInstall?.({
        thread,
        workspace: options.workspace,
        preview,
        preflight: preflight.command,
        detail,
      }) ?? true);
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
  };
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
  const allowed = await (options.authorizeInstall?.({
    thread,
    workspace: options.workspace,
    preview,
    preflight: preflight.command,
    detail,
  }) ?? true);
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
  ]
    .filter(Boolean)
    .join("\n");
}

function stableToolHiveRunVolumes(volumes: ToolHiveRunVolume[]): string {
  return JSON.stringify(
    volumes
      .map((volume) => ({
        hostPath: volume.hostPath.replace(/\/+$/, "") || "/",
        containerPath: volume.containerPath.replace(/\/+$/, "") || "/",
        mode: volume.mode,
        purpose: volume.purpose ?? "",
      }))
      .sort((left, right) =>
        `${left.containerPath}\0${left.hostPath}\0${left.mode}\0${left.purpose}`.localeCompare(
          `${right.containerPath}\0${right.hostPath}\0${right.mode}\0${right.purpose}`,
        ),
      ),
  );
}
