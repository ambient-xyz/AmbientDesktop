import {
  isAmbientSubagentsEnabled,
  type AmbientFeatureFlagSnapshot,
} from "./featureFlags";
import {
  SUBAGENT_TOOL_CATEGORIES,
} from "./subagentToolScope";
import {
  SYMPHONY_WORKFLOW_PATTERN_IDS,
  type SymphonyWorkflowPatternId,
} from "./symphonyWorkflowRecipes";

export const SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION =
  "ambient-symphony-pattern-selection-v1" as const;
export const SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION =
  "ambient-symphony-mode-policy-snapshot-v1" as const;
export const SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION =
  "ambient-symphony-child-launch-policy-v1" as const;
export const SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION =
  "ambient-symphony-mutation-workspace-lease-v1" as const;
export const SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION =
  "ambient-symphony-web-capability-profile-v1" as const;
export const SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION =
  "ambient-symphony-child-decision-request-v1" as const;
export const SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION =
  "ambient-symphony-child-launch-contract-bundle-v1" as const;

export const SYMPHONY_PATTERN_CONFIDENCES = ["high", "medium", "low"] as const;
export const SYMPHONY_FAILURE_POLICIES = ["require_all", "allow_partial_with_user_decision"] as const;
export const SYMPHONY_PARENT_ALLOWED_ACTIONS = [
  "detect_pattern",
  "plan",
  "spawn_child",
  "inspect_run_graph",
  "inspect_child_evidence",
  "request_decision",
  "retry_child",
  "synthesize",
] as const;
export const SYMPHONY_WEB_CAPABILITY_KINDS = [
  "search",
  "static_fetch_extract",
  "dynamic_headless_browser",
  "interactive_browser",
] as const;
export const SYMPHONY_WEB_PROBE_STATUSES = ["untested", "passed", "failed", "degraded"] as const;
export const SYMPHONY_INTERACTIVE_BROWSER_FALLBACK_POLICIES = ["deny", "approval_required"] as const;
export const SYMPHONY_CHILD_MUTATION_POLICIES = ["none", "lease_required"] as const;
export const SYMPHONY_MUTATION_WORKSPACE_LEASE_KINDS = ["git_worktree", "scratch_overlay"] as const;
export const SYMPHONY_MUTATION_WORKSPACE_LEASE_STATUSES = [
  "acquiring",
  "active",
  "promoting",
  "released",
  "failed",
] as const;
export const SYMPHONY_CHILD_DECISION_REASONS = [
  "needs_approval",
  "captcha_blocked",
  "tool_scope_denied",
  "failed",
  "timed_out",
  "cancelled",
] as const;
export const SYMPHONY_CHILD_DECISION_OPTIONS = [
  "grant_scope",
  "retry_child",
  "retry_with_verifier",
  "accept_partial",
  "cancel_group",
  "exit_symphony_mode",
] as const;
export const SYMPHONY_MUTATING_TOOL_POLICY_IDS = [
  "workspace.write",
  "artifact.write",
  "browser.interactive",
  "connector.write",
  "mcp.direct",
] as const;

const SYMPHONY_TOOL_CATEGORY_POLICY_IDS = new Set<string>(SUBAGENT_TOOL_CATEGORIES.map((category) => category.id));
const SYMPHONY_MUTATING_TOOL_CATEGORY_IDS = new Set<string>(
  SUBAGENT_TOOL_CATEGORIES.filter((category) => category.mutatesState).map((category) => category.id),
);

export type SymphonyPatternConfidence = typeof SYMPHONY_PATTERN_CONFIDENCES[number];
export type SymphonyFailurePolicy = typeof SYMPHONY_FAILURE_POLICIES[number];
export type SymphonyParentAllowedAction = typeof SYMPHONY_PARENT_ALLOWED_ACTIONS[number];
export type SymphonyWebCapabilityKind = typeof SYMPHONY_WEB_CAPABILITY_KINDS[number];
export type SymphonyWebProbeStatus = typeof SYMPHONY_WEB_PROBE_STATUSES[number];
export type SymphonyInteractiveBrowserFallbackPolicy = typeof SYMPHONY_INTERACTIVE_BROWSER_FALLBACK_POLICIES[number];
export type SymphonyChildMutationPolicy = typeof SYMPHONY_CHILD_MUTATION_POLICIES[number];
export type SymphonyMutationWorkspaceLeaseKind = typeof SYMPHONY_MUTATION_WORKSPACE_LEASE_KINDS[number];
export type SymphonyMutationWorkspaceLeaseStatus = typeof SYMPHONY_MUTATION_WORKSPACE_LEASE_STATUSES[number];
export type SymphonyChildDecisionReason = typeof SYMPHONY_CHILD_DECISION_REASONS[number];
export type SymphonyChildDecisionOption = typeof SYMPHONY_CHILD_DECISION_OPTIONS[number];

