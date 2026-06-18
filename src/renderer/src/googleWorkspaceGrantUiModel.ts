import type { AmbientPermissionGrant, PermissionAuditEntry, PermissionGrantScopeKind } from "../../shared/permissionTypes";

export interface GoogleWorkspaceGrantRow {
  id: string;
  grant: AmbientPermissionGrant;
  accountHint: string;
  methodId: string;
  service: string;
  sideEffect: string;
  scopeLabel: string;
  provenanceLabel: string;
  auditCount: number;
  lastUsedAt?: string;
}

export interface GoogleWorkspaceGrantAccountGroup {
  accountHint: string;
  grants: GoogleWorkspaceGrantRow[];
  services: string[];
  auditCount: number;
  lastUsedAt?: string;
}

export interface GoogleWorkspaceGrantReviewModel {
  grants: GoogleWorkspaceGrantRow[];
  groups: GoogleWorkspaceGrantAccountGroup[];
  totalAuditCount: number;
}

export function googleWorkspaceGrantReview(
  grants: AmbientPermissionGrant[],
  auditEntries: PermissionAuditEntry[],
): GoogleWorkspaceGrantReviewModel {
  const auditsByGrantId = new Map<string, PermissionAuditEntry[]>();
  for (const entry of auditEntries) {
    if (!entry.grantId) continue;
    const entries = auditsByGrantId.get(entry.grantId) ?? [];
    entries.push(entry);
    auditsByGrantId.set(entry.grantId, entries);
  }

  const rows = grants
    .filter(isGoogleWorkspaceGrant)
    .map((grant): GoogleWorkspaceGrantRow => {
      const conditions = googleWorkspaceGrantConditions(grant);
      const parsed = parseGoogleWorkspaceTargetLabel(grant.targetLabel);
      const methodId = conditions.methodId ?? parsed?.methodId ?? "unknown";
      const accountHint = conditions.accountHint ?? parsed?.accountHint ?? "default";
      const audit = auditsByGrantId.get(grant.id) ?? [];
      const lastUsedAt = latestAuditTime(audit);
      return {
        id: grant.id,
        grant,
        accountHint,
        methodId,
        service: googleWorkspaceMethodService(methodId),
        sideEffect: formatGoogleWorkspaceSideEffect(conditions.sideEffect),
        scopeLabel: formatGoogleWorkspaceGrantScope(grant.scopeKind),
        provenanceLabel: googleWorkspaceGrantProvenance(grant),
        auditCount: audit.length,
        lastUsedAt,
      };
    })
    .sort(compareGoogleWorkspaceGrantRows);

  const groupsByAccount = new Map<string, GoogleWorkspaceGrantRow[]>();
  for (const row of rows) {
    const group = groupsByAccount.get(row.accountHint) ?? [];
    group.push(row);
    groupsByAccount.set(row.accountHint, group);
  }

  const groups = [...groupsByAccount.entries()]
    .map(([accountHint, grants]): GoogleWorkspaceGrantAccountGroup => ({
      accountHint,
      grants,
      services: [...new Set(grants.map((grant) => grant.service))].sort((a, b) => a.localeCompare(b)),
      auditCount: grants.reduce((sum, grant) => sum + grant.auditCount, 0),
      lastUsedAt: latestIso(grants.map((grant) => grant.lastUsedAt).filter((value): value is string => Boolean(value))),
    }))
    .sort((a, b) => a.accountHint.localeCompare(b.accountHint));

  return {
    grants: rows,
    groups,
    totalAuditCount: rows.reduce((sum, grant) => sum + grant.auditCount, 0),
  };
}

export function isGoogleWorkspaceGrant(grant: AmbientPermissionGrant): boolean {
  const conditions = googleWorkspaceGrantConditions(grant);
  return conditions.provider === "google.workspace.cli" || grant.targetLabel.startsWith("Google Workspace ");
}

function googleWorkspaceGrantConditions(grant: AmbientPermissionGrant): {
  provider?: string;
  accountHint?: string;
  methodId?: string;
  sideEffect?: string;
} {
  const conditions = grant.conditions ?? {};
  return {
    provider: stringCondition(conditions.provider),
    accountHint: stringCondition(conditions.accountHint),
    methodId: stringCondition(conditions.methodId),
    sideEffect: stringCondition(conditions.sideEffect),
  };
}

function stringCondition(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseGoogleWorkspaceTargetLabel(label: string): { methodId: string; accountHint: string } | undefined {
  const match = /^Google Workspace\s+(.+)\s+\((.*)\)$/.exec(label.trim());
  if (!match) return undefined;
  return {
    methodId: match[1]?.trim() || "unknown",
    accountHint: match[2]?.trim() || "default",
  };
}

function googleWorkspaceMethodService(methodId: string): string {
  const service = methodId.split(".")[0]?.trim();
  return service || "google";
}

function formatGoogleWorkspaceSideEffect(sideEffect?: string): string {
  if (!sideEffect) return "Unknown";
  return sideEffect
    .split("_")
    .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function formatGoogleWorkspaceGrantScope(scope: PermissionGrantScopeKind): string {
  if (scope === "workflow_thread") return "Workflow";
  if (scope === "global_plugin") return "Plugin";
  return scope
    .split("_")
    .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function googleWorkspaceGrantProvenance(grant: AmbientPermissionGrant): string {
  if (grant.threadId) return `Thread ${grant.threadId}`;
  if (grant.workflowThreadId) return `Workflow ${grant.workflowThreadId}`;
  if (grant.projectPath) return `Project ${grant.projectPath}`;
  if (grant.workspacePath) return `Workspace ${grant.workspacePath}`;
  return grant.source.replace(/_/g, " ");
}

function latestAuditTime(entries: PermissionAuditEntry[]): string | undefined {
  return latestIso(entries.map((entry) => entry.createdAt));
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

function compareGoogleWorkspaceGrantRows(left: GoogleWorkspaceGrantRow, right: GoogleWorkspaceGrantRow): number {
  const leftTime = new Date(left.lastUsedAt ?? left.grant.updatedAt ?? left.grant.createdAt).getTime();
  const rightTime = new Date(right.lastUsedAt ?? right.grant.updatedAt ?? right.grant.createdAt).getTime();
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return rightTime - leftTime;
  return left.methodId.localeCompare(right.methodId);
}
