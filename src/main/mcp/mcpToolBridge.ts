import { stat } from "node:fs/promises";
import { mcpToolArgumentValidationErrorText, mcpToolTimeoutHintForDescriptor } from "./mcpToolBridgePresentation";
import { materializeTextOutput, materializedTextNotice } from "./mcpToolRuntimeFacade";
import { McpInstallCatalog } from "./mcpInstallCatalog";
import type { McpInstalledServerSummary } from "./mcpInstallCatalogTypes";
import { type ToolHiveInstalledServerState, type ToolHiveMcpToolPolicy, type ToolHiveRuntimeService } from "./mcpToolRuntimeFacade";
import {
  evaluateMcpRuntimePermissionEnforcement,
  mcpRuntimePermissionBlockedMessage,
  type McpRuntimePermissionEnforcement,
} from "./mcpRuntimePermissionEnforcement";
import {
  evaluateMcpToolCallPermission,
  mcpPermissionPolicyBlockedMessage,
  type McpPermissionPolicyEvaluation,
} from "./mcpPermissionPolicyService";
import {
  materializeMcpManagedFileExchangeArtifacts,
  prepareMcpManagedFileExchangeArguments,
  type McpManagedFileExchangePreparation,
  type McpManagedFileExchangeStagedFile,
} from "./mcpManagedFileExchange";
import { evaluateMcpAggregationReadiness, type InstalledMcpServerRecord } from "./mcpAggregationReadiness";
import {
  createMcpHttpClient,
  isMcpToolError,
  textFromMcpToolCallResult,
  type FetchLike,
} from "./mcpHttpClient";
import type {
  McpAggregationReadinessInput,
  McpAggregationReadinessReport,
  McpToolCallInput,
  McpToolCallResult,
  McpToolDescribeInput,
  McpToolDescriptor,
  McpToolDescriptorDriftEvent,
  McpToolDescriptorReview,
  McpToolDescriptorReviewAcceptInput,
  McpToolDescriptorReviewAcceptResult,
  McpToolDescriptorReviewInput,
  McpToolPolicySummary,
  McpToolPolicyUpdateInput,
  McpToolPolicyUpdatePreview,
  McpToolPolicyUpdateResult,
  McpToolSearchInput,
} from "./mcpToolBridgeTypes";

const defaultMcpHttpTimeoutMs = 60_000;
const defaultMcpToolSearchLimit = 8;
const maxMcpToolSearchLimit = 20;
const mcpToolResultPreviewChars = 12_000;

export { createMcpHttpClient, isMcpToolError, textFromMcpToolCallResult } from "./mcpHttpClient";
export {
  mcpAggregationReadinessText,
  mcpToolArgumentValidationErrorText,
  mcpToolCallOutputLooksLikeHtmlError,
  mcpToolCallResultText,
  mcpToolDescribeText,
  mcpToolDescriptorReviewAcceptText,
  mcpToolDescriptorReviewText,
  mcpToolPolicyUpdatePreviewText,
  mcpToolPolicyUpdateResultText,
  mcpToolSearchResultsText,
  mcpToolTimeoutHintForDescriptor,
  validateMcpToolArguments,
} from "./mcpToolBridgePresentation";
export type {
  McpAggregationNamespacePlanItem,
  McpAggregationReadinessCheck,
  McpAggregationReadinessInput,
  McpAggregationReadinessReport,
  McpAggregationReadinessServer,
  McpToolCallInput,
  McpToolCallResult,
  McpToolDescribeInput,
  McpToolDescriptor,
  McpToolDescriptorDriftEvent,
  McpToolDescriptorReview,
  McpToolDescriptorReviewAcceptInput,
  McpToolDescriptorReviewAcceptResult,
  McpToolDescriptorReviewInput,
  McpToolPolicySummary,
  McpToolPolicyUpdateInput,
  McpToolPolicyUpdatePreview,
  McpToolPolicyUpdateResult,
  McpToolSearchInput,
  McpToolTimeoutHint,
} from "./mcpToolBridgeTypes";
export type {
  FetchLike,
  McpHttpClient,
  McpHttpClientOptions,
  McpToolBridgeActivity,
  McpToolBridgeActivityHandler,
  McpToolBridgeActivitySource,
} from "./mcpHttpClient";

export class McpToolRuntimePermissionBlockedError extends Error {
  readonly descriptor: McpToolDescriptor;
  readonly enforcement: McpRuntimePermissionEnforcement;

  constructor(input: { descriptor: McpToolDescriptor; enforcement: McpRuntimePermissionEnforcement }) {
    super(mcpRuntimePermissionBlockedMessage(input.enforcement));
    this.name = "McpToolRuntimePermissionBlockedError";
    this.descriptor = input.descriptor;
    this.enforcement = input.enforcement;
  }
}

export function isMcpToolRuntimePermissionBlockedError(error: unknown): error is McpToolRuntimePermissionBlockedError {
  return error instanceof McpToolRuntimePermissionBlockedError;
}