export interface SymphonyPatternChildRolePlan {
  role: string;
  count: number;
  purpose: string;
}

export interface SymphonyPatternSelection {
  schemaVersion: typeof SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION;
  selectionId: string;
  parentRunId: string;
  pattern: SymphonyWorkflowPatternId;
  confidence: SymphonyPatternConfidence;
  childRolePlan: SymphonyPatternChildRolePlan[];
  requiredArtifacts: string[];
  reducerContract: string;
  failurePolicy: SymphonyFailurePolicy;
  tokenAndTimeBudget: {
    maxChildren: number;
    maxMinutes: number;
  };
}

export interface WebCapabilityProfile {
  schemaVersion: typeof SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION;
  providerId: string;
  supportedKinds: SymphonyWebCapabilityKind[];
  probeStatus: SymphonyWebProbeStatus;
  probeEvidenceRefs: string[];
  userPreferenceRank: Partial<Record<SymphonyWebCapabilityKind, number>>;
  failureNotes?: string[];
}

export interface SymphonyModePolicySnapshot {
  schemaVersion: typeof SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION;
  snapshotId: string;
  parentThreadId: string;
  parentRunId: string;
  enabled: true;
  parentAllowedActions: SymphonyParentAllowedAction[];
  observationPolicy: "full_runtime_observability";
  directExecutionPolicy: "deny_substantive_tools";
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
}

export interface ChildLaunchPolicySnapshot {
  schemaVersion: typeof SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION;
  policyId: string;
  childRunId: string;
  role: string;
  pattern: SymphonyWorkflowPatternId;
  inheritedAuthorityRoots: string[];
  writableRoots: string[];
  allowedToolIds: string[];
  deniedToolIds: string[];
  webProviderOrder: {
    search: string[];
    staticFetchExtract: string[];
    dynamicHeadlessBrowser: string[];
    interactiveBrowser: {
      providers: string[];
      fallback: SymphonyInteractiveBrowserFallbackPolicy;
    };
  };
  mutation: SymphonyChildMutationPolicy;
}

export interface MutationWorkspaceLease {
  schemaVersion: typeof SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION;
  leaseId: string;
  parentThreadId: string;
  childThreadId: string;
  childRunId: string;
  kind: SymphonyMutationWorkspaceLeaseKind;
  rootPath: string;
  sourceRoots: string[];
  readOnlyBaseRoots: string[];
  writableRoots: string[];
  status: SymphonyMutationWorkspaceLeaseStatus;
  promotionBundleId?: string;
  acquiredAt: string;
  lastHeartbeatAt: string;
}

export interface ChildDecisionRequest {
  schemaVersion: typeof SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION;
  requestId: string;
  barrierId: string;
  parentRunId: string;
  childRunIds: string[];
  reason: SymphonyChildDecisionReason;
  options: SymphonyChildDecisionOption[];
  recommendedOption: SymphonyChildDecisionOption;
  evidenceRefs: string[];
}

export interface SymphonyChildLaunchContractBundle {
  schemaVersion: typeof SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION;
  patternSelection: SymphonyPatternSelection;
  modePolicySnapshot: SymphonyModePolicySnapshot;
  childLaunchPolicySnapshot: ChildLaunchPolicySnapshot;
}

export interface SymphonyChildLaunchContractBinding {
  roleId?: string;
  childRunId?: string;
  requestedToolCategoryIds?: readonly string[];
  requestedToolIds?: readonly {
    source?: string;
    id: string;
    categoryId?: string;
  }[];
  childAuthorityMutation?: string;
}

