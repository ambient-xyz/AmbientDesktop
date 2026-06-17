import { stat } from "node:fs/promises";
import { materializeTextOutput, materializedTextNotice, type MaterializedTextOutput } from "../tool-runtime/toolOutputArtifacts";
import { McpInstallCatalog, type McpInstalledServerSummary } from "./mcpInstallCatalog";
import { type ToolHiveInstalledServerState, type ToolHiveMcpToolPolicy, type ToolHiveRuntimeService } from "../tool-runtime/toolHiveRuntimeService";
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
  type McpManagedFileExchangeArtifact,
  type McpManagedFileExchangePreparation,
  type McpManagedFileExchangeStagedFile,
  type McpToolCallFileInput,
} from "./mcpManagedFileExchange";

const mcpProtocolVersion = "2024-11-05";
const defaultMcpHttpTimeoutMs = 60_000;
const defaultMcpToolSearchLimit = 8;
const maxMcpToolSearchLimit = 20;
const mcpToolSearchDescriptionPreviewChars = 240;
const mcpToolResultPreviewChars = 12_000;
const publicWebMcpIdleTimeoutMs = 120_000;
const publicWebMcpMaxRunMs = 10 * 60_000;
const heavyAnalysisMcpIdleTimeoutMs = 180_000;
const heavyAnalysisMcpMaxRunMs = 15 * 60_000;
const mutatingMcpIdleTimeoutMs = 120_000;
const mutatingMcpMaxRunMs = 10 * 60_000;
const quickMcpMaxRunMs = 120_000;

export type McpToolBridgeActivitySource =
  | "request-start"
  | "response-headers"
  | "response-body"
  | "sse-connect-start"
  | "sse-connect-headers"
  | "sse-chunk"
  | "sse-event"
  | "sse-response";

export interface McpToolBridgeActivity {
  source: McpToolBridgeActivitySource;
  operation: string;
  endpointOrigin: string;
  method?: string;
  requestId?: number;
  bytes?: number;
}

export type McpToolBridgeActivityHandler = (activity: McpToolBridgeActivity) => void;

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

export interface McpToolSearchInput {
  query?: string;
  serverId?: string;
  workloadName?: string;
  limit?: number;
  refresh?: boolean;
  signal?: AbortSignal;
  onActivity?: McpToolBridgeActivityHandler;
}

export interface McpToolDescribeInput {
  toolName: string;
  serverId?: string;
  workloadName?: string;
  refresh?: boolean;
  signal?: AbortSignal;
  onActivity?: McpToolBridgeActivityHandler;
}

export interface McpToolCallInput extends McpToolDescribeInput {
  arguments?: Record<string, unknown>;
  fileInputs?: McpToolCallFileInput[];
}

export interface McpPreparedToolCall {
  descriptor: McpToolDescriptor;
  arguments: Record<string, unknown>;
  originalArguments: Record<string, unknown>;
  permission: McpPermissionPolicyEvaluation;
  runtimeEnforcement: McpRuntimePermissionEnforcement;
  fileExchange: McpManagedFileExchangePreparation;
}

export interface McpToolDescriptorReviewInput {
  serverId?: string;
  workloadName?: string;
  refresh?: boolean;
  signal?: AbortSignal;
}

export interface McpToolDescriptorReviewAcceptInput {
  serverId?: string;
  workloadName?: string;
  expectedDescriptorHash?: string;
  signal?: AbortSignal;
}

export interface McpToolPolicyUpdateInput extends McpToolDescribeInput {
  visibility?: McpToolPolicySummary["visibility"];
  callPolicy?: McpToolPolicySummary["callPolicy"];
  reason?: string;
  clear?: boolean;
}

export interface McpAggregationReadinessInput {
  refresh?: boolean;
  minServerCount?: number;
  signal?: AbortSignal;
  onActivity?: McpToolBridgeActivityHandler;
}

export interface McpToolDescriptor {
  serverId: string;
  workloadName: string;
  toolRef: string;
  workloadStatus?: string;
  endpoint?: string;
  reviewStatus: "trusted" | "needs-review";
  reviewReason?: string;
  lastDiscoveredAt?: string;
  descriptorHash?: string;
  policy?: McpToolPolicySummary;
  name: string;
  description?: string;
  inputSchema?: unknown;
  timeoutHint?: McpToolTimeoutHint;
}

export interface McpToolTimeoutHint {
  descriptorClass: "mcp";
  idleTimeoutMs: number;
  maxRunMs: number | null;
  source: "default" | "descriptor";
  reason: string;
  matchedSignals: string[];
}

export interface McpToolPolicySummary {
  visibility: "visible" | "hidden";
  callPolicy: "default" | "blocked" | "approval-required";
  reason?: string;
  updatedAt?: string;
}

export interface McpToolDescriptorReview {
  server: McpInstalledServerSummary;
  reviewStatus: "trusted" | "needs-review";
  reviewReason?: string;
  descriptorHash?: string;
  lastDiscoveredAt?: string;
  tools: McpToolDescriptor[];
}

export interface McpToolDescriptorReviewAcceptResult {
  status: "trusted" | "already-trusted";
  review: McpToolDescriptorReview;
}

export interface McpToolPolicyUpdatePreview {
  descriptor: McpToolDescriptor;
  previousPolicy?: McpToolPolicySummary;
  nextPolicy?: McpToolPolicySummary;
  status: "would-update" | "would-clear";
}

export interface McpToolPolicyUpdateResult {
  descriptor: McpToolDescriptor;
  previousPolicy?: McpToolPolicySummary;
  policy?: McpToolPolicySummary;
  status: "updated" | "cleared";
}

export interface McpAggregationReadinessServer {
  serverId: string;
  workloadName: string;
  status?: string;
  endpoint?: string;
  reviewStatus: "trusted" | "needs-review" | "missing";
  profileSha256Verified?: boolean;
  visibleToolCount: number;
  hiddenToolCount: number;
  blockedToolCount: number;
  approvalRequiredToolCount: number;
  callableToolCount: number;
  issues: string[];
}

export interface McpAggregationNamespacePlanItem {
  toolRef: string;
  aggregateName: string;
  serverId: string;
  workloadName: string;
  toolName: string;
  duplicateName: boolean;
  callPolicy: McpToolPolicySummary["callPolicy"];
}

export interface McpAggregationReadinessCheck {
  id: string;
  label: string;
  status: "passed" | "warning" | "blocked";
  detail: string;
}

export interface McpAggregationReadinessReport {
  schemaVersion: "ambient-mcp-aggregation-readiness-v1";
  status: "defer" | "ready-for-experiment" | "blocked";
  recommendedAction: string;
  serverCount: number;
  minServerCount: number;
  visibleToolCount: number;
  callableToolCount: number;
  hiddenToolCount: number;
  blockedToolCount: number;
  approvalRequiredToolCount: number;
  duplicateToolNames: string[];
  namespaceStrategy: "server-prefixed";
  checks: McpAggregationReadinessCheck[];
  servers: McpAggregationReadinessServer[];
  namespacePlan: McpAggregationNamespacePlanItem[];
  blockers: string[];
  warnings: string[];
}

export interface McpToolCallResult {
  descriptor: McpToolDescriptor;
  text: string;
  output: MaterializedTextOutput;
  arguments: Record<string, unknown>;
  originalArguments: Record<string, unknown>;
  stagedFiles: McpManagedFileExchangeStagedFile[];
  managedFileArtifacts: McpManagedFileExchangeArtifact[];
}

export interface McpToolDescriptorDriftEvent {
  serverId: string;
  workloadName: string;
  previousDescriptorHash: string;
  descriptorHash: string;
  reason?: string;
}

