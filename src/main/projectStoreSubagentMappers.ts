import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxDirection,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentPromptSnapshotSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentRunStatus,
  SubagentSpawnEdgeSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
  SubagentWaitBarrierStatus,
  SubagentWaitBarrierSummary,
} from "../shared/types";
import {
  SUBAGENT_MATURITY_EVIDENCE_KINDS,
  type SubagentApprovalRoutingVisibilityEvidence,
  type SubagentCompletionGuardVisibilityEvidence,
  type SubagentEventAttributionIntegrityEvidence,
  type SubagentLifecycleControlIntegrityEvidence,
  type SubagentMaturityBugEvidence,
  type SubagentMaturityEvidence,
  type SubagentMaturityEvidenceKind,
  type SubagentMaturityEvidenceStatus,
  type SubagentProductionUiVisibilityEvidence,
  type SubagentRetentionPolicyIntegrityEvidence,
  type SubagentSecurityReviewStatus,
  type SubagentToolScopeIntegrityEvidence,
} from "../shared/subagentMaturity";
import type {
  SubagentBatchJobPlan,
  SubagentBatchJobRecord,
  SubagentBatchResultLedger,
  SubagentBatchResultReport,
} from "./subagentBatchJobs";
import {
  fallbackSubagentCapacityLease,
  isSubagentCapacityLeaseSnapshot,
  materializeSubagentCapacityLeaseForRun,
} from "../shared/subagentCapacity";
import {
  getDefaultSubagentRoleProfile,
  type SubagentRoleId,
  type SubagentRoleProfile,
} from "../shared/subagentRoles";
import {
  isSubagentEffectiveRoleSnapshot,
} from "../shared/subagentPatternGraph";

export interface SubagentRunRow {
  id: string;
  protocol_version: string;
  parent_thread_id: string;
  parent_run_id: string;
  parent_message_id: string | null;
  child_thread_id: string;
  canonical_task_path: string;
  role_id: string;
  role_profile_snapshot_json: string | null;
  effective_role_snapshot_json: string | null;
  dependency_mode: string;
  status: SubagentRunStatus;
  feature_flag_snapshot_json: string;
  model_runtime_snapshot_json: string;
  capacity_lease_snapshot_json: string | null;
  result_artifact_json: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
}

export interface SubagentMailboxEventRow {
  id: string;
  run_id: string;
  direction: SubagentMailboxDirection;
  type: string;
  payload_json: string;
  delivery_state: SubagentMailboxDeliveryState;
  created_at: string;
  delivered_at: string | null;
}

