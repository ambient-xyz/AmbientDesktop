import { isAbsolute, resolve } from "node:path";

import type {
  SubagentCallableWorkflowChildBridgePolicy,
  SubagentChildAuthorityDecision,
  SubagentChildAuthorityRequest,
  SubagentChildAuthorityTaskIntent,
  SubagentTaskToolRequest,
  SubagentToolCategoryId,
  SubagentToolScopeDenial,
  SubagentToolScopeResolution,
  SubagentWorkspaceToolPolicy,
} from "../../shared/subagentToolScope";
import type {
  PermissionMode,
  ThreadWorktreeSummary,
} from "../../shared/types";
import type {
  MutationWorkspaceLease,
} from "../../shared/symphonyFineGrainedContracts";
import type { SubagentToolScopeRequestApprovalMode } from "./subagentToolScopeRequest";

export const SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION = "ambient-subagent-tool-scope-launch-policy-v1" as const;

export const SUBAGENT_TOOL_SCOPE_LAUNCH_HARD_DENIED_CATEGORIES = [
  "secrets.read",
  "workflow.call",
  "subagent.spawn",
] as const satisfies readonly SubagentToolCategoryId[];

export const SUBAGENT_CHILD_AUTHORITY_PROFILE_SCHEMA_VERSION =
  "ambient-subagent-child-authority-profile-v1" as const;

export interface SubagentChildAuthorityProfile {
  schemaVersion: typeof SUBAGENT_CHILD_AUTHORITY_PROFILE_SCHEMA_VERSION;
  childRunId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  roleId: string;
  taskIntent: SubagentChildAuthorityTaskIntent | "role_default";
  rationale: string;
  outerEnvelope: {
    parentThreadId: string;
    parentPermissionMode: PermissionMode;
    parentWorkspacePath?: string;
    approvalMode: SubagentWorkspaceToolPolicy["approvalMode"];
    worktreeIsolationStatus: SubagentWorktreeIsolationStatus;
  };
  resourceScopes: {
    filesystem: {
      readRoots: string[];
      writeRoots: string[];
      deniedWriteRoots: string[];
      readDecision: "allow" | "ask_parent" | "deny";
      writeDecision: SubagentChildAuthorityDecision;
    };
    browser: {
      domains: string[];
      networkDecision: "allow" | "ask_parent" | "deny";
    };
    connectors: {
      methods: string[];
      decision: "allow" | "ask_parent" | "deny";
    };
    nestedFanout: {
      decision: "allow" | "ask_parent" | "deny";
      remainingFanout: number;
    };
  };
  toolCategoryPolicy: {
    piVisibleCategories: SubagentToolCategoryId[];
    loadedCategories: SubagentToolCategoryId[];
    deniedCategories: Array<{ id: SubagentToolCategoryId; reason: string }>;
  };
  approvalRouting: {
    route: "parent";
    mode: SubagentWorkspaceToolPolicy["approvalMode"];
    childThreadId: string;
  };
  hardDenies: SubagentToolCategoryId[];
}

export interface SubagentLaunchChildWorkflowPolicyInput {
  allowCallableWorkflowTools?: boolean;
  allowedToolNames?: readonly string[];
  nestedFanoutLimit?: number;
  usedFanoutCount?: number;
}

export type SubagentWorktreeIsolationStatus =
  | "isolated"
  | "missing"
  | "inactive"
  | "mismatched_child_thread"
  | "parent_workspace";

export interface SubagentLaunchWorkspaceToolPolicy extends SubagentWorkspaceToolPolicy {
  schemaVersion: typeof SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION;
  parentPermissionMode: PermissionMode;
  worktreeIsolationStatus: SubagentWorktreeIsolationStatus;
  worktreeIsolationReason: string;
  expectedChildThreadId?: string;
  worktreeThreadId?: string;
  worktreePath?: string;
  mutationWorkspaceLeaseId?: string;
  mutationWorkspaceLeaseKind?: MutationWorkspaceLease["kind"];
}

export type SubagentToolScopeLaunchDenialKind =
  | "phase4_isolation_required"
  | "requested_scope_denied"
  | "symphony_policy_mismatch";

