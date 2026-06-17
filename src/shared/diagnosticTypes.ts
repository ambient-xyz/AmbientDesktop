import type { AmbientFeatureFlagSnapshot } from "./featureFlags";
import type { AgentMemoryStorageDiagnostics } from "./agentMemoryDiagnostics";
import type { AgentMemoryStarterStatus } from "./agentMemoryStarter";
import type {
  LocalModelResourceRegistryEntry,
  LocalRuntimeLeaseStatus,
  LocalRuntimePolicyHandoffActionKind,
  LocalRuntimePolicyHandoffMemoryEvidence,
  LocalRuntimePolicyHandoffNextSafeAction,
  LocalRuntimePolicyHandoffNextSafeActionKind,
  LocalRuntimePolicyHandoffNextSafeActionSafety,
} from "./localRuntimeTypes";
import type { SubagentMailboxDeliveryState, SubagentRepairDiagnosticAction, SubagentRepairIssueKind } from "./subagentTypes";
import type { ChatMessage } from "./threadTypes";
import type {
  CallableWorkflowTaskRestartIssue,
  CallableWorkflowTaskRestartIssueKind,
  CallableWorkflowTaskStatus,
  WorkflowArtifactStatus,
  WorkflowArtifactSummary,
  WorkflowRunStatus,
} from "./workflowTypes";

export interface DiagnosticExportResult {
  path: string;
  bytes: number;
  createdAt: string;
  summary?: DiagnosticExportSummary;
  agentMemory?: {
    diagnostics?: AgentMemoryStorageDiagnostics;
    starterStatus?: AgentMemoryStarterStatus;
  };
  subagents?: {
    replayEvidence?: DiagnosticExportSubagentReplayEvidence;
  };
  localRuntimes?: {
    evidence?: DiagnosticExportLocalRuntimeEvidence;
  };
}

export type DiagnosticExportHealthStatus = "healthy" | "needs_attention" | "error" | "unavailable";

export interface DiagnosticExportActionSummary {
  action: SubagentRepairDiagnosticAction;
  label: string;
  count: number;
}

export interface DiagnosticExportSubagentRepairSummary {
  status: DiagnosticExportHealthStatus;
  message: string;
  issueCount: number;
  shownIssueCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  truncatedIssues: boolean;
  affectedRunCount: number;
  affectedThreadCount: number;
  affectedBarrierCount: number;
  topActions: DiagnosticExportActionSummary[];
  errorMessages: string[];
}

export interface DiagnosticExportSubagentObservabilitySummary {
  status: DiagnosticExportHealthStatus;
  message: string;
  spawnAttempts: number;
  failedSpawns: number;
  failureRate: number | null;
  waitDurationCount: number;
  waitDurationTotalMs: number;
  waitDurationMaxMs: number;
  childIdleOpenRunCount: number;
  childIdleTotalMs: number;
  childIdleMaxMs: number;
  cancellationCascades: number;
  childRuntimeAborts: number;
  toolDenialCount: number;
  groupedCompletions: number;
  needsAttentionRequests: number;
  restartReconciliations: number;
  tokenCount: number;
  costMicros: number;
  localMemoryPeakBytes?: number;
  errorMessages: string[];
}

export interface DiagnosticExportSubagentAttributionIssueSummary {
  eventType: string;
  runId?: string;
  parentRunId?: string;
  message: string;
}

export interface DiagnosticExportSubagentAttributionSummary {
  status: DiagnosticExportHealthStatus;
  message: string;
  auditedRuntimeEventCount: number;
  auditedParentMailboxEventCount: number;
  issueCount: number;
  shownIssueCount: number;
  truncatedIssues: boolean;
  missingAttributionCount: number;
  mismatchedRunIdCount: number;
  issueSamples: DiagnosticExportSubagentAttributionIssueSummary[];
  errorMessages: string[];
}

export interface DiagnosticExportSubagentReplayTimelineItem {
  sequence: number;
  createdAt: string;
  runId: string;
  parentRunId: string;
  childThreadId: string;
  canonicalTaskPath?: string;
  roleId?: string;
  source?: string;
  type: string;
  status?: string;
  toolName?: string;
  textPreview?: string;
  messagePreview?: string;
  artifactPath?: string;
  approvalId?: string;
  approvalSource?: string;
  worktreeIsolated?: boolean;
  worktreePath?: string;
}

