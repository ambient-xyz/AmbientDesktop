import { join } from "node:path";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { PermissionGrantActionKind, PermissionGrantTargetKind, PermissionRequest } from "../../shared/permissionTypes";
import type {
  AmbientMcpContainerRuntimeStatus,
  AmbientMcpDefaultCapabilityInstallInput,
  AmbientMcpDefaultCapabilityInstallProgress,
  AmbientMcpInstallPreview,
  AmbientMcpServerInstallResult,
  AmbientMcpServerUninstallResult,
  AmbientMcpToolReviewAcceptResult,
} from "../../shared/pluginTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  buildContainerRuntimeInstallPlanFromProbe,
  containerRuntimeProbeSummary,
  containerRuntimeSetupPromptState,
  probeContainerRuntime,
  type ContainerRuntimeProbeResult,
  recordContainerRuntimeProbeState,
  type ContainerRuntimeSetupPromptState,
} from "./mcpContainerRuntimeFacade";
import { loadDefaultMcpCatalog, mcpDefaultCatalogDescriptorHash } from "./mcpDefaultCatalog";
import {
  adoptExistingMcpDefaultCapability,
  defaultCapabilityImageResolutionText,
  installMcpDefaultCapability,
  type InstallMcpDefaultCapabilityResult,
  type McpDefaultCapabilityInstallProgress,
} from "./mcpDefaultCapabilityInstaller";
import {
  isMcpDefaultCapabilityInstalledServerAvailable,
  reconcileMcpDefaultCapabilities,
  writeMcpDefaultCapabilitySummary,
  type McpDefaultCapabilitySummary,
} from "./mcpDefaultCapabilityReconciler";
import {
  evaluateMcpInstallGate,
  mcpDefaultCapabilityStatePathForUserData,
  mcpInstallGateSummary,
} from "./mcpInstallGate";
import {
  createPublicMcpPackageMetadataResolver,
  McpInstallCatalog,
  mcpInstallPreviewReviewState,
  mcpInstallPreviewSecretBindings,
  mcpInstallPreviewSourceIdentity,
  mcpRegistryInstallPreviewText,
  type McpInstalledServerSummary,
  type McpRegistryInstallPreview,
} from "./mcpInstallCatalog";
import { mcpServerInstallApprovalDetail, mcpServerUninstallApprovalDetail } from "./mcpServerPiTools";
import { ToolHiveRuntimeService, type ToolHiveCommandResult } from "./mcpToolRuntimeFacade";

interface DesktopMcpProjectStore {
  getThread(threadId: string): ThreadSummary;
  getWorkspace(): { path: string };
}

interface DesktopMcpProjectRuntimeHost {
  workspacePath: string;
  store: DesktopMcpProjectStore;
}

interface DesktopMcpPermissionInput {
  thread?: ThreadSummary;
  permissionMode?: "full-access" | "workspace";
  workspacePath?: string;
  workflowThreadId?: string;
  store?: DesktopMcpProjectStore;
  requireFreshPrompt?: boolean;
}

export interface DesktopMcpInstallServiceDependencies {
  activeThreadIdForHost(host: DesktopMcpProjectRuntimeHost): string;
  emitMainWindowDesktopEvent(event: DesktopEvent): void;
  emitPluginCatalogUpdated(workspacePath?: string): void;
  getAppVersion(): string;
  getUserDataPath(): string;
  permissionGrantTargetHash(actionKind: PermissionGrantActionKind, targetKind: PermissionGrantTargetKind, identity: string): string;
  requestPermissionWithGrantRegistry(
    request: Omit<PermissionRequest, "id">,
    input?: DesktopMcpPermissionInput,
  ): Promise<{ allowed: boolean }>;
}

let desktopMcpInstallServices: DesktopMcpInstallServiceDependencies | undefined;

export function configureDesktopMcpInstallService(dependencies: DesktopMcpInstallServiceDependencies): void {
  desktopMcpInstallServices = dependencies;
}

function services(): DesktopMcpInstallServiceDependencies {
  if (!desktopMcpInstallServices) throw new Error("Desktop MCP install service has not been configured.");
  return desktopMcpInstallServices;
}

const app = {
  getPath(name: "userData"): string {
    if (name !== "userData") throw new Error(`Unsupported Desktop MCP app path: ${name}`);
    return services().getUserDataPath();
  },
};

const packageJson = {
  get version(): string {
    return services().getAppVersion();
  },
};

function activeThreadIdForHost(host: DesktopMcpProjectRuntimeHost): string {
  return services().activeThreadIdForHost(host);
}

function emitMainWindowDesktopEvent(event: DesktopEvent): void {
  services().emitMainWindowDesktopEvent(event);
}

function emitPluginCatalogUpdated(workspacePath?: string): void {
  services().emitPluginCatalogUpdated(workspacePath);
}

function permissionGrantTargetHash(actionKind: PermissionGrantActionKind, targetKind: PermissionGrantTargetKind, identity: string): string {
  return services().permissionGrantTargetHash(actionKind, targetKind, identity);
}