export interface SymphonyContractValidationContext {
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  parentThreadId?: string;
  parentRunId?: string;
  launchBinding?: SymphonyChildLaunchContractBinding;
}

export function isSymphonyToolCategoryPolicyId(policyId: string): boolean {
  return SYMPHONY_TOOL_CATEGORY_POLICY_IDS.has(policyId);
}

export function symphonyExactToolPolicyId(tool: { source?: string; id: string }): string {
  return tool.source ? `${tool.source}:${tool.id}` : tool.id;
}

export function symphonyPolicyIncludesExactTool(
  policyToolIds: readonly string[],
  tool: { source?: string; id: string },
): boolean {
  const exactToolId = symphonyExactToolPolicyId(tool);
  if (policyToolIds.includes(exactToolId)) return true;
  return !tool.source && !isSymphonyToolCategoryPolicyId(tool.id) && policyToolIds.includes(tool.id);
}

export function assertValidSymphonyChildLaunchContractBundle(
  value: unknown,
  context: SymphonyContractValidationContext,
): SymphonyChildLaunchContractBundle {
  assertAmbientSubagentsEnabledForSymphony(context.featureFlagSnapshot);
  const bundle = objectRecord(value, "symphony");
  requireExactValue(
    bundle.schemaVersion,
    SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
    "symphony.schemaVersion",
  );
  const patternSelection = assertValidSymphonyPatternSelection(bundle.patternSelection);
  const modePolicySnapshot = assertValidSymphonyModePolicySnapshot(bundle.modePolicySnapshot);
  const childLaunchPolicySnapshot = assertValidChildLaunchPolicySnapshot(bundle.childLaunchPolicySnapshot);
  if (context.parentRunId && patternSelection.parentRunId !== context.parentRunId) {
    throw new Error("symphony.patternSelection.parentRunId must match the active parent run.");
  }
  if (context.parentRunId && modePolicySnapshot.parentRunId !== context.parentRunId) {
    throw new Error("symphony.modePolicySnapshot.parentRunId must match the active parent run.");
  }
  if (context.parentThreadId && modePolicySnapshot.parentThreadId !== context.parentThreadId) {
    throw new Error("symphony.modePolicySnapshot.parentThreadId must match the active parent thread.");
  }
  if (modePolicySnapshot.parentRunId !== patternSelection.parentRunId) {
    throw new Error("symphony mode policy and pattern selection must refer to the same parent run.");
  }
  if (childLaunchPolicySnapshot.pattern !== patternSelection.pattern) {
    throw new Error("symphony child launch policy pattern must match the selected Symphony pattern.");
  }
  assertSymphonyChildLaunchBinding(childLaunchPolicySnapshot, context.launchBinding);
  return {
    schemaVersion: SYMPHONY_CHILD_LAUNCH_CONTRACT_BUNDLE_SCHEMA_VERSION,
    patternSelection,
    modePolicySnapshot,
    childLaunchPolicySnapshot,
  };
}

export function materializeSymphonyChildLaunchContractBundleForRun(
  bundle: SymphonyChildLaunchContractBundle,
  input: {
    parentThreadId: string;
    parentRunId: string;
    roleId: string;
    childRunId: string;
  },
): SymphonyChildLaunchContractBundle {
  const materialized = {
    ...bundle,
    childLaunchPolicySnapshot: {
      ...bundle.childLaunchPolicySnapshot,
      childRunId: input.childRunId,
    },
  };
  return assertValidSymphonyChildLaunchContractBundle(materialized, {
    featureFlagSnapshot: materialized.modePolicySnapshot.featureFlagSnapshot,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    launchBinding: {
      roleId: input.roleId,
      childRunId: input.childRunId,
    },
  });
}

export function assertAmbientSubagentsEnabledForSymphony(snapshot: AmbientFeatureFlagSnapshot): void {
  const input = ambientFeatureFlagSnapshot(snapshot, "featureFlagSnapshot");
  if (!isAmbientSubagentsEnabled(input)) {
    throw new Error("ambient.subagents is off; Symphony fine-grained contracts are unavailable.");
  }
}

