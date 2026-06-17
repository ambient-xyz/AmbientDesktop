import type { AmbientModelRuntimeSnapshot } from "./ambientModels";
import type { AmbientFeatureFlagSnapshot } from "./featureFlags";
import type { SubagentCapacityLeaseSnapshot } from "./subagentCapacity";
import type {
  AmbientSubagentProtocolVersion,
  SubagentDependencyMode,
  SubagentRunStatus,
  SubagentWaitBarrierFailurePolicy,
  SubagentWaitBarrierMode,
  SubagentWaitBarrierStatus,
} from "./subagentProtocol";
import type { SubagentRoleProfile } from "./subagentRoles";
import type { SubagentEffectiveRoleSnapshot } from "./subagentPatternGraph";
import type { SubagentToolScopeResolution } from "./subagentToolScope";
import type {
  MutationWorkspaceLease,
  SymphonyChildLaunchContractBundle,
} from "./symphonyFineGrainedContracts";
import type { CallableWorkflowTaskRestartDiagnosticsReport, CallableWorkflowTaskRestartReconciliationSummary } from "./workflowTypes";

export interface CreateSubagentRunInput {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  title: string;
  roleId: string;
  roleProfileSnapshot?: SubagentRoleProfile;
  effectiveRoleSnapshot?: SubagentEffectiveRoleSnapshot;
  canonicalTaskPath: string;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  modelRuntimeSnapshot: AmbientModelRuntimeSnapshot;
  capacityLeaseSnapshot?: SubagentCapacityLeaseSnapshot;
  symphonyLaunchContracts?: SymphonyChildLaunchContractBundle;
  symphonyMutationWorkspaceLease?: MutationWorkspaceLease;
  dependencyMode?: SubagentDependencyMode;
  childOrder?: number;
}

export interface SubagentRunSummary {
  id: string;
  protocolVersion: AmbientSubagentProtocolVersion;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  childThreadId: string;
  canonicalTaskPath: string;
  roleId: string;
  roleProfileSnapshot: SubagentRoleProfile;
  roleProfileSnapshotSource: "resolved" | "legacy_default";
  effectiveRoleSnapshot?: SubagentEffectiveRoleSnapshot;
  dependencyMode: SubagentDependencyMode;
  status: SubagentRunStatus;
  featureFlagSnapshot: AmbientFeatureFlagSnapshot;
  modelRuntimeSnapshot: AmbientModelRuntimeSnapshot;
  capacityLeaseSnapshot: SubagentCapacityLeaseSnapshot;
  symphonyLaunchContracts?: SymphonyChildLaunchContractBundle;
  symphonyMutationWorkspaceLease?: MutationWorkspaceLease;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  closedAt?: string;
  resultArtifact?: unknown;
}

export interface SubagentRunEventSummary {
  runId: string;
  sequence: number;
  type: string;
  createdAt: string;
  preview?: unknown;
  artifactPath?: string;
}