function requestPermissionWithGrantRegistry(
  request: Omit<PermissionRequest, "id">,
  input?: DesktopMcpPermissionInput,
): Promise<{ allowed: boolean }> {
  return services().requestPermissionWithGrantRegistry(request, input);
}

function createMcpInstallCatalog(): { toolHive: ToolHiveRuntimeService; catalog: McpInstallCatalog } {
  const toolHive = new ToolHiveRuntimeService({
    userDataPath: app.getPath("userData"),
    env: process.env,
  });
  return { toolHive, catalog: new McpInstallCatalog(toolHive, { packageMetadataResolver: createPublicMcpPackageMetadataResolver() }) };
}

function ambientMcpInstallPreview(preview: McpRegistryInstallPreview): AmbientMcpInstallPreview {
  return {
    serverId: preview.serverId,
    title: preview.review.title,
    summary: preview.review.summary,
    sourceSummary: preview.review.sourceSummary,
    runtimeSummary: preview.review.runtimeSummary,
    permissionSummary: preview.review.permissionSummary,
    secretSummary: preview.review.secretSummary,
    validationSummary: preview.review.validationSummary,
    blockers: preview.review.blockers,
    warnings: preview.review.warnings,
    riskLevel: preview.candidate.riskSummary.level,
    riskReasons: preview.candidate.riskSummary.reasons,
    ...(preview.runPlan
      ? {
          runPlan: {
            serverId: preview.runPlan.serverId,
            workloadName: preview.runPlan.workloadName,
            group: preview.runPlan.group,
            isolateNetwork: preview.runPlan.isolateNetwork,
            transport: preview.runPlan.transport,
            permissionProfilePath: preview.runPlan.permissionProfilePath,
            sourceRef: preview.runPlan.sourceRef,
          },
        }
      : {}),
    permissionProfile: {
      path: preview.permissionProfile.path,
      sha256: preview.permissionProfile.sha256,
    },
    expectedTools: preview.candidate.validationPlan.expectedTools,
    reviewText: mcpRegistryInstallPreviewText(preview),
  };
}

function ambientMcpContainerRuntimeStatus(
  result: ContainerRuntimeProbeResult,
  setup: ContainerRuntimeSetupPromptState,
  defaultCapabilities: McpDefaultCapabilitySummary[],
): AmbientMcpContainerRuntimeStatus {
  const installPlan = buildContainerRuntimeInstallPlanFromProbe(result);
  return {
    schemaVersion: result.schemaVersion,
    status: result.status,
    ...(result.runtime ? { runtime: result.runtime } : {}),
    platform: result.platform,
    arch: result.arch,
    checkedAt: result.checkedAt,
    durationMs: result.durationMs,
    message: result.message,
    ...(result.reason ? { reason: result.reason } : {}),
    nextAction: result.nextAction,
    toolHive: {
      status: result.toolHive.status,
      message: result.toolHive.message,
      ...(result.toolHive.preflight ? { preflightOk: result.toolHive.preflight.ok } : {}),
      ...(result.toolHive.version?.stdout
        ? {
            versionLine: result.toolHive.version.stdout.split(/\r?\n/).find((line) => line.trim())?.trim(),
          }
        : {}),
    },
    hosts: result.hosts.map((host) => ({
      kind: host.kind,
      status: host.status,
      ...(host.reason ? { reason: host.reason } : {}),
      ...(host.version ? { version: host.version } : {}),
      message: host.message,
    })),
    ...(result.processHints?.length
      ? {
          processHints: result.processHints.map((hint) => ({
            kind: hint.kind,
            ...(hint.pid ? { pid: hint.pid } : {}),
            processName: hint.processName,
            ...(hint.executablePath ? { executablePath: hint.executablePath } : {}),
            ...(hint.applicationPath ? { applicationPath: hint.applicationPath } : {}),
            confidence: hint.confidence,
            reason: hint.reason,
          })),
        }
      : {}),
    setup,
    postInstallQueue: result.postInstallQueue,
    defaultCapabilities,
    ...(installPlan ? { installPlan } : {}),
  };
}

let mcpContainerRuntimeStatusProbeInFlight: Promise<AmbientMcpContainerRuntimeStatus> | undefined;

async function probeAmbientMcpContainerRuntimeStatus(): Promise<AmbientMcpContainerRuntimeStatus> {
  if (mcpContainerRuntimeStatusProbeInFlight) return mcpContainerRuntimeStatusProbeInFlight;
  const probe = probeAmbientMcpContainerRuntimeStatusUncached();
  mcpContainerRuntimeStatusProbeInFlight = probe;
  try {
    return await probe;
  } finally {
    if (mcpContainerRuntimeStatusProbeInFlight === probe) mcpContainerRuntimeStatusProbeInFlight = undefined;
  }
}