export interface SubagentToolScopeLaunchDenial {
  schemaVersion: typeof SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION;
  kind: SubagentToolScopeLaunchDenialKind;
  reason: string;
  explicitToolRequest: boolean;
  deniedCategoryIds: SubagentToolCategoryId[];
  deniedToolIds: string[];
}

export function resolveSubagentLaunchWorkspaceToolPolicy(input: {
  parentThread: Pick<{ permissionMode: PermissionMode; workspacePath?: string }, "permissionMode" | "workspacePath">;
  requestedApprovalMode?: SubagentToolScopeRequestApprovalMode;
  childWorktree?: ThreadWorktreeSummary | null;
  mutationWorkspaceLease?: MutationWorkspaceLease | null;
  expectedChildThreadId?: string;
  childWorkflowPolicy?: SubagentLaunchChildWorkflowPolicyInput;
}): SubagentLaunchWorkspaceToolPolicy {
  const isolation = resolveSubagentLaunchWorktreeIsolation({
    parentWorkspacePath: input.parentThread.workspacePath,
    childWorktree: input.childWorktree,
    mutationWorkspaceLease: input.mutationWorkspaceLease,
    expectedChildThreadId: input.expectedChildThreadId,
  });
  const callableWorkflowBridge = resolveSubagentCallableWorkflowChildBridgePolicy({
    policy: input.childWorkflowPolicy,
    isolation,
  });
  return {
    schemaVersion: SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION,
    hardDeniedCategories: SUBAGENT_TOOL_SCOPE_LAUNCH_HARD_DENIED_CATEGORIES
      .filter((categoryId) => categoryId !== "workflow.call" || !callableWorkflowBridge.allowCallableWorkflowTools),
    approvalMode: input.requestedApprovalMode ?? "interactive",
    worktreeIsolated: isolation.isolated,
    allowNestedFanout: callableWorkflowBridge.allowCallableWorkflowTools,
    callableWorkflowBridge,
    parentPermissionMode: input.parentThread.permissionMode,
    worktreeIsolationStatus: isolation.status,
    worktreeIsolationReason: isolation.reason,
    ...(input.expectedChildThreadId ? { expectedChildThreadId: input.expectedChildThreadId } : {}),
    ...(input.childWorktree?.threadId ? { worktreeThreadId: input.childWorktree.threadId } : {}),
    ...(isolation.worktreePath ? { worktreePath: isolation.worktreePath } : {}),
    ...(input.mutationWorkspaceLease?.leaseId ? { mutationWorkspaceLeaseId: input.mutationWorkspaceLease.leaseId } : {}),
    ...(input.mutationWorkspaceLease?.kind ? { mutationWorkspaceLeaseKind: input.mutationWorkspaceLease.kind } : {}),
  };
}

function resolveSubagentCallableWorkflowChildBridgePolicy(input: {
  policy: SubagentLaunchChildWorkflowPolicyInput | undefined;
  isolation: { isolated: boolean };
}): SubagentCallableWorkflowChildBridgePolicy {
  const requested = input.policy?.allowCallableWorkflowTools === true;
  const nestedFanoutLimit = nonnegativeInteger(input.policy?.nestedFanoutLimit);
  const usedFanoutCount = nonnegativeInteger(input.policy?.usedFanoutCount);
  const remainingFanout = Math.max(0, nestedFanoutLimit - usedFanoutCount);
  const allowedToolNames = normalizeCallableWorkflowToolNames(input.policy?.allowedToolNames);
  if (!requested) {
    return {
      allowCallableWorkflowTools: false,
      nestedFanoutLimit,
      remainingFanout,
      allowedToolNames,
      reason: "Callable workflow child bridge is disabled by child role policy.",
    };
  }
  if (!input.isolation.isolated) {
    return {
      allowCallableWorkflowTools: false,
      nestedFanoutLimit,
      remainingFanout,
      allowedToolNames,
      reason: "Callable workflow child bridge requires an active isolated child worktree.",
    };
  }
  if (nestedFanoutLimit <= 0 || remainingFanout <= 0) {
    return {
      allowCallableWorkflowTools: false,
      nestedFanoutLimit,
      remainingFanout,
      allowedToolNames,
      reason: "Callable workflow child bridge is unavailable because the nested fanout limit is exhausted.",
    };
  }
  return {
    allowCallableWorkflowTools: true,
    nestedFanoutLimit,
    remainingFanout,
    allowedToolNames,
    reason: `Callable workflow child bridge allowed by role policy with ${remainingFanout} nested fanout ${remainingFanout === 1 ? "slot" : "slots"} remaining.`,
  };
}

