import type { AmbientModelRuntimeProfile } from "../shared/ambientModels";
import { resolveAmbientModelRuntimeProfile } from "../shared/ambientModels";
import type { SubagentRoleProfile } from "../shared/subagentRoles";
import {
  SUBAGENT_TOOL_CATEGORIES,
  type SubagentTaskToolRequest,
} from "../shared/subagentToolScope";

export type SubagentModelScopeSource = "caller_override" | "parent_fallback" | "role_default";

export type SubagentModelScopeCapabilityId =
  | "availability"
  | "subagent_eligibility"
  | "streaming"
  | "context_window"
  | "output_budget"
  | "tool_use"
  | "structured_output";

export interface SubagentModelScopeCapabilityDiagnostic {
  capability: SubagentModelScopeCapabilityId;
  status: "pass" | "fail";
  required: string;
  actual: string;
  reason?: string;
}

export interface SubagentModelScopeCandidateDiagnostic {
  schemaVersion: "ambient-subagent-model-scope-candidate-v1";
  source: SubagentModelScopeSource;
  modelId: string;
  profileId: string;
  providerId: string;
  label: string;
  selected: boolean;
  eligible: boolean;
  locality: AmbientModelRuntimeProfile["locality"];
  toolUse: AmbientModelRuntimeProfile["toolUse"];
  structuredOutput: AmbientModelRuntimeProfile["structuredOutput"];
  selectableAsSubagent: boolean;
  supportsStreaming: boolean;
  available: boolean;
  unavailableReason?: string;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  capabilityDiagnostics: SubagentModelScopeCapabilityDiagnostic[];
  blockingReasons: string[];
}

export interface SubagentModelScopeResolution {
  schemaVersion: "ambient-subagent-model-scope-v1";
  source: SubagentModelScopeSource;
  requestedModelId?: string;
  parentModelId?: string;
  roleDefaultModelId: string;
  selectedModelId: string;
  profile: AmbientModelRuntimeProfile;
  warnings: string[];
  blockingReasons: string[];
  candidateDiagnostics: SubagentModelScopeCandidateDiagnostic[];
}

export function resolveSubagentModelScope(input: {
  role: SubagentRoleProfile;
  requestedModelId?: string;
  parentModelId?: string;
  requestedToolScope?: SubagentTaskToolRequest;
  resolveModelRuntimeProfile?: (modelId?: string) => AmbientModelRuntimeProfile;
}): SubagentModelScopeResolution {
  const resolveProfile = input.resolveModelRuntimeProfile ?? resolveAmbientModelRuntimeProfile;
  const requestedModelId = cleanModelId(input.requestedModelId);
  const parentModelId = cleanModelId(input.parentModelId);
  const warnings: string[] = [];

  if (requestedModelId) {
    const profile = resolveProfile(requestedModelId);
    const candidateDiagnostics = [
      subagentModelScopeCandidateDiagnostic("caller_override", requestedModelId, profile, true, input.role, input.requestedToolScope),
    ];
    return modelScopeResult({
      source: "caller_override",
      requestedModelId,
      parentModelId,
      roleDefaultModelId: input.role.defaultModelId,
      selectedModelId: requestedModelId,
      profile,
      warnings,
      candidateDiagnostics,
    });
  }

  const candidateDiagnostics: SubagentModelScopeCandidateDiagnostic[] = [];
  if (parentModelId) {
    const parentProfile = resolveProfile(parentModelId);
    const parentBlockers = subagentModelBlockingReasonsForRole(parentProfile, input.role, input.requestedToolScope);
    candidateDiagnostics.push(subagentModelScopeCandidateDiagnostic(
      "parent_fallback",
      parentModelId,
      parentProfile,
      parentBlockers.length === 0,
      input.role,
      input.requestedToolScope,
    ));
    if (parentBlockers.length === 0) {
      return modelScopeResult({
        source: "parent_fallback",
        parentModelId,
        roleDefaultModelId: input.role.defaultModelId,
        selectedModelId: parentModelId,
        profile: parentProfile,
        warnings,
        candidateDiagnostics,
      });
    }
    warnings.push(`Parent model ${parentModelId} is not eligible for sub-agent runs: ${parentBlockers.join("; ")}`);
  }

  const roleDefaultProfile = resolveProfile(input.role.defaultModelId);
  candidateDiagnostics.push(subagentModelScopeCandidateDiagnostic("role_default", input.role.defaultModelId, roleDefaultProfile, true, input.role, input.requestedToolScope));
  return modelScopeResult({
    source: "role_default",
    parentModelId,
    roleDefaultModelId: input.role.defaultModelId,
    selectedModelId: input.role.defaultModelId,
    profile: roleDefaultProfile,
    warnings,
    candidateDiagnostics,
  });
}

