import type { AmbientModelRuntimeProfile } from "./ambientModels";
import type { SubagentRoleProfile } from "./subagentRoles";

export type SubagentToolCategoryId =
  | "workspace.read"
  | "workspace.write"
  | "test.run"
  | "artifact.read"
  | "artifact.write"
  | "browser.read"
  | "browser.interactive"
  | "long-context.read"
  | "connector.read"
  | "connector.write"
  | "mcp.direct"
  | "secrets.read"
  | "workflow.call"
  | "subagent.spawn";

export type SubagentToolScopeSource =
  | "built_in"
  | "extension_load"
  | "extension_tool"
  | "direct_mcp"
  | "connector_app"
  | "callable_workflow"
  | "skill"
  | "fanout";

export type SubagentChildAuthorityTaskIntent =
  | "file_read"
  | "analysis"
  | "web_research"
  | "mutation"
  | "workflow"
  | "connector"
  | "custom";

export type SubagentChildAuthorityDecision = "allow" | "ask_parent" | "deny" | "allow_isolated_worktree";

export interface SubagentChildAuthorityRequest {
  taskIntent?: SubagentChildAuthorityTaskIntent;
  rationale?: string;
  readRoots?: string[];
  writeRoots?: string[];
  browserDomains?: string[];
  connectorMethods?: string[];
  network?: Extract<SubagentChildAuthorityDecision, "allow" | "ask_parent" | "deny">;
  mutation?: SubagentChildAuthorityDecision;
  nestedFanout?: Extract<SubagentChildAuthorityDecision, "allow" | "ask_parent" | "deny">;
}

export interface SubagentToolCategory {
  id: SubagentToolCategoryId;
  label: string;
  mutatesState: boolean;
  requiresToolUse: boolean;
  requiresApproval: boolean;
  piVisibleByDefault: boolean;
}

export interface SubagentTaskToolRequest {
  requestedCategories?: SubagentToolCategoryId[];
  requestedSources?: SubagentToolScopeSourceRequest[];
  requestedFanout?: boolean;
  childAuthority?: SubagentChildAuthorityRequest;
}

export interface SubagentWorkspaceToolPolicy {
  hardDeniedCategories: SubagentToolCategoryId[];
  approvalMode: "interactive" | "non_interactive";
  worktreeIsolated: boolean;
  allowNestedFanout: boolean;
  callableWorkflowBridge?: SubagentCallableWorkflowChildBridgePolicy;
}

export interface SubagentCallableWorkflowChildBridgePolicy {
  allowCallableWorkflowTools: boolean;
  nestedFanoutLimit: number;
  remainingFanout: number;
  allowedToolNames: string[];
  reason?: string;
}

export interface SubagentToolScopeResolution {
  schemaVersion: "ambient-subagent-tool-scope-v1";
  loadedCategories: SubagentToolCategoryId[];
  piVisibleCategories: SubagentToolCategoryId[];
  deniedCategories: Array<{
    id: SubagentToolCategoryId;
    reason: string;
  }>;
  loadedTools: SubagentToolScopeGrant[];
  piVisibleTools: SubagentToolScopeGrant[];
  deniedTools: SubagentToolScopeDenial[];
  approvalMode: SubagentWorkspaceToolPolicy["approvalMode"];
  worktreeIsolated: boolean;
  fanoutAvailable: boolean;
}

export interface SubagentToolScopeSourceRequest {
  source: SubagentToolScopeSource;
  id: string;
  categoryId?: SubagentToolCategoryId;
  piVisible?: boolean;
}

export interface SubagentToolScopeGrant {
  source: SubagentToolScopeSource;
  id: string;
  categoryId?: SubagentToolCategoryId;
  piVisible: boolean;
  mutatesState: boolean;
  requiresApproval: boolean;
}

export interface SubagentToolScopeDenial {
  source: SubagentToolScopeSource;
  id: string;
  categoryId?: SubagentToolCategoryId;
  reason: string;
}

