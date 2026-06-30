import type { McpInstalledServerSummary } from "./mcpInstallCatalogTypes";
import type {
  McpManagedFileExchangeArtifact,
  McpManagedFileExchangeStagedFile,
  McpToolCallFileInput,
} from "./mcpManagedFileExchange";
import type { McpToolBridgeActivityHandler } from "./mcpHttpClient";
import type { MaterializedTextOutput } from "./mcpToolRuntimeFacade";

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