async function probeAmbientMcpContainerRuntimeStatusUncached(): Promise<AmbientMcpContainerRuntimeStatus> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const result = await probeContainerRuntime({ toolHive });
  const setupState = await recordContainerRuntimeProbeState(mcpContainerRuntimeSetupStatePath(), result, {
    appVersion: packageJson.version,
  });
  let installedServers: McpInstalledServerSummary[] = [];
  try {
    installedServers = await catalog.listInstalledServers();
    const adopted = await adoptExistingDefaultCapabilityInstallState({ catalog, toolHive, installedServers });
    if (adopted) installedServers = await catalog.listInstalledServers();
  } catch (error) {
    console.warn(`[mcp-default-capabilities] installed server read failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const defaultCapabilities = await reconcileMcpDefaultCapabilities({
    statePath: mcpDefaultCapabilityStatePath(),
    runtime: result,
    defaultCatalog: loadDefaultMcpCatalog(),
    installedServers,
    appVersion: packageJson.version,
  });
  return ambientMcpContainerRuntimeStatus(result, containerRuntimeSetupPromptState(result, setupState), defaultCapabilities);
}

async function adoptExistingDefaultCapabilityInstallState(input: {
  catalog: McpInstallCatalog;
  toolHive: ToolHiveRuntimeService;
  installedServers: McpInstalledServerSummary[];
}): Promise<boolean> {
  const defaultCatalog = loadDefaultMcpCatalog();
  const scrapling = defaultCatalog.find((descriptor) => descriptor.defaultCapability?.capabilityId === "scrapling");
  if (!scrapling?.defaultCapability) return false;
  const alreadyInstalled = input.installedServers.some((server) =>
    (server.serverId === scrapling.serverId || server.workloadName === scrapling.defaultCapability?.workloadName) &&
    isMcpDefaultCapabilityInstalledServerAvailable(server)
  );
  if (alreadyInstalled) return false;
  const adopted = await adoptExistingMcpDefaultCapability({
    capabilityId: "scrapling",
    catalog: input.catalog,
    toolHive: input.toolHive,
  }).catch((error) => {
    console.warn(`[mcp-default-capabilities] default Scrapling adoption check failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  });
  if (!adopted) return false;
  console.log(`[mcp-default-capabilities] adopted existing ToolHive workload ${adopted.workload.name ?? scrapling.defaultCapability.workloadName} into current profile.`);
  return true;
}

async function reconcileMcpContainerRuntimeOnStartup(): Promise<void> {
  const status = await probeAmbientMcpContainerRuntimeStatus();
  console.log(
    `[mcp-container-runtime] startup reconciliation status=${status.status} decision=${status.setup.userDecision} prompt=${status.setup.shouldPrompt ? "yes" : "no"} version=${status.setup.upgradeReconciledAppVersion ?? packageJson.version}`,
  );
  if (status.setup.shouldPrompt) {
    emitMainWindowDesktopEvent({
      type: "mcp-container-runtime-setup-needed",
      reason: "startup-runtime-setup-prompt",
    });
  }
}

function mcpContainerRuntimeSetupStatePath(): string {
  return join(app.getPath("userData"), "mcp-container-runtime", "setup-state.json");
}

function mcpDefaultCapabilityStatePath(): string {
  return mcpDefaultCapabilityStatePathForUserData(app.getPath("userData"));
}

function mcpSetupErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emitMcpDefaultCapabilityInstallProgress(
  host: DesktopMcpProjectRuntimeHost,
  input: {
    capabilityId: "scrapling";
    title: string;
    workloadName: string;
    phase: AmbientMcpDefaultCapabilityInstallProgress["phase"];
    message: string;
    image?: string;
    resolvedImage?: string;
    runtime?: string;
  },
): void {
  const status: AmbientMcpDefaultCapabilityInstallProgress["status"] =
    input.phase === "completed" ? "succeeded" : input.phase === "failed" ? "failed" : "running";
  emitMainWindowDesktopEvent({
    type: "mcp-default-capability-install-progress",
    workspacePath: host.workspacePath,
    progress: {
      schemaVersion: "ambient-mcp-default-capability-install-progress-v1",
      capabilityId: input.capabilityId,
      title: input.title,
      workloadName: input.workloadName,
      phase: input.phase,
      status,
      message: input.message,
      ...(input.image ? { image: input.image } : {}),
      ...(input.resolvedImage ? { resolvedImage: input.resolvedImage } : {}),
      ...(input.runtime ? { runtime: input.runtime } : {}),
      recordedAt: new Date().toISOString(),
    },
  });
}

async function recordMcpDefaultCapabilitySummaryUpdate(
  summary: McpDefaultCapabilitySummary,
): Promise<void> {
  await writeMcpDefaultCapabilitySummary(mcpDefaultCapabilityStatePath(), summary, {
    appVersion: packageJson.version,
  });
}