export const SUBAGENT_TOOL_CATEGORIES: SubagentToolCategory[] = [
  { id: "workspace.read", label: "Workspace read", mutatesState: false, requiresToolUse: true, requiresApproval: false, piVisibleByDefault: true },
  { id: "workspace.write", label: "Workspace write", mutatesState: true, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: true },
  { id: "test.run", label: "Test run", mutatesState: false, requiresToolUse: true, requiresApproval: false, piVisibleByDefault: true },
  { id: "artifact.read", label: "Artifact read", mutatesState: false, requiresToolUse: false, requiresApproval: false, piVisibleByDefault: true },
  { id: "artifact.write", label: "Artifact write", mutatesState: true, requiresToolUse: false, requiresApproval: false, piVisibleByDefault: true },
  { id: "browser.read", label: "Browser read", mutatesState: false, requiresToolUse: true, requiresApproval: false, piVisibleByDefault: true },
  { id: "browser.interactive", label: "Interactive browser", mutatesState: true, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: true },
  { id: "long-context.read", label: "Long-context read", mutatesState: false, requiresToolUse: true, requiresApproval: false, piVisibleByDefault: true },
  { id: "connector.read", label: "Connector read", mutatesState: false, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: true },
  { id: "connector.write", label: "Connector write", mutatesState: true, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: true },
  { id: "mcp.direct", label: "Direct MCP", mutatesState: true, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: false },
  { id: "secrets.read", label: "Secret access", mutatesState: false, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: false },
  { id: "workflow.call", label: "Callable workflow", mutatesState: false, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: false },
  { id: "subagent.spawn", label: "Nested sub-agent fanout", mutatesState: false, requiresToolUse: true, requiresApproval: true, piVisibleByDefault: false },
];

const CATEGORY_BY_ID = new Map(SUBAGENT_TOOL_CATEGORIES.map((category) => [category.id, category]));
const MAX_SOURCE_ID_CHARS = 160;
const SOURCE_ID_PATTERN = /^[A-Za-z0-9._:/@+-]+$/;
const DIRECT_MCP_OPERATION_ID_PATTERN = /^[A-Za-z0-9._:@+-]+\/[A-Za-z0-9._:@+-]+$/;
const CONNECTOR_OPERATION_ID_PATTERN = /^[A-Za-z0-9_@+-][A-Za-z0-9._:@+-]*\.[A-Za-z0-9_@+-][A-Za-z0-9._:@+-]*$/;
const CALLABLE_WORKFLOW_TOOL_ID_PATTERN = /^ambient_workflow_(?:symphony|recorded)_[A-Za-z0-9_]+$/;
const NON_PI_CALLABLE_SOURCES = new Set<SubagentToolScopeSource>(["extension_load", "skill", "fanout"]);
const NON_PI_CALLABLE_SOURCE_REASON =
  "Tool source loads context or capability metadata but is not a Pi-callable tool; surface exact callable tools separately.";
const UNSUPPORTED_CHILD_BRIDGE_PI_VISIBLE_SOURCES = new Set<SubagentToolScopeSource>(["connector_app", "direct_mcp"]);
const UNSUPPORTED_CHILD_BRIDGE_PI_VISIBLE_SOURCE_REASON =
  "Direct MCP and connector/app child tools are not Pi-callable until Ambient provides a child-safe bridge; keep the exact source non-visible or use a surfaced extension tool.";
const CALLABLE_WORKFLOW_CHILD_BRIDGE_PI_VISIBLE_SOURCE_REASON =
  "Callable workflow tools are not Pi-callable in child sessions until Ambient provides an explicit child-safe workflow bridge; keep the exact workflow non-visible or run it from the parent.";
