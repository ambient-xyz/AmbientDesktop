import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionGrantActionKind, PermissionGrantScopeKind } from "../../shared/permissionTypes";

export type PermissionGrantRegistryRisk = "low" | "medium" | "high";
export type PermissionGrantRegistryTone = "ready" | "review" | "blocked";

export interface PermissionGrantRegistryRow {
  id: string;
  grant: AmbientPermissionGrant;
  scopeLabel: string;
  actionLabel: string;
  targetLabel: string;
  conditionLabel?: string;
  targetKindLabel: string;
  sourceLabel: string;
  provenanceLabel: string;
  risk: PermissionGrantRegistryRisk;
  riskLabel: string;
  tone: PermissionGrantRegistryTone;
  statusLabel: string;
  expiryLabel: string;
  auditCount: number;
  lastUsedAt?: string;
  recentUseLabel: string;
  impactLabel: string;
  active: boolean;
}

export interface PermissionGrantRegistryGroup {
  id: PermissionGrantScopeKind;
  scopeLabel: string;
  rows: PermissionGrantRegistryRow[];
  activeCount: number;
  revokedCount: number;
  auditCount: number;
  highestRisk: PermissionGrantRegistryRisk;
  tone: PermissionGrantRegistryTone;
  revokeIds: string[];
  summary: string;
}

export interface PermissionGrantFullAccessReceipt {
  id: string;
  entry: PermissionAuditEntry;
  toolLabel: string;
  riskLabel: string;
  createdLabel: string;
  reasonLabel: string;
  detailLabel?: string;
}

export interface PermissionGrantRegistryModel {
  rows: PermissionGrantRegistryRow[];
  groups: PermissionGrantRegistryGroup[];
  fullAccessReceipts: PermissionGrantFullAccessReceipt[];
  activeCount: number;
  revokedCount: number;
  expiringCount: number;
  highRiskCount: number;
  totalAuditCount: number;
  fullAccessReceiptCount: number;
  summary: string;
}

export function permissionGrantRegistryModel(input: {
  grants: AmbientPermissionGrant[];
  auditEntries: PermissionAuditEntry[];
  now?: string;
}): PermissionGrantRegistryModel {
  const nowMs = new Date(input.now ?? Date.now()).getTime();
  const auditsByGrantId = new Map<string, PermissionAuditEntry[]>();
  for (const entry of input.auditEntries) {
    if (!entry.grantId) continue;
    const entries = auditsByGrantId.get(entry.grantId) ?? [];
    entries.push(entry);
    auditsByGrantId.set(entry.grantId, entries);
  }

  const rows = input.grants.map((grant) => registryRow(grant, auditsByGrantId.get(grant.id) ?? [], nowMs)).sort(compareRegistryRows);
  const fullAccessReceipts = input.auditEntries
    .filter(isFullAccessReceipt)
    .sort(compareAuditCreatedDesc)
    .map(fullAccessReceipt);
  const groups = scopeOrder
    .map((scope) => registryGroup(scope, rows.filter((row) => row.grant.scopeKind === scope)))
    .filter((group): group is PermissionGrantRegistryGroup => Boolean(group));
  const activeCount = rows.filter((row) => row.active).length;
  const revokedCount = rows.length - activeCount;
  const expiringCount = rows.filter((row) => row.active && row.expiryLabel.startsWith("Expires")).length;
  const highRiskCount = rows.filter((row) => row.active && row.risk === "high").length;
  const totalAuditCount = rows.reduce((sum, row) => sum + row.auditCount, 0);

  return {
    rows,
    groups,
    fullAccessReceipts,
    activeCount,
    revokedCount,
    expiringCount,
    highRiskCount,
    totalAuditCount,
    fullAccessReceiptCount: fullAccessReceipts.length,
    summary: rows.length
      ? `${activeCount} active grant${activeCount === 1 ? "" : "s"} across ${groups.length} scope${groups.length === 1 ? "" : "s"}. ${totalAuditCount} visible reuse event${totalAuditCount === 1 ? "" : "s"}.`
      : fullAccessReceipts.length
        ? `${fullAccessReceipts.length} Full Access audit receipt${fullAccessReceipts.length === 1 ? "" : "s"} and no persistent permission grants.`
        : "No persistent permission grants yet.",
  };
}

