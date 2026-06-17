import type { SubagentToolScopeResolution } from "../../shared/subagentToolScope";
import type { SubagentToolScopeSnapshotSummary } from "../../shared/types";

export interface SubagentToolScopeSnapshotDisplayMetadata {
  schemaVersion: "ambient-subagent-tool-scope-display-metadata-v1";
  approvalMode?: string;
  approvalUnavailable: boolean;
  worktreeIsolated?: boolean;
  fanoutAvailable?: boolean;
  callableWorkflowBridge?: SubagentToolScopeCallableWorkflowBridgeDisplayMetadata;
  childAuthorityProfile?: SubagentToolScopeChildAuthorityDisplayMetadata;
  loadedCategoryCount: number;
  piVisibleCategoryCount: number;
  deniedCategoryCount: number;
  loadedToolCount: number;
  piVisibleToolCount: number;
  deniedToolCount: number;
  deniedCategoryIds: string[];
  deniedToolIds: string[];
  deniedCategoryLabels: string[];
  deniedToolLabels: string[];
}

export type SubagentToolScopeCallableWorkflowBridgeStatus =
  | "enabled"
  | "disabled"
  | "blocked_worktree"
  | "exhausted"
  | "unavailable";

export interface SubagentToolScopeCallableWorkflowBridgeDisplayMetadata {
  status: SubagentToolScopeCallableWorkflowBridgeStatus;
  allowCallableWorkflowTools: boolean;
  nestedFanoutLimit?: number;
  remainingFanout?: number;
  allowedToolNames: string[];
  allowedToolCount: number;
  reason?: string;
}

export interface SubagentToolScopeChildAuthorityDisplayMetadata {
  schemaVersion: "ambient-subagent-child-authority-display-metadata-v1";
  status: "present";
  childRunId?: string;
  childThreadId?: string;
  canonicalTaskPath?: string;
  roleId?: string;
  taskIntent?: string;
  rationale?: string;
  filesystem: {
    readRoots: string[];
    writeRoots: string[];
    deniedWriteRoots: string[];
    readRootCount: number;
    writeRootCount: number;
    deniedWriteRootCount: number;
    readDecision?: string;
    writeDecision?: string;
  };
  browser: {
    domains: string[];
    domainCount: number;
    networkDecision?: string;
  };
  connectors: {
    methods: string[];
    methodCount: number;
    decision?: string;
  };
  nestedFanout: {
    decision?: string;
    remainingFanout?: number;
  };
  approvalRouting?: {
    route?: string;
    mode?: string;
    childThreadId?: string;
  };
  outerEnvelope?: {
    parentThreadId?: string;
    parentPermissionMode?: string;
    parentWorkspacePath?: string;
    approvalMode?: string;
    worktreeIsolationStatus?: string;
  };
}

export type CompactSubagentToolScopeSnapshot = ReturnType<typeof compactSubagentToolScopeSnapshot>;

export function compactSubagentToolScopeSnapshot(snapshot: SubagentToolScopeSnapshotSummary): {
  runId: string;
  sequence: number;
  createdAt: string;
  schemaVersion: SubagentToolScopeResolution["schemaVersion"];
  loadedCategories: SubagentToolScopeResolution["loadedCategories"];
  piVisibleCategories: SubagentToolScopeResolution["piVisibleCategories"];
  deniedCategories: SubagentToolScopeResolution["deniedCategories"];
  loadedTools: SubagentToolScopeResolution["loadedTools"];
  piVisibleTools: SubagentToolScopeResolution["piVisibleTools"];
  deniedTools: SubagentToolScopeResolution["deniedTools"];
  approvalMode: SubagentToolScopeResolution["approvalMode"];
  worktreeIsolated: boolean;
  fanoutAvailable: boolean;
  displayMetadata: SubagentToolScopeSnapshotDisplayMetadata;
} {
  return {
    runId: snapshot.runId,
    sequence: snapshot.sequence,
    createdAt: snapshot.createdAt,
    schemaVersion: snapshot.scope.schemaVersion,
    loadedCategories: snapshot.scope.loadedCategories,
    piVisibleCategories: snapshot.scope.piVisibleCategories,
    deniedCategories: snapshot.scope.deniedCategories,
    loadedTools: snapshot.scope.loadedTools,
    piVisibleTools: snapshot.scope.piVisibleTools,
    deniedTools: snapshot.scope.deniedTools,
    approvalMode: snapshot.scope.approvalMode,
    worktreeIsolated: snapshot.scope.worktreeIsolated,
    fanoutAvailable: snapshot.scope.fanoutAvailable,
    displayMetadata: subagentToolScopeSnapshotDisplayMetadata(snapshot),
  };
}