export interface SubagentSpawnEdgeSummary {
  parentRunId: string;
  childRunId: string;
  parentThreadId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  depth: number;
  status: SubagentRunStatus;
  capacityReleasedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type SubagentMailboxDirection = "parent_to_child" | "child_to_parent";

export type SubagentMailboxDeliveryState = "queued" | "delivered" | "consumed" | "failed" | "cancelled";

export interface SubagentMailboxEventSummary {
  id: string;
  runId: string;
  direction: SubagentMailboxDirection;
  type: string;
  payload: unknown;
  deliveryState: SubagentMailboxDeliveryState;
  createdAt: string;
  deliveredAt?: string;
}

export interface SubagentParentMailboxEventSummary {
  id: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: string;
  payload: unknown;
  deliveryState: SubagentMailboxDeliveryState;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

export interface SubagentPromptSnapshotSummary {
  runId: string;
  sequence: number;
  createdAt: string;
  promptSha256: string;
  promptPreview: string;
  snapshot: unknown;
}

export interface SubagentToolScopeSnapshotSummary {
  runId: string;
  sequence: number;
  createdAt: string;
  scope: SubagentToolScopeResolution;
  resolverInputs: unknown;
}

export interface SubagentWaitBarrierSummary {
  id: string;
  parentThreadId: string;
  parentRunId: string;
  childRunIds: string[];
  dependencyMode: SubagentWaitBarrierMode;
  status: SubagentWaitBarrierStatus;
  failurePolicy: SubagentWaitBarrierFailurePolicy;
  quorumThreshold?: number;
  timeoutMs?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionArtifact?: unknown;
}

export type SubagentRepairIssueKind =
  | "missing_parent_thread"
  | "missing_child_thread"
  | "orphan_child_parent_thread"
  | "orphan_child_thread"
  | "thread_run_mismatch"
  | "active_run_interrupted"
  | "missing_lifecycle_start"
  | "missing_lifecycle_stop"
  | "missing_feature_flag_snapshot"
  | "subagent_feature_flag_disabled"
  | "missing_role_profile_snapshot"
  | "role_profile_snapshot_mismatch"
  | "missing_model_runtime_snapshot"
  | "model_runtime_snapshot_mismatch"
  | "missing_capacity_lease"
  | "capacity_lease_mismatch"
  | "missing_prompt_snapshot"
  | "prompt_snapshot_mismatch"
  | "missing_tool_scope_snapshot"
  | "tool_scope_snapshot_mismatch"
  | "missing_result_artifact"
  | "invalid_result_artifact"
  | "result_artifact_mismatch"
  | "missing_spawn_edge"
  | "dangling_spawn_edge"
  | "spawn_edge_mismatch"
  | "dangling_wait_barrier_child"
  | "parent_cancel_control_unreconciled";

export interface SubagentRepairIssue {
  id: string;
  kind: SubagentRepairIssueKind;
  severity: "info" | "warning" | "error";
  message: string;
  runId?: string;
  threadId?: string;
  parentThreadId?: string;
  parentRunId?: string;
  barrierId?: string;
}

export type SubagentRepairDiagnosticAction =
  | "auto_reconcile_restart"
  | "repair_spawn_edge"
  | "inspect_child_thread"
  | "inspect_lifecycle_events"
  | "inspect_run_snapshot"
  | "inspect_result_artifact"
  | "manual_repair_required";

export type SubagentPersistedChildTreeRepairAction =
  | "reconstruct_missing_spawn_edge"
  | "realign_spawn_edge"
  | "prune_dangling_spawn_edge";

export interface SubagentRepairDiagnosticItem {
  issueId: string;
  kind: SubagentRepairIssueKind;
  severity: SubagentRepairIssue["severity"];
  messagePreview: string;
  runId?: string;
  threadId?: string;
  parentThreadId?: string;
  parentRunId?: string;
  barrierId?: string;
  action: SubagentRepairDiagnosticAction;
  actionLabel: string;
  destructive: false;
}

export interface SubagentRepairDiagnosticsReport {
  schemaVersion: "ambient-subagent-repair-diagnostics-v1";
  createdAt: string;
  issueCount: number;
  shownIssueCount: number;
  truncatedIssues: boolean;
  affectedIdsTruncated: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  repairedRunIds: string[];
  repairedBarrierIds: string[];
  repairedParentControlBarrierIds: string[];
  repairedSpawnEdgeRunIds: string[];
  prunedDanglingSpawnEdgeRunIds: string[];
  diagnosticRunIds: string[];
  affectedRunIds: string[];
  affectedThreadIds: string[];
  affectedBarrierIds: string[];
  actionCounts: Partial<Record<SubagentRepairDiagnosticAction, number>>;
  issues: SubagentRepairDiagnosticItem[];
  callableWorkflowTasks?: CallableWorkflowTaskRestartDiagnosticsReport;
}

export interface SubagentRestartReconciliationSummary {
  schemaVersion: "ambient-subagent-restart-reconciliation-v1";
  createdAt: string;
  issueCount: number;
  skipped?: boolean;
  skipReason?: "ambient_subagents_disabled";
  featureFlagSnapshot?: AmbientFeatureFlagSnapshot;
  repairedRunIds: string[];
  repairedBarrierIds: string[];
  repairedParentControlBarrierIds: string[];
  repairableSpawnEdgeRunIds: string[];
  danglingSpawnEdgeRunIds: string[];
  diagnosticRunIds: string[];
  issues: SubagentRepairIssue[];
  callableWorkflowTasks?: CallableWorkflowTaskRestartReconciliationSummary;
}

export interface SubagentPersistedChildTreeRepairResult {
  schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1";
  createdAt: string;
  dryRun: boolean;
  skipped?: boolean;
  skipReason?: "ambient_subagents_disabled";
  featureFlagSnapshot?: AmbientFeatureFlagSnapshot;
  requestedActions: SubagentPersistedChildTreeRepairAction[];
  beforeIssueCount: number;
  afterIssueCount?: number;
  reconstructedMissingSpawnEdgeRunIds: string[];
  realignedSpawnEdgeRunIds: string[];
  prunedDanglingSpawnEdgeRunIds: string[];
  skippedIssueIds: string[];
  remainingIssues?: SubagentRepairIssue[];
}

export interface ResolveSubagentApprovalInput {
  childRunId: string;
  approvalId: string;
  decision: "approved" | "denied";
  requestedScope?: string;
  userDecision?: string;
  approvalRequestParentMailboxEventId?: string;
  approvalRequestChildMailboxEventId?: string;
}

export type SubagentWaitBarrierDecision =
  | "continue_with_partial"
  | "fail_parent"
  | "retry_child"
  | "detach_child"
  | "cancel_parent";

export interface ResolveSubagentWaitBarrierInput {
  waitBarrierId: string;
  decision: SubagentWaitBarrierDecision;
  userDecision?: string;
  partialSummary?: string;
  idempotencyKey?: string;
}

export interface CancelSubagentRunInput {
  childRunId: string;
  reason?: string;
}

export interface CloseSubagentRunInput {
  childRunId: string;
  reason?: string;
}

export interface SubagentApprovalResolutionResult {
  schemaVersion: "ambient-subagent-approval-resolution-v1";
  replay: boolean;
  childRun: SubagentRunSummary;
  approvalId: string;
  decision: "approved" | "denied";
  requestedScope: string;
  effectiveScope: string;
  childAlwaysDefaulted: boolean;
  parentRemainsBlocked: boolean;
  approvalRequestParentMailboxEvent?: SubagentParentMailboxEventSummary;
  approvalRequestChildMailboxEvent?: SubagentMailboxEventSummary;
  approvalResponseChildMailboxEvent?: SubagentMailboxEventSummary;
  approvalForwardedParentMailboxEvent?: SubagentParentMailboxEventSummary;
  approvalRunEvent?: SubagentRunEventSummary;
  waitBarrier?: SubagentWaitBarrierSummary;
}

export interface SubagentWaitBarrierResolutionResult {
  schemaVersion: "ambient-subagent-wait-barrier-resolution-result-v1";
  replay: boolean;
  waitBarrier: SubagentWaitBarrierSummary;
  childRuns: SubagentRunSummary[];
  decision: SubagentWaitBarrierDecision;
  parentMailboxEvent?: SubagentParentMailboxEventSummary;
}