const TASK_INTENT_ALLOWED_CATEGORY_IDS: Partial<Record<SubagentChildAuthorityTaskIntent, readonly SubagentToolCategoryId[]>> = {
  file_read: ["workspace.read", "artifact.read", "long-context.read"],
  analysis: ["workspace.read", "test.run", "artifact.read", "long-context.read", "connector.read"],
  web_research: ["workspace.read", "artifact.read", "connector.read"],
  workflow: ["workspace.read", "artifact.read", "long-context.read", "workflow.call", "subagent.spawn"],
  connector: ["artifact.read", "connector.read", "connector.write"],
};
const SECRET_LIKE_SOURCE_ID_PATTERNS = [
  /(?:^|[/:@._+-])(?:sk-[A-Za-z0-9_-]{16,}|gmi_[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})(?:$|[/:@._+-])/i,
  /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?key|authorization|password|passwd|pwd|credential)[_:/+-][A-Za-z0-9._:@+-]{16,}/i,
];

function requireCategory(id: string): SubagentToolCategory {
  const category = CATEGORY_BY_ID.get(id as SubagentToolCategoryId);
  if (!category) throw new Error(`Unknown sub-agent tool category: ${id}`);
  return category;
}

function categoryDenyReason(input: {
  category: SubagentToolCategory;
  role: SubagentRoleProfile;
  model: AmbientModelRuntimeProfile;
  workspacePolicy: SubagentWorkspaceToolPolicy;
  childAuthority?: SubagentChildAuthorityRequest;
  candidateCategories?: ReadonlySet<SubagentToolCategoryId>;
  allowedByRole: Set<SubagentToolCategoryId>;
  deniedByRole: Set<SubagentToolCategoryId>;
  hardDenied: Set<SubagentToolCategoryId>;
}): string | undefined {
  const { category } = input;
  if (input.hardDenied.has(category.id)) return "Denied by workspace or parent hard policy.";
  if (input.deniedByRole.has(category.id)) return "Denied by the selected sub-agent role.";
  if (!input.allowedByRole.has(category.id)) return "Requested task capability is outside the selected role.";
  if (category.requiresToolUse && input.model.toolUse === "none") return "Selected model profile does not support tool use.";
  const explicitBrowserInteractiveAuthority = category.id === "browser.interactive"
    && childAuthorityExplicitlyRequestsBrowserNetwork(input.childAuthority);
  if (category.id === "browser.interactive" && !explicitBrowserInteractiveAuthority) {
    return "Interactive browser tools require explicit child browser network authority.";
  }
  if (!explicitBrowserInteractiveAuthority) {
    if (category.mutatesState && input.role.mutationPolicy === "forbidden") return "Selected role forbids mutation.";
    if (category.mutatesState && input.role.mutationPolicy === "read_only") return "Selected role is read-only.";
    if (category.mutatesState && input.role.mutationPolicy === "requires_isolated_worktree" && !input.workspacePolicy.worktreeIsolated) {
      return "Mutating child requires an approved isolated worktree.";
    }
  }
  if (
    category.requiresApproval
    && input.workspacePolicy.approvalMode === "non_interactive"
    && !nonInteractiveApprovalAllowedByChildAuthority(input)
  ) {
    return "Capability requires interactive approval, but this launch is non-interactive.";
  }
  const taskIntentReason = explicitBrowserInteractiveAuthority
    ? undefined
    : taskIntentCategoryDenyReason(category, input.childAuthority?.taskIntent);
  if (taskIntentReason) return taskIntentReason;
  const brokeredWebResearchReason = brokeredWebResearchBrowserDenyReason({
    category,
    childAuthority: input.childAuthority,
    candidateCategories: input.candidateCategories,
  });
  if (brokeredWebResearchReason) return brokeredWebResearchReason;
  if ((category.id === "subagent.spawn" || category.id === "workflow.call") &&
    (input.role.nestedFanout === "disabled" || !input.workspacePolicy.allowNestedFanout)) {
    return category.id === "workflow.call"
      ? "Nested workflow fanout is disabled for this role or workspace."
      : "Nested sub-agent fanout is disabled for this role or workspace.";
  }
  if (category.id === "workflow.call") {
    const bridgeReason = callableWorkflowBridgeDenyReason(input.workspacePolicy.callableWorkflowBridge);
    if (bridgeReason) return bridgeReason;
  }
  return undefined;
}