async function installMcpDefaultCapabilityForDesktop(
  host: DesktopMcpProjectRuntimeHost,
  input: AmbientMcpDefaultCapabilityInstallInput,
): Promise<AmbientMcpServerInstallResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP default capability installation is blocked in Planner Mode.");

  const defaultCatalog = loadDefaultMcpCatalog();
  const descriptor = defaultCatalog.find((candidate) => candidate.defaultCapability?.capabilityId === input.capabilityId);
  const serverId = descriptor?.serverId ?? "io.github.d4vinci/scrapling";
  const runtimeProbe = await probeContainerRuntime({ toolHive });
  const installedBefore = await catalog.listInstalledServers();
  const defaultCapabilitiesBefore = await reconcileMcpDefaultCapabilities({
    statePath: mcpDefaultCapabilityStatePath(),
    runtime: runtimeProbe,
    defaultCatalog,
    installedServers: installedBefore,
    appVersion: packageJson.version,
  });
  const existing = installedBefore.find((server) =>
    server.serverId === serverId ||
    server.workloadName === descriptor?.defaultCapability?.workloadName ||
    (descriptor && (server.defaultCatalogDescriptorHash === mcpDefaultCatalogDescriptorHash(descriptor) ||
      server.installedDefaultCatalogDescriptorHash === mcpDefaultCatalogDescriptorHash(descriptor)))
  );
  if (existing && isMcpDefaultCapabilityInstalledServerAvailable(existing)) {
    return {
      status: "already-installed",
      serverId: existing.serverId,
      workloadName: existing.workloadName,
      message: `Default MCP capability ${input.capabilityId} is already installed as ToolHive workload ${existing.workloadName}.`,
      installed: installedBefore,
      defaultCapabilities: defaultCapabilitiesBefore,
    };
  }

  const preflight = runtimeProbe.toolHive.preflight;
  if (runtimeProbe.status !== "ready" || !preflight) {
    return {
      status: "runtime-preflight-failed",
      serverId,
      message: `Default MCP capability ${input.capabilityId} is blocked because the isolated container runtime is not ready.\n\n${containerRuntimeProbeSummary(runtimeProbe)}`,
      runtimeStatus: runtimeProbe.status,
      defaultCapabilities: defaultCapabilitiesBefore,
      installed: installedBefore,
      exitCode: preflight?.command.exitCode,
      durationMs: preflight?.command.durationMs,
    };
  }

  const preview = await catalog.previewDefaultCapabilityInstall({ capabilityId: input.capabilityId });
  const isRepair = Boolean(existing);
  if (!preview.runPlan || !preview.toolHiveRunSource || preview.review.blockers.length) {
    return {
      status: "blocked",
      serverId: preview.serverId,
      workloadName: preview.runPlan?.workloadName,
      message: `Default MCP capability install is blocked.\n\n${mcpDefaultCapabilityInstallApprovalDetail({ preview, workspace: { path: host.workspacePath }, preflight: preflight.command, existing })}`,
      defaultCapabilities: defaultCapabilitiesBefore,
      installed: installedBefore,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }
  emitMcpDefaultCapabilityInstallProgress(host, {
    capabilityId: input.capabilityId,
    title: preview.defaultDescriptor.title,
    workloadName: preview.runPlan.workloadName,
    phase: "approval-requested",
    message: `Waiting for approval to ${isRepair ? "repair" : "set up"} ${preview.defaultDescriptor.title}.`,
    image: preview.toolHiveRunSource,
  });

  const detail = mcpDefaultCapabilityInstallApprovalDetail({
    preview,
    workspace: { path: host.workspacePath },
    preflight: preflight.command,
    existing,
  });
  const resolution = await requestPermissionWithGrantRegistry({
    threadId: targetThreadId,
    workspacePath: thread.workspacePath,
    toolName: "ambient_mcp_default_capability_install",
    title: `${isRepair ? "Repair" : "Set up"} default MCP capability "${preview.defaultDescriptor.title}"?`,
    message: isRepair
      ? "Ambient will repair the existing default Scrapling ToolHive workload by removing or replacing unhealthy local install state, then start the reviewed pinned OCI image. Individual Scrapling tool calls remain separately reviewed."
      : "Ambient will install and start the reviewed pinned Scrapling OCI image through ToolHive as a global default capability. Individual Scrapling tool calls remain separately reviewed.",
    detail,
    risk: "plugin-tool",
    grantTargetLabel: `${isRepair ? "Repair" : "Set up"} default MCP capability ${preview.defaultDescriptor.title}`,
    grantTargetHash: permissionGrantTargetHash(
      "plugin_tool_execute",
      "tool",
      ["ambient_mcp_default_capability_install", preview.serverId, preview.runPlan.workloadName, mcpDefaultCatalogDescriptorHash(preview.defaultDescriptor)].join("\0"),
    ),
  }, {
    thread,
    permissionMode: thread.permissionMode,
    workspacePath: host.workspacePath,
    store: host.store,
    requireFreshPrompt: true,
  });
  if (!resolution.allowed) throw new Error("MCP default capability install was not approved.");
  emitMcpDefaultCapabilityInstallProgress(host, {
    capabilityId: input.capabilityId,
    title: preview.defaultDescriptor.title,
    workloadName: preview.runPlan.workloadName,
    phase: "approval-granted",
    message: `Approval received. Preparing ${preview.defaultDescriptor.title} ${isRepair ? "repair" : "install"}.`,
    image: preview.toolHiveRunSource,
  });

  if (existing) {
    await cleanupExistingDefaultCapabilityWorkload(toolHive, existing);
  }

  const installingCapability = defaultCapabilitiesBefore.find((capability) => capability.capabilityId === input.capabilityId);
  if (installingCapability) {
    await recordMcpDefaultCapabilitySummaryUpdate({
      ...installingCapability,
      status: "installing",
      nextAction: "install-default-capability",
      message: `Installing ${installingCapability.title}. Pulling the reviewed image and starting ToolHive workload ${preview.runPlan.workloadName}.`,
      lastReconciledAt: new Date().toISOString(),
      appVersion: packageJson.version,
    });
    emitMcpDefaultCapabilityInstallProgress(host, {
      capabilityId: input.capabilityId,
      title: preview.defaultDescriptor.title,
      workloadName: preview.runPlan.workloadName,
      phase: "state-updated",
      message: `${preview.defaultDescriptor.title} setup is now in progress.`,
      image: preview.toolHiveRunSource,
    });
  }

  let install: InstallMcpDefaultCapabilityResult;
  try {
    install = await installMcpDefaultCapability({
      capabilityId: input.capabilityId,
      catalog,
      toolHive,
      platform: runtimeProbe.platform,
      arch: runtimeProbe.arch,
      preferredContainerRuntime: runtimeProbe.runtime,
      containerRuntimeEnv: await toolHive.containerRuntimeEnv(),
      containerRuntimeProcessHints: runtimeProbe.processHints,
      onProgress: (progress: McpDefaultCapabilityInstallProgress) => {
        emitMcpDefaultCapabilityInstallProgress(host, {
          capabilityId: input.capabilityId,
          title: preview.defaultDescriptor.title,
          workloadName: preview.runPlan!.workloadName,
          phase: progress.phase,
          message: progress.message,
          ...(progress.image ? { image: progress.image } : {}),
          ...(progress.resolvedImage ? { resolvedImage: progress.resolvedImage } : {}),
          ...(progress.runtime ? { runtime: progress.runtime } : {}),
        });
      },
    });
  } catch (error) {
    const message = `Failed to set up ${preview.defaultDescriptor.title}: ${mcpSetupErrorMessage(error)}`;
    if (installingCapability) {
      await recordMcpDefaultCapabilitySummaryUpdate({
        ...installingCapability,
        status: "failed",
        nextAction: "install-default-capability",
        message,
        lastReconciledAt: new Date().toISOString(),
        appVersion: packageJson.version,
      });
    }
    emitMcpDefaultCapabilityInstallProgress(host, {
      capabilityId: input.capabilityId,
      title: preview.defaultDescriptor.title,
      workloadName: preview.runPlan.workloadName,
      phase: "failed",
      message,
      image: preview.toolHiveRunSource,
    });
    const installed = await catalog.listInstalledServers().catch(() => installedBefore);
    const defaultCapabilities = await reconcileMcpDefaultCapabilities({
      statePath: mcpDefaultCapabilityStatePath(),
      runtime: runtimeProbe,
      defaultCatalog,
      installedServers: installed,
      appVersion: packageJson.version,
    });
    emitPluginCatalogUpdated(host.workspacePath);
    return {
      status: "blocked",
      serverId: preview.serverId,
      workloadName: preview.runPlan.workloadName,
      message,
      installed,
      defaultCapabilities,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }
  const installed = await catalog.listInstalledServers();
  const defaultCapabilities = await reconcileMcpDefaultCapabilities({
    statePath: mcpDefaultCapabilityStatePath(),
    runtime: runtimeProbe,
    defaultCatalog,
    installedServers: installed,
    appVersion: packageJson.version,
  });
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: "installed",
    serverId: install.preview.serverId,
    workloadName: install.preview.runPlan?.workloadName,
    message: mcpDefaultCapabilityInstallResultText(install),
    installed,
    defaultCapabilities,
    adoptedExistingWorkload: install.adoptedExistingWorkload,
    exitCode: install.command.exitCode,
    durationMs: install.command.durationMs,
    permissionProfile: {
      path: install.preview.permissionProfile.path,
      sha256: install.preview.permissionProfile.sha256,
    },
  };
}