export function subagentToolScopeSnapshotDisplayMetadata(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
): SubagentToolScopeSnapshotDisplayMetadata {
  const scope = toolScopeRecord(snapshot);
  const loadedCategories = stringArrayValue(scope.loadedCategories);
  const piVisibleCategories = stringArrayValue(scope.piVisibleCategories);
  const deniedCategories = arrayValue(scope.deniedCategories);
  const loadedTools = arrayValue(scope.loadedTools);
  const piVisibleTools = arrayValue(scope.piVisibleTools);
  const deniedTools = arrayValue(scope.deniedTools);
  const callableWorkflowBridge = callableWorkflowBridgeDisplayMetadata(snapshot);
  const childAuthorityProfile = childAuthorityDisplayMetadata(snapshot);
  return {
    schemaVersion: "ambient-subagent-tool-scope-display-metadata-v1",
    ...(stringValue(scope.approvalMode) ? { approvalMode: stringValue(scope.approvalMode) } : {}),
    approvalUnavailable: subagentToolScopeApprovalUnavailable(snapshot),
    ...(typeof scope.worktreeIsolated === "boolean" ? { worktreeIsolated: scope.worktreeIsolated } : {}),
    ...(typeof scope.fanoutAvailable === "boolean" ? { fanoutAvailable: scope.fanoutAvailable } : {}),
    ...(callableWorkflowBridge ? { callableWorkflowBridge } : {}),
    ...(childAuthorityProfile ? { childAuthorityProfile } : {}),
    loadedCategoryCount: loadedCategories.length,
    piVisibleCategoryCount: piVisibleCategories.length,
    deniedCategoryCount: deniedCategories.length,
    loadedToolCount: loadedTools.length,
    piVisibleToolCount: piVisibleTools.length,
    deniedToolCount: deniedTools.length,
    deniedCategoryIds: deniedCategoryIdsFromSubagentToolScopeSnapshot(snapshot),
    deniedToolIds: deniedToolIdsFromSubagentToolScopeSnapshot(snapshot),
    deniedCategoryLabels: deniedCategoryLabelsFromSubagentToolScopeSnapshot(snapshot),
    deniedToolLabels: deniedToolLabelsFromSubagentToolScopeSnapshot(snapshot),
  };
}

export function childAuthorityDisplayMetadata(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
): SubagentToolScopeChildAuthorityDisplayMetadata | undefined {
  const displayAuthority = childAuthorityDisplayMetadataRecord(snapshot);
  if (displayAuthority) return normalizeChildAuthorityDisplayMetadata(displayAuthority);

  const authority = childAuthorityProfileRecord(snapshot);
  if (!authority) return undefined;
  const resourceScopes = recordValue(authority.resourceScopes);
  const filesystem = recordValue(resourceScopes?.filesystem);
  const browser = recordValue(resourceScopes?.browser);
  const connectors = recordValue(resourceScopes?.connectors);
  const nestedFanout = recordValue(resourceScopes?.nestedFanout);
  const approvalRouting = recordValue(authority.approvalRouting);
  const outerEnvelope = recordValue(authority.outerEnvelope);
  return {
    schemaVersion: "ambient-subagent-child-authority-display-metadata-v1",
    status: "present",
    ...(stringValue(authority.childRunId) ? { childRunId: stringValue(authority.childRunId) } : {}),
    ...(stringValue(authority.childThreadId) ? { childThreadId: stringValue(authority.childThreadId) } : {}),
    ...(stringValue(authority.canonicalTaskPath) ? { canonicalTaskPath: stringValue(authority.canonicalTaskPath) } : {}),
    ...(stringValue(authority.roleId) ? { roleId: stringValue(authority.roleId) } : {}),
    ...(stringValue(authority.taskIntent) ? { taskIntent: stringValue(authority.taskIntent) } : {}),
    ...(stringValue(authority.rationale) ? { rationale: stringValue(authority.rationale) } : {}),
    filesystem: childAuthorityFilesystemDisplayMetadata(filesystem),
    browser: childAuthorityBrowserDisplayMetadata(browser),
    connectors: childAuthorityConnectorsDisplayMetadata(connectors),
    nestedFanout: childAuthorityNestedFanoutDisplayMetadata(nestedFanout),
    ...(approvalRouting ? { approvalRouting: childAuthorityApprovalRoutingDisplayMetadata(approvalRouting) } : {}),
    ...(outerEnvelope ? { outerEnvelope: childAuthorityOuterEnvelopeDisplayMetadata(outerEnvelope) } : {}),
  };
}