export function assertValidSymphonyPatternSelection(value: unknown): SymphonyPatternSelection {
  const input = objectRecord(value, "symphony.patternSelection");
  requireExactValue(input.schemaVersion, SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION, "symphony.patternSelection.schemaVersion");
  const childRolePlan = arrayInput(input.childRolePlan, "symphony.patternSelection.childRolePlan").map((item, index) => {
    const rolePlan = objectRecord(item, `symphony.patternSelection.childRolePlan[${index}]`);
    return {
      role: nonEmptyString(rolePlan.role, `symphony.patternSelection.childRolePlan[${index}].role`),
      count: positiveInteger(rolePlan.count, `symphony.patternSelection.childRolePlan[${index}].count`),
      purpose: nonEmptyString(rolePlan.purpose, `symphony.patternSelection.childRolePlan[${index}].purpose`),
    };
  });
  if (childRolePlan.length === 0) {
    throw new Error("symphony.patternSelection.childRolePlan must include at least one child role.");
  }
  return {
    schemaVersion: SYMPHONY_PATTERN_SELECTION_SCHEMA_VERSION,
    selectionId: nonEmptyString(input.selectionId, "symphony.patternSelection.selectionId"),
    parentRunId: nonEmptyString(input.parentRunId, "symphony.patternSelection.parentRunId"),
    pattern: enumValue(input.pattern, SYMPHONY_WORKFLOW_PATTERN_IDS, "symphony.patternSelection.pattern"),
    confidence: enumValue(input.confidence, SYMPHONY_PATTERN_CONFIDENCES, "symphony.patternSelection.confidence"),
    childRolePlan,
    requiredArtifacts: stringArray(input.requiredArtifacts, "symphony.patternSelection.requiredArtifacts"),
    reducerContract: nonEmptyString(input.reducerContract, "symphony.patternSelection.reducerContract"),
    failurePolicy: enumValue(input.failurePolicy, SYMPHONY_FAILURE_POLICIES, "symphony.patternSelection.failurePolicy"),
    tokenAndTimeBudget: {
      maxChildren: positiveInteger(
        objectRecord(input.tokenAndTimeBudget, "symphony.patternSelection.tokenAndTimeBudget").maxChildren,
        "symphony.patternSelection.tokenAndTimeBudget.maxChildren",
      ),
      maxMinutes: positiveInteger(
        objectRecord(input.tokenAndTimeBudget, "symphony.patternSelection.tokenAndTimeBudget").maxMinutes,
        "symphony.patternSelection.tokenAndTimeBudget.maxMinutes",
      ),
    },
  };
}

export function assertValidWebCapabilityProfile(value: unknown): WebCapabilityProfile {
  const input = objectRecord(value, "webCapabilityProfile");
  requireExactValue(input.schemaVersion, SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION, "webCapabilityProfile.schemaVersion");
  const supportedKinds = enumArray(input.supportedKinds, SYMPHONY_WEB_CAPABILITY_KINDS, "webCapabilityProfile.supportedKinds");
  if (supportedKinds.length === 0) {
    throw new Error("webCapabilityProfile.supportedKinds must include at least one capability kind.");
  }
  const rankInput = objectRecord(input.userPreferenceRank, "webCapabilityProfile.userPreferenceRank");
  const userPreferenceRank: Partial<Record<SymphonyWebCapabilityKind, number>> = {};
  for (const kind of SYMPHONY_WEB_CAPABILITY_KINDS) {
    if (rankInput[kind] === undefined) continue;
    userPreferenceRank[kind] = positiveInteger(rankInput[kind], `webCapabilityProfile.userPreferenceRank.${kind}`);
  }
  return {
    schemaVersion: SYMPHONY_WEB_CAPABILITY_PROFILE_SCHEMA_VERSION,
    providerId: nonEmptyString(input.providerId, "webCapabilityProfile.providerId"),
    supportedKinds,
    probeStatus: enumValue(input.probeStatus, SYMPHONY_WEB_PROBE_STATUSES, "webCapabilityProfile.probeStatus"),
    probeEvidenceRefs: stringArray(input.probeEvidenceRefs, "webCapabilityProfile.probeEvidenceRefs"),
    userPreferenceRank,
    ...(input.failureNotes !== undefined ? { failureNotes: stringArray(input.failureNotes, "webCapabilityProfile.failureNotes") } : {}),
  };
}