interface InstalledMcpServerRecord {
  summary: McpInstalledServerSummary;
  state?: ToolHiveInstalledServerState;
}

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface McpHttpClientOptions {
  fetchImpl: FetchLike;
  timeoutMs: number;
  maxRunMs?: number | null;
  allowRemote?: boolean;
  headers?: Record<string, string>;
  onActivity?: McpToolBridgeActivityHandler;
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
      return visibleTools
        .sort(compareMcpToolDescriptors)
        .slice(0, limit);
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
      throw new Error(`MCP tool ${descriptor.name} is blocked because server ${descriptor.serverId} needs descriptor review: ${descriptor.reviewReason ?? "descriptor drift detected"}`);
    }
    if (!descriptor.endpoint) throw new Error(`MCP tool ${descriptor.name} cannot be called because workload ${descriptor.workloadName} has no ToolHive endpoint.`);
    if (descriptor.policy?.callPolicy === "blocked") {
      throw new Error(`MCP tool ${descriptor.serverId}/${descriptor.name} is blocked by Ambient tool policy${descriptor.policy.reason ? `: ${descriptor.policy.reason}` : "."}`);
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
    if (!descriptor.endpoint) throw new Error(`MCP tool ${descriptor.name} cannot be called because workload ${descriptor.workloadName} has no ToolHive endpoint.`);
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
      throw new Error(await mcpToolCallErrorWithFileExchangeHint(errorMessage(error), prepared.fileExchange));
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
    const freshRecord = selectInstalledRecord(await this.installedRecords({
      serverId: record.summary.serverId,
      workloadName: record.summary.workloadName,
    }), {
      serverId: record.summary.serverId,
      workloadName: record.summary.workloadName,
    });
    const freshTools = normalizeMcpTools(freshRecord.summary, freshRecord.state?.lastKnownToolDescriptors ?? [], freshRecord.state, this.timeoutMs);
    return descriptorReviewFromRecord(freshRecord, freshTools.length ? freshTools : tools);
  }

  async acceptToolDescriptorReview(input: McpToolDescriptorReviewAcceptInput): Promise<McpToolDescriptorReviewAcceptResult> {
    const record = selectInstalledRecord(await this.installedRecords(input), input);
    const trust = await this.options.toolHive.trustInstalledServerToolDescriptors(record.summary.workloadName, input.expectedDescriptorHash);
    const freshRecord = selectInstalledRecord(await this.installedRecords({
      serverId: record.summary.serverId,
      workloadName: record.summary.workloadName,
    }), {
      serverId: record.summary.serverId,
      workloadName: record.summary.workloadName,
    });
    const tools = normalizeMcpTools(freshRecord.summary, trust.state.lastKnownToolDescriptors ?? freshRecord.state?.lastKnownToolDescriptors ?? [], trust.state, this.timeoutMs);
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
      input.clear ? {} : {
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
    const minServerCount = Math.max(2, Math.floor(input.minServerCount ?? 2));
    const records = await this.installedRecords({});
    const blockers: string[] = [];
    const warnings: string[] = [];
    const servers: McpAggregationReadinessServer[] = [];
    const allTools: McpToolDescriptor[] = [];

    for (const record of records) {
      const serverIssues: string[] = [];
      let tools: McpToolDescriptor[] = [];
      try {
        tools = await this.toolsForInstalledServer(record, { refresh: input.refresh, signal: input.signal, onActivity: input.onActivity });
        allTools.push(...tools);
      } catch (error) {
        const message = errorMessage(error);
        serverIssues.push(`tool discovery failed: ${message}`);
        blockers.push(`${record.summary.serverId}: tool discovery failed: ${message}`);
      }
      const reviewStatus = record.state?.toolDescriptorReviewStatus ?? (tools.length ? "trusted" : "missing");
      if (reviewStatus !== "trusted") {
        const issue = reviewStatus === "needs-review"
          ? "descriptor drift requires review before aggregation"
          : "no trusted descriptor snapshot exists";
        serverIssues.push(issue);
        blockers.push(`${record.summary.serverId}: ${issue}`);
      }
      if (!record.summary.endpoint) {
        serverIssues.push("no MCP endpoint is available");
        blockers.push(`${record.summary.serverId}: no MCP endpoint is available`);
      }
      let profileSha256Verified: boolean | undefined;
      try {
        const profile = await this.options.toolHive.readInstalledServerPermissionProfile(record.summary.workloadName);
        profileSha256Verified = profile.sha256Verified;
        if (!profile.sha256Verified) {
          serverIssues.push("installed ToolHive permission profile hash does not match state");
          blockers.push(`${record.summary.serverId}: installed ToolHive permission profile hash does not match state`);
        }
      } catch (error) {
        const message = errorMessage(error);
        serverIssues.push(`permission profile unavailable: ${message}`);
        blockers.push(`${record.summary.serverId}: permission profile unavailable: ${message}`);
      }
      const visibleTools = tools.filter(isVisibleMcpTool);
      const hiddenToolCount = tools.length - visibleTools.length;
      const blockedToolCount = visibleTools.filter((tool) => tool.policy?.callPolicy === "blocked").length;
      const approvalRequiredToolCount = visibleTools.filter((tool) => tool.policy?.callPolicy === "approval-required").length;
      const callableToolCount = visibleTools.length - blockedToolCount;
      if (tools.length === 0 && !serverIssues.length) {
        serverIssues.push("no tools are discoverable");
        blockers.push(`${record.summary.serverId}: no tools are discoverable`);
      } else if (callableToolCount === 0 && tools.length > 0) {
        serverIssues.push("all visible tools are blocked or hidden");
        warnings.push(`${record.summary.serverId}: all visible tools are blocked or hidden`);
      }
      servers.push({
        serverId: record.summary.serverId,
        workloadName: record.summary.workloadName,
        ...(record.summary.workloadStatus ? { status: record.summary.workloadStatus } : {}),
        ...(record.summary.endpoint ? { endpoint: record.summary.endpoint } : {}),
        reviewStatus,
        ...(profileSha256Verified !== undefined ? { profileSha256Verified } : {}),
        visibleToolCount: visibleTools.length,
        hiddenToolCount,
        blockedToolCount,
        approvalRequiredToolCount,
        callableToolCount,
        issues: serverIssues,
      });
    }

    const callableTools = allTools.filter((tool) => isVisibleMcpTool(tool) && tool.policy?.callPolicy !== "blocked");
    const duplicateToolNames = duplicateNames(callableTools.map((tool) => tool.name));
    if (duplicateToolNames.length) {
      warnings.push(`duplicate MCP tool names require server-prefixed aggregate names: ${duplicateToolNames.join(", ")}`);
    }
    if (records.length < minServerCount) {
      warnings.push(`vMCP aggregation is deferred until at least ${minServerCount} installed MCP servers are stable; found ${records.length}.`);
    }
    const namespacePlan = callableTools
      .sort((left, right) => left.toolRef.localeCompare(right.toolRef))
      .map((tool) => ({
        toolRef: tool.toolRef,
        aggregateName: aggregateToolName(tool),
        serverId: tool.serverId,
        workloadName: tool.workloadName,
        toolName: tool.name,
        duplicateName: duplicateToolNames.includes(tool.name),
        callPolicy: tool.policy?.callPolicy ?? "default",
      }));
    const visibleToolCount = allTools.filter(isVisibleMcpTool).length;
    const blockedToolCount = allTools.filter((tool) => isVisibleMcpTool(tool) && tool.policy?.callPolicy === "blocked").length;
    const hiddenToolCount = allTools.length - visibleToolCount;
    const approvalRequiredToolCount = allTools.filter((tool) => isVisibleMcpTool(tool) && tool.policy?.callPolicy === "approval-required").length;
    const status: McpAggregationReadinessReport["status"] = blockers.length
      ? "blocked"
      : records.length < minServerCount
        ? "defer"
        : "ready-for-experiment";
    return {
      schemaVersion: "ambient-mcp-aggregation-readiness-v1",
      status,
      recommendedAction: aggregationRecommendedAction(status, blockers, records.length, minServerCount),
      serverCount: records.length,
      minServerCount,
      visibleToolCount,
      callableToolCount: callableTools.length,
      hiddenToolCount,
      blockedToolCount,
      approvalRequiredToolCount,
      duplicateToolNames,
      namespaceStrategy: "server-prefixed",
      checks: aggregationReadinessChecks({ records, blockers, warnings, duplicateToolNames, namespacePlan, minServerCount }),
      servers,
      namespacePlan,
      blockers,
      warnings,
    };
  }

  private async discoverTools(input: McpToolSearchInput): Promise<McpToolDescriptor[]> {
    const records = await this.installedRecords(input);
    const tools: McpToolDescriptor[] = [];
    const errors: string[] = [];
    for (const record of records) {
      try {
        tools.push(...await this.toolsForInstalledServer(record, input));
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
    const [summaries, state] = await Promise.all([
      this.options.catalog.listInstalledServers(),
      this.options.toolHive.readState(),
    ]);
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
      throw new Error(`ToolHive workload ${record.summary.workloadName} has no endpoint. Start the workload or run ambient_mcp_server_list for status.`);
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
  const paths = readableStagedFiles.slice(0, 5).map((file) => `${file.argumentPath} -> ${file.containerPath}`).join("; ");
  return [
    message,
    `Ambient diagnostic: staged host file input${readableStagedFiles.length === 1 ? "" : "s"} still exist for ${paths}, but the MCP server reported a missing or denied container path. Treat this as a ToolHive managed file exchange visibility issue. Do not retry with arbitrary host paths or unmanaged workspace paths. Repair/reinstall the Ambient-managed MCP server if diagnostics show the exchange is unhealthy; if the tool writes an output file, retry with an explicit output_path/destination argument so Ambient can pre-authorize and surface the generated artifact.`,
  ].join("\n\n");
}

function mcpToolErrorLooksLikeFileVisibilityFailure(message: string): boolean {
  return /\b(?:file not found|no such file|not found|permission denied|access denied|cannot open|not readable)\b/i.test(message);
}

export function mcpToolSearchResultsText(tools: McpToolDescriptor[]): string {
  if (!tools.length) return "No Ambient MCP tools matched. Install and start an Ambient-managed ToolHive MCP server, then search again.";
  return [
    `Found ${tools.length} Ambient MCP tool${tools.length === 1 ? "" : "s"}.`,
    ...tools.map((tool) => {
      const status = [tool.workloadStatus ? `status=${tool.workloadStatus}` : undefined, `review=${tool.reviewStatus}`].filter(Boolean).join(", ");
      const policy = toolPolicyText(tool.policy);
      const description = toolDescriptionPreview(tool.description);
      return `- ${tool.toolRef}: serverId=${tool.serverId}; toolName=${tool.name}; workload=${tool.workloadName}; ${status}${policy ? `; ${policy}` : ""}.${description ? ` descriptionPreview=${JSON.stringify(description)}` : ""}`;
    }),
    "",
    "Search rows intentionally include only description previews. Use ambient_mcp_tool_describe with the exact toolName plus serverId/workloadName from the selected result for the full description and input schema. The displayed toolRef is also accepted as toolName when carrying one copyable identifier is easier.",
  ].join("\n");
}

export function mcpToolDescribeText(tool: McpToolDescriptor): string {
  const timeoutHint = mcpToolTimeoutHintForDescriptor(tool);
  const fileInputHints = mcpToolFileInputHints(tool.inputSchema);
  const outputPathHints = mcpToolOutputPathHints(tool.inputSchema);
  return [
    `${tool.toolRef}: ${tool.description ?? "MCP tool."}`,
    `Tool ref: ${tool.toolRef}`,
    `Tool name: ${tool.name}`,
    `Server id: ${tool.serverId}`,
    `Workload: ${tool.workloadName}`,
    tool.workloadStatus ? `Status: ${tool.workloadStatus}` : undefined,
    tool.endpoint ? `Endpoint: ${tool.endpoint}` : undefined,
    `Descriptor review: ${tool.reviewStatus}`,
    `Timeout hint: idle=${timeoutHint.idleTimeoutMs}ms; maxRun=${formatMcpTimeoutMs(timeoutHint.maxRunMs)}; ${timeoutHint.reason}`,
    tool.reviewReason ? `Review reason: ${tool.reviewReason}` : undefined,
    tool.policy ? `Tool policy: ${toolPolicyText(tool.policy)}` : undefined,
    tool.policy?.reason ? `Policy reason: ${tool.policy.reason}` : undefined,
    tool.lastDiscoveredAt ? `Last discovery: ${tool.lastDiscoveredAt}` : undefined,
    "",
    "Input schema:",
    JSON.stringify(tool.inputSchema ?? emptyObjectSchema(), null, 2),
    fileInputHints.length ? "" : undefined,
    fileInputHints.length ? "Managed file input hints:" : undefined,
    ...fileInputHints,
    outputPathHints.length ? "" : undefined,
    outputPathHints.length ? "Managed output path hints:" : undefined,
    ...outputPathHints,
    "",
    "Call this tool with ambient_mcp_tool_call using this exact toolName plus serverId/workloadName, or use the toolRef as toolName. Put the MCP tool input object under the top-level arguments field, for example: {\"toolName\":\"" + tool.toolRef + "\",\"arguments\":{...}}. Do not use toolInput.",
  ].filter((line) => line !== undefined).join("\n");
}

function mcpToolFileInputHints(inputSchema: unknown): string[] {
  const argumentPaths = mcpToolFileArgumentPaths(inputSchema);
  if (!argumentPaths.length) return [];
  return [
    ...argumentPaths.slice(0, 6).map((argumentPath) =>
      `- ${argumentPath}: if the user provides inline file-like content, call ambient_mcp_tool_call with fileInputs:[{"argumentPath":"${argumentPath}","filename":"input","content":"..."}]; Ambient stages it into the managed ToolHive exchange and rewrites arguments.${argumentPath} to the container path.`,
    ),
    argumentPaths.length > 6 ? `- ... ${argumentPaths.length - 6} more file-like schema fields omitted from hints.` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function mcpToolFileArgumentPaths(inputSchema: unknown, prefix = "", seen = new Set<unknown>()): string[] {
  if (!inputSchema || typeof inputSchema !== "object" || seen.has(inputSchema)) return [];
  seen.add(inputSchema);
  const schema = inputSchema as Record<string, unknown>;
  const paths: string[] = [];
  const properties = schema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (mcpSchemaFieldLooksLikeFileArgument(key, value)) paths.push(path);
      paths.push(...mcpToolFileArgumentPaths(value, path, seen));
    }
  }
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const variants = schema[key];
    if (Array.isArray(variants)) {
      for (const variant of variants) paths.push(...mcpToolFileArgumentPaths(variant, prefix, seen));
    }
  }
  return [...new Set(paths)];
}

function mcpSchemaFieldLooksLikeFileArgument(key: string, schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const record = schema as Record<string, unknown>;
  if (!mcpSchemaAllowsString(record)) return false;
  if (mcpSchemaFieldLooksLikeOutputArgument(key, schema)) return false;
  const haystack = [
    key,
    typeof record.title === "string" ? record.title : "",
    typeof record.description === "string" ? record.description : "",
  ].join(" ");
  return /\b(?:file|file[_\s-]*path|filepath|file[_\s-]*name|filename|path|csv|tsv|xlsx?|jsonl?|yaml|dataset|input[_\s-]*file)\b/i.test(haystack);
}

function mcpToolOutputPathHints(inputSchema: unknown): string[] {
  const argumentPaths = mcpToolOutputArgumentPaths(inputSchema);
  if (!argumentPaths.length) return [];
  return [
    ...argumentPaths.slice(0, 6).map((argumentPath) =>
      `- ${argumentPath}: if the MCP tool writes a file, provide a workspace-relative filename such as "result.html"; Ambient pre-creates a writable managed ToolHive exchange file, rewrites arguments.${argumentPath} to the container path, and surfaces the generated artifact. Prefer this over relying on default sibling output paths.`,
    ),
    argumentPaths.length > 6 ? `- ... ${argumentPaths.length - 6} more output-like schema fields omitted from hints.` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function mcpToolOutputArgumentPaths(inputSchema: unknown, prefix = "", seen = new Set<unknown>()): string[] {
  if (!inputSchema || typeof inputSchema !== "object" || seen.has(inputSchema)) return [];
  seen.add(inputSchema);
  const schema = inputSchema as Record<string, unknown>;
  const paths: string[] = [];
  const properties = schema.properties;
  if (properties && typeof properties === "object" && !Array.isArray(properties)) {
    for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (mcpSchemaFieldLooksLikeOutputArgument(key, value)) paths.push(path);
      paths.push(...mcpToolOutputArgumentPaths(value, path, seen));
    }
  }
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const variants = schema[key];
    if (Array.isArray(variants)) {
      for (const variant of variants) paths.push(...mcpToolOutputArgumentPaths(variant, prefix, seen));
    }
  }
  return [...new Set(paths)];
}

function mcpSchemaFieldLooksLikeOutputArgument(key: string, schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const record = schema as Record<string, unknown>;
  if (!mcpSchemaAllowsString(record)) return false;
  const haystack = [
    key,
    typeof record.title === "string" ? record.title : "",
    typeof record.description === "string" ? record.description : "",
  ].join(" ");
  return /\b(?:output|output[_\s-]*path|out[_\s-]*path|output[_\s-]*file|outfile|destination|dest|save[_\s-]*(?:as|path|file)?|write[_\s-]*(?:to|path|file)?|target[_\s-]*(?:path|file)?)\b/i.test(haystack);
}

function mcpSchemaAllowsString(schema: unknown, seen = new Set<unknown>()): boolean {
  if (!schema || typeof schema !== "object" || seen.has(schema)) return false;
  seen.add(schema);
  const record = schema as Record<string, unknown>;
  const type = record.type;
  if (type === "string" || (Array.isArray(type) && type.includes("string"))) return true;
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    const variants = record[key];
    if (Array.isArray(variants) && variants.some((variant) => mcpSchemaAllowsString(variant, seen))) return true;
  }
  return false;
}

export function mcpToolCallResultText(result: McpToolCallResult): string {
  return [
    `MCP tool ${result.descriptor.serverId}/${result.descriptor.name} completed.`,
    mcpToolCallOutputWarning(result),
    mcpToolManagedFileArtifactsText(result),
    result.text,
  ].filter(Boolean).join("\n\n");
}

function mcpToolManagedFileArtifactsText(result: McpToolCallResult): string | undefined {
  if (!result.managedFileArtifacts?.length) return undefined;
  return [
    "Managed MCP file artifacts:",
    ...result.managedFileArtifacts.map((artifact) => {
      const location = artifact.workspacePath
        ? artifact.workspacePath
        : artifact.copySkippedReason
          ? `${artifact.hostPath} (${artifact.copySkippedReason})`
          : artifact.hostPath;
      return `- ${artifact.filename} (${artifact.bytes} bytes): ${location} (container: ${artifact.containerPath})`;
    }),
  ].join("\n");
}

export function mcpToolArgumentValidationErrorText(tool: Pick<McpToolDescriptor, "toolRef" | "inputSchema">, toolArguments: Record<string, unknown>): string | undefined {
  const validationErrors = validateMcpToolArguments(tool.inputSchema, toolArguments);
  if (!validationErrors.length) return undefined;
  return [
    `MCP tool arguments failed schema validation for ${tool.toolRef}: ${validationErrors.join("; ")}.`,
    mcpToolArgumentRepairHint(tool.inputSchema, toolArguments),
  ].filter(Boolean).join(" ");
}

function mcpToolCallOutputWarning(result: McpToolCallResult): string | undefined {
  if (!mcpToolCallOutputLooksLikeHtmlError(result)) return undefined;
  return "Warning: MCP transport completed, but the tool output looks like an HTML error page. Treat this as an installed-server/tool behavior failure until a non-error smoke result is observed.";
}

export function mcpToolCallOutputLooksLikeHtmlError(result: McpToolCallResult): boolean {
  const text = (result.output.text || result.text || "").slice(0, 16_000);
  return looksLikeHtmlDocument(text) &&
    /\b(?:40[034]|50[0234]|not found|forbidden|unauthorized|access denied|error page|temporarily unavailable)\b/i.test(text);
}

function looksLikeHtmlDocument(text: string): boolean {
  return /<(?:!doctype\s+html|html|head|title|body|meta)\b/i.test(text.slice(0, 4_000));
}

export function mcpToolDescriptorReviewText(review: McpToolDescriptorReview): string {
  return [
    `MCP tool descriptor review for ${review.server.serverId}.`,
    `Workload: ${review.server.workloadName}`,
    `Status: ${review.reviewStatus}`,
    review.reviewReason ? `Reason: ${review.reviewReason}` : undefined,
    review.descriptorHash ? `Descriptor hash: ${review.descriptorHash}` : undefined,
    review.lastDiscoveredAt ? `Last discovery: ${review.lastDiscoveredAt}` : undefined,
    `Tools: ${review.tools.length}`,
    ...review.tools.slice(0, 20).map((tool) => `- ${tool.name}${tool.policy ? ` (${toolPolicyText(tool.policy)})` : ""}${tool.description ? `: ${tool.description}` : ""}`),
    review.tools.length > 20 ? `- ... ${review.tools.length - 20} more` : undefined,
  ].filter((line) => line !== undefined).join("\n");
}

export function mcpToolDescriptorReviewAcceptText(result: McpToolDescriptorReviewAcceptResult): string {
  return [
    result.status === "trusted"
      ? `Trusted current MCP tool descriptors for ${result.review.server.serverId}.`
      : `MCP tool descriptors for ${result.review.server.serverId} were already trusted.`,
    mcpToolDescriptorReviewText(result.review),
  ].join("\n\n");
}

export function mcpToolPolicyUpdatePreviewText(preview: McpToolPolicyUpdatePreview): string {
  return [
    `MCP tool policy update preview for ${preview.descriptor.toolRef}.`,
    `Status: ${preview.status}`,
    `Server id: ${preview.descriptor.serverId}`,
    `Workload: ${preview.descriptor.workloadName}`,
    `Tool name: ${preview.descriptor.name}`,
    preview.descriptor.descriptorHash ? `Descriptor hash: ${preview.descriptor.descriptorHash}` : undefined,
    `Previous policy: ${toolPolicyText(preview.previousPolicy) || "default"}`,
    `Next policy: ${toolPolicyText(preview.nextPolicy) || "default"}`,
    "",
    preview.status === "would-clear"
      ? "This will restore the tool to the default visible/default-call policy."
      : "This will update Ambient's app-global per-tool policy for this installed MCP server.",
    "This does not trust descriptor drift, reinstall servers, stop workloads, or call the downstream MCP tool.",
  ].filter((line) => line !== undefined).join("\n");
}

export function mcpToolPolicyUpdateResultText(result: McpToolPolicyUpdateResult): string {
  return [
    result.status === "cleared"
      ? `Cleared Ambient MCP tool policy for ${result.descriptor.toolRef}.`
      : `Updated Ambient MCP tool policy for ${result.descriptor.toolRef}.`,
    `Previous policy: ${toolPolicyText(result.previousPolicy) || "default"}`,
    `Current policy: ${toolPolicyText(result.policy) || "default"}`,
  ].join("\n");
}

export function mcpAggregationReadinessText(report: McpAggregationReadinessReport): string {
  return [
    "MCP aggregation readiness.",
    `Status: ${report.status}`,
    `Recommended action: ${report.recommendedAction}`,
    `Installed servers: ${report.serverCount} (minimum for aggregation experiment: ${report.minServerCount})`,
    `Tools: visible=${report.visibleToolCount}; callable=${report.callableToolCount}; hidden=${report.hiddenToolCount}; blocked=${report.blockedToolCount}; approvalRequired=${report.approvalRequiredToolCount}`,
    `Namespace strategy: ${report.namespaceStrategy}`,
    report.duplicateToolNames.length ? `Duplicate tool names: ${report.duplicateToolNames.join(", ")}` : "Duplicate tool names: none",
    "",
    "Checks:",
    ...report.checks.map((check) => `- ${check.status}: ${check.label} - ${check.detail}`),
    "",
    "Servers:",
    ...report.servers.map((server) => {
      const issueText = server.issues.length ? ` issues=${server.issues.join("; ")}` : "";
      return `- ${server.serverId}: workload=${server.workloadName}; review=${server.reviewStatus}; profileHash=${server.profileSha256Verified === undefined ? "unknown" : server.profileSha256Verified ? "verified" : "mismatch"}; callableTools=${server.callableToolCount}; hidden=${server.hiddenToolCount}; blocked=${server.blockedToolCount}${issueText}`;
    }),
    "",
    "Namespace preview:",
    ...(report.namespacePlan.length
      ? report.namespacePlan.slice(0, 25).map((item) => `- ${item.aggregateName} -> ${item.toolRef}${item.duplicateName ? " (duplicate source name)" : ""}`)
      : ["- none"]),
    report.namespacePlan.length > 25 ? `- ... ${report.namespacePlan.length - 25} more` : undefined,
    "",
    "Aggregation remains disabled in this build; keep using ambient_mcp_tool_search, ambient_mcp_tool_describe, and ambient_mcp_tool_call as the stable compact bridge.",
  ].filter((line) => line !== undefined).join("\n");
}

export function validateMcpToolArguments(schema: unknown, value: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.anyOf)) {
    return record.anyOf.some((candidate) => validateMcpToolArguments(candidate, value, path).length === 0)
      ? []
      : [`${path} did not match any allowed schema`];
  }
  if (Array.isArray(record.oneOf)) {
    const matches = record.oneOf.filter((candidate) => validateMcpToolArguments(candidate, value, path).length === 0).length;
    return matches === 1 ? [] : [`${path} must match exactly one allowed schema`];
  }
  if (Array.isArray(record.enum) && !record.enum.includes(value)) return [`${path} must be one of ${record.enum.map(String).join(", ")}`];
  const type = record.type;
  if (Array.isArray(type) && !type.some((candidate) => typeof candidate === "string" && !validateType(candidate, value, path))) {
    return [`${path} must match one of types ${type.filter((entry) => typeof entry === "string").join(", ")}`];
  }
  if (typeof type === "string") {
    const typeError = validateType(type, value, path);
    if (typeError) return [typeError];
  }
  if (record.type === "object" || (record.properties && value && typeof value === "object" && !Array.isArray(value))) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
    const objectValue = value as Record<string, unknown>;
    const properties = (record.properties && typeof record.properties === "object" ? record.properties : {}) as Record<string, unknown>;
    const errors: string[] = [];
    for (const required of Array.isArray(record.required) ? record.required : []) {
      if (typeof required === "string" && objectValue[required] === undefined) errors.push(`${path}.${required} is required`);
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (objectValue[key] !== undefined) errors.push(...validateMcpToolArguments(childSchema, objectValue[key], `${path}.${key}`));
    }
    if (record.additionalProperties === false) {
      for (const key of Object.keys(objectValue)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${path}.${key} is not allowed`);
      }
    }
    return errors;
  }
  if (record.type === "array" && Array.isArray(value) && record.items) {
    return value.flatMap((item, index) => validateMcpToolArguments(record.items, item, `${path}[${index}]`));
  }
  return [];
}

function mcpToolArgumentRepairHint(schema: unknown, value: Record<string, unknown>): string | undefined {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return undefined;
  const record = schema as Record<string, unknown>;
  const properties = (record.properties && typeof record.properties === "object" ? record.properties : {}) as Record<string, unknown>;
  const propertyNames = Object.keys(properties);
  const required = (Array.isArray(record.required) ? record.required.filter((entry): entry is string => typeof entry === "string") : []);
  if (!propertyNames.length && !required.length) return undefined;
  const supplied = Object.keys(value);
  const missing = required.filter((field) => value[field] === undefined);
  const unexpected = supplied.filter((field) => !Object.prototype.hasOwnProperty.call(properties, field));
  const hints: string[] = [];
  if (required.length) hints.push(`expected top-level required field${required.length === 1 ? "" : "s"}: ${required.join(", ")}`);
  if (propertyNames.length) hints.push(`allowed top-level field${propertyNames.length === 1 ? "" : "s"}: ${propertyNames.join(", ")}`);
  if (unexpected.length) hints.push(`unexpected top-level field${unexpected.length === 1 ? "" : "s"}: ${unexpected.join(", ")}`);
  for (const field of unexpected) {
    const nested = value[field];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    const nestedRecord = nested as Record<string, unknown>;
    const nestedMatches = [...new Set([...required, ...missing])].filter((candidate) => nestedRecord[candidate] !== undefined);
    if (nestedMatches.length) {
      hints.push(`move ${nestedMatches.join(", ")} out of ${field} and pass them directly under arguments`);
      break;
    }
  }
  return hints.length ? `Repair hint: ${hints.join("; ")}.` : undefined;
}

function toolDescriptionPreview(description: string | undefined): string | undefined {
  const normalized = description?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= mcpToolSearchDescriptionPreviewChars
    ? normalized
    : `${normalized.slice(0, mcpToolSearchDescriptionPreviewChars - 1)}…`;
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

export function mcpToolTimeoutHintForDescriptor(
  descriptor: Pick<McpToolDescriptor, "serverId" | "name" | "description" | "inputSchema" | "timeoutHint">,
  defaultIdleTimeoutMs = defaultMcpHttpTimeoutMs,
): McpToolTimeoutHint {
  if (descriptor.timeoutHint) return descriptor.timeoutHint;
  const idleDefault = Math.max(1, Math.floor(defaultIdleTimeoutMs));
  const text = mcpToolTimeoutHaystack(descriptor);
  const matchedSignals: string[] = [];
  const matches = (signal: string, pattern: RegExp): boolean => {
    if (!pattern.test(text)) return false;
    matchedSignals.push(signal);
    return true;
  };
  if (matches("heavy-analysis", /\b(?:ghidra|decompile|disassemble|xref|binary|reverse|analysis|analyze|index|list[_ -]?functions?|function[_ -]?graph)\b/i)) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: heavyAnalysisMcpIdleTimeoutMs,
      maxRunMs: heavyAnalysisMcpMaxRunMs,
      source: "descriptor",
      reason: "Descriptor looks like a local analysis or reverse-engineering tool, so Ambient allows longer MCP idle gaps while keeping a hard cap.",
      matchedSignals,
    };
  }
  if (matches("public-web", /\b(?:scrapling|scrape|scraping|fetch|crawl|browser|web|url|urls|html|page|pages|search|extract|render)\b/i)) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: publicWebMcpIdleTimeoutMs,
      maxRunMs: publicWebMcpMaxRunMs,
      source: "descriptor",
      reason: "Descriptor looks like public web retrieval or extraction, so Ambient allows slower page fetches while keeping a hard cap.",
      matchedSignals,
    };
  }
  if (matches("mutating-or-generation", /\b(?:write|create|update|delete|remove|upload|download|generate|compile|build|install|execute|run)\b/i)) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: mutatingMcpIdleTimeoutMs,
      maxRunMs: mutatingMcpMaxRunMs,
      source: "descriptor",
      reason: "Descriptor looks mutating, generative, or execution-heavy, so Ambient allows a longer MCP idle window with a hard cap.",
      matchedSignals,
    };
  }
  if (matches("quick-read", /\b(?:list|status|ping|health|version|whoami|schema|capabilities)\b/i) && mcpToolRequiredPropertyCount(descriptor.inputSchema) === 0) {
    return {
      descriptorClass: "mcp",
      idleTimeoutMs: idleDefault,
      maxRunMs: quickMcpMaxRunMs,
      source: "descriptor",
      reason: "Descriptor looks like a quick read-only metadata probe, so Ambient keeps the default MCP idle window and adds a short hard cap.",
      matchedSignals,
    };
  }
  return {
    descriptorClass: "mcp",
    idleTimeoutMs: idleDefault,
    maxRunMs: null,
    source: "default",
    reason: "No per-tool timeout signal matched; Ambient uses the default MCP idle timeout without a hard cap.",
    matchedSignals,
  };
}

function mcpToolTimeoutHaystack(
  descriptor: Pick<McpToolDescriptor, "serverId" | "name" | "description" | "inputSchema">,
): string {
  return [
    descriptor.serverId,
    descriptor.name,
    descriptor.description,
    ...mcpToolSchemaTerms(descriptor.inputSchema),
  ].filter(Boolean).join(" ").toLowerCase();
}

function mcpToolSchemaTerms(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const record = schema as Record<string, unknown>;
  const terms: string[] = [];
  if (record.title && typeof record.title === "string") terms.push(record.title);
  if (record.description && typeof record.description === "string") terms.push(record.description);
  if (record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
    for (const [key, value] of Object.entries(record.properties as Record<string, unknown>)) {
      terms.push(key);
      terms.push(...mcpToolSchemaTerms(value));
    }
  }
  if (record.items) terms.push(...mcpToolSchemaTerms(record.items));
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    if (Array.isArray(record[key])) {
      for (const child of record[key]) terms.push(...mcpToolSchemaTerms(child));
    }
  }
  return terms;
}

function mcpToolRequiredPropertyCount(schema: unknown): number {
  if (!schema || typeof schema !== "object") return 0;
  const required = (schema as Record<string, unknown>).required;
  return Array.isArray(required) ? required.filter((value) => typeof value === "string").length : 0;
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
  if (input.callPolicy !== undefined && input.callPolicy !== "default" && input.callPolicy !== "blocked" && input.callPolicy !== "approval-required") {
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

function aggregationRecommendedAction(
  status: McpAggregationReadinessReport["status"],
  blockers: string[],
  serverCount: number,
  minServerCount: number,
): string {
  if (status === "ready-for-experiment") {
    return "The compact Ambient MCP bridge is stable enough for a bounded vMCP aggregation experiment. Keep aggregation disabled by default and use server-prefixed names.";
  }
  if (status === "blocked") {
    return `Do not prototype vMCP aggregation yet. Resolve blocker${blockers.length === 1 ? "" : "s"}: ${blockers.slice(0, 3).join("; ")}${blockers.length > 3 ? "; ..." : ""}`;
  }
  return `Defer vMCP aggregation until at least ${minServerCount} installed MCP servers are stable; currently ${serverCount}. Keep using the compact search/describe/call bridge.`;
}

function aggregationReadinessChecks(input: {
  records: InstalledMcpServerRecord[];
  blockers: string[];
  warnings: string[];
  duplicateToolNames: string[];
  namespacePlan: McpAggregationNamespacePlanItem[];
  minServerCount: number;
}): McpAggregationReadinessCheck[] {
  return [
    {
      id: "installed-server-count",
      label: "Multiple stable installed servers",
      status: input.records.length >= input.minServerCount ? "passed" : "warning",
      detail: `${input.records.length} installed server${input.records.length === 1 ? "" : "s"} found; ${input.minServerCount} required before aggregation is useful.`,
    },
    {
      id: "descriptor-trust",
      label: "Descriptor snapshots trusted",
      status: input.blockers.some((blocker) => /descriptor|tool discovery|no tools/.test(blocker)) ? "blocked" : "passed",
      detail: input.blockers.filter((blocker) => /descriptor|tool discovery|no tools/.test(blocker)).join("; ") || "All discoverable tool snapshots are trusted.",
    },
    {
      id: "runtime-boundary",
      label: "Runtime permission profiles verified",
      status: input.blockers.some((blocker) => /permission profile|MCP endpoint/.test(blocker)) ? "blocked" : "passed",
      detail: input.blockers.filter((blocker) => /permission profile|MCP endpoint/.test(blocker)).join("; ") || "Installed permission profile hashes and endpoints are available.",
    },
    {
      id: "namespace-plan",
      label: "Aggregate namespace plan",
      status: input.namespacePlan.length ? input.duplicateToolNames.length ? "warning" : "passed" : "blocked",
      detail: input.namespacePlan.length
        ? input.duplicateToolNames.length
          ? `Server-prefixed names required for duplicates: ${input.duplicateToolNames.join(", ")}.`
          : "Server-prefixed namespace can map every callable visible tool."
        : "No callable visible MCP tools are available for aggregation.",
    },
    {
      id: "stable-bridge-first",
      label: "Compact bridge remains primary",
      status: "passed",
      detail: "Aggregation status is read-only and does not register every MCP tool as a Pi tool.",
    },
  ];
}

function duplicateNames(names: string[]): string[] {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name)
    .sort((left, right) => left.localeCompare(right));
}

function aggregateToolName(tool: McpToolDescriptor): string {
  return `${aggregateNameSegment(tool.serverId)}__${aggregateNameSegment(tool.name)}`;
}

function aggregateNameSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "mcp";
}

function isVisibleMcpTool(tool: McpToolDescriptor): boolean {
  return tool.policy?.visibility !== "hidden";
}

function toolPolicyText(policy: McpToolPolicySummary | undefined): string {
  if (!policy) return "";
  const parts = [
    policy.visibility !== "visible" ? `visibility=${policy.visibility}` : undefined,
    policy.callPolicy !== "default" ? `callPolicy=${policy.callPolicy}` : undefined,
    policy.reason ? `reason=${policy.reason}` : undefined,
  ].filter(Boolean);
  return parts.length ? `policy ${parts.join(", ")}` : "";
}

function formatMcpTimeoutMs(value: number | null): string {
  return value === null ? "none" : `${value}ms`;
}

function selectMcpTool(tools: McpToolDescriptor[], input: McpToolDescribeInput): McpToolDescriptor {
  const requestedToolName = input.toolName.trim();
  const parsedRef = parseMcpToolRef(requestedToolName);
  const refMatches = parsedRef
    ? tools.filter((tool) => tool.name === parsedRef.toolName && mcpToolMatchesServerSelector(tool, parsedRef.serverSelector))
    : [];
  const matches = refMatches.length ? refMatches : tools.filter((tool) => tool.name === requestedToolName || tool.toolRef === requestedToolName);
  if (matches.length === 0) {
    const scope = [input.serverId ? `serverId=${input.serverId}` : undefined, input.workloadName ? `workloadName=${input.workloadName}` : undefined].filter(Boolean).join(", ");
    const candidates = formatMcpToolCandidates(tools);
    throw new Error(`No installed Ambient MCP tool named ${requestedToolName} matched${scope ? ` ${scope}` : " the selected server"}.${candidates ? ` Available tools: ${candidates}.` : ""}`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple installed Ambient MCP tools matched ${requestedToolName}; use one exact toolRef as toolName or include exact serverId/workloadName. Candidates: ${formatMcpToolCandidates(matches)}.`);
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
    throw new Error(`Ambient MCP server selector ${selector} is ambiguous; use an exact serverId or workloadName. Candidates: ${formatInstalledRecordCandidates(aliasMatches)}.`);
  }
  if (aliasMatches.length === 0) {
    throw new Error(`No installed Ambient MCP server matches selector ${selector}. Use ambient_mcp_server_list for exact serverId/workloadName values.`);
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
  if (records.length === 0) throw new Error(`No installed Ambient MCP server matches ${input.serverId ?? input.workloadName ?? "request"}.`);
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
  const stopWords = new Set(["ambient", "github", "gitlab", "server", "servers", "mcp", "standard", "import", "tool", "tools", "io", "com", "org", "www", "package"]);
  return [...new Set(value
    .trim()
    .replace(/\.git$/i, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !stopWords.has(token)))];
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
  return records
    .map((record) => `${record.summary.serverId} (workload=${record.summary.workloadName})`)
    .join("; ");
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

export interface McpHttpClient {
  listTools(signal?: AbortSignal): Promise<unknown[]>;
  callTool(name: string, toolArguments: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
}

export function createMcpHttpClient(endpoint: string, options: McpHttpClientOptions): McpHttpClient {
  const parsed = new URL(endpoint);
  return parsed.pathname.replace(/\/+$/, "").endsWith("/sse")
    ? new SseMcpClient(endpoint, options)
    : new StreamableHttpMcpClient(endpoint, options);
}

class StreamableHttpMcpClient implements McpHttpClient {
  private nextId = 1;
  private initialized = false;
  private sessionId: string | undefined;

  constructor(
    private readonly endpoint: string,
    private readonly options: McpHttpClientOptions,
  ) {
    if (!options.allowRemote) assertLoopbackMcpEndpoint(endpoint);
  }

  async listTools(signal?: AbortSignal): Promise<unknown[]> {
    await this.initialize(signal);
    const result = await this.request("tools/list", {}, signal);
    if (!isRecord(result) || !Array.isArray(result.tools)) return [];
    return result.tools;
  }

  async callTool(name: string, toolArguments: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    await this.initialize(signal);
    return this.request("tools/call", { name, arguments: toolArguments }, signal);
  }

  private async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return;
    await this.request("initialize", {
      protocolVersion: mcpProtocolVersion,
      capabilities: {},
      clientInfo: { name: "Ambient Desktop", version: "0.1.0" },
    }, signal);
    await this.notify("notifications/initialized", {}, signal);
    this.initialized = true;
  }

  private async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    const envelope = await this.post({ jsonrpc: "2.0", id, method, params }, signal);
    const response = jsonRpcEnvelopeForId(envelope, id);
    if (!response) throw new Error(`MCP endpoint did not return a JSON-RPC response for ${method}.`);
    if ("error" in response) throw new Error(`MCP ${method} failed: ${JSON.stringify(response.error)}`);
    return response.result;
  }

  private async notify(method: string, params: unknown, signal?: AbortSignal): Promise<void> {
    await this.post({ jsonrpc: "2.0", method, params }, signal);
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const operation = jsonRpcMethodName(body) ?? "notification";
    const watchdog = createMcpAbortableIdleWatchdog({
      endpoint: this.endpoint,
      operation: `streamable-http ${operation}`,
      timeoutMs: this.options.timeoutMs,
      maxRunMs: this.options.maxRunMs,
      controller,
      onActivity: this.options.onActivity,
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const headers: Record<string, string> = {
        ...(this.options.headers ?? {}),
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      };
      if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
      const response = await this.options.fetchImpl(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      watchdog.mark("response-headers");
      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) this.sessionId = sessionId;
      if (!response.ok) throw new Error(`MCP endpoint ${new URL(this.endpoint).origin} returned HTTP ${response.status}.`);
      const text = await readResponseTextWithActivity(response, (bytes) => watchdog.mark("response-body", { bytes }));
      if (!text.trim()) return undefined;
      return parseMcpHttpPayload(text, response.headers.get("content-type") ?? "");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && watchdog.timedOut()) throw new Error(watchdog.timeoutMessage());
      if (error instanceof Error && error.name === "AbortError") throw new Error(`MCP endpoint ${new URL(this.endpoint).origin} request was aborted.`);
      throw error;
    } finally {
      watchdog.stop();
      signal?.removeEventListener("abort", onAbort);
    }
  }
}