function resolveSubagentLaunchWorktreeIsolation(input: {
  parentWorkspacePath?: string;
  childWorktree?: ThreadWorktreeSummary | null;
  mutationWorkspaceLease?: MutationWorkspaceLease | null;
  expectedChildThreadId?: string;
}): { isolated: boolean; status: SubagentWorktreeIsolationStatus; reason: string; worktreePath?: string } {
  const lease = input.mutationWorkspaceLease;
  if (lease?.status === "active" && !pathsEqual(lease.rootPath, input.parentWorkspacePath)) {
    return {
      isolated: true,
      status: "isolated",
      reason: `Active ${lease.kind} mutation workspace lease ${lease.leaseId} is separate from the parent workspace.`,
      worktreePath: lease.rootPath,
    };
  }
  const worktree = input.childWorktree;
  if (!worktree) {
    return {
      isolated: false,
      status: "missing",
      reason: "No child worktree was reserved for launch.",
    };
  }
  if (worktree.status !== "active") {
    return {
      isolated: false,
      status: "inactive",
      reason: `Child worktree status is ${worktree.status}.`,
    };
  }
  if (input.expectedChildThreadId && worktree.threadId !== input.expectedChildThreadId) {
    return {
      isolated: false,
      status: "mismatched_child_thread",
      reason: `Active worktree belongs to thread ${worktree.threadId}, not expected child thread ${input.expectedChildThreadId}.`,
    };
  }
  if (pathsEqual(worktree.worktreePath, input.parentWorkspacePath)) {
    return {
      isolated: false,
      status: "parent_workspace",
      reason: "Active child worktree path matches the parent workspace path.",
    };
  }
  return {
    isolated: true,
    status: "isolated",
    reason: "Active child worktree belongs to the expected child thread and is separate from the parent workspace.",
    worktreePath: worktree.worktreePath,
  };
}

export function resolveSubagentToolScopeLaunchDenial(input: {
  scope: SubagentToolScopeResolution;
  requestedToolScope: SubagentTaskToolRequest;
}): SubagentToolScopeLaunchDenial | undefined {
  const explicitToolRequest = subagentToolScopeRequestIsExplicit(input.requestedToolScope);
  const hardBlock = input.scope.deniedCategories.find((category) =>
    category.id === "workspace.write" || category.id === "workflow.call" || category.id === "subagent.spawn"
  );
  if (hardBlock) {
    return buildLaunchDenial({
      scope: input.scope,
      kind: "phase4_isolation_required",
      explicitToolRequest,
      reason: `Sub-agent role/tool scope is not launchable in Phase 4 without additional isolation: ${hardBlock.id} (${hardBlock.reason})`,
    });
  }
  if (explicitToolRequest && (input.scope.deniedCategories.length || input.scope.deniedTools.length)) {
    const categoryReasons = input.scope.deniedCategories.map((category) => `${category.id}: ${category.reason}`);
    const sourceReasons = input.scope.deniedTools.map((tool) => `${tool.source}:${tool.id}: ${tool.reason}`);
    const reasons = [...categoryReasons, ...sourceReasons].join("; ");
    return buildLaunchDenial({
      scope: input.scope,
      kind: "requested_scope_denied",
      explicitToolRequest,
      reason: `Requested sub-agent tool scope was denied: ${reasons}`,
    });
  }
  return undefined;
}