function mcpDefaultCapabilityInstallApprovalDetail(input: {
  preview: InstallMcpDefaultCapabilityResult["preview"];
  workspace: { path: string };
  preflight: ToolHiveCommandResult;
  existing?: McpInstalledServerSummary;
}): string {
  const runPlan = input.preview.runPlan;
  const cleanup = input.existing
    ? [
        "- Repair cleanup: after approval, Ambient may remove or replace the existing unhealthy ToolHive workload before starting the reviewed default capability.",
        `- Existing workload: ${input.existing.workloadName}`,
        input.existing.workloadStatus ? `- Existing runtime status: ${input.existing.workloadStatus}` : undefined,
        input.existing.endpoint ? `- Existing endpoint: ${input.existing.endpoint}` : "- Existing endpoint: none reported.",
      ].filter(Boolean)
    : ["- Repair cleanup: none; no existing default workload or install state matched."];
  return [
    input.preview.review.title,
    "",
    input.preview.review.summary,
    "",
    `Source: ${input.preview.review.sourceSummary}`,
    `Runtime: ${input.preview.review.runtimeSummary}`,
    `Permissions: ${input.preview.review.permissionSummary}`,
    `Validation: ${input.preview.review.validationSummary}`,
    input.preview.review.warnings.length ? `Warnings: ${input.preview.review.warnings.join("; ")}` : "Warnings: none.",
    input.preview.review.blockers.length ? `Blockers: ${input.preview.review.blockers.join("; ")}` : "Blockers: none.",
    "",
    "Approval context:",
    `- Workspace: ${input.workspace.path}`,
    `- ToolHive runtime preflight: exit ${input.preflight.exitCode}`,
    runPlan
      ? `- Command shape: thv run --name ${runPlan.workloadName} --group ${runPlan.group} --isolate-network --permission-profile ${runPlan.permissionProfilePath} ${input.preview.toolHiveRunSource}${input.preview.toolHiveServerArgs.length ? ` -- ${input.preview.toolHiveServerArgs.join(" ")}` : ""}`
      : "- Command shape: unavailable",
    `- Default descriptor hash: ${mcpDefaultCatalogDescriptorHash(input.preview.defaultDescriptor)}`,
    "- Install scope: global Ambient MCP default capability state.",
    ...cleanup,
    "- Tool use: Scrapling tool calls remain separately reviewed through ambient_mcp_tool_call.",
  ].join("\n");
}