export function assertValidSymphonyModePolicySnapshot(value: unknown): SymphonyModePolicySnapshot {
  const input = objectRecord(value, "symphony.modePolicySnapshot");
  requireExactValue(input.schemaVersion, SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION, "symphony.modePolicySnapshot.schemaVersion");
  if (input.enabled !== true) throw new Error("symphony.modePolicySnapshot.enabled must be true.");
  requireExactValue(
    input.observationPolicy,
    "full_runtime_observability",
    "symphony.modePolicySnapshot.observationPolicy",
  );
  requireExactValue(
    input.directExecutionPolicy,
    "deny_substantive_tools",
    "symphony.modePolicySnapshot.directExecutionPolicy",
  );
  const featureFlagSnapshot = ambientFeatureFlagSnapshot(
    input.featureFlagSnapshot,
    "symphony.modePolicySnapshot.featureFlagSnapshot",
  );
  assertAmbientSubagentsEnabledForSymphony(featureFlagSnapshot);
  const parentAllowedActions = uniqueEnumArray(
    input.parentAllowedActions,
    SYMPHONY_PARENT_ALLOWED_ACTIONS,
    "symphony.modePolicySnapshot.parentAllowedActions",
  );
  if (!parentAllowedActions.includes("spawn_child")) {
    throw new Error("symphony.modePolicySnapshot.parentAllowedActions must include spawn_child for child launch.");
  }
  return {
    schemaVersion: SYMPHONY_MODE_POLICY_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: nonEmptyString(input.snapshotId, "symphony.modePolicySnapshot.snapshotId"),
    parentThreadId: nonEmptyString(input.parentThreadId, "symphony.modePolicySnapshot.parentThreadId"),
    parentRunId: nonEmptyString(input.parentRunId, "symphony.modePolicySnapshot.parentRunId"),
    enabled: true,
    parentAllowedActions,
    observationPolicy: "full_runtime_observability",
    directExecutionPolicy: "deny_substantive_tools",
    featureFlagSnapshot,
  };
}

export function assertValidChildLaunchPolicySnapshot(value: unknown): ChildLaunchPolicySnapshot {
  const input = objectRecord(value, "symphony.childLaunchPolicySnapshot");
  requireExactValue(input.schemaVersion, SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION, "symphony.childLaunchPolicySnapshot.schemaVersion");
  const webProviderOrder = objectRecord(input.webProviderOrder, "symphony.childLaunchPolicySnapshot.webProviderOrder");
  const interactiveBrowser = objectRecord(
    webProviderOrder.interactiveBrowser,
    "symphony.childLaunchPolicySnapshot.webProviderOrder.interactiveBrowser",
  );
  const allowedToolIds = policyToolIdArray(input.allowedToolIds, "symphony.childLaunchPolicySnapshot.allowedToolIds");
  const deniedToolIds = policyToolIdArray(input.deniedToolIds, "symphony.childLaunchPolicySnapshot.deniedToolIds");
  const duplicateAllowedAndDenied = allowedToolIds.find((toolId) => deniedToolIds.includes(toolId));
  if (duplicateAllowedAndDenied) {
    throw new Error(`symphony.childLaunchPolicySnapshot cannot both allow and deny ${duplicateAllowedAndDenied}.`);
  }
  const inheritedAuthorityRoots = absolutePathArray(
    input.inheritedAuthorityRoots,
    "symphony.childLaunchPolicySnapshot.inheritedAuthorityRoots",
  );
  const writableRoots = absolutePathArray(input.writableRoots, "symphony.childLaunchPolicySnapshot.writableRoots");
  const mutation = enumValue(input.mutation, SYMPHONY_CHILD_MUTATION_POLICIES, "symphony.childLaunchPolicySnapshot.mutation");
  if (mutation === "none" && writableRoots.length > 0) {
    throw new Error("symphony.childLaunchPolicySnapshot.writableRoots must be empty when mutation is none.");
  }
  const mutatingAllowedToolId = mutation === "none"
    ? allowedToolIds.find((toolId) => (SYMPHONY_MUTATING_TOOL_POLICY_IDS as readonly string[]).includes(toolId))
    : undefined;
  if (mutatingAllowedToolId) {
    throw new Error(`symphony.childLaunchPolicySnapshot.allowedToolIds must not include mutating tool policy ${mutatingAllowedToolId} when mutation is none.`);
  }
  return {
    schemaVersion: SYMPHONY_CHILD_LAUNCH_POLICY_SCHEMA_VERSION,
    policyId: nonEmptyString(input.policyId, "symphony.childLaunchPolicySnapshot.policyId"),
    childRunId: nonEmptyString(input.childRunId, "symphony.childLaunchPolicySnapshot.childRunId"),
    role: nonEmptyString(input.role, "symphony.childLaunchPolicySnapshot.role"),
    pattern: enumValue(input.pattern, SYMPHONY_WORKFLOW_PATTERN_IDS, "symphony.childLaunchPolicySnapshot.pattern"),
    inheritedAuthorityRoots,
    writableRoots,
    allowedToolIds,
    deniedToolIds,
    webProviderOrder: {
      search: stringArray(webProviderOrder.search, "symphony.childLaunchPolicySnapshot.webProviderOrder.search"),
      staticFetchExtract: stringArray(
        webProviderOrder.staticFetchExtract,
        "symphony.childLaunchPolicySnapshot.webProviderOrder.staticFetchExtract",
      ),
      dynamicHeadlessBrowser: stringArray(
        webProviderOrder.dynamicHeadlessBrowser,
        "symphony.childLaunchPolicySnapshot.webProviderOrder.dynamicHeadlessBrowser",
      ),
      interactiveBrowser: {
        providers: stringArray(
          interactiveBrowser.providers,
          "symphony.childLaunchPolicySnapshot.webProviderOrder.interactiveBrowser.providers",
        ),
        fallback: enumValue(
          interactiveBrowser.fallback,
          SYMPHONY_INTERACTIVE_BROWSER_FALLBACK_POLICIES,
          "symphony.childLaunchPolicySnapshot.webProviderOrder.interactiveBrowser.fallback",
        ),
      },
    },
    mutation,
  };
}