export function subagentModelBlockingReasons(profile: AmbientModelRuntimeProfile): string[] {
  return [
    !profile.available ? profile.unavailableReason ?? `Model ${profile.modelId} is unavailable.` : undefined,
    !profile.selectableAsSubagent ? `Model ${profile.modelId} is not selectable for sub-agent delegation.` : undefined,
    !profile.supportsStreaming ? `Model ${profile.modelId} does not support required sub-agent streaming.` : undefined,
  ].filter((reason): reason is string => Boolean(reason));
}

function modelScopeResult(input: {
  source: SubagentModelScopeSource;
  requestedModelId?: string;
  parentModelId?: string;
  roleDefaultModelId: string;
  selectedModelId: string;
  profile: AmbientModelRuntimeProfile;
  warnings: string[];
  candidateDiagnostics: SubagentModelScopeCandidateDiagnostic[];
}): SubagentModelScopeResolution {
  const selectedCandidate = input.candidateDiagnostics.find((candidate) => candidate.selected);
  return {
    schemaVersion: "ambient-subagent-model-scope-v1",
    source: input.source,
    ...(input.requestedModelId ? { requestedModelId: input.requestedModelId } : {}),
    ...(input.parentModelId ? { parentModelId: input.parentModelId } : {}),
    roleDefaultModelId: input.roleDefaultModelId,
    selectedModelId: input.selectedModelId,
    profile: input.profile,
    warnings: input.warnings,
    blockingReasons: selectedCandidate?.blockingReasons ?? subagentModelBlockingReasons(input.profile),
    candidateDiagnostics: input.candidateDiagnostics,
  };
}

function subagentModelScopeCandidateDiagnostic(
  source: SubagentModelScopeSource,
  modelId: string,
  profile: AmbientModelRuntimeProfile,
  selected: boolean,
  role: Pick<SubagentRoleProfile, "allowedToolCategories" | "deniedToolCategories" | "guardPolicy">,
  requestedToolScope: SubagentTaskToolRequest | undefined,
): SubagentModelScopeCandidateDiagnostic {
  const capabilityDiagnostics = subagentModelCapabilityDiagnostics(profile, role, requestedToolScope);
  const blockingReasons = subagentModelBlockingReasonsFromCapabilityDiagnostics(capabilityDiagnostics);
  return {
    schemaVersion: "ambient-subagent-model-scope-candidate-v1",
    source,
    modelId,
    profileId: profile.profileId,
    providerId: profile.providerId,
    label: profile.label,
    selected,
    eligible: blockingReasons.length === 0,
    locality: profile.locality,
    toolUse: profile.toolUse,
    structuredOutput: profile.structuredOutput,
    selectableAsSubagent: profile.selectableAsSubagent,
    supportsStreaming: profile.supportsStreaming,
    available: profile.available,
    ...(profile.unavailableReason ? { unavailableReason: profile.unavailableReason } : {}),
    ...(profile.contextWindowTokens !== undefined ? { contextWindowTokens: profile.contextWindowTokens } : {}),
    ...(profile.maxOutputTokens !== undefined ? { maxOutputTokens: profile.maxOutputTokens } : {}),
    capabilityDiagnostics,
    blockingReasons,
  };
}