async function cleanupExistingDefaultCapabilityWorkload(
  toolHive: ToolHiveRuntimeService,
  existing: McpInstalledServerSummary,
): Promise<void> {
  if (existing.workloadStatus) {
    await toolHive.removeWorkload(existing.workloadName).catch((error) => {
      console.warn(`[mcp-default-capabilities] stale workload cleanup failed for ${existing.workloadName}: ${error instanceof Error ? error.message : String(error)}`);
    });
  } else {
    await toolHive.removeInstalledServerState(existing.workloadName);
  }
}

function mcpDefaultCapabilityInstallResultText(result: InstallMcpDefaultCapabilityResult): string {
  const runPlan = result.preview.runPlan;
  return [
    result.adoptedExistingWorkload
      ? `Adopted existing default MCP capability ${result.preview.defaultDescriptor.title}.`
      : `Installed default MCP capability ${result.preview.defaultDescriptor.title}.`,
    runPlan ? `Workload: ${runPlan.workloadName}` : undefined,
    result.workload.status ? `Runtime status: ${result.workload.status}` : undefined,
    result.workload.endpoint ? `Endpoint: ${result.workload.endpoint}` : undefined,
    defaultCapabilityImageResolutionText(result.imageResolution),
    `ToolHive command: ${result.command.command}`,
    `Exit code: ${result.command.exitCode}`,
    `Permission profile: ${result.preview.permissionProfile.path}`,
    "Next: use ambient_mcp_tool_search and ambient_mcp_tool_describe before calling Scrapling tools.",
  ].filter(Boolean).join("\n");
}