export interface McpToolBridgeOptions {
  catalog: McpInstallCatalog;
  toolHive: ToolHiveRuntimeService;
  workspacePath: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  onDescriptorDrift?: (event: McpToolDescriptorDriftEvent) => void | Promise<void>;
}

export interface McpPreparedToolCall {
  descriptor: McpToolDescriptor;
  arguments: Record<string, unknown>;
  originalArguments: Record<string, unknown>;
  permission: McpPermissionPolicyEvaluation;
  runtimeEnforcement: McpRuntimePermissionEnforcement;
  fileExchange: McpManagedFileExchangePreparation;
}

export class McpToolBridge {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(private readonly options: McpToolBridgeOptions) {
    if (!options.workspacePath.trim()) throw new Error("McpToolBridge requires a workspacePath for materialized tool outputs.");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? defaultMcpHttpTimeoutMs));
  }

  async searchTools(input: McpToolSearchInput = {}): Promise<McpToolDescriptor[]> {
    const query = normalizeSearchQuery(input.query);
    const limit = Math.max(1, Math.min(maxMcpToolSearchLimit, Math.floor(input.limit ?? defaultMcpToolSearchLimit)));
    const tools = await this.discoverTools(input);
    const visibleTools = tools.filter(isVisibleMcpTool);
    if (!query) {
      return visibleTools.sort(compareMcpToolDescriptors).slice(0, limit);
    }
    return visibleTools
      .map((tool) => ({ tool, score: mcpToolSearchScore(tool, query) }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || compareMcpToolDescriptors(left.tool, right.tool))
      .map((match) => match.tool)
      .slice(0, limit);
  }

  async describeTool(input: McpToolDescribeInput): Promise<McpToolDescriptor> {
    const tools = await this.discoverTools(input);
    return selectMcpTool(tools.filter(isVisibleMcpTool), input);
  }

  async evaluateRuntimePermission(input: {
    descriptor: McpToolDescriptor;
    permission: McpPermissionPolicyEvaluation;
  }): Promise<McpRuntimePermissionEnforcement> {
    const profile = await this.options.toolHive.readInstalledServerPermissionProfile(input.descriptor.workloadName);
    return evaluateMcpRuntimePermissionEnforcement({
      permission: input.permission,
      server: profile.server,
      permissionProfile: profile.profile,
      profilePath: profile.path,
      profileSha256: profile.sha256,
      expectedProfileSha256: profile.expectedSha256,
      profileSha256Verified: profile.sha256Verified,
    });
  }

  async prepareToolCall(input: McpToolCallInput): Promise<McpPreparedToolCall> {
    const descriptor = await this.describeTool({ ...input, refresh: input.refresh ?? true });
    if (descriptor.reviewStatus === "needs-review") {
      throw new Error(
        `MCP tool ${descriptor.name} is blocked because server ${descriptor.serverId} needs descriptor review: ${descriptor.reviewReason ?? "descriptor drift detected"}`,
      );
    }
    if (!descriptor.endpoint)
      throw new Error(`MCP tool ${descriptor.name} cannot be called because workload ${descriptor.workloadName} has no ToolHive endpoint.`);
    if (descriptor.policy?.callPolicy === "blocked") {
      throw new Error(
        `MCP tool ${descriptor.serverId}/${descriptor.name} is blocked by Ambient tool policy${descriptor.policy.reason ? `: ${descriptor.policy.reason}` : "."}`,
      );
    }
    const originalArguments = input.arguments ?? {};
    const profile = await this.options.toolHive.readInstalledServerPermissionProfile(descriptor.workloadName);
    const fileExchange = await prepareMcpManagedFileExchangeArguments({
      arguments: originalArguments,
      fileInputs: input.fileInputs,
      workspacePath: this.options.workspacePath,
      server: profile.server,
    });
    const toolArguments = fileExchange.arguments;
    const validationError = mcpToolArgumentValidationErrorText(descriptor, toolArguments);
    if (validationError) throw new Error(validationError);
    const permission = evaluateMcpToolCallPermission({
      descriptor,
      toolArguments,
      workspacePath: this.options.workspacePath,
      projectPath: this.options.workspacePath,
    });
    if (permission.hardDenials.length) throw new Error(mcpPermissionPolicyBlockedMessage(permission));
    const runtimeEnforcement = evaluateMcpRuntimePermissionEnforcement({
      permission,
      server: profile.server,
      permissionProfile: profile.profile,
      profilePath: profile.path,
      profileSha256: profile.sha256,
      expectedProfileSha256: profile.expectedSha256,
      profileSha256Verified: profile.sha256Verified,
    });
    if (runtimeEnforcement.blockers.length) throw new McpToolRuntimePermissionBlockedError({ descriptor, enforcement: runtimeEnforcement });
    return {
      descriptor,
      arguments: toolArguments,
      originalArguments,
      permission,
      runtimeEnforcement,
      fileExchange,
    };
  }

  async callTool(input: McpToolCallInput): Promise<McpToolCallResult> {
    const prepared = await this.prepareToolCall(input);
    const { descriptor, arguments: toolArguments } = prepared;
    const timeoutHint = mcpToolTimeoutHintForDescriptor(descriptor, this.timeoutMs);
    if (!descriptor.endpoint)
      throw new Error(`MCP tool ${descriptor.name} cannot be called because workload ${descriptor.workloadName} has no ToolHive endpoint.`);
    const client = createMcpHttpClient(descriptor.endpoint, {
      fetchImpl: this.fetchImpl,
      timeoutMs: timeoutHint.idleTimeoutMs,
      maxRunMs: timeoutHint.maxRunMs,
      onActivity: input.onActivity,
    });
    let result: unknown;
    try {
      result = await client.callTool(descriptor.name, toolArguments, input.signal);
    } catch (error) {
      throw new Error(await mcpToolCallErrorWithFileExchangeHint(errorMessage(error), prepared.fileExchange), { cause: error });
    }
    const text = textFromMcpToolCallResult(result);
    if (isMcpToolError(result)) {
      throw new Error(await mcpToolCallErrorWithFileExchangeHint(text || `MCP tool ${descriptor.name} failed.`, prepared.fileExchange));
    }
    const output = await materializeTextOutput(this.options.workspacePath, {
      label: `toolhive-mcp-${descriptor.serverId}-${descriptor.name}`,
      text,
      maxPreviewChars: mcpToolResultPreviewChars,
      extension: "txt",
    });
    const managedFileArtifacts = await materializeMcpManagedFileExchangeArtifacts({
      exchange: prepared.fileExchange.exchange,
      workspacePath: this.options.workspacePath,
      workloadName: descriptor.workloadName,
      text,
      stagedFiles: prepared.fileExchange.stagedFiles,
    });
    return {
      descriptor,
      text: output.truncated ? `${output.text}\n\n${materializedTextNotice("MCP tool output", output)}` : output.text,
      output,
      arguments: toolArguments,
      originalArguments: prepared.originalArguments,
      stagedFiles: prepared.fileExchange.stagedFiles,
      managedFileArtifacts,
    };
  }

  async reviewToolDescriptors(input: McpToolDescriptorReviewInput = {}): Promise<McpToolDescriptorReview> {
    const record = selectInstalledRecord(await this.installedRecords(input), input);
    const tools = await this.toolsForInstalledServer(record, input);
    const freshRecord = selectInstalledRecord(
      await this.installedRecords({
        serverId: record.summary.serverId,
        workloadName: record.summary.workloadName,
      }),
      {
        serverId: record.summary.serverId,
        workloadName: record.summary.workloadName,
      },
    );
    const freshTools = normalizeMcpTools(
      freshRecord.summary,
      freshRecord.state?.lastKnownToolDescriptors ?? [],
      freshRecord.state,
      this.timeoutMs,
    );
    return descriptorReviewFromRecord(freshRecord, freshTools.length ? freshTools : tools);
  }

  async acceptToolDescriptorReview(input: McpToolDescriptorReviewAcceptInput): Promise<McpToolDescriptorReviewAcceptResult> {
    const record = selectInstalledRecord(await this.installedRecords(input), input);
    const trust = await this.options.toolHive.trustInstalledServerToolDescriptors(
      record.summary.workloadName,
      input.expectedDescriptorHash,
    );
    const freshRecord = selectInstalledRecord(
      await this.installedRecords({
        serverId: record.summary.serverId,
        workloadName: record.summary.workloadName,
      }),
      {
        serverId: record.summary.serverId,
        workloadName: record.summary.workloadName,
      },
    );
    const tools = normalizeMcpTools(
      freshRecord.summary,
      trust.state.lastKnownToolDescriptors ?? freshRecord.state?.lastKnownToolDescriptors ?? [],
      trust.state,
      this.timeoutMs,
    );
    return {
      status: trust.wasReviewRequired ? "trusted" : "already-trusted",
      review: descriptorReviewFromRecord({ summary: freshRecord.summary, state: trust.state }, tools),
    };
  }

  async previewToolPolicyUpdate(input: McpToolPolicyUpdateInput): Promise<McpToolPolicyUpdatePreview> {
    assertPolicyUpdateInput(input);
    const descriptor = await this.selectToolForPolicyUpdate(input);
    const nextPolicy = policySummaryFromUpdateInput(input);
    return {
      descriptor,
      ...(descriptor.policy ? { previousPolicy: descriptor.policy } : {}),
      ...(nextPolicy ? { nextPolicy } : {}),
      status: nextPolicy ? "would-update" : "would-clear",
    };
  }

  async updateToolPolicy(input: McpToolPolicyUpdateInput): Promise<McpToolPolicyUpdateResult> {
    const preview = await this.previewToolPolicyUpdate({ ...input, refresh: input.refresh ?? false });
    const updatedState = await this.options.toolHive.updateInstalledServerToolPolicy(
      preview.descriptor.workloadName,
      preview.descriptor.name,
      input.clear
        ? {}
        : {
            ...(input.visibility ? { visibility: input.visibility } : {}),
            ...(input.callPolicy ? { callPolicy: input.callPolicy } : {}),
            ...(typeof input.reason === "string" ? { reason: input.reason } : {}),
          },
    );
    const nextPolicy = mcpToolPolicyForName(updatedState.toolPolicies, preview.descriptor.name);
    const descriptor = {
      ...preview.descriptor,
      ...(nextPolicy ? { policy: nextPolicy } : {}),
    };
    if (!nextPolicy) delete descriptor.policy;
    return {
      descriptor,
      ...(preview.previousPolicy ? { previousPolicy: preview.previousPolicy } : {}),
      ...(nextPolicy ? { policy: nextPolicy } : {}),
      status: nextPolicy ? "updated" : "cleared",
    };
  }

  async evaluateAggregationReadiness(input: McpAggregationReadinessInput = {}): Promise<McpAggregationReadinessReport> {
    return evaluateMcpAggregationReadiness({
      input,
      records: await this.installedRecords({}),
      toolsForInstalledServer: (record, searchInput) => this.toolsForInstalledServer(record, searchInput),
      readInstalledServerPermissionProfile: (workloadName) => this.options.toolHive.readInstalledServerPermissionProfile(workloadName),
    });
  }

  private async discoverTools(input: McpToolSearchInput): Promise<McpToolDescriptor[]> {
    const records = await this.installedRecords(input);
    const tools: McpToolDescriptor[] = [];
    const errors: string[] = [];
    for (const record of records) {
      try {
        tools.push(...(await this.toolsForInstalledServer(record, input)));
      } catch (error) {
        const message = errorMessage(error);
        if (input.serverId || input.workloadName) throw error;
        errors.push(`${record.summary.serverId}: ${message}`);
      }
    }
    if (!tools.length && errors.length) throw new Error(`No Ambient MCP tools could be discovered. ${errors.join(" ")}`);
    return tools;
  }

  private async installedRecords(input: McpToolSearchInput): Promise<InstalledMcpServerRecord[]> {
    const [summaries, state] = await Promise.all([this.options.catalog.listInstalledServers(), this.options.toolHive.readState()]);
    const stateByWorkload = new Map(state.installedServers.map((server) => [server.workloadName, server]));
    return resolveInstalledRecords(
      summaries.map((summary) => ({ summary, state: stateByWorkload.get(summary.workloadName) })),
      input,
    );
  }

  private async toolsForInstalledServer(record: InstalledMcpServerRecord, input: McpToolSearchInput): Promise<McpToolDescriptor[]> {
    const cached = normalizeMcpTools(record.summary, record.state?.lastKnownToolDescriptors ?? [], record.state, this.timeoutMs);
    const shouldRefresh = input.refresh === true || cached.length === 0;
    if (!shouldRefresh) return cached;
    if (!record.summary.endpoint) {
      if (cached.length) return cached;
      throw new Error(
        `ToolHive workload ${record.summary.workloadName} has no endpoint. Start the workload or run ambient_mcp_server_list for status.`,
      );
    }
    const client = createMcpHttpClient(record.summary.endpoint, {
      fetchImpl: this.fetchImpl,
      timeoutMs: this.timeoutMs,
      onActivity: input.onActivity,
    });
    const discovered = await client.listTools(input.signal);
    const snapshot = await this.options.toolHive.snapshotInstalledServerToolDescriptors(record.summary.workloadName, discovered);
    if (snapshot.changed && snapshot.previousHash) {
      await this.options.onDescriptorDrift?.({
        serverId: record.summary.serverId,
        workloadName: record.summary.workloadName,
        previousDescriptorHash: snapshot.previousHash,
        descriptorHash: snapshot.descriptorHash,
        ...(snapshot.state.toolDescriptorReviewReason ? { reason: snapshot.state.toolDescriptorReviewReason } : {}),
      });
    }
    return normalizeMcpTools(record.summary, snapshot.state.lastKnownToolDescriptors ?? discovered, snapshot.state, this.timeoutMs);
  }

  private async selectToolForPolicyUpdate(input: McpToolPolicyUpdateInput): Promise<McpToolDescriptor> {
    const tools = await this.discoverTools(input);
    return selectMcpTool(tools, input);
  }
}