export function workflowPermissionGrantRegistryModel(input: {
  grants: AmbientPermissionGrant[];
  auditEntries: PermissionAuditEntry[];
  workflowThreadId: string;
  projectPath?: string;
  workspacePath?: string;
  auditThreadId?: string;
  now?: string;
}): PermissionGrantRegistryModel {
  const relevantGrants = input.grants.filter((grant) => {
    if (grant.scopeKind === "workflow_thread") return grant.workflowThreadId === input.workflowThreadId;
    if (grant.scopeKind === "project") return Boolean(input.projectPath) && grant.projectPath === input.projectPath;
    if (grant.scopeKind === "workspace") return Boolean(input.workspacePath) && grant.workspacePath === input.workspacePath;
    if (grant.scopeKind === "global_plugin") return true;
    return false;
  });
  const relevantGrantIds = new Set(relevantGrants.map((grant) => grant.id));
  const relevantAuditEntries = input.auditEntries.filter((entry) => {
    if (entry.grantId) return relevantGrantIds.has(entry.grantId);
    if (!isFullAccessReceipt(entry)) return false;
    return entry.threadId === input.workflowThreadId || Boolean(input.auditThreadId && entry.threadId === input.auditThreadId);
  });
  return permissionGrantRegistryModel({
    grants: relevantGrants,
    auditEntries: relevantAuditEntries,
    now: input.now,
  });
}

export function permissionGrantRevocationImpact(input: {
  grants: AmbientPermissionGrant[];
  auditEntries: PermissionAuditEntry[];
  grantIds: string[];
}): { title: string; detail: string } | undefined {
  const grantIdSet = new Set(input.grantIds);
  const selected = input.grants.filter((grant) => grantIdSet.has(grant.id) && !grant.revokedAt);
  if (!selected.length) return undefined;
  const auditCount = input.auditEntries.filter((entry) => entry.grantId && grantIdSet.has(entry.grantId)).length;
  const scopes = Array.from(new Set(selected.map((grant) => formatScope(grant.scopeKind))));
  const actionLabels = Array.from(new Set(selected.map((grant) => formatLabel(grant.actionKind)))).slice(0, 3);
  const targetPreview = selected.slice(0, 3).map(grantTargetWithCondition);
  const extraTargets = Math.max(0, selected.length - targetPreview.length);
  const highRiskCount = selected.filter((grant) => grantRisk(grant.actionKind) === "high").length;
  return {
    title: `Revoke ${selected.length} active grant${selected.length === 1 ? "" : "s"} across ${scopes.join(", ")}?`,
    detail: [
      `This will stop automatic reuse for ${actionLabels.join(", ")} until the user grants access again.`,
      auditCount ? `${auditCount} visible reuse event${auditCount === 1 ? "" : "s"} will remain in the audit log.` : "No visible reuse events are attached to these grants yet.",
      highRiskCount ? `${highRiskCount} high-risk grant${highRiskCount === 1 ? "" : "s"} included.` : undefined,
      `Targets: ${targetPreview.join("; ")}${extraTargets ? `; and ${extraTargets} more` : ""}.`,
    ].filter((part): part is string => Boolean(part)).join(" "),
  };
}