export function resolveSubagentChildAuthorityProfile(input: {
  parentThread: Pick<{ id: string; permissionMode: PermissionMode; workspacePath?: string }, "id" | "permissionMode" | "workspacePath">;
  childRun: Pick<{ id: string; childThreadId: string; canonicalTaskPath: string }, "id" | "childThreadId" | "canonicalTaskPath">;
  roleId: string;
  requestedToolScope: SubagentTaskToolRequest;
  scope: SubagentToolScopeResolution;
  workspacePolicy: SubagentLaunchWorkspaceToolPolicy;
}): SubagentChildAuthorityProfile {
  const request = input.requestedToolScope.childAuthority;
  const taskIntent = request?.taskIntent ?? "role_default";
  const piVisible = new Set(input.scope.piVisibleCategories);
  const browserVisible = piVisible.has("browser.read") || piVisible.has("browser.interactive");
  const readRoots = authorityReadRoots(request, input.parentThread.workspacePath);
  const writeDecision = authorityWriteDecision(request, piVisible, input.workspacePolicy);
  const writeRootBase = writeDecision === "allow_isolated_worktree"
    ? input.workspacePolicy.worktreePath
    : input.parentThread.workspacePath;
  const writeRoots = writeDecision === "allow" || writeDecision === "allow_isolated_worktree"
    ? authorityRoots(request?.writeRoots, writeRootBase)
    : [];
  const deniedWriteRoots = writeDecision === "deny"
    ? (authorityRoots(request?.writeRoots, input.parentThread.workspacePath).length ? authorityRoots(request?.writeRoots, input.parentThread.workspacePath) : ["*"])
    : [];
  return {
    schemaVersion: SUBAGENT_CHILD_AUTHORITY_PROFILE_SCHEMA_VERSION,
    childRunId: input.childRun.id,
    childThreadId: input.childRun.childThreadId,
    canonicalTaskPath: input.childRun.canonicalTaskPath,
    roleId: input.roleId,
    taskIntent,
    rationale: request?.rationale ?? defaultChildAuthorityRationale(taskIntent),
    outerEnvelope: {
      parentThreadId: input.parentThread.id,
      parentPermissionMode: input.parentThread.permissionMode,
      ...(input.parentThread.workspacePath ? { parentWorkspacePath: input.parentThread.workspacePath } : {}),
      approvalMode: input.workspacePolicy.approvalMode,
      worktreeIsolationStatus: input.workspacePolicy.worktreeIsolationStatus,
    },
    resourceScopes: {
      filesystem: {
        readRoots,
        writeRoots,
        deniedWriteRoots,
        readDecision: readRoots.length || piVisible.has("workspace.read") || piVisible.has("artifact.read") || piVisible.has("long-context.read")
          ? "allow"
          : "ask_parent",
        writeDecision,
      },
      browser: {
        domains: dedupeAuthorityStrings(request?.browserDomains),
        networkDecision: browserVisible ? request?.network ?? "ask_parent" : "deny",
      },
      connectors: {
        methods: dedupeAuthorityStrings(request?.connectorMethods),
        decision: piVisible.has("connector.read") || piVisible.has("connector.write")
          ? request?.network ?? "ask_parent"
          : "deny",
      },
      nestedFanout: {
        decision: nestedFanoutAuthorityDecision(request, input.workspacePolicy, piVisible),
        remainingFanout: input.workspacePolicy.callableWorkflowBridge?.remainingFanout ?? 0,
      },
    },
    toolCategoryPolicy: {
      piVisibleCategories: input.scope.piVisibleCategories,
      loadedCategories: input.scope.loadedCategories,
      deniedCategories: input.scope.deniedCategories,
    },
    approvalRouting: {
      route: "parent",
      mode: input.workspacePolicy.approvalMode,
      childThreadId: input.childRun.childThreadId,
    },
    hardDenies: input.workspacePolicy.hardDeniedCategories,
  };
}

export function subagentToolScopeRequestIsExplicit(request: SubagentTaskToolRequest): boolean {
  return Boolean(request.requestedCategories?.length || request.requestedSources?.length || request.requestedFanout);
}