function subagentModelBlockingReasonsForRole(
  profile: AmbientModelRuntimeProfile,
  role: Pick<SubagentRoleProfile, "allowedToolCategories" | "deniedToolCategories" | "guardPolicy">,
  requestedToolScope: SubagentTaskToolRequest | undefined,
): string[] {
  return subagentModelBlockingReasonsFromCapabilityDiagnostics(
    subagentModelCapabilityDiagnostics(profile, role, requestedToolScope),
  );
}

function subagentModelBlockingReasonsFromCapabilityDiagnostics(
  diagnostics: readonly SubagentModelScopeCapabilityDiagnostic[],
): string[] {
  return uniqueStrings(diagnostics
    .filter((diagnostic) => diagnostic.status === "fail")
    .map((diagnostic) => diagnostic.reason ?? `${diagnostic.capability} failed: ${diagnostic.actual}`));
}

function subagentModelCapabilityDiagnostics(
  profile: AmbientModelRuntimeProfile,
  role: Pick<SubagentRoleProfile, "allowedToolCategories" | "deniedToolCategories" | "guardPolicy">,
  requestedToolScope: SubagentTaskToolRequest | undefined,
): SubagentModelScopeCapabilityDiagnostic[] {
  return [
    {
      capability: "availability",
      status: profile.available ? "pass" : "fail",
      required: "registered and available runtime profile",
      actual: profile.available ? "available" : "unavailable",
      ...(!profile.available ? { reason: profile.unavailableReason ?? `Model ${profile.modelId} is unavailable.` } : {}),
    },
    {
      capability: "subagent_eligibility",
      status: profile.selectableAsSubagent ? "pass" : "fail",
      required: "selectableAsSubagent=true",
      actual: `selectableAsSubagent=${String(profile.selectableAsSubagent)}`,
      ...(!profile.selectableAsSubagent ? { reason: `Model ${profile.modelId} is not selectable for sub-agent delegation.` } : {}),
    },
    {
      capability: "streaming",
      status: profile.supportsStreaming ? "pass" : "fail",
      required: "supportsStreaming=true",
      actual: `supportsStreaming=${String(profile.supportsStreaming)}`,
      ...(!profile.supportsStreaming ? { reason: `Model ${profile.modelId} does not support required sub-agent streaming.` } : {}),
    },
    subagentContextWindowCapabilityDiagnostic(profile),
    subagentOutputBudgetCapabilityDiagnostic(profile),
    subagentToolUseCapabilityDiagnostic(profile, role, requestedToolScope),
    subagentStructuredOutputCapabilityDiagnostic(profile, role),
  ];
}

function subagentContextWindowCapabilityDiagnostic(profile: AmbientModelRuntimeProfile): SubagentModelScopeCapabilityDiagnostic {
  if (typeof profile.contextWindowTokens === "number" && Number.isFinite(profile.contextWindowTokens) && profile.contextWindowTokens > 0) {
    return {
      capability: "context_window",
      status: "pass",
      required: "registered positive contextWindowTokens",
      actual: `${profile.contextWindowTokens} tokens`,
    };
  }
  return {
    capability: "context_window",
    status: "fail",
    required: "registered positive contextWindowTokens",
    actual: "unknown",
    reason: "Model profile does not declare a context window; runtime preflight must prove the child prompt fits before launch.",
  };
}

function subagentOutputBudgetCapabilityDiagnostic(profile: AmbientModelRuntimeProfile): SubagentModelScopeCapabilityDiagnostic {
  if (typeof profile.maxOutputTokens === "number" && Number.isFinite(profile.maxOutputTokens) && profile.maxOutputTokens > 0) {
    return {
      capability: "output_budget",
      status: "pass",
      required: "registered positive maxOutputTokens",
      actual: `${profile.maxOutputTokens} tokens`,
    };
  }
  return {
    capability: "output_budget",
    status: "fail",
    required: "registered positive maxOutputTokens",
    actual: "unknown",
    reason: "Model profile does not declare a maximum output budget; runtime preflight must reserve a safe child output allowance.",
  };
}