async function installMcpRegistryServerForDesktop(
  host: DesktopMcpProjectRuntimeHost,
  input: { serverId: string; refresh?: boolean },
): Promise<AmbientMcpServerInstallResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP server installation is blocked in Planner Mode.");
  const existing = (await catalog.listInstalledServers()).find((server) => server.serverId === input.serverId);
  if (existing) {
    return {
      status: "already-installed",
      serverId: existing.serverId,
      workloadName: existing.workloadName,
      message: `MCP server ${existing.serverId} is already installed as ToolHive workload ${existing.workloadName}.`,
      installed: await catalog.listInstalledServers(),
    };
  }
  const defaultCapabilityId = catalog.defaultCapabilityIdForServerId(input.serverId);
  if (defaultCapabilityId) {
    return installMcpDefaultCapabilityForDesktop(host, { capabilityId: defaultCapabilityId });
  }

  const preview = await catalog.previewRegistryInstall(input);
  if (!preview.runPlan || preview.review.blockers.length) {
    return {
      status: "blocked",
      serverId: preview.serverId,
      message: `MCP server install is blocked.\n\n${mcpRegistryInstallPreviewText(preview)}`,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }

  const gate = await evaluateMcpInstallGate({
    toolHive,
    catalog,
    defaultCapabilityStatePath: mcpDefaultCapabilityStatePath(),
    appVersion: packageJson.version,
  });
  const runtimeProbe = gate.runtimeProbe;
  const preflight = runtimeProbe.toolHive.preflight;
  if (gate.status !== "ready" || !preflight) {
    return {
      status: gate.status === "ready" ? "runtime-preflight-failed" : gate.status,
      serverId: preview.serverId,
      workloadName: preview.runPlan.workloadName,
      message: mcpInstallGateSummary(gate),
      runtimeStatus: runtimeProbe.status,
      defaultCapabilities: gate.defaultCapabilities,
      exitCode: preflight?.command.exitCode,
      durationMs: preflight?.command.durationMs,
      permissionProfile: {
        path: preview.permissionProfile.path,
        sha256: preview.permissionProfile.sha256,
      },
    };
  }

  const detail = mcpServerInstallApprovalDetail({
    preview,
    workspace: { path: host.workspacePath },
    preflight: preflight.command,
  });
  const resolution = await requestPermissionWithGrantRegistry({
    threadId: targetThreadId,
    workspacePath: thread.workspacePath,
    toolName: "ambient_mcp_server_install",
    title: `Install MCP server "${preview.candidate.displayName}"?`,
    message:
      "Ambient will install and start this ToolHive registry MCP server in the Ambient ToolHive group. Tool-level use remains a separate reviewed MCP bridge step.",
    detail,
    risk: "plugin-tool",
    grantTargetLabel: `Install MCP server ${preview.candidate.displayName}`,
    grantTargetHash: permissionGrantTargetHash(
      "plugin_tool_execute",
      "tool",
      ["ambient_mcp_server_install", preview.serverId, preview.runPlan.workloadName].join("\0"),
    ),
  }, {
    thread,
    permissionMode: thread.permissionMode,
    workspacePath: host.workspacePath,
    store: host.store,
    requireFreshPrompt: true,
  });
  if (!resolution.allowed) throw new Error("MCP server install was not approved.");

  const result = await toolHive.runRegistryServer({
    serverId: preview.serverId,
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
  });
  const workload = await toolHive.waitForAmbientWorkload(preview.runPlan.workloadName, { timeoutMs: 90_000 });
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: "installed",
    serverId: preview.serverId,
    workloadName: preview.runPlan.workloadName,
    message: [
      `Installed MCP server ${preview.serverId}.`,
      `Workload: ${preview.runPlan.workloadName}`,
      workload.status ? `Runtime status: ${workload.status}` : undefined,
      workload.endpoint ? `Endpoint: ${workload.endpoint}` : undefined,
      `Exit code: ${result.exitCode}`,
      `Permission profile: ${preview.permissionProfile.path}`,
    ].filter(Boolean).join("\n"),
    installed: await catalog.listInstalledServers(),
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    permissionProfile: {
      path: preview.permissionProfile.path,
      sha256: preview.permissionProfile.sha256,
    },
  };
}

async function uninstallMcpServerForDesktop(
  host: DesktopMcpProjectRuntimeHost,
  input: { serverId?: string; workloadName?: string },
): Promise<AmbientMcpServerUninstallResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP server uninstall is blocked in Planner Mode.");
  const selected = selectMcpInstalledServer(await catalog.listInstalledServers(), input);
  const detail = mcpServerUninstallApprovalDetail({
    server: selected,
    workspace: { path: host.workspacePath },
  });
  const resolution = await requestPermissionWithGrantRegistry({
    threadId: targetThreadId,
    workspacePath: thread.workspacePath,
    toolName: "ambient_mcp_server_uninstall",
    title: `Remove MCP server "${selected.serverId}"?`,
    message: "Ambient will stop and remove this Ambient-managed ToolHive MCP workload. Secrets are not deleted by this action.",
    detail,
    risk: "plugin-tool",
    grantTargetLabel: `Remove MCP server ${selected.serverId}`,
    grantTargetHash: permissionGrantTargetHash(
      "plugin_tool_execute",
      "tool",
      ["ambient_mcp_server_uninstall", selected.serverId, selected.workloadName].join("\0"),
    ),
  }, {
    thread,
    permissionMode: thread.permissionMode,
    workspacePath: host.workspacePath,
    store: host.store,
    requireFreshPrompt: true,
  });
  if (!resolution.allowed) throw new Error("MCP server uninstall was not approved.");

  let stopResult: ToolHiveCommandResult | undefined;
  const workloadStatus = selected.workloadStatus?.toLowerCase();
  if (workloadStatus !== "stopped" && workloadStatus !== "exited") {
    stopResult = await toolHive.stopWorkload(selected.workloadName, 30);
  }
  const removeResult = await toolHive.removeWorkload(selected.workloadName);
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: "removed",
    serverId: selected.serverId,
    workloadName: selected.workloadName,
    message: [
      `Removed MCP server ${selected.serverId}.`,
      `Workload: ${selected.workloadName}`,
      stopResult ? `Stop exit code: ${stopResult.exitCode}` : "Stop skipped because workload was reported stopped.",
      `Remove exit code: ${removeResult.exitCode}`,
    ].join("\n"),
    installed: await catalog.listInstalledServers(),
    stopExitCode: stopResult?.exitCode,
    removeExitCode: removeResult.exitCode,
    durationMs: (stopResult?.durationMs ?? 0) + removeResult.durationMs,
  };
}

