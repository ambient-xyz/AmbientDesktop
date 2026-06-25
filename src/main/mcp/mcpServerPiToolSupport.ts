import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { containerRuntimeProbeSummary, probeContainerRuntime, type ContainerRuntimeProbeResult } from "./mcpContainerRuntimeFacade";
import type { McpAutowirePlanRevision } from "./mcpAutowireFacade";
import {
  mcpDefaultCapabilityInstallPreviewText,
  mcpInstallPreviewText,
  type McpInstalledServerSummary,
  type McpDefaultCapabilityInstallPreview,
  type McpInstallPreview,
  type McpRegistryInstallPreview,
  type McpRemoteMcpProxyPreview,
  type McpSecretBinding,
  type McpStandardImportPreview,
} from "./mcpInstallCatalog";
import type { McpInstallGateResult } from "./mcpInstallGate";
import type { McpServerInstallPreviewForApproval, McpServerPiToolOptions, McpServerPiToolWorkspace } from "./mcpServerPiToolTypes";
import { McpToolBridge, type McpToolDescriptor } from "./mcpToolBridge";
import type {
  ToolHiveCommandResult,
  ToolHiveInstalledServerState,
  ToolHiveOperationProgress,
  ToolHiveRuntimeService,
  ToolHiveRunVolume,
} from "./mcpToolRuntimeFacade";
import { storedMcpSecretBindingsForServer } from "./mcpSecretReferences";

export type McpServerPiToolDefinition = ToolDefinition<any, any, any>;
export type McpPiToolUpdate = (update: { content: Array<{ type: "text"; text: string }>; details: Record<string, unknown> }) => void;

export type InstalledMcpAutowireRevisionRecord = {
  revision: McpAutowirePlanRevision;
  previousActiveRevisionId?: string;
};

export interface McpInstallProtocolValidationResult {
  status: "ready" | "validation_failed";
  toolCount: number;
  descriptorHash?: string;
  error?: string;
}

export async function evaluateMcpServerInstallGate(
  options: Pick<McpServerPiToolOptions, "toolHive" | "containerRuntimeProbe" | "installGate">,
): Promise<McpInstallGateResult> {
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

export async function validateInstalledMcpTools(input: {
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

export function mcpServerInstallResultTextWithRevision(
  preview: McpInstallPreview,
  result: ToolHiveCommandResult,
  workload: { status?: string; endpoint?: string } | undefined,
  validation: McpInstallProtocolValidationResult | undefined,
  installRevision: InstalledMcpAutowireRevisionRecord | undefined,
): string {
  return [
    mcpServerInstallResultText(preview, result, workload, validation),
    installRevision?.previousActiveRevisionId
      ? [
          "",
          `Previous active Autowire revision: ${installRevision.previousActiveRevisionId}`,
          `Current active Autowire revision: ${installRevision.revision.revisionId}`,
          "Rollback target is recorded for audit; rollback should use a managed Ambient install/repair flow, not raw ToolHive edits.",
        ].join("\n")
      : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

export function mcpToolDiscoveryNextAction(serverId: string, workloadName?: string): string {
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

export async function installedServerForServerId(
  toolHive: ToolHiveRuntimeService,
  serverId: string,
): Promise<ToolHiveInstalledServerState | undefined> {
  const state = await toolHive.readState();
  return state.installedServers.find((server) => server.serverId === serverId);
}

export function selectInstalledServer(
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

export async function previewRegistryInstallWithStoredSecrets(
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

export function toolResult(text: string, details: Record<string, unknown>): AgentToolResult<Record<string, unknown>> {
  return {
    content: [{ type: "text", text }],
    details,
  };
}

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function requiredObject(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${key} is required.`);
  return value as Record<string, unknown>;
}

export async function candidateOrRefInput(
  options: McpServerPiToolOptions,
  input: Record<string, unknown>,
): Promise<{ candidate: Record<string, unknown>; candidateRef?: string }> {
  const candidate = objectInput(input.candidate);
  if (Object.keys(candidate).length) return { candidate };
  const candidateRef = optionalString(input.candidateRef);
  if (!candidateRef) throw new Error("candidate or candidateRef is required.");
  const resolved = await options.resolveCandidateRef?.(candidateRef);
  if (!resolved || typeof resolved !== "object" || Array.isArray(resolved)) {
    throw new Error(
      `No reviewed MCP candidate is available for candidateRef ${candidateRef}. The reference may be from an earlier or reset Pi session; rerun ambient_mcp_autowire_plan or pass the exact candidate JSON.`,
    );
  }
  return { candidate: resolved, candidateRef };
}

export async function recordInstalledMcpAutowireRevision(input: {
  options: Pick<McpServerPiToolOptions, "planRevisions" | "toolHive">;
  preview: McpInstallPreview;
  workloadName: string;
  summary: string;
}): Promise<InstalledMcpAutowireRevisionRecord | undefined> {
  if (!input.options.planRevisions) return undefined;
  const previousActiveRevisionId = (await input.options.toolHive.readState()).installedServers.find(
    (server) => server.workloadName === input.workloadName,
  )?.activeRevisionId;
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

export async function awaitMcpApprovalWithHeartbeat(input: {
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
      content: [
        { type: "text", text: heartbeatCount === 1 ? input.message : `${input.message} (${formatMcpElapsedMs(elapsedMs)} elapsed).` },
      ],
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

export function emitMcpToolHiveProgressUpdate(input: {
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

export function secretBindingsInput(value: unknown): McpSecretBinding[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    .map((binding) => ({
      envName: requiredString(binding, "envName"),
      secretRef: requiredString(binding, "secretRef"),
    }));
}

export function runtimeVolumesInput(value: unknown): ToolHiveRunVolume[] {
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

export function runtimeVolumesText(volumes: ToolHiveRunVolume[]): string {
  if (!volumes.length) return "none";
  return volumes.map((volume) => `${volume.hostPath} -> ${volume.containerPath}:${volume.mode}`).join("; ");
}

export function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sameSecretBindings(a: McpSecretBinding[], b: McpSecretBinding[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((binding, index) => binding.envName === b[index]?.envName && binding.secretRef === b[index]?.secretRef);
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
  ]
    .filter(Boolean)
    .join("\n");
}

function registryInstallCommandShape(
  preview: McpRegistryInstallPreview,
  runPlan: NonNullable<McpRegistryInstallPreview["runPlan"]>,
): string {
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

function isDefaultCapabilityInstallPreview(preview: McpServerInstallPreviewForApproval): preview is McpDefaultCapabilityInstallPreview {
  return "capabilityId" in preview;
}

async function probeMcpContainerRuntime(
  options: Pick<McpServerPiToolOptions, "toolHive" | "containerRuntimeProbe">,
): Promise<ContainerRuntimeProbeResult> {
  return options.containerRuntimeProbe ? options.containerRuntimeProbe() : probeContainerRuntime({ toolHive: options.toolHive });
}

function commonDescriptorHash(tools: McpToolDescriptor[]): string | undefined {
  const hashes = [...new Set(tools.map((tool) => tool.descriptorHash).filter((hash): hash is string => Boolean(hash)))];
  return hashes.length === 1 ? hashes[0] : undefined;
}

function formatMcpElapsedMs(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}