export function callableWorkflowBridgeDisplayMetadata(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
): SubagentToolScopeCallableWorkflowBridgeDisplayMetadata | undefined {
  const bridge = callableWorkflowBridgeRecord(snapshot);
  if (!bridge) return undefined;
  const allowCallableWorkflowTools = booleanValue(bridge.allowCallableWorkflowTools) ?? false;
  const nestedFanoutLimit = numberValue(bridge.nestedFanoutLimit);
  const remainingFanout = numberValue(bridge.remainingFanout);
  const allowedToolNames = stringArrayValue(bridge.allowedToolNames);
  const reason = stringValue(bridge.reason);
  return {
    status: callableWorkflowBridgeStatus({
      allowCallableWorkflowTools,
      reason,
      nestedFanoutLimit,
      remainingFanout,
    }),
    allowCallableWorkflowTools,
    ...(nestedFanoutLimit !== undefined ? { nestedFanoutLimit } : {}),
    ...(remainingFanout !== undefined ? { remainingFanout } : {}),
    allowedToolNames,
    allowedToolCount: allowedToolNames.length,
    ...(reason ? { reason } : {}),
  };
}

export function subagentToolScopeApprovalUnavailable(snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>): boolean {
  const scope = toolScopeRecord(snapshot);
  const display = recordValue(scope.displayMetadata);
  if (display && typeof display.approvalUnavailable === "boolean") return display.approvalUnavailable;
  if (scope.approvalMode !== "non_interactive") return false;
  return [
    ...arrayValue(scope.deniedCategories).map((category) => stringValue(recordValue(category)?.reason)),
    ...arrayValue(scope.deniedTools).map((tool) => stringValue(recordValue(tool)?.reason)),
  ].some((reason) => Boolean(reason?.includes("requires interactive approval")));
}

export function deniedCategoryIdsFromSubagentToolScopeSnapshot(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
  limit = 20,
): string[] {
  const scope = toolScopeRecord(snapshot);
  const displayIds = stringArrayValue(recordValue(scope.displayMetadata)?.deniedCategoryIds);
  if (displayIds.length > 0) return uniqueStrings(displayIds).slice(0, limit);
  const ids = arrayValue(scope.deniedCategories)
    .map((item) => stringValue(recordValue(item)?.id))
    .filter((id): id is string => Boolean(id));
  return uniqueStrings(ids).slice(0, limit);
}

export function deniedToolIdsFromSubagentToolScopeSnapshot(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
  limit = 20,
): string[] {
  const scope = toolScopeRecord(snapshot);
  const displayIds = stringArrayValue(recordValue(scope.displayMetadata)?.deniedToolIds);
  if (displayIds.length > 0) return uniqueStrings(displayIds).slice(0, limit);
  const ids = arrayValue(scope.deniedTools)
    .map((item) => {
      const tool = recordValue(item);
      const source = stringValue(tool?.source);
      const id = stringValue(tool?.id);
      if (source && id) return `${source}:${id}`;
      return id;
    })
    .filter((id): id is string => Boolean(id));
  return uniqueStrings(ids).slice(0, limit);
}

export function deniedCategoryLabelsFromSubagentToolScopeSnapshot(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
  limit = 20,
): string[] {
  const scope = toolScopeRecord(snapshot);
  const displayLabels = stringArrayValue(recordValue(scope.displayMetadata)?.deniedCategoryLabels);
  if (displayLabels.length > 0) return uniqueStrings(displayLabels).slice(0, limit);
  const labels = arrayValue(scope.deniedCategories)
    .map((item) => deniedCategoryLabel(recordValue(item)))
    .filter((label): label is string => Boolean(label));
  return uniqueStrings(labels).slice(0, limit);
}

export function deniedToolLabelsFromSubagentToolScopeSnapshot(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
  limit = 20,
): string[] {
  const scope = toolScopeRecord(snapshot);
  const displayLabels = stringArrayValue(recordValue(scope.displayMetadata)?.deniedToolLabels);
  if (displayLabels.length > 0) return uniqueStrings(displayLabels).slice(0, limit);
  const labels = arrayValue(scope.deniedTools)
    .map((item) => deniedToolLabel(recordValue(item)))
    .filter((label): label is string => Boolean(label));
  return uniqueStrings(labels).slice(0, limit);
}

function deniedCategoryLabel(category: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(category?.id);
  return id ? `${categoryLabel(id)} (${id})` : undefined;
}