export interface DiagnosticExportSubagentReplayTranscriptItem {
  sequence: number;
  createdAt: string;
  threadId: string;
  role: ChatMessage["role"];
  childRunId?: string;
  childThreadId?: string;
  contentPreview: string;
}

export interface DiagnosticExportSubagentCompletionGuardSummary {
  valid?: boolean;
  synthesisAllowed?: boolean;
  required?: boolean;
  structuredEvidenceCount?: number;
  ambientEvidenceCount?: number;
  isolatedWorktreeEvidenceCount?: number;
  approvalEvidenceCount?: number;
  reason?: string;
}

export interface DiagnosticExportSubagentLifecycleSummary {
  action?: string;
  source?: string;
  status?: string;
  waitBarrierId?: string;
  barrierStatus?: string;
  reason?: string;
  userDecisionPreview?: string;
  partialSummaryPreview?: string;
  detachedRunIds?: string[];
  cancelledRunIds?: string[];
  stoppedChildRunIds?: string[];
  unchangedRunIds?: string[];
  cancelledWaitBarrierIds?: string[];
  cancelledMailboxEventIds?: string[];
  parentCancellationRequested?: boolean;
}

export interface DiagnosticExportSubagentReplayParentMailboxItem {
  sequence: number;
  id: string;
  createdAt: string;
  updatedAt: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: string;
  deliveryState: SubagentMailboxDeliveryState;
  childRunIds: string[];
  childThreadIds?: string[];
  canonicalTaskPaths?: string[];
  childSourceLabels?: string[];
  idempotencyKey?: string;
  payloadPreview?: string;
  failureStage?: string;
  approvalMode?: string;
  approvalUnavailable?: boolean;
  deniedCategoryIds?: string[];
  deniedToolIds?: string[];
  deniedCategoryLabels?: string[];
  deniedToolLabels?: string[];
  completionGuardSummary?: DiagnosticExportSubagentCompletionGuardSummary;
  lifecycleSummary?: DiagnosticExportSubagentLifecycleSummary;
}

export interface DiagnosticExportCallableWorkflowReplayItem {
  sequence: number;
  taskId: string;
  launchId: string;
  createdAt: string;
  updatedAt: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  toolName: string;
  sourceKind: string;
  title: string;
  status: CallableWorkflowTaskStatus;
  statusLabel: string;
  blocking: boolean;
  runnerDeferredReason: string;
  workflowThreadId?: string;
  workflowArtifactId?: string;
  workflowArtifactTitle?: string;
  workflowArtifactStatus?: WorkflowArtifactStatus;
  workflowArtifactSourcePath?: string;
  workflowArtifactStatePath?: string;
  workflowArtifactMutationPolicy?: WorkflowArtifactSummary["manifest"]["mutationPolicy"];
  workflowRunId?: string;
  workflowRunStatus?: WorkflowRunStatus;
  workflowRunEventTypes: string[];
  artifactLinkState: "not_linked" | "linked" | "missing";
  runLinkState: "not_linked" | "linked" | "missing" | "artifact_mismatch";
  callerKind?: string;
  childThreadId?: string;
  childRunId?: string;
  subagentRunId?: string;
  canonicalTaskPath?: string;
  approvalSource?: string;
  approvalScope?: string;
  worktreeIsolated?: boolean;
  worktreeStatus?: string;
  nestedFanoutSource?: string;
  lastEventType?: string;
  lastEventMessage?: string;
  tokenCount?: number;
  costMicros?: number;
}

