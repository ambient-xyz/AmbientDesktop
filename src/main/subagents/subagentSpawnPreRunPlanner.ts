import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import {
  buildSubagentCanonicalPath,
  type SubagentDependencyMode,
  type SubagentForkMode,
  type SubagentPromptMode,
} from "../../shared/subagentProtocol";
import type {
  SubagentRoleId,
  SubagentRoleProfile,
} from "../../shared/subagentRoles";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import {
  effectiveSubagentRoleSnapshot,
  SUBAGENT_PATTERN_ROLE_IDS,
  type SubagentPatternGraphApprovalState,
  type SubagentEffectiveRoleSnapshot,
  type SubagentPatternRoleId,
} from "../../shared/subagentPatternGraph";
import type {
  AgentRoleLaunchResolution,
  AgentRoleRegistry,
} from "./subagentAgentFacade";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
} from "./subagentIdempotency";
import {
  resolveSubagentModelScope,
  type SubagentModelScopeResolution,
} from "./subagentModelProviderFacade";
import {
  compactSubagentModelScopeForPi,
  previewSubagentSpawnText,
  scheduledSubagentSpawnRequestFields,
} from "./subagentSpawnFailure";
import {
  resolveSubagentToolScopeRequest,
  type SubagentToolScopeRequest,
} from "./subagentToolScopeRequest";
import {
  assertValidSymphonyChildLaunchContractBundle,
  type SymphonyChildLaunchContractBundle,
} from "../../shared/symphonyFineGrainedContracts";

export const SUBAGENT_SPAWN_PRE_RUN_PLANNER_SCHEMA_VERSION =
  "ambient-subagent-spawn-pre-run-planner-v1" as const;

export const SUBAGENT_SPAWN_PLANNER_DEPENDENCY_MODES = [
  "required",
  "optional_background",
  "supervisor_attention",
] as const;

export const SUBAGENT_SPAWN_PLANNER_FORK_MODES = [
  "full_history",
  "recent_turns",
  "no_history",
] as const;

export const SUBAGENT_SPAWN_PLANNER_PROMPT_MODES = [
  "append",
  "replace",
  "fresh",
] as const;

export interface ResolveSubagentSpawnPreRunPlanInput {
  parentThread: Pick<ThreadSummary, "id" | "model" | "canonicalTaskPath">;
  parentRun: { id: string };
  request: Record<string, unknown>;
  featureFlagSnapshot?: AmbientFeatureFlagSnapshot;
  resolveSymphonyLaunchContract?: (contractId: string) => unknown;
  roleRegistry: AgentRoleRegistry;
  resolveModelRuntimeProfile: (modelId?: string) => AmbientModelRuntimeProfile;
  existingRuns: readonly SubagentRunSummary[];
}

export interface SubagentSpawnPreRunPlan {
  schemaVersion: typeof SUBAGENT_SPAWN_PRE_RUN_PLANNER_SCHEMA_VERSION;
  task: string;
  requestedRoleId: string;
  requestedForkMode?: SubagentForkMode;
  roleResolution: AgentRoleLaunchResolution;
  roleId: SubagentRoleId;
  role: SubagentRoleProfile;
  scheduledSpawnFields: string[];
  modelScope: SubagentModelScopeResolution;
  modelId: string;
  model: AmbientModelRuntimeProfile;
  dependencyMode: SubagentDependencyMode;
  forkMode: SubagentForkMode;
  promptMode: SubagentPromptMode;
  effectiveRoleSnapshot?: SubagentEffectiveRoleSnapshot;
  patternGraphBinding?: SubagentSpawnPatternGraphBinding;
  symphonyContractId?: string;
  symphonyContracts?: SymphonyChildLaunchContractBundle;
  requestedToolScope: SubagentToolScopeRequest;
  spawnIndex: number;
  canonicalTaskPath: string;
  payloadFingerprint: string;
  idempotencyKey: string;
  retentionPolicy: string;
  title: string;
}

export interface SubagentSpawnPatternGraphBinding {
  workflowTaskId: string;
  roleNodeId: string;
  label?: string;
  approvalState?: SubagentPatternGraphApprovalState;
  blockingParent?: boolean;
}