function buildLaunchDenial(input: {
  scope: SubagentToolScopeResolution;
  kind: SubagentToolScopeLaunchDenialKind;
  reason: string;
  explicitToolRequest: boolean;
}): SubagentToolScopeLaunchDenial {
  return {
    schemaVersion: SUBAGENT_TOOL_SCOPE_LAUNCH_POLICY_SCHEMA_VERSION,
    kind: input.kind,
    reason: input.reason,
    explicitToolRequest: input.explicitToolRequest,
    deniedCategoryIds: uniqueDeniedCategoryIds(input.scope.deniedCategories),
    deniedToolIds: uniqueDeniedToolIds(input.scope.deniedTools),
  };
}

function uniqueDeniedCategoryIds(denials: SubagentToolScopeResolution["deniedCategories"]): SubagentToolCategoryId[] {
  return [...new Set(denials.map((denial) => denial.id))];
}

function uniqueDeniedToolIds(denials: SubagentToolScopeDenial[]): string[] {
  return [...new Set(denials.map((denial) => `${denial.source}:${denial.id}`))];
}

function authorityReadRoots(
  request: SubagentChildAuthorityRequest | undefined,
  parentWorkspacePath: string | undefined,
): string[] {
  const requested = authorityRoots(request?.readRoots, parentWorkspacePath);
  if (requested.length) return requested;
  return parentWorkspacePath ? [parentWorkspacePath] : [];
}

function authorityRoots(values: readonly string[] | undefined, basePath: string | undefined): string[] {
  return dedupeAuthorityStrings(values).map((value) =>
    isAbsolute(value) || !basePath ? normalizePath(value) ?? value : resolve(basePath, value)
  );
}

function authorityWriteDecision(
  request: SubagentChildAuthorityRequest | undefined,
  piVisible: ReadonlySet<SubagentToolCategoryId>,
  workspacePolicy: SubagentLaunchWorkspaceToolPolicy,
): SubagentChildAuthorityDecision {
  if (request?.mutation === "allow_isolated_worktree") {
    return workspacePolicy.worktreeIsolated && piVisible.has("workspace.write")
      ? "allow_isolated_worktree"
      : "ask_parent";
  }
  if (request?.mutation) return request.mutation;
  if (piVisible.has("workspace.write")) return workspacePolicy.worktreeIsolated ? "allow_isolated_worktree" : "ask_parent";
  return "deny";
}

function nestedFanoutAuthorityDecision(
  request: SubagentChildAuthorityRequest | undefined,
  workspacePolicy: SubagentLaunchWorkspaceToolPolicy,
  piVisible: ReadonlySet<SubagentToolCategoryId>,
): "allow" | "ask_parent" | "deny" {
  if (request?.nestedFanout) return request.nestedFanout;
  if (workspacePolicy.allowNestedFanout && piVisible.has("subagent.spawn")) return "allow";
  return "deny";
}

function defaultChildAuthorityRationale(taskIntent: SubagentChildAuthorityProfile["taskIntent"]): string {
  if (taskIntent === "file_read") return "Read-only child task; grant only file/artifact/long-context read authority needed for delegated reading.";
  if (taskIntent === "analysis") return "Analysis child task; allow non-mutating evidence gathering within the parent authority envelope without browser control.";
  if (taskIntent === "web_research") return "Brokered web-research child task; use web_research provider tools and keep managed browser fallback disabled unless explicitly granted.";
  if (taskIntent === "mutation") return "Mutation-capable child task; require isolated worktree and explicit approval evidence before writes.";
  if (taskIntent === "workflow") return "Workflow child task; use role-gated workflow and nested fanout policy.";
  if (taskIntent === "connector") return "Connector child task; use exact connector methods and parent approval routing.";
  return "Child authority follows the resolved role defaults and parent authority envelope.";
}

function dedupeAuthorityStrings(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function normalizeCallableWorkflowToolNames(toolNames: readonly string[] | undefined): string[] {
  return [...new Set((toolNames ?? [])
    .map((toolName) => toolName.trim())
    .filter((toolName) => /^ambient_workflow_(?:symphony|recorded)_[A-Za-z0-9_]+$/.test(toolName)))];
}

function nonnegativeInteger(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined) return 0;
  return Math.max(0, Math.floor(value));
}

function pathsEqual(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizePath(left);
  const normalizedRight = normalizePath(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function normalizePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/[\\/]+$/, "");
}