export function assertValidMutationWorkspaceLease(value: unknown): MutationWorkspaceLease {
  const input = objectRecord(value, "mutationWorkspaceLease");
  requireExactValue(input.schemaVersion, SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION, "mutationWorkspaceLease.schemaVersion");
  const rootPath = absolutePolicyPath(input.rootPath, "mutationWorkspaceLease.rootPath");
  const writableRoots = absolutePathArray(input.writableRoots, "mutationWorkspaceLease.writableRoots");
  const outsideWritableRoot = writableRoots.find((writableRoot) => !policyPathWithinRoot(writableRoot, rootPath));
  if (outsideWritableRoot) {
    throw new Error(`mutationWorkspaceLease.writableRoots must stay inside mutationWorkspaceLease.rootPath; ${outsideWritableRoot} is outside ${rootPath}.`);
  }
  return {
    schemaVersion: SYMPHONY_MUTATION_WORKSPACE_LEASE_SCHEMA_VERSION,
    leaseId: nonEmptyString(input.leaseId, "mutationWorkspaceLease.leaseId"),
    parentThreadId: nonEmptyString(input.parentThreadId, "mutationWorkspaceLease.parentThreadId"),
    childThreadId: nonEmptyString(input.childThreadId, "mutationWorkspaceLease.childThreadId"),
    childRunId: nonEmptyString(input.childRunId, "mutationWorkspaceLease.childRunId"),
    kind: enumValue(input.kind, SYMPHONY_MUTATION_WORKSPACE_LEASE_KINDS, "mutationWorkspaceLease.kind"),
    rootPath,
    sourceRoots: absolutePathArray(input.sourceRoots, "mutationWorkspaceLease.sourceRoots"),
    readOnlyBaseRoots: absolutePathArray(input.readOnlyBaseRoots, "mutationWorkspaceLease.readOnlyBaseRoots"),
    writableRoots,
    status: enumValue(input.status, SYMPHONY_MUTATION_WORKSPACE_LEASE_STATUSES, "mutationWorkspaceLease.status"),
    ...(input.promotionBundleId !== undefined
      ? { promotionBundleId: nonEmptyString(input.promotionBundleId, "mutationWorkspaceLease.promotionBundleId") }
      : {}),
    acquiredAt: nonEmptyString(input.acquiredAt, "mutationWorkspaceLease.acquiredAt"),
    lastHeartbeatAt: nonEmptyString(input.lastHeartbeatAt, "mutationWorkspaceLease.lastHeartbeatAt"),
  };
}