export interface SubagentMaturityEvidenceRow {
  id: string;
  kind: SubagentMaturityEvidenceKind;
  evidence_key: string | null;
  status: SubagentMaturityEvidenceStatus;
  run_id: string | null;
  parent_run_id: string | null;
  artifact_path: string | null;
  reviewer: string | null;
  notes: string | null;
  details_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubagentParentMailboxEventRow {
  id: string;
  parent_thread_id: string;
  parent_run_id: string;
  parent_message_id: string | null;
  type: string;
  payload_json: string;
  delivery_state: SubagentMailboxDeliveryState;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
}

export interface SubagentPromptSnapshotRow {
  run_id: string;
  sequence: number;
  created_at: string;
  prompt_sha256: string;
  prompt_preview: string;
  snapshot_json: string;
}

export interface SubagentRunEventRow {
  run_id: string;
  sequence: number;
  type: string;
  created_at: string;
  preview_json: string | null;
  artifact_path: string | null;
}

export interface SubagentToolScopeSnapshotRow {
  run_id: string;
  sequence: number;
  created_at: string;
  scope_json: string;
  resolver_inputs_json: string;
}

export interface SubagentWaitBarrierRow {
  id: string;
  parent_thread_id: string;
  parent_run_id: string;
  child_run_ids_json: string;
  dependency_mode: SubagentWaitBarrierMode;
  status: SubagentWaitBarrierStatus;
  failure_policy: SubagentWaitBarrierFailurePolicy;
  quorum_threshold: number | null;
  timeout_ms: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_artifact_json: string | null;
}

export interface SubagentSpawnEdgeRow {
  parent_run_id: string;
  child_run_id: string;
  parent_thread_id: string;
  child_thread_id: string;
  canonical_task_path: string;
  depth: number;
  status: SubagentRunStatus;
  capacity_released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubagentBatchJobRow {
  id: string;
  parent_thread_id: string;
  parent_run_id: string;
  canonical_task_path: string;
  plan_json: string;
  ledger_json: string;
  created_at: string;
  updated_at: string;
}

export interface SubagentBatchResultReportRow {
  job_id: string;
  report_id: string;
  item_id: string;
  child_run_id: string;
  report_json: string;
  created_at: string;
}

export function subagentRunStatusIsTerminal(status: SubagentRunStatus): boolean {
  return [
    "completed",
    "failed",
    "stopped",
    "cancelled",
    "timed_out",
    "detached",
    "aborted_partial",
  ].includes(status);
}

export function subagentSpawnEdgeRecordForRun(
  run: SubagentRunSummary,
  input: { now: string; createdAt: string; depth: number },
): SubagentSpawnEdgeSummary {
  return {
    parentRunId: run.parentRunId,
    childRunId: run.id,
    parentThreadId: run.parentThreadId,
    childThreadId: run.childThreadId,
    canonicalTaskPath: run.canonicalTaskPath,
    depth: input.depth,
    status: run.status,
    ...(run.closedAt ? { capacityReleasedAt: run.closedAt } : {}),
    createdAt: input.createdAt,
    updatedAt: input.now,
  };
}

export function mapSubagentRunRow(row: SubagentRunRow): SubagentRunSummary {
  const roleProfile = subagentRoleProfileSnapshotForRow(row);
  return {
    id: row.id,
    protocolVersion: row.protocol_version as SubagentRunSummary["protocolVersion"],
    parentThreadId: row.parent_thread_id,
    parentRunId: row.parent_run_id,
    parentMessageId: row.parent_message_id ?? undefined,
    childThreadId: row.child_thread_id,
    canonicalTaskPath: row.canonical_task_path,
    roleId: row.role_id,
    roleProfileSnapshot: roleProfile.profile,
    roleProfileSnapshotSource: roleProfile.source,
    effectiveRoleSnapshot: subagentEffectiveRoleSnapshotForRow(row),
    dependencyMode: row.dependency_mode as SubagentRunSummary["dependencyMode"],
    status: row.status,
    featureFlagSnapshot: parseJsonObject(row.feature_flag_snapshot_json, undefined)!,
    modelRuntimeSnapshot: parseJsonObject(row.model_runtime_snapshot_json, undefined)!,
    capacityLeaseSnapshot: subagentCapacityLeaseSnapshotForRow(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    closedAt: row.closed_at ?? undefined,
    resultArtifact: row.result_artifact_json ? parseJsonObject(row.result_artifact_json, undefined) : undefined,
  };
}

export function mapSubagentSpawnEdgeRow(row: SubagentSpawnEdgeRow): SubagentSpawnEdgeSummary {
  return {
    parentRunId: row.parent_run_id,
    childRunId: row.child_run_id,
    parentThreadId: row.parent_thread_id,
    childThreadId: row.child_thread_id,
    canonicalTaskPath: row.canonical_task_path,
    depth: row.depth,
    status: row.status,
    capacityReleasedAt: row.capacity_released_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSubagentBatchJobRow(row: SubagentBatchJobRow): SubagentBatchJobRecord {
  return {
    plan: parseJsonObject<SubagentBatchJobPlan | undefined>(row.plan_json, undefined)!,
    ledger: parseJsonObject<SubagentBatchResultLedger | undefined>(row.ledger_json, undefined)!,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSubagentBatchResultReportRow(row: SubagentBatchResultReportRow): SubagentBatchResultReport {
  return parseJsonObject<SubagentBatchResultReport | undefined>(row.report_json, undefined)!;
}

export function mapSubagentMailboxEventRow(row: SubagentMailboxEventRow): SubagentMailboxEventSummary {
  return {
    id: row.id,
    runId: row.run_id,
    direction: row.direction,
    type: row.type,
    payload: parseJsonObject(row.payload_json, undefined),
    deliveryState: row.delivery_state,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at ?? undefined,
  };
}

export function compactSubagentMailboxEventForPreview(event: SubagentMailboxEventSummary) {
  return {
    id: event.id,
    type: event.type,
    direction: event.direction,
    deliveryState: event.deliveryState,
    createdAt: event.createdAt,
    deliveredAt: event.deliveredAt,
  };
}

export function subagentLifecycleArtifactPath(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const artifactPath = (value as Record<string, unknown>).artifactPath;
  return typeof artifactPath === "string" && artifactPath.length > 0 ? artifactPath : undefined;
}

export function compactSubagentCapacityLeasePreview(
  lease: SubagentRunSummary["capacityLeaseSnapshot"],
): Record<string, unknown> {
  return {
    schemaVersion: lease.schemaVersion,
    leaseId: lease.leaseId,
    status: lease.status,
    canonicalTaskPath: lease.canonicalTaskPath,
    providerId: lease.provider.providerId,
    modelId: lease.provider.modelId,
    profileId: lease.provider.profile.profileId,
    locality: lease.provider.locality,
    projectedOpenRunCount: lease.provider.projectedOpenRunCount,
    ...(lease.provider.concurrencyLimit !== undefined ? { concurrencyLimit: lease.provider.concurrencyLimit } : {}),
    localMemoryOutcome: lease.localMemory.outcome,
    localMemoryAllowed: lease.localMemory.allowed,
    ...(lease.localMemory.requestedEstimatedResidentMemoryBytes !== undefined
      ? { requestedEstimatedResidentMemoryBytes: lease.localMemory.requestedEstimatedResidentMemoryBytes }
      : {}),
    blockingReasons: lease.blockingReasons,
    ...(lease.releasedAt ? { releasedAt: lease.releasedAt } : {}),
  };
}

export function mapSubagentMaturityEvidenceRow(row: SubagentMaturityEvidenceRow): SubagentMaturityEvidence {
  return {
    schemaVersion: "ambient-subagent-maturity-evidence-v1",
    id: row.id,
    kind: normalizeSubagentMaturityEvidenceKind(row.kind),
    status: normalizeSubagentMaturityEvidenceStatus(row.status),
    evidenceKey: row.evidence_key ?? undefined,
    runId: row.run_id ?? undefined,
    parentRunId: row.parent_run_id ?? undefined,
    artifactPath: row.artifact_path ?? undefined,
    reviewer: row.reviewer ?? undefined,
    notes: row.notes ?? undefined,
    details: row.details_json ? parseJsonObject<Record<string, unknown>>(row.details_json, {}) : undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSubagentParentMailboxEventRow(row: SubagentParentMailboxEventRow): SubagentParentMailboxEventSummary {
  return {
    id: row.id,
    parentThreadId: row.parent_thread_id,
    parentRunId: row.parent_run_id,
    parentMessageId: row.parent_message_id ?? undefined,
    type: row.type,
    payload: parseJsonObject(row.payload_json, undefined),
    deliveryState: row.delivery_state,
    idempotencyKey: row.idempotency_key ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deliveredAt: row.delivered_at ?? undefined,
  };
}

export function mapSubagentPromptSnapshotRow(row: SubagentPromptSnapshotRow): SubagentPromptSnapshotSummary {
  return {
    runId: row.run_id,
    sequence: row.sequence,
    createdAt: row.created_at,
    promptSha256: row.prompt_sha256,
    promptPreview: row.prompt_preview,
    snapshot: parseJsonObject(row.snapshot_json, undefined),
  };
}

export function mapSubagentRunEventRow(row: SubagentRunEventRow): SubagentRunEventSummary {
  return {
    runId: row.run_id,
    sequence: row.sequence,
    type: row.type,
    createdAt: row.created_at,
    preview: row.preview_json ? parseJsonObject(row.preview_json, undefined) : undefined,
    artifactPath: row.artifact_path ?? undefined,
  };
}

export function mapSubagentToolScopeSnapshotRow(row: SubagentToolScopeSnapshotRow): SubagentToolScopeSnapshotSummary {
  return {
    runId: row.run_id,
    sequence: row.sequence,
    createdAt: row.created_at,
    scope: parseJsonObject<SubagentToolScopeSnapshotSummary["scope"] | undefined>(row.scope_json, undefined)!,
    resolverInputs: parseJsonObject(row.resolver_inputs_json, undefined),
  };
}

export function mapSubagentWaitBarrierRow(row: SubagentWaitBarrierRow): SubagentWaitBarrierSummary {
  return {
    id: row.id,
    parentThreadId: row.parent_thread_id,
    parentRunId: row.parent_run_id,
    childRunIds: parseJsonArray<unknown>(row.child_run_ids_json).filter((item): item is string => typeof item === "string"),
    dependencyMode: row.dependency_mode,
    status: row.status,
    failurePolicy: row.failure_policy,
    quorumThreshold: row.quorum_threshold ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    resolutionArtifact: row.resolution_artifact_json ? parseJsonObject(row.resolution_artifact_json, undefined) : undefined,
  };
}

export function resolveSubagentWaitBarrierQuorumThreshold(input: {
  dependencyMode: SubagentWaitBarrierMode;
  childCount: number;
  quorumThreshold?: number;
}): number | null {
  if (input.dependencyMode !== "quorum") {
    if (input.quorumThreshold !== undefined) {
      throw new Error("quorumThreshold is only valid for quorum sub-agent wait barriers.");
    }
    return null;
  }
  const quorumThreshold = input.quorumThreshold;
  if (typeof quorumThreshold !== "number" || !Number.isInteger(quorumThreshold)) {
    throw new Error("Quorum sub-agent wait barriers require an explicit integer quorumThreshold.");
  }
  if (quorumThreshold < 1 || quorumThreshold > input.childCount) {
    throw new Error(`Quorum sub-agent wait barrier threshold must be between 1 and ${input.childCount}.`);
  }
  return quorumThreshold;
}

function parseJsonObject<T>(json: string, fallback: T): T {
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function subagentRoleProfileSnapshotForRow(row: SubagentRunRow): { profile: SubagentRoleProfile; source: SubagentRunSummary["roleProfileSnapshotSource"] } {
  const parsed = row.role_profile_snapshot_json
    ? parseJsonObject(row.role_profile_snapshot_json, undefined)
    : undefined;
  if (isSubagentRoleProfileSnapshot(parsed, row.role_id)) {
    return { profile: parsed, source: "resolved" };
  }
  return {
    profile: getDefaultSubagentRoleProfile(row.role_id as SubagentRoleId),
    source: "legacy_default",
  };
}

function subagentEffectiveRoleSnapshotForRow(row: SubagentRunRow): SubagentRunSummary["effectiveRoleSnapshot"] {
  const parsed = row.effective_role_snapshot_json
    ? parseJsonObject(row.effective_role_snapshot_json, undefined)
    : undefined;
  return isSubagentEffectiveRoleSnapshot(parsed, row.role_id) ? parsed : undefined;
}

function subagentCapacityLeaseSnapshotForRow(row: SubagentRunRow): SubagentRunSummary["capacityLeaseSnapshot"] {
  const parsed = row.capacity_lease_snapshot_json
    ? parseJsonObject(row.capacity_lease_snapshot_json, undefined)
    : undefined;
  if (isSubagentCapacityLeaseSnapshot(parsed)) return parsed;
  const modelRuntimeSnapshot = parseJsonObject(row.model_runtime_snapshot_json, undefined) as unknown as SubagentRunSummary["modelRuntimeSnapshot"];
  if (!modelRuntimeSnapshot?.profile) return undefined as unknown as SubagentRunSummary["capacityLeaseSnapshot"];
  return materializeSubagentCapacityLeaseForRun(
    fallbackSubagentCapacityLease({
      parentThreadId: row.parent_thread_id,
      parentRunId: row.parent_run_id,
      canonicalTaskPath: row.canonical_task_path,
      roleId: row.role_id,
      model: modelRuntimeSnapshot.profile,
      now: row.created_at,
    }),
    {
      childRunId: row.id,
      childThreadId: row.child_thread_id,
      canonicalTaskPath: row.canonical_task_path,
      parentThreadId: row.parent_thread_id,
      parentRunId: row.parent_run_id,
      roleId: row.role_id,
    },
  );
}

function isSubagentRoleProfileSnapshot(value: unknown, roleId: string): value is SubagentRoleProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.schemaVersion === "ambient-subagent-role-profile-v1" &&
    record.id === roleId &&
    (record.schedulingPolicy === "live_parent_only" || record.schedulingPolicy === "automation_deferred");
}

export function normalizeSubagentMaturityEvidenceKind(kind: string): SubagentMaturityEvidenceKind {
  if ((SUBAGENT_MATURITY_EVIDENCE_KINDS as string[]).includes(kind)) return kind as SubagentMaturityEvidenceKind;
  throw new Error(`Unsupported sub-agent maturity evidence kind: ${kind}`);
}

export function normalizeSubagentMaturityEvidenceStatus(status: string): SubagentMaturityEvidenceStatus {
  if (status === "not_started" || status === "passed" || status === "failed") return status;
  throw new Error(`Unsupported sub-agent maturity evidence status: ${status}`);
}

export function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function latestSubagentMaturityEvidence(
  evidence: SubagentMaturityEvidence[],
  kind: SubagentMaturityEvidenceKind,
): SubagentMaturityEvidence | undefined {
  return evidence
    .filter((item) => item.kind === kind)
    .reduce<SubagentMaturityEvidence | undefined>((latest, item) => {
      if (!latest) return item;
      return item.updatedAt.localeCompare(latest.updatedAt) >= 0 ? item : latest;
    }, undefined);
}

export function passedSubagentMaturityEvidenceCount(evidence: SubagentMaturityEvidence[], kind: SubagentMaturityEvidenceKind): number {
  return evidence.filter((item) => item.kind === kind && item.status === "passed").length;
}

export function subagentMaturityEvidencePassed(evidence: SubagentMaturityEvidence | undefined): boolean | undefined {
  if (!evidence) return undefined;
  return evidence.status === "passed";
}

export function subagentCompletionGuardVisibilityFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): Partial<SubagentCompletionGuardVisibilityEvidence> | undefined {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return {
    childInspector: details.childInspector === true,
    parentBlockingIndicator: details.parentBlockingIndicator === true,
    replayDiagnostics: details.replayDiagnostics === true,
    diagnosticHistory: details.diagnosticHistory === true,
  };
}

export function subagentApprovalRoutingVisibilityFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): Partial<SubagentApprovalRoutingVisibilityEvidence> | undefined {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return {
    childRequestAttribution: details.childRequestAttribution === true,
    scopedResponsePersistence: details.scopedResponsePersistence === true,
    parentWaitResumption: details.parentWaitResumption === true,
    nonInteractiveFailure: details.nonInteractiveFailure === true,
    uiAndReplayVisibility: details.uiAndReplayVisibility === true,
  };
}

export function subagentProductionUiVisibilityFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): Partial<SubagentProductionUiVisibilityEvidence> | undefined {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return {
    collapsedParentClusters: details.collapsedParentClusters === true,
    blockingChildIndicators: details.blockingChildIndicators === true,
    childInspectorRows: details.childInspectorRows === true,
    repairReplayPanels: details.repairReplayPanels === true,
    localRuntimeOwnershipControls: details.localRuntimeOwnershipControls === true,
  };
}

export function subagentEventAttributionIntegrityFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): Partial<SubagentEventAttributionIntegrityEvidence> | undefined {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return {
    runtimePreviewAttribution: details.runtimePreviewAttribution === true,
    parentMailboxAttribution: details.parentMailboxAttribution === true,
    toolApprovalErrorProvenance: details.toolApprovalErrorProvenance === true,
    replayDiagnostics: details.replayDiagnostics === true,
    largeOutputArtifactBacking: details.largeOutputArtifactBacking === true,
  };
}

export function subagentLifecycleControlIntegrityFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): Partial<SubagentLifecycleControlIntegrityEvidence> | undefined {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return {
    parentStopCascade: details.parentStopCascade === true,
    childCancelIsolation: details.childCancelIsolation === true,
    closeCapacityRetention: details.closeCapacityRetention === true,
    lifecycleHookArtifacts: details.lifecycleHookArtifacts === true,
    restartInterruptionRepair: details.restartInterruptionRepair === true,
  };
}

export function subagentRetentionPolicyIntegrityFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): Partial<SubagentRetentionPolicyIntegrityEvidence> | undefined {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return {
    closeDoesNotDelete: details.closeDoesNotDelete === true,
    capCleanupOldestEligible: details.capCleanupOldestEligible === true,
    protectedChildrenRetained: details.protectedChildrenRetained === true,
    summaryArtifactsRetained: details.summaryArtifactsRetained === true,
    retainedStateVisible: details.retainedStateVisible === true,
  };
}

export function subagentToolScopeIntegrityFromEvidence(
  evidence: SubagentMaturityEvidence | undefined,
): Partial<SubagentToolScopeIntegrityEvidence> | undefined {
  const details = evidence?.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  return {
    hardDenyPrecedence: details.hardDenyPrecedence === true,
    roleTaskNarrowing: details.roleTaskNarrowing === true,
    exactToolAndExtensionResolution: details.exactToolAndExtensionResolution === true,
    childFanoutDefaultBlocked: details.childFanoutDefaultBlocked === true,
    snapshotAndInspectorDiagnostics: details.snapshotAndInspectorDiagnostics === true,
  };
}

export function subagentBugEvidenceFromAudit(evidence: SubagentMaturityEvidence | undefined): Partial<SubagentMaturityBugEvidence> | undefined {
  if (!evidence) return undefined;
  if (evidence.status === "passed") return { p0: 0, p1: 0 };
  if (evidence.status === "not_started") return undefined;
  const p0 = safeEvidenceCount(evidence.details?.p0);
  const p1 = safeEvidenceCount(evidence.details?.p1);
  if (p0 + p1 > 0) return { p0, p1 };
  return {
    p0: 0,
    p1: 1,
  };
}

export function subagentSecurityReviewFromEvidence(evidence: SubagentMaturityEvidence | undefined): {
  status: SubagentSecurityReviewStatus;
  reviewedAt?: string;
  reviewer?: string;
  notes?: string;
} | undefined {
  if (!evidence) return undefined;
  return {
    status: evidence.status === "passed" ? "passed" : evidence.status === "failed" ? "failed" : "not_started",
    reviewedAt: evidence.updatedAt,
    ...(evidence.reviewer ? { reviewer: evidence.reviewer } : {}),
    ...(evidence.notes ? { notes: evidence.notes } : {}),
  };
}

function safeEvidenceCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function parseJsonArray<T>(json: string): T[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