async function mcpToolCallErrorWithFileExchangeHint(message: string, fileExchange: McpManagedFileExchangePreparation): Promise<string> {
  if (!fileExchange.stagedFiles.length || !mcpToolErrorLooksLikeFileVisibilityFailure(message)) return message;
  const readableStagedFiles: McpManagedFileExchangeStagedFile[] = [];
  for (const file of fileExchange.stagedFiles) {
    if (file.source === "output-path") continue;
    try {
      const info = await stat(file.hostPath);
      if (info.isFile()) readableStagedFiles.push(file);
    } catch {
      // If the host file is gone too, the original tool error is sufficient.
    }
  }
  if (!readableStagedFiles.length) return message;
  const paths = readableStagedFiles
    .slice(0, 5)
    .map((file) => `${file.argumentPath} -> ${file.containerPath}`)
    .join("; ");
  return [
    message,
    `Ambient diagnostic: staged host file input${readableStagedFiles.length === 1 ? "" : "s"} still exist for ${paths}, but the MCP server reported a missing or denied container path. Treat this as a ToolHive managed file exchange visibility issue. Do not retry with arbitrary host paths or unmanaged workspace paths. Repair/reinstall the Ambient-managed MCP server if diagnostics show the exchange is unhealthy; if the tool writes an output file, retry with an explicit output_path/destination argument so Ambient can pre-authorize and surface the generated artifact.`,
  ].join("\n\n");
}