function registryRow(grant: AmbientPermissionGrant, auditEntries: PermissionAuditEntry[], nowMs: number): PermissionGrantRegistryRow {
  const risk = grantRisk(grant.actionKind);
  const revoked = Boolean(grant.revokedAt);
  const expiresMs = grant.expiresAt ? new Date(grant.expiresAt).getTime() : undefined;
  const expired = expiresMs !== undefined && Number.isFinite(expiresMs) && expiresMs <= nowMs;
  const expiringSoon = expiresMs !== undefined && Number.isFinite(expiresMs) && expiresMs > nowMs && expiresMs - nowMs <= 7 * 24 * 60 * 60 * 1000;
  const active = !revoked && !expired;
  const lastUsedAt = latestIso(auditEntries.map((entry) => entry.createdAt));
  return {
    id: grant.id,
    grant,
    scopeLabel: formatScope(grant.scopeKind),
    actionLabel: formatLabel(grant.actionKind),
    targetLabel: grant.targetLabel,
    conditionLabel: conditionLabel(grant.conditions),
    targetKindLabel: formatLabel(grant.targetKind),
    sourceLabel: formatLabel(grant.source),
    provenanceLabel: provenanceLabel(grant),
    risk,
    riskLabel: risk === "high" ? "High risk" : risk === "medium" ? "Review" : "Low risk",
    tone: !active ? "blocked" : risk === "high" || expiringSoon ? "review" : "ready",
    statusLabel: revoked ? "Revoked" : expired ? "Expired" : "Active",
    expiryLabel: expiryLabel(grant.expiresAt, nowMs),
    auditCount: auditEntries.length,
    lastUsedAt,
    recentUseLabel: lastUsedAt ? `Last used ${formatShortDate(lastUsedAt)}` : "No visible reuse",
    impactLabel: impactLabel(grant, auditEntries.length),
    active,
  };
}

function fullAccessReceipt(entry: PermissionAuditEntry): PermissionGrantFullAccessReceipt {
  return {
    id: entry.id,
    entry,
    toolLabel: entry.toolName,
    riskLabel: formatLabel(entry.risk),
    createdLabel: formatShortDate(entry.createdAt),
    reasonLabel: entry.reason,
    detailLabel: entry.detail ? compactDetail(entry.detail) : undefined,
  };
}

function isFullAccessReceipt(entry: PermissionAuditEntry): boolean {
  return entry.decision === "allowed" && entry.decisionSource === "allowed_by_full_access";
}

function registryGroup(scope: PermissionGrantScopeKind, rows: PermissionGrantRegistryRow[]): PermissionGrantRegistryGroup | undefined {
  if (!rows.length) return undefined;
  const activeRows = rows.filter((row) => row.active);
  const highestRisk = activeRows.some((row) => row.risk === "high") ? "high" : activeRows.some((row) => row.risk === "medium") ? "medium" : "low";
  const auditCount = rows.reduce((sum, row) => sum + row.auditCount, 0);
  return {
    id: scope,
    scopeLabel: formatScope(scope),
    rows,
    activeCount: activeRows.length,
    revokedCount: rows.length - activeRows.length,
    auditCount,
    highestRisk,
    tone: activeRows.length === 0 ? "blocked" : highestRisk === "high" ? "review" : "ready",
    revokeIds: activeRows.map((row) => row.id),
    summary: `${activeRows.length} active, ${auditCount} visible reuse event${auditCount === 1 ? "" : "s"}`,
  };
}

function grantRisk(action: PermissionGrantActionKind): PermissionGrantRegistryRisk {
  if (
    action === "shell_command" ||
    action === "local_file_write" ||
    action === "remote_mutation" ||
    action === "browser_control" ||
    action === "browser_login" ||
    action === "plugin_tool_execute"
  ) {
    return "high";
  }
  if (
    action === "file_content_read" ||
    action === "secret_path_read" ||
    action === "connector_account_data_read" ||
    action === "connector_content_read" ||
    action === "browser_profile"
  ) {
    return "medium";
  }
  return "low";
}

function expiryLabel(expiresAt: string | undefined, nowMs: number): string {
  if (!expiresAt) return "No expiry";
  const expiresMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMs)) return "Invalid expiry";
  if (expiresMs <= nowMs) return `Expired ${formatShortDate(expiresAt)}`;
  if (expiresMs - nowMs <= 7 * 24 * 60 * 60 * 1000) return `Expires ${formatShortDate(expiresAt)}`;
  return `Expires ${formatShortDate(expiresAt)}`;
}