class SseMcpClient implements McpHttpClient {
  private nextId = 1;
  private initialized = false;
  private endpointUrl: URL | undefined;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private readLoop: Promise<void> | undefined;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: unknown) => void }>();
  private endpointReady: Promise<URL>;
  private resolveEndpoint!: (value: URL) => void;
  private rejectEndpoint!: (error: unknown) => void;
  private readonly activityListeners = new Set<(activity: McpToolBridgeActivity) => void>();

  constructor(
    private readonly endpoint: string,
    private readonly options: McpHttpClientOptions,
  ) {
    if (!options.allowRemote) assertLoopbackMcpEndpoint(endpoint);
    this.endpointReady = new Promise<URL>((resolve, reject) => {
      this.resolveEndpoint = resolve;
      this.rejectEndpoint = reject;
    });
  }

  async listTools(signal?: AbortSignal): Promise<unknown[]> {
    try {
      await this.initialize(signal);
      const result = await this.request("tools/list", {}, signal);
      if (!isRecord(result) || !Array.isArray(result.tools)) return [];
      return result.tools;
    } finally {
      await this.close();
    }
  }

  async callTool(name: string, toolArguments: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    try {
      await this.initialize(signal);
      return await this.request("tools/call", { name, arguments: toolArguments }, signal);
    } finally {
      await this.close();
    }
  }

  private async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return;
    await this.connect(signal);
    await this.request("initialize", {
      protocolVersion: mcpProtocolVersion,
      capabilities: {},
      clientInfo: { name: "Ambient Desktop", version: "0.1.0" },
    }, signal);
    await this.notify("notifications/initialized", {}, signal);
    this.initialized = true;
  }

  private async connect(signal?: AbortSignal): Promise<void> {
    if (this.readLoop) return;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    const watchdog = createMcpAbortableIdleWatchdog({
      endpoint: this.endpoint,
      operation: "sse connect",
      timeoutMs: this.options.timeoutMs,
      maxRunMs: this.options.maxRunMs,
      controller,
      onActivity: (activity) => this.emitActivity(activity),
      initialSource: "sse-connect-start",
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.options.fetchImpl(this.endpoint, {
        method: "GET",
        headers: { ...(this.options.headers ?? {}), accept: "text/event-stream" },
        signal: controller.signal,
      });
      watchdog.mark("sse-connect-headers");
      if (!response.ok) throw new Error(`MCP SSE endpoint ${new URL(this.endpoint).origin} returned HTTP ${response.status}.`);
      if (!response.body) throw new Error("MCP SSE endpoint did not provide a response body.");
      this.reader = response.body.getReader();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError" && watchdog.timedOut()) throw new Error(watchdog.timeoutMessage());
      if (error instanceof Error && error.name === "AbortError") throw new Error(`MCP SSE endpoint ${new URL(this.endpoint).origin} request was aborted.`);
      throw error;
    } finally {
      watchdog.stop();
      signal?.removeEventListener("abort", onAbort);
    }
    this.readLoop = this.readSseLoop().catch((error) => {
      this.rejectEndpoint(error);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    this.endpointUrl = await withMcpActivityTimeout(this.endpointReady, {
      endpoint: this.endpoint,
      operation: "sse endpoint discovery",
      timeoutMs: this.options.timeoutMs,
      maxRunMs: this.options.maxRunMs,
      registerActivityListener: (listener) => this.registerActivityListener(listener),
    });
  }

  private async request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    const id = this.nextId++;
    const responsePromise = this.waitForResponse(id);
    try {
      await this.post({ jsonrpc: "2.0", id, method, params }, signal);
    } catch (error) {
      this.pending.get(id)?.reject(error);
      this.pending.delete(id);
      await responsePromise.catch(() => undefined);
      throw error;
    }
    const envelope = await responsePromise;
    const response = jsonRpcEnvelopeForId(envelope, id);
    if (!response) throw new Error(`MCP SSE endpoint did not return a JSON-RPC response for ${method}.`);
    if ("error" in response) throw new Error(`MCP ${method} failed: ${JSON.stringify(response.error)}`);
    return response.result;
  }

  private async notify(method: string, params: unknown, signal?: AbortSignal): Promise<void> {
    await this.post({ jsonrpc: "2.0", method, params }, signal);
  }

  private async post(body: unknown, signal?: AbortSignal): Promise<void> {
    if (!this.endpointUrl) throw new Error("MCP SSE message endpoint is not ready.");
    const response = await this.options.fetchImpl(this.endpointUrl, {
      method: "POST",
      headers: { ...(this.options.headers ?? {}), "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw new Error(`MCP SSE message endpoint ${this.endpointUrl.origin} returned HTTP ${response.status}.`);
    void response.body?.cancel().catch(() => undefined);
  }

  private async waitForResponse(id: number): Promise<unknown> {
    const pending = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    try {
      return await withMcpActivityTimeout(pending, {
        endpoint: this.endpoint,
        operation: `sse response ${id}`,
        timeoutMs: this.options.timeoutMs,
        maxRunMs: this.options.maxRunMs,
        method: `response-${id}`,
        requestId: id,
        registerActivityListener: (listener) => this.registerActivityListener(listener),
      });
    } finally {
      this.pending.delete(id);
    }
  }

  private async readSseLoop(): Promise<void> {
    if (!this.reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let dataLines: string[] = [];
    while (true) {
      const { value, done } = await this.reader.read();
      if (done) break;
      this.emitActivity({ ...mcpActivityBase(this.endpoint, "sse stream"), source: "sse-chunk", bytes: value.byteLength });
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = /\r?\n/.exec(buffer))) {
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (!line) {
          this.dispatchSseEvent(eventName, dataLines.join("\n"));
          eventName = "message";
          dataLines = [];
        } else if (line.startsWith("event:")) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }
    }
    if (dataLines.length) this.dispatchSseEvent(eventName, dataLines.join("\n"));
  }

  private dispatchSseEvent(eventName: string, data: string): void {
    if (!data.trim()) return;
    this.emitActivity({ ...mcpActivityBase(this.endpoint, `sse event ${eventName}`), source: "sse-event" });
    if (eventName === "endpoint") {
      try {
        const endpointUrl = new URL(data.trim(), this.endpoint);
        if (!this.options.allowRemote) assertSameLoopbackOrigin(this.endpoint, endpointUrl.toString());
        this.resolveEndpoint(endpointUrl);
      } catch (error) {
        this.rejectEndpoint(error);
      }
      return;
    }
    if (data.trim() === "[DONE]") return;
    let parsed: unknown;
    try {
      parsed = parseJson(data);
    } catch {
      return;
    }
    const envelopes = Array.isArray(parsed) ? parsed : [parsed];
    for (const envelope of envelopes) {
      if (!isRecord(envelope) || typeof envelope.id !== "number") continue;
      const pending = this.pending.get(envelope.id);
      if (pending) {
        this.emitActivity({
          ...mcpActivityBase(this.endpoint, `sse response ${envelope.id}`),
          source: "sse-response",
          requestId: envelope.id,
        });
        pending.resolve(envelope);
      }
    }
  }

  private registerActivityListener(listener: (activity: McpToolBridgeActivity) => void): () => void {
    this.activityListeners.add(listener);
    return () => this.activityListeners.delete(listener);
  }

  private emitActivity(activity: McpToolBridgeActivity): void {
    this.options.onActivity?.(activity);
    for (const listener of this.activityListeners) listener(activity);
  }

  private async close(): Promise<void> {
    for (const pending of this.pending.values()) pending.reject(new Error("MCP SSE client closed."));
    this.pending.clear();
    await this.reader?.cancel().catch(() => undefined);
    await this.readLoop?.catch(() => undefined);
  }
}

function parseMcpHttpPayload(text: string, contentType: string): unknown {
  if (contentType.toLowerCase().includes("text/event-stream")) {
    const messages = sseDataMessages(text).map(parseJson);
    return messages.length === 1 ? messages[0] : messages;
  }
  return parseJson(text);
}

function sseDataMessages(text: string): string[] {
  const messages: string[] = [];
  let data: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      if (data.length) {
        const message = data.join("\n").trim();
        if (message && message !== "[DONE]") messages.push(message);
        data = [];
      }
      continue;
    }
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length) {
    const message = data.join("\n").trim();
    if (message && message !== "[DONE]") messages.push(message);
  }
  return messages;
}

function jsonRpcEnvelopeForId(envelope: unknown, id: number): Record<string, unknown> | undefined {
  if (Array.isArray(envelope)) return envelope.find((entry) => isRecord(entry) && entry.id === id) as Record<string, unknown> | undefined;
  return isRecord(envelope) && envelope.id === id ? envelope : undefined;
}

export function textFromMcpToolCallResult(result: unknown): string {
  if (!result || typeof result !== "object") return result === undefined ? "" : String(result);
  const record = result as Record<string, unknown>;
  const contentText = textFromMcpContent(record.content);
  const structuredText =
    "structuredContent" in record && record.structuredContent !== undefined
      ? `\n\nStructured content:\n${JSON.stringify(record.structuredContent, null, 2)}`
      : "";
  return `${contentText}${structuredText}`.trim() || "MCP tool completed without text.";
}

function textFromMcpContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content === undefined ? "" : JSON.stringify(content, null, 2);
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return String(item);
      const record = item as Record<string, unknown>;
      if (record.type === "text") return typeof record.text === "string" ? record.text : "";
      if (record.type === "image") return `[image: ${typeof record.mimeType === "string" ? record.mimeType : "image"}]`;
      if (typeof record.uri === "string") return `[resource: ${record.uri}]`;
      return JSON.stringify(record);
    })
    .filter(Boolean)
    .join("\n");
}