function deniedToolLabel(tool: Record<string, unknown> | undefined): string | undefined {
  const id = stringValue(tool?.id);
  if (!id) return undefined;
  const source = stringValue(tool?.source);
  const categoryId = stringValue(tool?.categoryId);
  const sourcePrefix = source ? `${sourceLabel(source)} ` : "";
  const category = categoryId ? ` / ${categoryLabel(categoryId)} (${categoryId})` : "";
  return `${sourcePrefix}${id}${category}`;
}

function callableWorkflowBridgeRecord(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
): Record<string, unknown> | undefined {
  const scope = toolScopeRecord(snapshot);
  const displayBridge = recordValue(recordValue(scope.displayMetadata)?.callableWorkflowBridge);
  if (displayBridge) return displayBridge;
  const root = recordValue(snapshot);
  const resolverInputs = recordValue(root?.resolverInputs);
  const workspacePolicy = recordValue(resolverInputs?.workspacePolicy);
  return recordValue(workspacePolicy?.callableWorkflowBridge);
}

function childAuthorityProfileRecord(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
): Record<string, unknown> | undefined {
  const root = recordValue(snapshot);
  const resolverInputs = recordValue(root?.resolverInputs);
  const profile = recordValue(resolverInputs?.childAuthorityProfile);
  if (!profile) return undefined;
  return stringValue(profile.schemaVersion) === "ambient-subagent-child-authority-profile-v1" ? profile : undefined;
}

function childAuthorityDisplayMetadataRecord(
  snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>,
): Record<string, unknown> | undefined {
  const scope = toolScopeRecord(snapshot);
  const display = recordValue(scope.displayMetadata);
  const authority = recordValue(display?.childAuthorityProfile);
  if (!authority) return undefined;
  return stringValue(authority.schemaVersion) === "ambient-subagent-child-authority-display-metadata-v1"
    ? authority
    : undefined;
}

function normalizeChildAuthorityDisplayMetadata(
  authority: Record<string, unknown>,
): SubagentToolScopeChildAuthorityDisplayMetadata {
  const filesystem = childAuthorityFilesystemDisplayMetadata(recordValue(authority.filesystem));
  const browser = childAuthorityBrowserDisplayMetadata(recordValue(authority.browser));
  const connectors = childAuthorityConnectorsDisplayMetadata(recordValue(authority.connectors));
  const nestedFanout = childAuthorityNestedFanoutDisplayMetadata(recordValue(authority.nestedFanout));
  const approvalRouting = recordValue(authority.approvalRouting);
  const outerEnvelope = recordValue(authority.outerEnvelope);
  return {
    schemaVersion: "ambient-subagent-child-authority-display-metadata-v1",
    status: "present",
    ...(stringValue(authority.childRunId) ? { childRunId: stringValue(authority.childRunId) } : {}),
    ...(stringValue(authority.childThreadId) ? { childThreadId: stringValue(authority.childThreadId) } : {}),
    ...(stringValue(authority.canonicalTaskPath) ? { canonicalTaskPath: stringValue(authority.canonicalTaskPath) } : {}),
    ...(stringValue(authority.roleId) ? { roleId: stringValue(authority.roleId) } : {}),
    ...(stringValue(authority.taskIntent) ? { taskIntent: stringValue(authority.taskIntent) } : {}),
    ...(stringValue(authority.rationale) ? { rationale: stringValue(authority.rationale) } : {}),
    filesystem,
    browser,
    connectors,
    nestedFanout,
    ...(approvalRouting ? { approvalRouting: childAuthorityApprovalRoutingDisplayMetadata(approvalRouting) } : {}),
    ...(outerEnvelope ? { outerEnvelope: childAuthorityOuterEnvelopeDisplayMetadata(outerEnvelope) } : {}),
  };
}

function childAuthorityFilesystemDisplayMetadata(
  filesystem: Record<string, unknown> | undefined,
): SubagentToolScopeChildAuthorityDisplayMetadata["filesystem"] {
  const readRoots = uniqueStrings(stringArrayValue(filesystem?.readRoots));
  const writeRoots = uniqueStrings(stringArrayValue(filesystem?.writeRoots));
  const deniedWriteRoots = uniqueStrings(stringArrayValue(filesystem?.deniedWriteRoots));
  return {
    readRoots,
    writeRoots,
    deniedWriteRoots,
    readRootCount: readRoots.length,
    writeRootCount: writeRoots.length,
    deniedWriteRootCount: deniedWriteRoots.length,
    ...(stringValue(filesystem?.readDecision) ? { readDecision: stringValue(filesystem?.readDecision) } : {}),
    ...(stringValue(filesystem?.writeDecision) ? { writeDecision: stringValue(filesystem?.writeDecision) } : {}),
  };
}