export interface DiagnosticExportCallableWorkflowRestartIssueItem {
  sequence: number;
  issueId: string;
  kind: CallableWorkflowTaskRestartIssueKind;
  severity: CallableWorkflowTaskRestartIssue["severity"];
  messagePreview: string;
  taskId: string;
  taskStatus?: CallableWorkflowTaskStatus;
  taskStatusLabel?: string;
  blocking?: boolean;
  runnerDeferredReason?: string;
  parentThreadId: string;
  parentRunId: string;
  workflowArtifactId?: string;
  workflowRunId?: string;
  callerKind?: string;
  callerThreadId?: string;
  callerRunId?: string;
  childThreadId?: string;
  childRunId?: string;
  subagentRunId?: string;
  canonicalTaskPath?: string;
  childParentThreadId?: string;
  childParentRunId?: string;
  approvalSource?: string;
  approvalScope?: string;
  worktreeRequired?: boolean;
  worktreeIsolated?: boolean;
  worktreeStatus?: string;
  nestedFanoutRequired?: boolean;
  nestedFanoutSource?: string;
}

export interface DiagnosticExportSubagentReplayEvidence {
  schemaVersion: "ambient-subagent-replay-evidence-v1";
  source: "diagnostic_export";
  createdAt: string;
  liveTokens: false;
  truncated: boolean;
  counts: {
    runs: number;
    childThreads: number;
    persistedRunEvents: number;
    runtimeEvents: number;
    parentMailboxEvents: number;
    transcriptMessages: number;
    callableWorkflowTasks: number;
  };
  shownCounts: {
    runs: number;
    childThreads: number;
    persistedRunEvents: number;
    runtimeEvents: number;
    parentMailboxEvents: number;
    transcriptMessages: number;
    callableWorkflowTasks: number;
  };
  childThreads: Array<{
    threadId: string;
    runId?: string;
    parentThreadId?: string;
    parentRunId?: string;
    canonicalTaskPath?: string;
    collapsedByDefault?: boolean;
    status?: string;
  }>;
  runtimeEventTimeline: DiagnosticExportSubagentReplayTimelineItem[];
  persistedRunEventTimeline: DiagnosticExportSubagentReplayTimelineItem[];
  parentMailboxTimeline: DiagnosticExportSubagentReplayParentMailboxItem[];
  transcriptTimeline: DiagnosticExportSubagentReplayTranscriptItem[];
  callableWorkflowTaskTimeline: DiagnosticExportCallableWorkflowReplayItem[];
  restartRepair: {
    observedIssueKinds: SubagentRepairIssueKind[];
    repairedRunIds: string[];
    repairedBarrierIds: string[];
    repairedParentControlBarrierIds: string[];
    repairableSpawnEdgeRunIds: string[];
    danglingSpawnEdgeRunIds: string[];
    diagnosticRunIds: string[];
    callableWorkflowTaskIssues: DiagnosticExportCallableWorkflowRestartIssueItem[];
  };
}

export interface DiagnosticExportSubagentReplaySummary {
  status: DiagnosticExportHealthStatus;
  message: string;
  runCount: number;
  childThreadCount: number;
  persistedRunEventCount: number;
  runtimeEventCount: number;
  parentMailboxEventCount: number;
  transcriptMessageCount: number;
  callableWorkflowTaskCount: number;
  truncated: boolean;
  errorMessages: string[];
}

export interface DiagnosticExportSubagentSummary {
  repairDiagnostics: DiagnosticExportSubagentRepairSummary;
  observability: DiagnosticExportSubagentObservabilitySummary;
  attribution: DiagnosticExportSubagentAttributionSummary;
  replayEvidence: DiagnosticExportSubagentReplaySummary;
}

export interface DiagnosticExportLocalRuntimeSummary {
  status: DiagnosticExportHealthStatus;
  message: string;
  runtimeCount: number;
  runningCount: number;
  activeLeaseCount: number;
  stopBlockedCount: number;
  restartBlockedCount: number;
  untrackedCount: number;
  staleLeaseCount: number;
  releasedLeaseCount: number;
  crashedLeaseCount: number;
  activeEstimatedResidentMemoryBytes: number;
  activeActualResidentMemoryBytes?: number;
  memoryPolicyOutcome?: string;
  memoryPolicyReason?: string;
  errorMessages: string[];
}

export interface DiagnosticExportLocalRuntimeEvidenceCounts {
  runtimes: number;
  activeOwners: number;
  blockedActions: number;
  nextSafeActions: number;
}