export function isMcpToolError(result: unknown): boolean {
  return Boolean(result && typeof result === "object" && (result as { isError?: unknown }).isError);
}

function validateType(type: string, value: unknown, path: string): string | undefined {
  if (type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) return `${path} must be an object`;
  if (type === "array" && !Array.isArray(value)) return `${path} must be an array`;
  if (type === "string" && typeof value !== "string") return `${path} must be a string`;
  if ((type === "number" || type === "integer") && (typeof value !== "number" || !Number.isFinite(value))) return `${path} must be a number`;
  if (type === "integer" && typeof value === "number" && !Number.isInteger(value)) return `${path} must be an integer`;
  if (type === "boolean" && typeof value !== "boolean") return `${path} must be a boolean`;
  if (type === "null" && value !== null) return `${path} must be null`;
  return undefined;
}

function assertLoopbackMcpEndpoint(endpoint: string): void {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("ToolHive MCP endpoints must use HTTP(S).");
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) {
    throw new Error(`Refusing to call non-loopback ToolHive MCP endpoint ${parsed.origin}.`);
  }
}

function assertSameLoopbackOrigin(baseEndpoint: string, messageEndpoint: string): void {
  const base = new URL(baseEndpoint);
  const message = new URL(messageEndpoint);
  assertLoopbackMcpEndpoint(message.toString());
  if (base.origin !== message.origin) {
    throw new Error(`Refusing MCP SSE message endpoint on different origin ${message.origin}.`);
  }
}