function mcpToolErrorLooksLikeFileVisibilityFailure(message: string): boolean {
  return /\b(?:file not found|no such file|not found|permission denied|access denied|cannot open|not readable)\b/i.test(message);
}

function normalizeMcpTools(
  server: McpInstalledServerSummary,
  descriptors: unknown[],
  state?: ToolHiveInstalledServerState,
  defaultIdleTimeoutMs = defaultMcpHttpTimeoutMs,
): McpToolDescriptor[] {
  return descriptors
    .map((descriptor) => normalizeMcpTool(server, descriptor, state, defaultIdleTimeoutMs))
    .filter((descriptor): descriptor is McpToolDescriptor => Boolean(descriptor));
}

function normalizeMcpTool(
  server: McpInstalledServerSummary,
  descriptor: unknown,
  state?: ToolHiveInstalledServerState,
  defaultIdleTimeoutMs = defaultMcpHttpTimeoutMs,
): McpToolDescriptor | undefined {
  if (!isRecord(descriptor) || typeof descriptor.name !== "string" || !descriptor.name.trim()) return undefined;
  const inputSchema = "inputSchema" in descriptor ? descriptor.inputSchema : descriptor.input_schema;
  const policy = mcpToolPolicyForName(state?.toolPolicies, descriptor.name.trim());
  const normalizedDescriptor = {
    serverId: server.serverId,
    workloadName: server.workloadName,
    toolRef: mcpToolRef(server.serverId, descriptor.name.trim()),
    ...(server.workloadStatus ? { workloadStatus: server.workloadStatus } : {}),
    ...(server.endpoint ? { endpoint: server.endpoint } : {}),
    reviewStatus: state?.toolDescriptorReviewStatus ?? "trusted",
    ...(state?.toolDescriptorReviewReason ? { reviewReason: state.toolDescriptorReviewReason } : {}),
    ...(state?.lastToolDiscoveryAt ? { lastDiscoveredAt: state.lastToolDiscoveryAt } : {}),
    ...(state?.lastKnownToolDescriptorHash ? { descriptorHash: state.lastKnownToolDescriptorHash } : {}),
    ...(policy ? { policy } : {}),
    name: descriptor.name.trim(),
    ...(typeof descriptor.description === "string" && descriptor.description.trim() ? { description: descriptor.description.trim() } : {}),
    inputSchema: inputSchema && typeof inputSchema === "object" ? inputSchema : emptyObjectSchema(),
  };
  return {
    ...normalizedDescriptor,
    timeoutHint: mcpToolTimeoutHintForDescriptor(normalizedDescriptor, defaultIdleTimeoutMs),
  };
}