async function acceptMcpToolDescriptorReviewForDesktop(
  host: DesktopMcpProjectRuntimeHost,
  input: { serverId?: string; workloadName?: string; expectedDescriptorHash?: string },
): Promise<AmbientMcpToolReviewAcceptResult> {
  const { toolHive, catalog } = createMcpInstallCatalog();
  const targetThreadId = activeThreadIdForHost(host);
  const thread = host.store.getThread(targetThreadId);
  if (thread.collaborationMode === "planner") throw new Error("MCP tool descriptor review acceptance is blocked in Planner Mode.");
  const selected = selectMcpInstalledServer(await catalog.listInstalledServers(), input);
  if (!selected.lastKnownToolDescriptorHash) throw new Error(`No MCP tool descriptor snapshot exists for ${selected.serverId}. Refresh tool discovery before accepting review.`);
  if (input.expectedDescriptorHash && input.expectedDescriptorHash !== selected.lastKnownToolDescriptorHash) {
    throw new Error(`MCP tool descriptor snapshot changed before review could be accepted. Expected ${input.expectedDescriptorHash}, found ${selected.lastKnownToolDescriptorHash}.`);
  }

  if (selected.toolDescriptorReviewStatus === "needs-review") {
    const detail = mcpToolDescriptorReviewApprovalDetail(selected, host.workspacePath, input.expectedDescriptorHash);
    const resolution = await requestPermissionWithGrantRegistry({
      threadId: targetThreadId,
      workspacePath: thread.workspacePath,
      toolName: "ambient_mcp_tool_review_accept",
      title: `Trust MCP tool descriptors for "${selected.serverId}"?`,
      message:
        "Ambient will mark this installed ToolHive MCP server's current tool descriptor snapshot trusted. This clears descriptor drift but does not call a downstream MCP tool.",
      detail,
      risk: "plugin-tool",
      grantTargetLabel: `Trust MCP tool descriptors ${selected.serverId}`,
      grantTargetHash: permissionGrantTargetHash(
        "plugin_tool_execute",
        "tool",
        ["ambient_mcp_tool_review_accept", selected.serverId, selected.workloadName, selected.lastKnownToolDescriptorHash].join("\0"),
      ),
    }, {
      thread,
      permissionMode: thread.permissionMode,
      workspacePath: host.workspacePath,
      store: host.store,
      requireFreshPrompt: true,
    });
    if (!resolution.allowed) throw new Error("MCP tool descriptor review acceptance was not approved.");
  }

  const result = await toolHive.trustInstalledServerToolDescriptors(selected.workloadName, input.expectedDescriptorHash);
  emitPluginCatalogUpdated(host.workspacePath);
  return {
    status: result.wasReviewRequired ? "trusted" : "already-trusted",
    serverId: selected.serverId,
    workloadName: selected.workloadName,
    descriptorHash: result.descriptorHash,
    message: result.wasReviewRequired
      ? `Trusted current MCP tool descriptors for ${selected.serverId}.`
      : `MCP tool descriptors for ${selected.serverId} were already trusted.`,
    installed: await catalog.listInstalledServers(),
  };
}

function mcpToolDescriptorReviewApprovalDetail(
  server: McpInstalledServerSummary,
  workspacePath: string,
  expectedDescriptorHash?: string,
): string {
  return [
    `Trust current MCP tool descriptors for ${server.serverId}?`,
    "",
    "Review context:",
    `- Workspace: ${workspacePath}`,
    `- Workload: ${server.workloadName}`,
    `- Runtime status: ${server.workloadStatus ?? "unknown"}`,
    server.endpoint ? `- Endpoint: ${server.endpoint}` : undefined,
    `- Descriptor review: ${server.toolDescriptorReviewStatus ?? "unknown"}`,
    server.toolDescriptorReviewReason ? `- Review reason: ${server.toolDescriptorReviewReason}` : undefined,
    server.lastKnownToolDescriptorHash ? `- Current descriptor hash: ${server.lastKnownToolDescriptorHash}` : undefined,
    expectedDescriptorHash ? `- Expected descriptor hash: ${expectedDescriptorHash}` : undefined,
    typeof server.lastKnownToolCount === "number" ? `- Cached tool count: ${server.lastKnownToolCount}` : undefined,
    server.lastToolDiscoveryAt ? `- Last discovery: ${server.lastToolDiscoveryAt}` : undefined,
    "- Action: clear descriptor drift for this installed server snapshot only.",
  ].filter(Boolean).join("\n");
}

function selectMcpInstalledServer(
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
export {
  acceptMcpToolDescriptorReviewForDesktop,
  ambientMcpInstallPreview,
  createMcpInstallCatalog,
  installMcpDefaultCapabilityForDesktop,
  installMcpRegistryServerForDesktop,
  mcpContainerRuntimeSetupStatePath,
  probeAmbientMcpContainerRuntimeStatus,
  reconcileMcpContainerRuntimeOnStartup,
  uninstallMcpServerForDesktop,
};