function impactLabel(grant: AmbientPermissionGrant, auditCount: number): string {
  const scope = formatScope(grant.scopeKind).toLowerCase();
  const action = formatLabel(grant.actionKind).toLowerCase();
  const conditions = conditionLabel(grant.conditions);
  return [
    `Revoking removes ${action} access for this ${scope} grant.`,
    conditions ? `Grant ${conditions.toLowerCase()}.` : undefined,
    `${auditCount} visible reuse event${auditCount === 1 ? "" : "s"} would remain in audit history.`,
  ].filter((part): part is string => Boolean(part)).join(" ");
}

function provenanceLabel(grant: AmbientPermissionGrant): string {
  if (grant.workflowThreadId) return `Workflow ${grant.workflowThreadId}`;
  if (grant.threadId) return `Thread ${grant.threadId}`;
  if (grant.projectPath) return `Project ${grant.projectPath}`;
  if (grant.workspacePath) return `Workspace ${grant.workspacePath}`;
  return formatLabel(grant.scopeKind);
}

function latestIso(values: string[]): string | undefined {
  let latest: string | undefined;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const ms = new Date(value).getTime();
    if (!Number.isFinite(ms) || ms <= latestMs) continue;
    latestMs = ms;
    latest = value;
  }
  return latest;
}

function compareRegistryRows(left: PermissionGrantRegistryRow, right: PermissionGrantRegistryRow): number {
  if (left.active !== right.active) return left.active ? -1 : 1;
  const risk = riskRank(right.risk) - riskRank(left.risk);
  if (risk) return risk;
  const leftTime = new Date(left.lastUsedAt ?? left.grant.updatedAt ?? left.grant.createdAt).getTime();
  const rightTime = new Date(right.lastUsedAt ?? right.grant.updatedAt ?? right.grant.createdAt).getTime();
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
  return left.targetLabel.localeCompare(right.targetLabel);
}

function compareAuditCreatedDesc(left: PermissionAuditEntry, right: PermissionAuditEntry): number {
  return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
}

function riskRank(risk: PermissionGrantRegistryRisk): number {
  if (risk === "high") return 3;
  if (risk === "medium") return 2;
  return 1;
}

function formatScope(scope: PermissionGrantScopeKind): string {
  if (scope === "workflow_thread") return "Workflow";
  if (scope === "global_plugin") return "Plugin";
  return formatLabel(scope);
}

function formatLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatShortDate(value: string): string {
  return value.slice(0, 10);
}

function compactDetail(detail: string): string {
  const compact = detail.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 3).join(" · ") || detail.trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
}

function grantTargetWithCondition(grant: AmbientPermissionGrant): string {
  const conditions = conditionLabel(grant.conditions);
  return conditions ? `${grant.targetLabel} (${conditions})` : grant.targetLabel;
}

function conditionLabel(conditions: Record<string, unknown> | undefined): string | undefined {
  if (!conditions || typeof conditions !== "object") return undefined;
  const entries = Object.keys(conditions)
    .sort()
    .map((key) => `${formatLabel(key)}=${conditionValueLabel(conditions[key])}`)
    .filter((entry) => entry.length > 0);
  if (!entries.length) return undefined;
  const shown = entries.slice(0, 4).join(" · ");
  const extra = entries.length > 4 ? ` · +${entries.length - 4} more` : "";
  const label = `Conditions: ${shown}${extra}`;
  return label.length > 180 ? `${label.slice(0, 177)}...` : label;
}

function conditionValueLabel(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(conditionValueLabel).join(", ")}]`;
  if (value && typeof value === "object") return JSON.stringify(stableConditionValue(value));
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "set";
}

function stableConditionValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableConditionValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item !== undefined) sorted[key] = stableConditionValue(item);
  }
  return sorted;
}

const scopeOrder: PermissionGrantScopeKind[] = ["workflow_thread", "thread", "project", "workspace", "global_plugin"];