function mcpToolPolicyForName(
  policies: Record<string, ToolHiveMcpToolPolicy> | undefined,
  toolName: string,
): McpToolPolicySummary | undefined {
  const policy = policies?.[toolName];
  if (!policy) return undefined;
  return {
    visibility: policy.visibility ?? "visible",
    callPolicy: policy.callPolicy ?? "default",
    ...(policy.reason ? { reason: policy.reason } : {}),
    ...(policy.updatedAt ? { updatedAt: policy.updatedAt } : {}),
  };
}

function assertPolicyUpdateInput(input: McpToolPolicyUpdateInput): void {
  const hasVisibility = input.visibility !== undefined;
  const hasCallPolicy = input.callPolicy !== undefined;
  const hasReason = input.reason !== undefined;
  if (input.clear && (hasVisibility || hasCallPolicy || hasReason)) {
    throw new Error("clear cannot be combined with visibility, callPolicy, or reason.");
  }
  if (!input.clear && !hasVisibility && !hasCallPolicy && !hasReason) {
    throw new Error("Provide clear=true, visibility, callPolicy, or reason for an MCP tool policy update.");
  }
  if (input.visibility !== undefined && input.visibility !== "visible" && input.visibility !== "hidden") {
    throw new Error("visibility must be visible or hidden.");
  }
  if (
    input.callPolicy !== undefined &&
    input.callPolicy !== "default" &&
    input.callPolicy !== "blocked" &&
    input.callPolicy !== "approval-required"
  ) {
    throw new Error("callPolicy must be default, blocked, or approval-required.");
  }
}