function nonInteractiveApprovalAllowedByChildAuthority(input: {
  category: SubagentToolCategory;
  workspacePolicy: SubagentWorkspaceToolPolicy;
  childAuthority?: SubagentChildAuthorityRequest;
}): boolean {
  return input.category.id === "workspace.write"
    && input.workspacePolicy.worktreeIsolated
    && input.childAuthority?.mutation === "allow_isolated_worktree";
}

function taskIntentCategoryDenyReason(
  category: SubagentToolCategory,
  taskIntent: SubagentChildAuthorityTaskIntent | undefined,
): string | undefined {
  if (!taskIntent || taskIntent === "custom" || taskIntent === "mutation") return undefined;
  const allowed = TASK_INTENT_ALLOWED_CATEGORY_IDS[taskIntent];
  if (!allowed || allowed.includes(category.id)) return undefined;
  return `Denied by child task intent ${taskIntent}; allowed categories: ${allowed.join(", ")}.`;
}

function brokeredWebResearchBrowserDenyReason(input: {
  category: SubagentToolCategory;
  childAuthority?: SubagentChildAuthorityRequest;
  candidateCategories?: ReadonlySet<SubagentToolCategoryId>;
}): string | undefined {
  if (input.category.id !== "browser.read") return undefined;
  if (!input.candidateCategories?.has("connector.read")) return undefined;
  if (childAuthorityExplicitlyRequestsBrowserNetwork(input.childAuthority)) return undefined;
  return "Browser read is denied for ordinary brokered web research; use connector.read/web_research tools unless the parent explicitly grants child browser network authority.";
}

function childAuthorityExplicitlyRequestsBrowserNetwork(
  childAuthority: SubagentChildAuthorityRequest | undefined,
): boolean {
  if (!childAuthority || childAuthority.network === "deny") return false;
  if (childAuthority.network === "allow" || childAuthority.network === "ask_parent") return true;
  if (childAuthority.taskIntent === "custom") return true;
  return Boolean(childAuthority.browserDomains?.length);
}

function sourceDefaultPiVisible(source: SubagentToolScopeSource, category?: SubagentToolCategory): boolean {
  if (source === "extension_load" || source === "direct_mcp" || source === "skill" || source === "fanout") return false;
  return Boolean(category?.piVisibleByDefault);
}

function callableWorkflowBridgeDenyReason(
  bridge: SubagentCallableWorkflowChildBridgePolicy | undefined,
): string | undefined {
  if (!bridge) return CALLABLE_WORKFLOW_CHILD_BRIDGE_PI_VISIBLE_SOURCE_REASON;
  if (!bridge.allowCallableWorkflowTools) return bridge.reason ?? CALLABLE_WORKFLOW_CHILD_BRIDGE_PI_VISIBLE_SOURCE_REASON;
  if (!positiveCount(bridge.nestedFanoutLimit) || !positiveCount(bridge.remainingFanout)) {
    return bridge.reason ?? "Callable workflow child bridge is unavailable because the nested fanout limit is exhausted.";
  }
  return undefined;
}

function callableWorkflowSourceDenyReason(input: {
  source: SubagentToolScopeSource;
  id: string;
  workspacePolicy: SubagentWorkspaceToolPolicy;
}): string | undefined {
  if (input.source !== "callable_workflow") return undefined;
  const bridgeReason = callableWorkflowBridgeDenyReason(input.workspacePolicy.callableWorkflowBridge);
  if (bridgeReason) return bridgeReason;
  const allowedToolNames = input.workspacePolicy.callableWorkflowBridge?.allowedToolNames ?? [];
  if (allowedToolNames.length > 0 && !allowedToolNames.includes(input.id)) {
    return "Callable workflow tool is outside the child role policy allowlist.";
  }
  return undefined;
}