export function resolveSubagentSpawnPreRunPlan(
  input: ResolveSubagentSpawnPreRunPlanInput,
): SubagentSpawnPreRunPlan {
  const request = input.request;
  const task = requiredString(request, "task");
  const requestedRoleId = optionalString(request.roleId) ?? "explorer";
  const requestedForkModeRaw = optionalString(request.forkMode);
  const requestedForkMode = requestedForkModeRaw
    ? enumValue(requestedForkModeRaw, SUBAGENT_SPAWN_PLANNER_FORK_MODES, "forkMode") as SubagentForkMode
    : undefined;
  const roleResolution = input.roleRegistry.resolveRoleForLaunch({
    roleId: requestedRoleId,
    ...(requestedForkMode ? { forkMode: requestedForkMode } : {}),
  });
  const roleId = roleResolution.roleId;
  const role = roleResolution.profile;
  const effectiveRoleSnapshot = resolveLaunchEffectiveRoleSnapshot(request.effectiveRole, roleId);
  const patternGraphBinding = resolveLaunchPatternGraphBinding(request.patternGraphBinding);
  const requestedToolScope = resolveSubagentToolScopeRequest(request.toolScope);
  const symphonyContracts = resolveLaunchSymphonyContracts({
    request,
    featureFlagSnapshot: input.featureFlagSnapshot,
    resolveSymphonyLaunchContract: input.resolveSymphonyLaunchContract,
    parentThreadId: input.parentThread.id,
    parentRunId: input.parentRun.id,
    roleId,
    requestedToolScope,
  });
  const modelScope = resolveSubagentModelScope({
    role,
    requestedModelId: optionalString(request.modelId),
    parentModelId: input.parentThread.model,
    requestedToolScope,
    resolveModelRuntimeProfile: input.resolveModelRuntimeProfile,
  });
  const modelId = modelScope.selectedModelId;
  const model = modelScope.profile;
  const dependencyMode = enumValue(
    request.dependencyMode ?? "optional_background",
    SUBAGENT_SPAWN_PLANNER_DEPENDENCY_MODES,
    "dependencyMode",
  );
  const forkMode = requestedForkMode ?? role.defaultForkMode;
  const promptMode = enumValue(
    request.promptMode ?? role.promptMode,
    SUBAGENT_SPAWN_PLANNER_PROMPT_MODES,
    "promptMode",
  ) as SubagentPromptMode;
  const spawnIndex = input.existingRuns.length;
  const canonicalTaskPath = buildSubagentCanonicalPath({
    parentPath: input.parentThread.canonicalTaskPath,
    roleId,
    spawnIndex,
  });
  const retentionPolicy = optionalString(request.retentionPolicy) ?? role.retentionDefault;
  const payloadFingerprint = createSubagentPayloadFingerprint({
    task,
    roleId,
    modelId,
    modelScope: compactSubagentModelScopeForPi(modelScope),
    dependencyMode,
    forkMode,
    promptMode,
    effectiveRoleSnapshot,
    patternGraphBinding,
    ...(symphonyContracts ? { symphonyContractId: symphonyContracts.contractId } : {}),
    toolScope: requestedToolScope,
    retentionPolicy,
    schedulingPolicy: role.schedulingPolicy,
  });
  const idempotencyKey = optionalString(request.idempotencyKey) ??
    createSubagentIdempotencyKey({
      operation: "spawn",
      parentRunId: input.parentRun.id,
      payloadFingerprint,
    });

  return {
    schemaVersion: SUBAGENT_SPAWN_PRE_RUN_PLANNER_SCHEMA_VERSION,
    task,
    requestedRoleId,
    ...(requestedForkMode ? { requestedForkMode } : {}),
    roleResolution,
    roleId,
    role,
    scheduledSpawnFields: scheduledSubagentSpawnRequestFields(request),
    modelScope,
    modelId,
    model,
    dependencyMode,
    forkMode,
    promptMode,
    ...(effectiveRoleSnapshot ? { effectiveRoleSnapshot } : {}),
    ...(patternGraphBinding ? { patternGraphBinding } : {}),
    ...(symphonyContracts ? {
      symphonyContractId: symphonyContracts.contractId,
      symphonyContracts: symphonyContracts.contracts,
    } : {}),
    requestedToolScope,
    spawnIndex,
    canonicalTaskPath,
    payloadFingerprint,
    idempotencyKey,
    retentionPolicy,
    title: optionalString(request.title) ?? defaultSubagentChildTitle(role, task),
  };
}