export interface DiagnosticExportLocalRuntimeEvidenceRuntimeItem {
  sequence: number;
  runtimeEntryId: string;
  capability: LocalModelResourceRegistryEntry["capability"];
  trackingStatus: "managed" | "tracked" | "untracked";
  running: boolean;
  providerId?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  pid?: number;
  endpoint?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  memorySampledAt?: string;
  ownerLabels: string[];
  activeLeaseIds: string[];
  staleLeaseIds: string[];
  releasedLeaseIds: string[];
  crashedLeaseIds: string[];
  ordinaryStopAllowed: boolean;
  ordinaryRestartAllowed: boolean;
  stopReason: string;
  restartReason: string;
  forceStopAllowed: boolean;
  forceRestartAllowed: boolean;
  forceStopRequiresSubagentCancellation: boolean;
  forceRestartRequiresSubagentCancellation: boolean;
  untracked: boolean;
}

export interface DiagnosticExportLocalRuntimeEvidenceOwnerItem {
  sequence: number;
  runtimeEntryId: string;
  leaseId: string;
  displayName: string;
  status: LocalRuntimeLeaseStatus;
  parentThreadId?: string;
  subagentThreadId?: string;
  subagentRunId?: string;
  capabilityKind: LocalModelResourceRegistryEntry["capability"];
  providerId?: string;
  modelRuntimeId?: string;
  modelProfileId?: string;
  modelId?: string;
  estimatedResidentMemoryBytes?: number;
  actualResidentMemoryBytes?: number;
  pid?: number;
  endpoint?: string;
  acquiredAt: string;
  lastHeartbeatAt: string;
}

export interface DiagnosticExportLocalRuntimeEvidenceBlockedActionItem {
  sequence: number;
  runtimeEntryId: string;
  action: LocalRuntimePolicyHandoffActionKind;
  reason: string;
  blockerLeaseIds: string[];
  affectedSubagentLabels: string[];
  affectedSubagentThreadIds: string[];
  forceAllowed: boolean;
  forceRequiresSubagentCancellation: boolean;
  untracked: boolean;
}

export interface DiagnosticExportLocalRuntimeEvidenceNextSafeActionItem {
  sequence: number;
  action: LocalRuntimePolicyHandoffNextSafeActionKind;
  safety: LocalRuntimePolicyHandoffNextSafeActionSafety;
  reason: string;
  runtimeEntryId?: string;
  runtimeId?: string;
  capability?: LocalModelResourceRegistryEntry["capability"];
  toolName?: LocalRuntimePolicyHandoffNextSafeAction["toolName"];
  blockerLeaseIds?: string[];
  affectedSubagentLabels?: string[];
  ownershipResolution?: {
    lifecycleAction: "stop" | "restart";
    resolution: "cancel-or-mark-affected-subagents";
    requiresInventoryRefresh: true;
    reason: string;
    blockerLeaseIds: string[];
    affectedSubagentLabels: string[];
  };
  untracked?: boolean;
}

export interface DiagnosticExportLocalRuntimeEvidence {
  schemaVersion: "ambient-local-runtime-diagnostic-evidence-v1";
  source: "diagnostic_export";
  capturedAt: string;
  truncated: boolean;
  counts: DiagnosticExportLocalRuntimeEvidenceCounts;
  shownCounts: DiagnosticExportLocalRuntimeEvidenceCounts;
  runtimes: DiagnosticExportLocalRuntimeEvidenceRuntimeItem[];
  activeOwners: DiagnosticExportLocalRuntimeEvidenceOwnerItem[];
  blockedActions: DiagnosticExportLocalRuntimeEvidenceBlockedActionItem[];
  nextSafeActions: DiagnosticExportLocalRuntimeEvidenceNextSafeActionItem[];
  memoryEvidence: LocalRuntimePolicyHandoffMemoryEvidence;
}

export interface DiagnosticExportSummary {
  featureFlags?: AmbientFeatureFlagSnapshot;
  agentMemory?: AgentMemoryStorageDiagnostics;
  agentMemoryStarter?: AgentMemoryStarterStatus;
  subagents: DiagnosticExportSubagentSummary;
  localRuntimes?: DiagnosticExportLocalRuntimeSummary;
}