function subagentToolUseCapabilityDiagnostic(
  profile: AmbientModelRuntimeProfile,
  role: Pick<SubagentRoleProfile, "allowedToolCategories" | "deniedToolCategories">,
  requestedToolScope: SubagentTaskToolRequest | undefined,
): SubagentModelScopeCapabilityDiagnostic {
  const requiredCategoryIds = modelToolUseRequiredCategoryIds(role, requestedToolScope);
  const basis = requestedToolScope && subagentTaskToolRequestHasExplicitScope(requestedToolScope)
    ? "requested tool scope"
    : "role default tool scope";
  if (requiredCategoryIds.length === 0) {
    return {
      capability: "tool_use",
      status: "pass",
      required: `${basis} exposes no categories that require model tool use`,
      actual: "not_required",
    };
  }
  if (profile.toolUse !== "none") {
    return {
      capability: "tool_use",
      status: "pass",
      required: `${basis} requires model tool use: ${requiredCategoryIds.join(", ")}`,
      actual: `toolUse=${profile.toolUse}`,
    };
  }
  return {
    capability: "tool_use",
    status: "fail",
    required: `${basis} requires model tool use: ${requiredCategoryIds.join(", ")}`,
    actual: "toolUse=none",
    reason: "Tool-scope resolution will deny these categories unless the child launch uses a tool-free role/scope.",
  };
}

function subagentStructuredOutputCapabilityDiagnostic(
  profile: AmbientModelRuntimeProfile,
  role: Pick<SubagentRoleProfile, "guardPolicy">,
): SubagentModelScopeCapabilityDiagnostic {
  if (!role.guardPolicy.structuredOutputRequired) {
    return {
      capability: "structured_output",
      status: "pass",
      required: "structured output is optional for this role",
      actual: "not_required",
    };
  }
  if (profile.structuredOutput !== "none") {
    return {
      capability: "structured_output",
      status: "pass",
      required: "role requires a validated structured child result",
      actual: `model_native:${profile.structuredOutput}`,
    };
  }
  return {
    capability: "structured_output",
    status: "pass",
    required: "role requires a validated structured child result",
    actual: "ambient_validated_text",
    reason: "Ambient will request marked result JSON and validate or synthesize structured output at the runtime boundary.",
  };
}

function modelToolUseRequiredCategoryIds(
  role: Pick<SubagentRoleProfile, "allowedToolCategories" | "deniedToolCategories">,
  requestedToolScope: SubagentTaskToolRequest | undefined,
): string[] {
  const denied = new Set(role.deniedToolCategories);
  const explicitScope = requestedToolScope && subagentTaskToolRequestHasExplicitScope(requestedToolScope);
  const candidateIds = explicitScope
    ? requestedToolScopeCategoryIds(requestedToolScope)
    : role.allowedToolCategories;
  return SUBAGENT_TOOL_CATEGORIES
    .filter((category) => category.requiresToolUse)
    .filter((category) => candidateIds.includes(category.id))
    .filter((category) => role.allowedToolCategories.includes(category.id))
    .filter((category) => !denied.has(category.id))
    .map((category) => category.id);
}

function subagentTaskToolRequestHasExplicitScope(request: SubagentTaskToolRequest): boolean {
  return Boolean(request.requestedCategories?.length || request.requestedSources?.length || request.requestedFanout);
}

function requestedToolScopeCategoryIds(request: SubagentTaskToolRequest): string[] {
  return [...new Set([
    ...(request.requestedCategories ?? []),
    ...(request.requestedSources ?? []).flatMap((source) => source.categoryId ? [source.categoryId] : []),
    ...(request.requestedFanout ? ["subagent.spawn" as const] : []),
  ])];
}

function cleanModelId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}