async function readResponseTextWithActivity(response: Response, markBodyActivity: (bytes: number) => void): Promise<string> {
  if (!response.body) return response.text();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      markBodyActivity(value.byteLength);
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

function jsonRpcMethodName(body: unknown): string | undefined {
  return isRecord(body) && typeof body.method === "string" ? body.method : undefined;
}

function mcpActivityBase(endpoint: string, operation: string): Omit<McpToolBridgeActivity, "source"> {
  return {
    operation,
    endpointOrigin: new URL(endpoint).origin,
  };
}

function createMcpAbortableIdleWatchdog(input: {
  endpoint: string;
  operation: string;
  timeoutMs: number;
  maxRunMs?: number | null;
  controller: AbortController;
  onActivity?: McpToolBridgeActivityHandler;
  initialSource?: McpToolBridgeActivitySource;
}): {
  mark: (source: McpToolBridgeActivitySource, details?: Partial<Pick<McpToolBridgeActivity, "bytes" | "method" | "requestId">>) => void;
  stop: () => void;
  timedOut: () => boolean;
  timeoutMessage: () => string;
} {
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let maxRunTimer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  let timeoutCause: "idle" | "max-run" | undefined;
  let lastActivity = input.initialSource ?? "request-start";
  const schedule = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      timeoutCause = "idle";
      input.controller.abort();
    }, input.timeoutMs);
  };
  const maxRunMs = positiveTimeoutMs(input.maxRunMs);
  if (maxRunMs !== undefined) {
    maxRunTimer = setTimeout(() => {
      timedOut = true;
      timeoutCause = "max-run";
      input.controller.abort();
    }, maxRunMs);
  }
  const mark = (source: McpToolBridgeActivitySource, details: Partial<Pick<McpToolBridgeActivity, "bytes" | "method" | "requestId">> = {}) => {
    lastActivity = source;
    input.onActivity?.({
      ...mcpActivityBase(input.endpoint, input.operation),
      source,
      ...details,
    });
    schedule();
  };
  mark(input.initialSource ?? "request-start");
  return {
    mark,
    stop: () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (maxRunTimer) clearTimeout(maxRunTimer);
      idleTimer = undefined;
      maxRunTimer = undefined;
    },
    timedOut: () => timedOut,
    timeoutMessage: () => {
      const origin = new URL(input.endpoint).origin;
      if (timeoutCause === "max-run" && maxRunMs !== undefined) {
        return `MCP endpoint ${origin} exceeded ${maxRunMs} ms max run for ${input.operation} (last activity: ${lastActivity}).`;
      }
      return `MCP endpoint ${origin} stalled after ${input.timeoutMs} ms without ${input.operation} activity (last activity: ${lastActivity}).`;
    },
  };
}