function policySummaryFromUpdateInput(input: McpToolPolicyUpdateInput): McpToolPolicySummary | undefined {
  if (input.clear) return undefined;
  const visibility = input.visibility;
  const callPolicy = input.callPolicy;
  const reason = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim().slice(0, 1_000) : undefined;
  const isDefaultVisibility = !visibility || visibility === "visible";
  const isDefaultCallPolicy = !callPolicy || callPolicy === "default";
  if (isDefaultVisibility && isDefaultCallPolicy && !reason) return undefined;
  return {
    visibility: visibility ?? "visible",
    callPolicy: callPolicy ?? "default",
    ...(reason ? { reason } : {}),
  };
}

function isVisibleMcpTool(tool: McpToolDescriptor): boolean {
  return tool.policy?.visibility !== "hidden";
}

function selectMcpTool(tools: McpToolDescriptor[], input: McpToolDescribeInput): McpToolDescriptor {
  const requestedToolName = input.toolName.trim();
  const parsedRef = parseMcpToolRef(requestedToolName);
  const refMatches = parsedRef
    ? tools.filter((tool) => tool.name === parsedRef.toolName && mcpToolMatchesServerSelector(tool, parsedRef.serverSelector))
    : [];
  const matches = refMatches.length
    ? refMatches
    : tools.filter((tool) => tool.name === requestedToolName || tool.toolRef === requestedToolName);
  if (matches.length === 0) {
    const scope = [
      input.serverId ? `serverId=${input.serverId}` : undefined,
      input.workloadName ? `workloadName=${input.workloadName}` : undefined,
    ]
      .filter(Boolean)
      .join(", ");
    const candidates = formatMcpToolCandidates(tools);
    throw new Error(
      `No installed Ambient MCP tool named ${requestedToolName} matched${scope ? ` ${scope}` : " the selected server"}.${candidates ? ` Available tools: ${candidates}.` : ""}`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple installed Ambient MCP tools matched ${requestedToolName}; use one exact toolRef as toolName or include exact serverId/workloadName. Candidates: ${formatMcpToolCandidates(matches)}.`,
    );
  }
  return matches[0];
}

function resolveInstalledRecords(
  records: InstalledMcpServerRecord[],
  input: { serverId?: string; workloadName?: string },
): InstalledMcpServerRecord[] {
  const workloadName = normalizedSelector(input.workloadName);
  const serverId = normalizedSelector(input.serverId);
  let selected = records;
  if (workloadName) {
    selected = selected.filter((record) => record.summary.workloadName === workloadName);
    if (!selected.length) throw new Error(`No installed Ambient MCP server has workloadName ${workloadName}.`);
  }
  if (!serverId) return selected;
  const resolved = resolveInstalledRecordsByServerSelector(selected, serverId);
  if (!resolved.length && workloadName) {
    throw new Error(`No installed Ambient MCP server matches serverId ${serverId} within workloadName ${workloadName}.`);
  }
  return resolved;
}

function resolveInstalledRecordsByServerSelector(records: InstalledMcpServerRecord[], selector: string): InstalledMcpServerRecord[] {
  const exactServer = records.filter((record) => record.summary.serverId === selector);
  if (exactServer.length) return exactServer;
  const exactWorkload = records.filter((record) => record.summary.workloadName === selector);
  if (exactWorkload.length) return exactWorkload;
  const alias = selector.toLowerCase();
  const aliasMatches = records.filter((record) => installedServerAliases(record).has(alias));
  if (aliasMatches.length > 1) {
    throw new Error(
      `Ambient MCP server selector ${selector} is ambiguous; use an exact serverId or workloadName. Candidates: ${formatInstalledRecordCandidates(aliasMatches)}.`,
    );
  }
  if (aliasMatches.length === 0) {
    throw new Error(
      `No installed Ambient MCP server matches selector ${selector}. Use ambient_mcp_server_list for exact serverId/workloadName values.`,
    );
  }
  return aliasMatches;
}

function selectInstalledRecord(
  records: InstalledMcpServerRecord[],
  input: { serverId?: string; workloadName?: string },
): InstalledMcpServerRecord {
  if (!input.serverId && !input.workloadName && records.length !== 1) {
    throw new Error("serverId or workloadName is required when more than one Ambient MCP server is installed.");
  }
  if (records.length === 0)
    throw new Error(`No installed Ambient MCP server matches ${input.serverId ?? input.workloadName ?? "request"}.`);
  if (records.length > 1) throw new Error("Multiple installed Ambient MCP servers matched; provide both serverId and workloadName.");
  return records[0];
}

function mcpToolRef(serverId: string, toolName: string): string {
  return `${serverId}/${toolName}`;
}

function parseMcpToolRef(value: string): { serverSelector: string; toolName: string } | undefined {
  const splitAt = value.lastIndexOf("/");
  if (splitAt <= 0 || splitAt === value.length - 1) return undefined;
  const serverSelector = value.slice(0, splitAt).trim();
  const toolName = value.slice(splitAt + 1).trim();
  return serverSelector && toolName ? { serverSelector, toolName } : undefined;
}

function mcpToolMatchesServerSelector(tool: McpToolDescriptor, selector: string): boolean {
  const normalized = selector.trim();
  if (!normalized) return false;
  if (tool.serverId === normalized || tool.workloadName === normalized) return true;
  return installedServerAliasValues({
    serverId: tool.serverId,
    workloadName: tool.workloadName,
  }).has(normalized.toLowerCase());
}

function installedServerAliases(record: InstalledMcpServerRecord): Set<string> {
  return installedServerAliasValues({
    serverId: record.summary.serverId,
    workloadName: record.summary.workloadName,
    registryId: record.summary.registryId,
    packageIdentifier: record.summary.packageIdentifier,
    candidateId: record.summary.candidateId,
    sourceUrl: record.summary.sourceUrl,
  });
}

function installedServerAliasValues(input: {
  serverId: string;
  workloadName: string;
  registryId?: string;
  packageIdentifier?: string;
  candidateId?: string;
  sourceUrl?: string;
}): Set<string> {
  const aliases = new Set<string>();
  addIdentityAliases(aliases, input.serverId);
  addIdentityAliases(aliases, stripAmbientWorkloadPrefix(input.workloadName));
  addIdentityAliases(aliases, input.registryId);
  addIdentityAliases(aliases, input.packageIdentifier);
  addIdentityAliases(aliases, input.candidateId);
  addIdentityAliases(aliases, sourceUrlRepoName(input.sourceUrl));
  return aliases;
}

function addIdentityAliases(aliases: Set<string>, value: string | undefined): void {
  addAlias(aliases, shortIdentitySegment(value));
  for (const token of identityAliasTokens(value)) addAlias(aliases, token);
}

function addAlias(aliases: Set<string>, value: string | undefined): void {
  const normalized = value?.trim().toLowerCase();
  if (normalized) aliases.add(normalized);
}

function identityAliasTokens(value: string | undefined): string[] {
  if (!value) return [];
  const stopWords = new Set([
    "ambient",
    "github",
    "gitlab",
    "server",
    "servers",
    "mcp",
    "standard",
    "import",
    "tool",
    "tools",
    "io",
    "com",
    "org",
    "www",
    "package",
  ]);
  return [
    ...new Set(
      value
        .trim()
        .replace(/\.git$/i, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4 && !stopWords.has(token)),
    ),
  ];
}

function shortIdentitySegment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/\.git$/i, "");
  if (!trimmed) return undefined;
  const parts = trimmed.split(/[/:]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : trimmed;
}

function stripAmbientWorkloadPrefix(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.startsWith("ambient-") ? trimmed.slice("ambient-".length) : undefined;
}

function sourceUrlRepoName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return shortIdentitySegment(parsed.pathname);
  } catch {
    return shortIdentitySegment(value);
  }
}

function normalizedSelector(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function formatInstalledRecordCandidates(records: InstalledMcpServerRecord[]): string {
  return records.map((record) => `${record.summary.serverId} (workload=${record.summary.workloadName})`).join("; ");
}

function formatMcpToolCandidates(tools: McpToolDescriptor[]): string {
  return tools
    .slice(0, 12)
    .map((tool) => `${tool.toolRef} (workload=${tool.workloadName})`)
    .join("; ");
}

function descriptorReviewFromRecord(record: InstalledMcpServerRecord, tools: McpToolDescriptor[]): McpToolDescriptorReview {
  return {
    server: record.summary,
    reviewStatus: record.state?.toolDescriptorReviewStatus ?? "trusted",
    ...(record.state?.toolDescriptorReviewReason ? { reviewReason: record.state.toolDescriptorReviewReason } : {}),
    ...(record.state?.lastKnownToolDescriptorHash ? { descriptorHash: record.state.lastKnownToolDescriptorHash } : {}),
    ...(record.state?.lastToolDiscoveryAt ? { lastDiscoveredAt: record.state.lastToolDiscoveryAt } : {}),
    tools,
  };
}

function normalizeSearchQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function mcpToolSearchScore(tool: McpToolDescriptor, query: string): number {
  const haystack = mcpToolSearchHaystack(tool);
  if (haystack.includes(query)) return 1_000;
  const terms = searchTermsFromQuery(query);
  if (terms.length === 0) return 1;
  if (queryLooksLikePublicPageRetrieval(query, terms) && mcpToolLooksLikePublicPageRetrieval(tool, haystack)) return 750;
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (matchedTerms.length === terms.length) return 500 + matchedTerms.length;
  const identityHaystack = [tool.toolRef, tool.serverId, tool.workloadName, tool.name].join(" ").toLowerCase();
  const identityMatches = terms.filter((term) => identityHaystack.includes(term));
  if (identityMatches.length > 0) return 300 + identityMatches.length * 10 + matchedTerms.length;
  if (terms.length < 4) return 0;
  return matchedTerms.length >= Math.min(3, Math.ceil(terms.length * 0.35)) ? 100 + matchedTerms.length : 0;
}

function compareMcpToolDescriptors(left: McpToolDescriptor, right: McpToolDescriptor): number {
  return left.serverId.localeCompare(right.serverId) || left.name.localeCompare(right.name);
}

function normalizeSearchTerm(term: string): string {
  const trimmed = term.trim().toLowerCase();
  if (trimmed.length < 5) return trimmed;
  const stemmed = trimmed.replace(/(?:ing|ers|er|ed|es|s)$/u, "").replace(/e$/u, "");
  return stemmed.length >= 4 ? stemmed : trimmed;
}

function mcpToolSearchHaystack(tool: McpToolDescriptor): string {
  const schemaText = inputSchemaSearchText(tool.inputSchema);
  return [
    tool.toolRef,
    tool.serverId,
    tool.workloadName,
    tool.name,
    tool.description ?? "",
    schemaText,
    inferredMcpToolSearchKeywords(tool, schemaText),
  ]
    .join(" ")
    .toLowerCase();
}

function searchTermsFromQuery(query: string): string[] {
  return [...query.replace(/https?:\/\/\S+/giu, " url web page ").split(/[^a-z0-9_./:-]+/iu)]
    .map(normalizeSearchTerm)
    .filter((term) => term.length >= 2 && !mcpToolSearchStopWords.has(term));
}

const mcpToolSearchStopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "best",
  "by",
  "for",
  "from",
  "if",
  "in",
  "installed",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "over",
  "please",
  "prefer",
  "should",
  "that",
  "the",
  "this",
  "to",
  "use",
  "using",
  "with",
]);

function queryLooksLikePublicPageRetrieval(query: string, terms: string[]): boolean {
  if (/https?:\/\/\S+/iu.test(query)) return true;
  const termSet = new Set(terms);
  return [
    "url",
    "web",
    "page",
    "website",
    "retrieve",
    "retrieval",
    "fetch",
    "scrape",
    "extract",
    "content",
    "markdown",
    "html",
    "knowledge",
    "research",
  ].some((term) => termSet.has(term));
}

function mcpToolLooksLikePublicPageRetrieval(tool: McpToolDescriptor, haystack: string): boolean {
  const hasUrlInput = /\burls?\b/.test(haystack);
  const hasPageRetrievalLanguage = /\b(fetch\w*|retriev\w*|scrap\w*|crawl\w*|browser|page|website|html|markdown|content)\b/.test(haystack);
  const isScrapling = /(^|[/:_-])scrapling($|[/:_-])/.test(`${tool.serverId} ${tool.workloadName} ${tool.toolRef}`.toLowerCase());
  return (hasUrlInput && hasPageRetrievalLanguage) || isScrapling;
}

function inferredMcpToolSearchKeywords(tool: McpToolDescriptor, schemaText: string): string {
  const identity = `${tool.serverId} ${tool.workloadName} ${tool.toolRef} ${tool.name}`.toLowerCase();
  const keywords: string[] = [];
  if (/\burls?\b/.test(schemaText) || /\b(fetch\w*|retriev\w*|scrap\w*|crawl\w*|html|markdown|content)\b/.test(identity)) {
    keywords.push(
      "url link web page webpage website public https http fetch retrieve retrieval read extract extraction scrape scraping crawl content html markdown text knowledge research source",
    );
  }
  if (identity.includes("scrapling")) {
    keywords.push(
      "scrapling default ambient web research public page retrieval knowledge retrieval browser-backed browsing fetcher crawler scraper installed capability",
    );
  }
  return keywords.join(" ");
}

function inputSchemaSearchText(schema: unknown): string {
  if (!schema || typeof schema !== "object") return "";
  const terms: string[] = [];
  collectInputSchemaSearchTerms(schema, terms, 0);
  return terms.join(" ");
}

function collectInputSchemaSearchTerms(value: unknown, terms: string[], depth: number): void {
  if (terms.length > 500 || depth > 8 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectInputSchemaSearchTerms(item, terms, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (terms.length > 500) return;
    terms.push(key);
    if (typeof child === "string" && child.length <= 120) terms.push(child);
    else collectInputSchemaSearchTerms(child, terms, depth + 1);
  }
}

function emptyObjectSchema(): Record<string, unknown> {
  return { type: "object", properties: {}, additionalProperties: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