export function assertValidChildDecisionRequest(value: unknown): ChildDecisionRequest {
  const input = objectRecord(value, "childDecisionRequest");
  requireExactValue(input.schemaVersion, SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION, "childDecisionRequest.schemaVersion");
  const options = uniqueEnumArray(input.options, SYMPHONY_CHILD_DECISION_OPTIONS, "childDecisionRequest.options");
  const recommendedOption = enumValue(
    input.recommendedOption,
    SYMPHONY_CHILD_DECISION_OPTIONS,
    "childDecisionRequest.recommendedOption",
  );
  if (!options.includes(recommendedOption)) {
    throw new Error("childDecisionRequest.recommendedOption must be included in options.");
  }
  return {
    schemaVersion: SYMPHONY_CHILD_DECISION_REQUEST_SCHEMA_VERSION,
    requestId: nonEmptyString(input.requestId, "childDecisionRequest.requestId"),
    barrierId: nonEmptyString(input.barrierId, "childDecisionRequest.barrierId"),
    parentRunId: nonEmptyString(input.parentRunId, "childDecisionRequest.parentRunId"),
    childRunIds: nonEmptyStringArray(input.childRunIds, "childDecisionRequest.childRunIds"),
    reason: enumValue(input.reason, SYMPHONY_CHILD_DECISION_REASONS, "childDecisionRequest.reason"),
    options,
    recommendedOption,
    evidenceRefs: stringArray(input.evidenceRefs, "childDecisionRequest.evidenceRefs"),
  };
}

function objectRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${key} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function ambientFeatureFlagSnapshot(value: unknown, key: string): AmbientFeatureFlagSnapshot {
  const snapshot = objectRecord(value, key);
  requireExactValue(snapshot.schemaVersion, "ambient-feature-flags-v1", `${key}.schemaVersion`);
  nonEmptyString(snapshot.generatedAt, `${key}.generatedAt`);
  const flags = objectRecord(snapshot.flags, `${key}.flags`);
  const subagents = objectRecord(flags["ambient.subagents"], `${key}.flags.ambient.subagents`);
  requireExactValue(subagents.id, "ambient.subagents", `${key}.flags.ambient.subagents.id`);
  if (typeof subagents.enabled !== "boolean") {
    throw new Error(`${key}.flags.ambient.subagents.enabled must be a boolean.`);
  }
  return snapshot as unknown as AmbientFeatureFlagSnapshot;
}

function assertSymphonyChildLaunchBinding(
  policy: ChildLaunchPolicySnapshot,
  binding: SymphonyChildLaunchContractBinding | undefined,
): void {
  if (!binding) return;
  if (binding.roleId && policy.role !== binding.roleId) {
    throw new Error(`symphony.childLaunchPolicySnapshot.role must match resolved child role ${binding.roleId}.`);
  }
  if (binding.childRunId && policy.childRunId !== binding.childRunId) {
    throw new Error(`symphony.childLaunchPolicySnapshot.childRunId must match persisted child run ${binding.childRunId}.`);
  }
  for (const categoryId of binding.requestedToolCategoryIds ?? []) {
    if (policy.deniedToolIds.includes(categoryId)) {
      throw new Error(`symphony.childLaunchPolicySnapshot denies requested tool category ${categoryId}.`);
    }
    if (!policy.allowedToolIds.includes(categoryId)) {
      throw new Error(`symphony.childLaunchPolicySnapshot.allowedToolIds must include requested tool category ${categoryId}.`);
    }
  }
  for (const tool of binding.requestedToolIds ?? []) {
    const exactToolId = symphonyExactToolPolicyId(tool);
    const categoryAllowed = tool.categoryId ? policy.allowedToolIds.includes(tool.categoryId) : false;
    const exactAllowed = symphonyPolicyIncludesExactTool(policy.allowedToolIds, tool);
    const categoryDenied = tool.categoryId ? policy.deniedToolIds.includes(tool.categoryId) : false;
    const exactDenied = symphonyPolicyIncludesExactTool(policy.deniedToolIds, tool);
    if (categoryDenied || exactDenied) {
      throw new Error(`symphony.childLaunchPolicySnapshot denies requested exact tool ${exactToolId}.`);
    }
    if (
      policy.mutation === "none" &&
      exactAllowed &&
      tool.categoryId &&
      SYMPHONY_MUTATING_TOOL_CATEGORY_IDS.has(tool.categoryId)
    ) {
      throw new Error(`symphony.childLaunchPolicySnapshot.allowedToolIds must not include exact mutating tool ${exactToolId} when mutation is none.`);
    }
    if (!categoryAllowed && !exactAllowed) {
      const suffix = tool.categoryId ? ` or category ${tool.categoryId}` : "";
      throw new Error(`symphony.childLaunchPolicySnapshot.allowedToolIds must include requested exact tool ${exactToolId}${suffix}.`);
    }
  }
  if (policy.mutation === "none" && binding.childAuthorityMutation && binding.childAuthorityMutation !== "deny") {
    throw new Error("symphony.childLaunchPolicySnapshot.mutation must allow a lease when child authority requests mutation.");
  }
}