function childAuthorityBrowserDisplayMetadata(
  browser: Record<string, unknown> | undefined,
): SubagentToolScopeChildAuthorityDisplayMetadata["browser"] {
  const domains = uniqueStrings(stringArrayValue(browser?.domains));
  return {
    domains,
    domainCount: domains.length,
    ...(stringValue(browser?.networkDecision) ? { networkDecision: stringValue(browser?.networkDecision) } : {}),
  };
}

function childAuthorityConnectorsDisplayMetadata(
  connectors: Record<string, unknown> | undefined,
): SubagentToolScopeChildAuthorityDisplayMetadata["connectors"] {
  const methods = uniqueStrings(stringArrayValue(connectors?.methods));
  return {
    methods,
    methodCount: methods.length,
    ...(stringValue(connectors?.decision) ? { decision: stringValue(connectors?.decision) } : {}),
  };
}

function childAuthorityNestedFanoutDisplayMetadata(
  nestedFanout: Record<string, unknown> | undefined,
): SubagentToolScopeChildAuthorityDisplayMetadata["nestedFanout"] {
  const remainingFanout = numberValue(nestedFanout?.remainingFanout);
  return {
    ...(stringValue(nestedFanout?.decision) ? { decision: stringValue(nestedFanout?.decision) } : {}),
    ...(remainingFanout !== undefined ? { remainingFanout } : {}),
  };
}

function childAuthorityApprovalRoutingDisplayMetadata(
  approvalRouting: Record<string, unknown>,
): NonNullable<SubagentToolScopeChildAuthorityDisplayMetadata["approvalRouting"]> {
  return {
    ...(stringValue(approvalRouting.route) ? { route: stringValue(approvalRouting.route) } : {}),
    ...(stringValue(approvalRouting.mode) ? { mode: stringValue(approvalRouting.mode) } : {}),
    ...(stringValue(approvalRouting.childThreadId) ? { childThreadId: stringValue(approvalRouting.childThreadId) } : {}),
  };
}

function childAuthorityOuterEnvelopeDisplayMetadata(
  outerEnvelope: Record<string, unknown>,
): NonNullable<SubagentToolScopeChildAuthorityDisplayMetadata["outerEnvelope"]> {
  return {
    ...(stringValue(outerEnvelope.parentThreadId) ? { parentThreadId: stringValue(outerEnvelope.parentThreadId) } : {}),
    ...(stringValue(outerEnvelope.parentPermissionMode) ? { parentPermissionMode: stringValue(outerEnvelope.parentPermissionMode) } : {}),
    ...(stringValue(outerEnvelope.parentWorkspacePath) ? { parentWorkspacePath: stringValue(outerEnvelope.parentWorkspacePath) } : {}),
    ...(stringValue(outerEnvelope.approvalMode) ? { approvalMode: stringValue(outerEnvelope.approvalMode) } : {}),
    ...(stringValue(outerEnvelope.worktreeIsolationStatus) ? { worktreeIsolationStatus: stringValue(outerEnvelope.worktreeIsolationStatus) } : {}),
  };
}

function callableWorkflowBridgeStatus(input: {
  allowCallableWorkflowTools: boolean;
  reason?: string;
  nestedFanoutLimit?: number;
  remainingFanout?: number;
}): SubagentToolScopeCallableWorkflowBridgeStatus {
  if (input.allowCallableWorkflowTools) return "enabled";
  if (input.reason?.includes("disabled")) return "disabled";
  if (input.reason?.includes("worktree")) return "blocked_worktree";
  if (input.reason?.includes("exhausted") || input.nestedFanoutLimit === 0 || input.remainingFanout === 0) return "exhausted";
  return "unavailable";
}

function sourceLabel(source: string): string {
  return source.split("_").map(titleCase).join(" ");
}

function categoryLabel(category: string): string {
  return category.split(".").map(titleCase).join(" ");
}

function titleCase(value: string): string {
  const normalized = value.replace(/[-_]+/g, " ").trim();
  if (!normalized) return value;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toolScopeRecord(snapshot: SubagentToolScopeSnapshotSummary | Record<string, unknown>): Record<string, unknown> {
  if ("scope" in snapshot && recordValue(snapshot.scope)) return snapshot.scope as Record<string, unknown>;
  return snapshot as Record<string, unknown>;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return arrayValue(value).filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