function withMcpActivityTimeout<T>(promise: Promise<T>, input: {
  endpoint: string;
  operation: string;
  timeoutMs: number;
  maxRunMs?: number | null;
  method?: string;
  requestId?: number;
  registerActivityListener?: (listener: (activity: McpToolBridgeActivity) => void) => () => void;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let maxRunTimer: ReturnType<typeof setTimeout> | undefined;
    let lastActivity: McpToolBridgeActivitySource = "request-start";
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (maxRunTimer) clearTimeout(maxRunTimer);
      idleTimer = undefined;
      maxRunTimer = undefined;
      unsubscribe?.();
      unsubscribe = undefined;
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const reset = (activity?: McpToolBridgeActivity) => {
      if (settled) return;
      if (activity) lastActivity = activity.source;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        settle(() => reject(new Error(`MCP endpoint ${new URL(input.endpoint).origin} stalled after ${input.timeoutMs} ms without ${input.operation} activity (last activity: ${lastActivity}).`)));
      }, input.timeoutMs);
    };
    const maxRunMs = positiveTimeoutMs(input.maxRunMs);
    if (maxRunMs !== undefined) {
      maxRunTimer = setTimeout(() => {
        settle(() => reject(new Error(`MCP endpoint ${new URL(input.endpoint).origin} exceeded ${maxRunMs} ms max run for ${input.operation} (last activity: ${lastActivity}).`)));
      }, maxRunMs);
    }
    unsubscribe = input.registerActivityListener?.((activity) => {
      reset(activity);
    });
    reset({
      ...mcpActivityBase(input.endpoint, input.operation),
      source: "request-start",
      ...(input.method ? { method: input.method } : {}),
      ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    });
    promise.then(
      (value) => {
        settle(() => resolve(value));
      },
      (error) => {
        settle(() => reject(error));
      },
    );
  });
}

function positiveTimeoutMs(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const timeout = Math.floor(value);
  return timeout > 0 ? timeout : undefined;
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
  const identityHaystack = [
    tool.toolRef,
    tool.serverId,
    tool.workloadName,
    tool.name,
  ].join(" ").toLowerCase();
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
  const stemmed = trimmed
    .replace(/(?:ing|ers|er|ed|es|s)$/u, "")
    .replace(/e$/u, "");
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
  ].join(" ").toLowerCase();
}

function searchTermsFromQuery(query: string): string[] {
  return [
    ...query.replace(/https?:\/\/\S+/giu, " url web page ").split(/[^a-z0-9_./:-]+/iu),
  ]
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
  return ["url", "web", "page", "website", "retrieve", "retrieval", "fetch", "scrape", "extract", "content", "markdown", "html", "knowledge", "research"].some((term) => termSet.has(term));
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

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`MCP endpoint returned invalid JSON: ${errorMessage(error)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