function arrayInput(value: unknown, key: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${key} must be an array.`);
  return value;
}

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} must be a non-empty string.`);
  return value.trim();
}

function stringArray(value: unknown, key: string): string[] {
  return arrayInput(value, key).map((item, index) => nonEmptyString(item, `${key}[${index}]`));
}

function policyToolIdArray(value: unknown, key: string): string[] {
  return stringArray(value, key).map((toolId, index) => {
    if (toolId.includes("*")) throw new Error(`${key}[${index}] must not use wildcard grants or denials.`);
    if (!/^[A-Za-z0-9._:/@+-]+$/.test(toolId)) {
      throw new Error(`${key}[${index}] contains unsupported policy id characters.`);
    }
    return toolId;
  });
}

function absolutePathArray(value: unknown, key: string): string[] {
  return stringArray(value, key).map((path, index) => absolutePolicyPath(path, `${key}[${index}]`));
}

function absolutePolicyPath(value: unknown, key: string): string {
  const path = nonEmptyString(value, key);
  if (!isAbsolutePolicyPath(path)) throw new Error(`${key} must be an absolute path.`);
  if (hasTraversalPolicyPathSegment(path)) {
    throw new Error(`${key} must not contain . or .. path segments.`);
  }
  return path;
}

function isAbsolutePolicyPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

function hasTraversalPolicyPathSegment(path: string): boolean {
  return path.replace(/\\/g, "/").split("/").some((segment) => segment === "." || segment === "..");
}

function policyPathWithinRoot(candidate: string, root: string): boolean {
  const normalizedCandidate = normalizePolicyPathForContainment(candidate);
  const normalizedRoot = normalizePolicyPathForContainment(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}/`);
}

function normalizePolicyPathForContainment(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/g, "");
  const value = normalized || "/";
  return /^[A-Za-z]:\//.test(value) ? value.toLowerCase() : value;
}

function nonEmptyStringArray(value: unknown, key: string): string[] {
  const values = stringArray(value, key);
  if (values.length === 0) throw new Error(`${key} must include at least one value.`);
  return values;
}

function positiveInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${key} must be a positive integer.`);
  }
  return value;
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, key: string): T[number] {
  const text = nonEmptyString(value, key);
  if ((allowed as readonly string[]).includes(text)) return text as T[number];
  throw new Error(`${key} must be one of ${allowed.join(", ")}.`);
}

function enumArray<T extends readonly string[]>(value: unknown, allowed: T, key: string): T[number][] {
  return arrayInput(value, key).map((item, index) => enumValue(item, allowed, `${key}[${index}]`));
}

function uniqueEnumArray<T extends readonly string[]>(value: unknown, allowed: T, key: string): T[number][] {
  return [...new Set(enumArray(value, allowed, key))];
}

function requireExactValue(value: unknown, expected: string, key: string): void {
  if (value !== expected) throw new Error(`${key} must be ${expected}.`);
}