function resolveLaunchSymphonyContracts(input: {
  request: Record<string, unknown>;
  featureFlagSnapshot?: AmbientFeatureFlagSnapshot;
  resolveSymphonyLaunchContract?: (contractId: string) => unknown;
  parentThreadId: string;
  parentRunId: string;
  roleId: SubagentRoleId;
  requestedToolScope: SubagentToolScopeRequest;
}): { contractId: string; contracts: SymphonyChildLaunchContractBundle } | undefined {
  const symphonyMode = input.request.symphonyMode === true;
  const inlineContracts = input.request.symphony;
  const contractId = optionalString(input.request.symphonyContractId);
  if (!symphonyMode && !contractId && inlineContracts === undefined) return undefined;
  if (inlineContracts !== undefined) {
    throw new Error("Symphony-mode child spawn requires a stored symphonyContractId; inline symphony bundles are not authoritative.");
  }
  if (!contractId) {
    throw new Error("Symphony-mode child spawn requires a stored symphonyContractId.");
  }
  if (!input.featureFlagSnapshot) {
    throw new Error("Symphony-mode child spawn requires a feature flag snapshot before run creation.");
  }
  if (!input.resolveSymphonyLaunchContract) {
    throw new Error("Symphony-mode child spawn requires a product-owned Symphony launch contract resolver.");
  }
  const rawContracts = input.resolveSymphonyLaunchContract(contractId);
  if (!rawContracts) {
    throw new Error(`Stored Symphony launch contract not found: ${contractId}`);
  }
  const contracts = assertValidSymphonyChildLaunchContractBundle(rawContracts, {
    featureFlagSnapshot: input.featureFlagSnapshot,
    parentThreadId: input.parentThreadId,
    parentRunId: input.parentRunId,
    launchBinding: {
      roleId: input.roleId,
      requestedToolCategoryIds: input.requestedToolScope.requestedCategories,
      requestedToolIds: requestedToolIdsForBinding(input.requestedToolScope),
      childAuthorityMutation: input.requestedToolScope.childAuthority?.mutation,
    },
  });
  return { contractId, contracts };
}

function requestedToolIdsForBinding(request: SubagentToolScopeRequest): Array<{ source: string; id: string; categoryId?: string }> {
  const toolIds: Array<{ source: string; id: string; categoryId?: string }> = [];
  for (const source of request.requestedSources ?? []) {
    toolIds.push({
      source: source.source,
      id: source.id,
      ...(source.categoryId ? { categoryId: source.categoryId } : {}),
    });
  }
  return toolIds;
}

function resolveLaunchPatternGraphBinding(value: unknown): SubagentSpawnPatternGraphBinding | undefined {
  const input = optionalObject(value, "patternGraphBinding");
  if (!input) return undefined;
  const workflowTaskId = requiredObjectString(input, "workflowTaskId", "patternGraphBinding.workflowTaskId");
  const roleNodeId = requiredObjectString(input, "roleNodeId", "patternGraphBinding.roleNodeId");
  const approvalState = optionalString(input.approvalState);
  if (approvalState && !["none", "pending", "approved", "denied"].includes(approvalState)) {
    throw new Error("patternGraphBinding.approvalState must be one of none, pending, approved, denied.");
  }
  if (input.blockingParent !== undefined && typeof input.blockingParent !== "boolean") {
    throw new Error("patternGraphBinding.blockingParent must be a boolean.");
  }
  return {
    workflowTaskId,
    roleNodeId,
    ...(optionalString(input.label) ? { label: optionalString(input.label) } : {}),
    ...(approvalState ? { approvalState: approvalState as SubagentPatternGraphApprovalState } : {}),
    ...(typeof input.blockingParent === "boolean" ? { blockingParent: input.blockingParent } : {}),
  };
}

function resolveLaunchEffectiveRoleSnapshot(
  value: unknown,
  baseRole: SubagentRoleId,
): SubagentEffectiveRoleSnapshot | undefined {
  const input = optionalObject(value, "effectiveRole");
  if (!input) return undefined;
  const patternRole = enumValue(
    input.patternRole,
    SUBAGENT_PATTERN_ROLE_IDS,
    "effectiveRole.patternRole",
  ) as SubagentPatternRoleId;
  const overlayLabels = requiredStringArray(input.overlayLabels, "effectiveRole.overlayLabels");
  if (overlayLabels.length === 0) {
    throw new Error("effectiveRole.overlayLabels must include at least one non-empty overlay label.");
  }
  const outputContract = optionalString(input.outputContract);
  return effectiveSubagentRoleSnapshot({
    baseRole,
    patternRole,
    overlayLabels,
    ...(outputContract ? { outputContract } : {}),
  });
}

export function defaultSubagentChildTitle(role: Pick<SubagentRoleProfile, "label">, task: string): string {
  const compact = previewSubagentSpawnText(task, 56).replace(/\s+/g, " ");
  return `${role.label}: ${compact}`;
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

function requiredObjectString(input: Record<string, unknown>, key: string, label: string): string {
  const value = optionalString(input[key]);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalObject(value: unknown, key: string): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  throw new Error(`${key} must be an object.`);
}

function requiredStringArray(value: unknown, key: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of non-empty strings.`);
  return value.map((item, index) => {
    const text = optionalString(item);
    if (!text) throw new Error(`${key}[${index}] must be a non-empty string.`);
    return text;
  });
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, key: string): T[number] {
  const text = optionalString(value);
  if (text && (allowed as readonly string[]).includes(text)) return text as T[number];
  throw new Error(`${key} must be one of ${allowed.join(", ")}.`);
}
