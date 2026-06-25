import { piToolFieldsFromDescriptor, pluginInstallToolDescriptor } from "./mcpDesktopToolsFacade";
import {
  mcpInstallPreviewReviewState,
  mcpInstallPreviewSecretBindings,
  mcpInstallPreviewSourceIdentity,
  mcpInstallPreviewText,
  type McpSecretBinding,
  type McpStandardImportPreview,
} from "./mcpInstallCatalog";
import { mcpInstallGateSummary } from "./mcpInstallGate";
import { MCP_MANAGED_FILE_EXCHANGE_PURPOSE, validateMcpManagedFileExchangeHostAccess } from "./mcpManagedFileExchange";
import {
  awaitMcpApprovalWithHeartbeat,
  candidateOrRefInput,
  emitMcpToolHiveProgressUpdate,
  errorMessage,
  evaluateMcpServerInstallGate,
  installedServerForServerId,
  mcpServerInstallApprovalDetail,
  mcpServerInstallResultTextWithRevision,
  mcpToolDiscoveryNextAction,
  objectInput,
  optionalString,
  recordInstalledMcpAutowireRevision,
  secretBindingsInput,
  toolResult,
  validateInstalledMcpTools,
  type McpInstallProtocolValidationResult,
  type McpPiToolUpdate,
  type McpServerPiToolDefinition,
} from "./mcpServerPiToolSupport";
import type { McpServerPiToolOptions } from "./mcpServerPiToolTypes";
import { storedMcpSecretBindingsForCandidate } from "./mcpSecretReferences";
import type {
  ToolHiveCommandResult,
  ToolHiveInstalledServerState,
  ToolHiveRunVolume,
  ToolHiveWorkloadSummary,
} from "./mcpToolRuntimeFacade";

export function createMcpStandardImportPiToolDefinitions(options: McpServerPiToolOptions): McpServerPiToolDefinition[] {
  return [createMcpStandardImportDescribePiToolDefinition(options), createMcpStandardImportInstallPiToolDefinition(options)];
}

function createMcpStandardImportDescribePiToolDefinition(options: McpServerPiToolOptions): McpServerPiToolDefinition {
  const importDescribe = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_standard_import_describe"));
  return {
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
      const standardImportNextToolName = readyForInstall ? "ambient_mcp_standard_import_install" : preferredFallback?.nextToolName;
      const standardImportNextToolInput = readyForInstall
        ? standardImportInstallNextToolInput(preview, expectedCandidateHash)
        : preferredFallback?.nextToolInput;
      return toolResult(mcpInstallPreviewText(preview), {
        runtime: "ambient-mcp",
        toolName: "ambient_mcp_standard_import_describe",
        status: preview.review.blockers.length ? (preferredFallback ? "fallback-available" : "blocked") : "ready-for-review",
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
  };
}

function createMcpStandardImportInstallPiToolDefinition(options: McpServerPiToolOptions): McpServerPiToolDefinition {
  const importInstall = piToolFieldsFromDescriptor(pluginInstallToolDescriptor("ambient_mcp_standard_import_install"));
  return {
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
          content: [
            {
              type: "text",
              text: `Repairing Standard MCP import ${preview.serverId}; existing ToolHive state is missing required Ambient runtime shape.`,
            },
          ],
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
            ]
              .filter(Boolean)
              .join("\n")
          : undefined,
      ]
        .filter(Boolean)
        .join("\n");
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
        authorize: async () =>
          await (options.authorizeInstall?.({ thread, workspace: options.workspace, preview, preflight: preflight.command, detail }) ??
            true),
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
        ...(existingCompatibility && !existingCompatibility.compatible
          ? {
              repairedRuntimeShape: true,
              repairReasons: existingCompatibility.reasons,
            }
          : {}),
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
  };
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
    content: [
      { type: "text", text: `Removing stale Standard MCP workload ${existing.workloadName} before repairing ${preview.serverId}.` },
    ],
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
      throw new Error(
        `Cannot repair ${preview.serverId} because stale ToolHive workload ${existing.workloadName} could not be stopped: ${errorMessage(error)}`,
      );
    }
  }
  try {
    const remove = await options.toolHive.removeWorkload(existing.workloadName);
    if (remove.exitCode === 0 || toolHiveRemovalLooksMissing(remove)) return;
    throw new Error(`ToolHive remove exited ${remove.exitCode}.`);
  } catch (error) {
    if (!toolHiveRemovalLooksMissing(error)) {
      throw new Error(
        `Cannot repair ${preview.serverId} because stale ToolHive workload ${existing.workloadName} could not be removed: ${errorMessage(error)}`,
      );
    }
    await options.toolHive.removeInstalledServerState(existing.workloadName);
  }
}

async function sameNameStandardImportRuntimeConflict(
  toolHive: McpServerPiToolOptions["toolHive"],
  preview: McpStandardImportPreview,
  existing?: ToolHiveInstalledServerState,
): Promise<ToolHiveWorkloadSummary | undefined> {
  const workloadName = preview.runPlan?.workloadName;
  if (!workloadName) return undefined;
  if (existing?.workloadName === workloadName) return undefined;
  try {
    return (await toolHive.listAmbientWorkloadSummaries({ all: true })).find((workload) => workload.name === workloadName);
  } catch {
    return undefined;
  }
}

async function previewStandardMcpImportWithStoredSecrets(
  options: Pick<McpServerPiToolOptions, "catalog" | "workspace">,
  input: {
    candidate: Record<string, unknown>;
    candidateRef?: string;
    expectedCandidateHash?: string;
    explicitSecretBindings: McpSecretBinding[];
  },
) {
  const preview = await options.catalog.previewStandardMcpImport({
    candidate: input.candidate,
    ...(input.candidateRef ? { candidateRef: input.candidateRef } : {}),
    expectedCandidateHash: input.expectedCandidateHash,
    secretBindings: input.explicitSecretBindings,
  });
  const secretBindings = await storedMcpSecretBindingsForCandidate(options.workspace.path, preview.candidate, input.explicitSecretBindings);
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

async function validateStandardImportInstallShape(input: {
  options: McpServerPiToolOptions;
  preview: McpStandardImportPreview;
  validation: McpInstallProtocolValidationResult;
}): Promise<McpInstallProtocolValidationResult> {
  const { options, preview, validation } = input;
  if (validation.status !== "ready" || !preview.runPlan) return validation;

  const state = await options.toolHive.readState();
  const installed =
    state.installedServers.find((server) => server.workloadName === preview.runPlan!.workloadName) ??
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
    ...(sourceBuildRoute
      ? {
          nextToolName: sourceBuildRoute.nextToolName,
          nextToolInput: sourceBuildRoute.nextToolInput,
        }
      : {}),
    fallbackRoutes: structuredFallbacks,
  };
}

function standardImportRuntimeFailureSourceBuildRoute(
  preview: McpStandardImportPreview,
): StandardImportRuntimeFailureSourceBuildRoute | undefined {
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
    reason:
      "ToolHive could not run the package-backed Standard MCP source; continue through Ambient's reviewed source-build lane for the same GitHub source.",
    evidenceRefs: preview.candidate.evidence.map((entry) => entry.id).slice(0, 20),
    nextToolName: "ambient_mcp_autowire_source_build_describe",
    nextToolInput,
  };
}

function toolHiveRemovalLooksMissing(value: unknown): boolean {
  const text =
    typeof value === "string"
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

function sameSecretBindings(a: McpSecretBinding[], b: McpSecretBinding[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((binding, index) => binding.envName === b[index]?.envName && binding.secretRef === b[index]?.secretRef);
}