function piVisibilityDenyReason(input: {
  source: SubagentToolScopeSource;
  id: string;
  piVisible: boolean;
  workspacePolicy: SubagentWorkspaceToolPolicy;
}): string | undefined {
  const callableWorkflowDenyReason = callableWorkflowSourceDenyReason(input);
  if (callableWorkflowDenyReason) return callableWorkflowDenyReason;
  if (!input.piVisible) return undefined;
  if (NON_PI_CALLABLE_SOURCES.has(input.source)) return NON_PI_CALLABLE_SOURCE_REASON;
  if (UNSUPPORTED_CHILD_BRIDGE_PI_VISIBLE_SOURCES.has(input.source)) {
    return UNSUPPORTED_CHILD_BRIDGE_PI_VISIBLE_SOURCE_REASON;
  }
  return undefined;
}

function dedupeSourceRequests(requests: SubagentToolScopeSourceRequest[]): SubagentToolScopeSourceRequest[] {
  const seen = new Set<string>();
  const deduped: SubagentToolScopeSourceRequest[] = [];
  for (const request of requests) {
    const id = normalizeSubagentToolScopeSourceRequestIdForSource(request.source, request.id);
    const key = `${request.source}:${id}:${request.categoryId ?? ""}:${request.piVisible ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...request, id });
  }
  return deduped;
}

export function normalizeSubagentToolScopeSourceRequestId(rawId: unknown): string {
  if (typeof rawId !== "string") throw new Error("Sub-agent tool source request id must be a string.");
  const id = rawId.trim();
  if (!id) throw new Error("Sub-agent tool source request is missing an id.");
  if (id.length > MAX_SOURCE_ID_CHARS) {
    throw new Error(`Sub-agent tool source request id exceeds ${MAX_SOURCE_ID_CHARS} characters.`);
  }
  if (id.includes("*")) {
    throw new Error("Sub-agent tool source request ids must not use wildcard grants.");
  }
  if (!SOURCE_ID_PATTERN.test(id)) {
    throw new Error("Sub-agent tool source request id contains unsupported characters.");
  }
  if (sourceRequestIdLooksSecretLike(id)) {
    throw new Error("Sub-agent tool source request id appears to contain secret-like material.");
  }
  return id;
}

export function normalizeSubagentToolScopeSourceRequestIdForSource(
  source: SubagentToolScopeSource,
  rawId: unknown,
): string {
  const id = normalizeSubagentToolScopeSourceRequestId(rawId);
  if (source === "direct_mcp" && !DIRECT_MCP_OPERATION_ID_PATTERN.test(id)) {
    throw new Error("Direct MCP tool source ids must use exact server/tool operation ids.");
  }
  if (source === "connector_app" && !CONNECTOR_OPERATION_ID_PATTERN.test(id)) {
    throw new Error("Connector tool source ids must use exact connector.operation ids.");
  }
  if (source === "callable_workflow" && !CALLABLE_WORKFLOW_TOOL_ID_PATTERN.test(id)) {
    throw new Error("Callable workflow tool source ids must use exact ambient_workflow_symphony_* or ambient_workflow_recorded_* tool names.");
  }
  return id;
}

function sourceRequestIdLooksSecretLike(id: string): boolean {
  return SECRET_LIKE_SOURCE_ID_PATTERNS.some((pattern) => pattern.test(id));
}

export function resolveSubagentToolScope(input: {
  role: SubagentRoleProfile;
  model: AmbientModelRuntimeProfile;
  task?: SubagentTaskToolRequest;
  workspacePolicy: SubagentWorkspaceToolPolicy;
}): SubagentToolScopeResolution {
  const allowedByRole = new Set(input.role.allowedToolCategories.map((id) => requireCategory(id).id));
  const deniedByRole = new Set(input.role.deniedToolCategories.map((id) => requireCategory(id).id));
  const hardDenied = new Set(input.workspacePolicy.hardDeniedCategories);
  const requestedSources = dedupeSourceRequests(input.task?.requestedSources ?? []);
  const requestedFanout = Boolean(input.task?.requestedFanout);
  const requested = input.task?.requestedCategories?.length ? new Set(input.task.requestedCategories.map((id) => requireCategory(id).id)) : undefined;
  const hasSourceRequest = requestedSources.length > 0 || requestedFanout;
  const defaultByRole = input.role.defaultToolCategories?.length
    ? new Set(input.role.defaultToolCategories.map((id) => requireCategory(id).id))
    : allowedByRole;
  const candidates = requested ?? (hasSourceRequest ? new Set<SubagentToolCategoryId>() : defaultByRole);
  const loadedCategories: SubagentToolCategoryId[] = [];
  const piVisibleCategories: SubagentToolCategoryId[] = [];
  const deniedCategories: SubagentToolScopeResolution["deniedCategories"] = [];
  const loadedTools: SubagentToolScopeGrant[] = [];
  const piVisibleTools: SubagentToolScopeGrant[] = [];
  const deniedTools: SubagentToolScopeDenial[] = [];

  const loadedCategorySet = new Set<SubagentToolCategoryId>();
  const piVisibleCategorySet = new Set<SubagentToolCategoryId>();
  const deniedCategorySet = new Set<SubagentToolCategoryId>();
  const loadedToolSet = new Set<string>();

  const addDeniedCategory = (id: SubagentToolCategoryId, reason: string): void => {
    if (deniedCategorySet.has(id)) return;
    deniedCategorySet.add(id);
    deniedCategories.push({ id, reason });
  };

  const addLoadedCategory = (id: SubagentToolCategoryId): void => {
    if (loadedCategorySet.has(id)) return;
    loadedCategorySet.add(id);
    loadedCategories.push(id);
  };

  const addPiVisibleCategory = (id: SubagentToolCategoryId): void => {
    if (piVisibleCategorySet.has(id)) return;
    piVisibleCategorySet.add(id);
    piVisibleCategories.push(id);
  };

  const addGrant = (grant: SubagentToolScopeGrant): void => {
    const key = `${grant.source}:${grant.id}:${grant.categoryId ?? ""}`;
    if (loadedToolSet.has(key)) return;
    loadedToolSet.add(key);
    loadedTools.push(grant);
    if (grant.categoryId) addLoadedCategory(grant.categoryId);
    if (!grant.piVisible) return;
    piVisibleTools.push(grant);
    if (grant.categoryId) addPiVisibleCategory(grant.categoryId);
  };

  const addDenial = (denial: SubagentToolScopeDenial): void => {
    deniedTools.push(denial);
    if (denial.categoryId) addDeniedCategory(denial.categoryId, denial.reason);
  };

  const evaluateCategorySource = (request: SubagentToolScopeSourceRequest): void => {
    if (!request.categoryId) {
      addDenial({
        source: request.source,
        id: request.id,
        reason: "Tool source request is missing categoryId, so Ambient cannot apply role/model/workspace policy.",
      });
      return;
    }
    const category = requireCategory(request.categoryId);
    const denyReason = categoryDenyReason({
      category,
      role: input.role,
      model: input.model,
      workspacePolicy: input.workspacePolicy,
      childAuthority: input.task?.childAuthority,
      candidateCategories: candidates,
      allowedByRole,
      deniedByRole,
      hardDenied,
    });
    if (denyReason) {
      addDenial({ source: request.source, id: request.id, categoryId: category.id, reason: denyReason });
      return;
    }
    const sourceDenyReason = callableWorkflowSourceDenyReason({
      source: request.source,
      id: request.id,
      workspacePolicy: input.workspacePolicy,
    });
    if (sourceDenyReason) {
      addDenial({ source: request.source, id: request.id, categoryId: category.id, reason: sourceDenyReason });
      return;
    }
    const piVisible = request.piVisible ?? sourceDefaultPiVisible(request.source, category);
    const visibilityDenyReason = piVisibilityDenyReason({
      source: request.source,
      id: request.id,
      piVisible,
      workspacePolicy: input.workspacePolicy,
    });
    if (visibilityDenyReason) {
      addDenial({ source: request.source, id: request.id, categoryId: category.id, reason: visibilityDenyReason });
      return;
    }
    addGrant({
      source: request.source,
      id: request.id,
      categoryId: category.id,
      piVisible,
      mutatesState: category.mutatesState,
      requiresApproval: category.requiresApproval,
    });
  };

  for (const category of SUBAGENT_TOOL_CATEGORIES) {
    if (!candidates.has(category.id)) continue;

    const denyReason = categoryDenyReason({
      category,
      role: input.role,
      model: input.model,
      workspacePolicy: input.workspacePolicy,
      childAuthority: input.task?.childAuthority,
      candidateCategories: candidates,
      allowedByRole,
      deniedByRole,
      hardDenied,
    });
    if (denyReason) {
      addDenial({ source: "built_in", id: category.id, categoryId: category.id, reason: denyReason });
      continue;
    }

    addGrant({
      source: "built_in",
      id: category.id,
      categoryId: category.id,
      piVisible: category.piVisibleByDefault,
      mutatesState: category.mutatesState,
      requiresApproval: category.requiresApproval,
    });
  }

  for (const request of requestedSources) {
    if (request.source === "skill") {
      if (!input.role.inheritSkills) {
        addDenial({
          source: "skill",
          id: request.id,
          categoryId: request.categoryId,
          reason: "Selected sub-agent role does not inherit skills.",
        });
        continue;
      }
      const category = request.categoryId ? requireCategory(request.categoryId) : undefined;
      if (category) {
        const denyReason = categoryDenyReason({
          category,
          role: input.role,
          model: input.model,
          workspacePolicy: input.workspacePolicy,
          childAuthority: input.task?.childAuthority,
          candidateCategories: candidates,
          allowedByRole,
          deniedByRole,
          hardDenied,
        });
        if (denyReason) {
          addDenial({ source: "skill", id: request.id, categoryId: category.id, reason: denyReason });
          continue;
        }
      }
      const piVisible = request.piVisible ?? false;
      const visibilityDenyReason = piVisibilityDenyReason({
        source: request.source,
        id: request.id,
        piVisible,
        workspacePolicy: input.workspacePolicy,
      });
      if (visibilityDenyReason) {
        addDenial({ source: "skill", id: request.id, categoryId: category?.id, reason: visibilityDenyReason });
        continue;
      }
      addGrant({
        source: "skill",
        id: request.id,
        categoryId: category?.id,
        piVisible,
        mutatesState: category?.mutatesState ?? false,
        requiresApproval: category?.requiresApproval ?? false,
      });
      continue;
    }
    evaluateCategorySource(request);
  }

  if (requestedFanout) {
    evaluateCategorySource({
      source: "fanout",
      id: "subagent.spawn",
      categoryId: "subagent.spawn",
      piVisible: false,
    });
  }

  return {
    schemaVersion: "ambient-subagent-tool-scope-v1",
    loadedCategories,
    piVisibleCategories,
    deniedCategories,
    loadedTools,
    piVisibleTools,
    deniedTools,
    approvalMode: input.workspacePolicy.approvalMode,
    worktreeIsolated: input.workspacePolicy.worktreeIsolated,
    fanoutAvailable: loadedCategories.includes("subagent.spawn"),
  };
}

function positiveCount(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
