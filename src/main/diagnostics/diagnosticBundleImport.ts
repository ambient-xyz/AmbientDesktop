import { stat, readFile } from "node:fs/promises";
import { z } from "zod";
import type {
  AmbientFeatureFlagSnapshot,
  DiagnosticExportLocalRuntimeEvidence,
  DiagnosticExportResult,
  DiagnosticExportSubagentReplayEvidence,
  DiagnosticExportSummary,
} from "../../shared/types";
import {
  AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
  AMBIENT_SUBAGENTS_FEATURE_FLAG,
  AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG,
} from "../../shared/featureFlags";
import {
  AGENT_MEMORY_STARTER_BLOCKER_CODES,
  AGENT_MEMORY_STARTER_NEXT_ACTIONS,
  AGENT_MEMORY_STARTER_STATES,
  type AgentMemoryStarterStatus,
} from "../../shared/agentMemoryStarter";

export const MAX_DIAGNOSTIC_IMPORT_BYTES = 50 * 1024 * 1024;

const MAX_SUMMARY_MESSAGE_CHARS = 1_000;
const MAX_EVIDENCE_STRING_CHARS = 500;
const MAX_ERROR_MESSAGES = 8;
const MAX_REPLAY_ROWS = 240;
const MAX_RESTART_REPAIR_IDS = 120;
const MAX_LOCAL_RUNTIME_EVIDENCE_ROWS = 240;
const MAX_LOCAL_RUNTIME_EVIDENCE_IDS = 120;
const MAX_AGENT_MEMORY_RUNTIME_SNAPSHOTS = 50;

const healthStatusSchema = z.enum(["healthy", "needs_attention", "error", "unavailable"]);
const nonNegativeIntegerSchema = z.number().int().nonnegative();
const optionalBoundedStringSchema = z.string().transform((value) => truncateText(value, MAX_EVIDENCE_STRING_CHARS)).optional();
const boundedSummaryStringSchema = z.string().transform((value) => truncateText(value, MAX_SUMMARY_MESSAGE_CHARS));
const boundedErrorMessagesSchema = z.array(boundedSummaryStringSchema).max(MAX_ERROR_MESSAGES);
const callableWorkflowTaskStatusSchema = z.enum(["queued", "compiling", "running", "paused", "succeeded", "failed", "canceled"]);
const callableWorkflowTaskRestartIssueKindSchema = z.enum([
  "missing_parent_thread",
  "missing_parent_run",
  "parent_run_thread_mismatch",
  "active_task_interrupted",
  "missing_workflow_artifact",
  "missing_workflow_thread",
  "missing_workflow_run",
  "workflow_run_artifact_mismatch",
  "missing_task_artifact_link",
  "workflow_run_terminal_task_unfinished",
]);
const workflowArtifactStatusSchema = z.enum(["draft", "ready_for_preview", "approved", "rejected", "archived"]);
const workflowRunStatusSchema = z.enum(["created", "previewed", "running", "paused", "needs_input", "succeeded", "failed", "canceled", "skipped"]);
const diagnosticSeveritySchema = z.enum(["info", "warning", "error"]);

const diagnosticActionSummarySchema = z.object({
  action: z.enum([
    "auto_reconcile_restart",
    "repair_spawn_edge",
    "inspect_child_thread",
    "inspect_lifecycle_events",
    "inspect_run_snapshot",
    "inspect_result_artifact",
    "manual_repair_required",
  ]),
  label: boundedSummaryStringSchema,
  count: nonNegativeIntegerSchema,
});

const repairSummarySchema = z.object({
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
  issueCount: nonNegativeIntegerSchema,
  shownIssueCount: nonNegativeIntegerSchema,
  errorCount: nonNegativeIntegerSchema,
  warningCount: nonNegativeIntegerSchema,
  infoCount: nonNegativeIntegerSchema,
  truncatedIssues: z.boolean(),
  affectedRunCount: nonNegativeIntegerSchema,
  affectedThreadCount: nonNegativeIntegerSchema,
  affectedBarrierCount: nonNegativeIntegerSchema,
  topActions: z.array(diagnosticActionSummarySchema).max(8),
  errorMessages: boundedErrorMessagesSchema,
});

const observabilitySummarySchema = z.object({
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
  spawnAttempts: nonNegativeIntegerSchema,
  failedSpawns: nonNegativeIntegerSchema,
  failureRate: z.number().finite().nonnegative().nullable(),
  waitDurationCount: nonNegativeIntegerSchema,
  waitDurationTotalMs: nonNegativeIntegerSchema,
  waitDurationMaxMs: nonNegativeIntegerSchema,
  childIdleOpenRunCount: nonNegativeIntegerSchema,
  childIdleTotalMs: nonNegativeIntegerSchema,
  childIdleMaxMs: nonNegativeIntegerSchema,
  cancellationCascades: nonNegativeIntegerSchema,
  childRuntimeAborts: nonNegativeIntegerSchema,
  toolDenialCount: nonNegativeIntegerSchema,
  groupedCompletions: nonNegativeIntegerSchema,
  needsAttentionRequests: nonNegativeIntegerSchema,
  restartReconciliations: nonNegativeIntegerSchema,
  tokenCount: nonNegativeIntegerSchema,
  costMicros: nonNegativeIntegerSchema,
  localMemoryPeakBytes: nonNegativeIntegerSchema.optional(),
  errorMessages: boundedErrorMessagesSchema,
});

const attributionIssueSummarySchema = z.object({
  eventType: boundedSummaryStringSchema,
  runId: optionalBoundedStringSchema,
  parentRunId: optionalBoundedStringSchema,
  message: boundedSummaryStringSchema,
});

const attributionSummarySchema = z.object({
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
  auditedRuntimeEventCount: nonNegativeIntegerSchema,
  auditedParentMailboxEventCount: nonNegativeIntegerSchema,
  issueCount: nonNegativeIntegerSchema,
  shownIssueCount: nonNegativeIntegerSchema,
  truncatedIssues: z.boolean(),
  missingAttributionCount: nonNegativeIntegerSchema,
  mismatchedRunIdCount: nonNegativeIntegerSchema,
  issueSamples: z.array(attributionIssueSummarySchema).max(24),
  errorMessages: boundedErrorMessagesSchema,
});

const replaySummarySchema = z.object({
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
  runCount: nonNegativeIntegerSchema,
  childThreadCount: nonNegativeIntegerSchema,
  persistedRunEventCount: nonNegativeIntegerSchema,
  runtimeEventCount: nonNegativeIntegerSchema,
  parentMailboxEventCount: nonNegativeIntegerSchema,
  transcriptMessageCount: nonNegativeIntegerSchema,
  callableWorkflowTaskCount: nonNegativeIntegerSchema.default(0),
  truncated: z.boolean(),
  errorMessages: boundedErrorMessagesSchema,
});

const localRuntimeSummarySchema = z.object({
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
  runtimeCount: nonNegativeIntegerSchema,
  runningCount: nonNegativeIntegerSchema,
  activeLeaseCount: nonNegativeIntegerSchema,
  stopBlockedCount: nonNegativeIntegerSchema,
  restartBlockedCount: nonNegativeIntegerSchema,
  untrackedCount: nonNegativeIntegerSchema,
  staleLeaseCount: nonNegativeIntegerSchema,
  releasedLeaseCount: nonNegativeIntegerSchema,
  crashedLeaseCount: nonNegativeIntegerSchema,
  activeEstimatedResidentMemoryBytes: nonNegativeIntegerSchema,
  activeActualResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
  memoryPolicyOutcome: boundedSummaryStringSchema.optional(),
  memoryPolicyReason: boundedSummaryStringSchema.optional(),
  errorMessages: boundedErrorMessagesSchema,
});

const agentMemoryOperationStatusSchema = z.object({
  status: z.enum(["idle", "ok", "unavailable", "error"]),
  at: boundedSummaryStringSchema,
  message: optionalBoundedStringSchema,
  moduleSpecifier: optionalBoundedStringSchema,
  total: nonNegativeIntegerSchema.optional(),
  strategy: optionalBoundedStringSchema,
  providerId: optionalBoundedStringSchema,
  modelId: optionalBoundedStringSchema,
  modelProfileId: optionalBoundedStringSchema,
  dimensions: nonNegativeIntegerSchema.optional(),
  endpoint: optionalBoundedStringSchema,
});

const agentMemoryEmbeddingDiagnosticsSchema = z.object({
  enabled: z.boolean(),
  status: z.enum(["disabled", "ready", "keyword_fallback", "starting", "unavailable", "error"]),
  message: boundedSummaryStringSchema,
  providerMode: optionalBoundedStringSchema,
  providerId: optionalBoundedStringSchema,
  providerCapabilityId: optionalBoundedStringSchema,
  packageName: optionalBoundedStringSchema,
  modelId: optionalBoundedStringSchema,
  modelProfileId: optionalBoundedStringSchema,
  dimensions: nonNegativeIntegerSchema.optional(),
  endpoint: optionalBoundedStringSchema,
  runtimeId: optionalBoundedStringSchema,
  runtimeStatus: optionalBoundedStringSchema,
  running: z.boolean().optional(),
  autoStartProvider: z.boolean().optional(),
  preflightEnabled: z.boolean().optional(),
  sendDimensions: z.boolean().optional(),
  maxInputChars: nonNegativeIntegerSchema.optional(),
  timeoutMs: nonNegativeIntegerSchema.optional(),
  reindexStatus: z.enum(["not_required", "pending", "partial", "complete", "error", "unknown"]).optional(),
  missingHints: boundedErrorMessagesSchema.optional(),
  lastError: optionalBoundedStringSchema,
});

const agentMemoryContextAccountingSchema = z.object({
  at: boundedSummaryStringSchema,
  messageCount: nonNegativeIntegerSchema,
  originalUserChars: nonNegativeIntegerSchema,
  recallContextChars: nonNegativeIntegerSchema,
  offloadContextChars: nonNegativeIntegerSchema,
  totalInjectedChars: nonNegativeIntegerSchema,
  projectedUserMessageChars: nonNegativeIntegerSchema,
  truncated: z.boolean(),
});

const agentMemoryRuntimeSnapshotSchema = z.object({
  threadId: boundedSummaryStringSchema,
  active: z.boolean(),
  dataDir: boundedSummaryStringSchema,
  sessionKey: boundedSummaryStringSchema,
  embedding: agentMemoryEmbeddingDiagnosticsSchema.optional(),
  lastInitialize: agentMemoryOperationStatusSchema.optional(),
  lastEmbedding: agentMemoryOperationStatusSchema.optional(),
  lastRecall: agentMemoryOperationStatusSchema.optional(),
  lastCapture: agentMemoryOperationStatusSchema.optional(),
  lastSearch: agentMemoryOperationStatusSchema.optional(),
  lastContextInjection: agentMemoryContextAccountingSchema.optional(),
});

const agentMemoryNativePreflightDependencySchema = z.object({
  name: boundedSummaryStringSchema,
  expectedVersion: optionalBoundedStringSchema,
  resolvable: z.boolean(),
  version: optionalBoundedStringSchema,
  packageJsonPath: optionalBoundedStringSchema,
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
});

const agentMemoryNativePreflightSchema = z.object({
  schemaVersion: z.literal("ambient-agent-memory-native-preflight-v1"),
  checkedAt: boundedSummaryStringSchema,
  platform: boundedSummaryStringSchema,
  arch: boundedSummaryStringSchema,
  nodeModuleVersion: optionalBoundedStringSchema,
  coreModuleConfigured: z.boolean(),
  coreModuleSpecifier: optionalBoundedStringSchema,
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
  dependencies: z.array(agentMemoryNativePreflightDependencySchema).max(12),
  errors: boundedErrorMessagesSchema,
});

const agentMemoryStorageDiagnosticsSchema = z.object({
  schemaVersion: z.literal("ambient-agent-memory-diagnostics-v1"),
  adapter: z.literal("tencentdb"),
  storageScope: z.literal("workspace"),
  checkedAt: boundedSummaryStringSchema,
  status: healthStatusSchema,
  message: boundedSummaryStringSchema,
  featureEnabled: z.boolean(),
  settingsEnabled: z.boolean(),
  defaultThreadEnabled: z.boolean(),
  embedding: agentMemoryEmbeddingDiagnosticsSchema,
  activeThreadCount: nonNegativeIntegerSchema,
  threadEnabledCount: nonNegativeIntegerSchema,
  dataDir: boundedSummaryStringSchema,
  dataDirExists: z.boolean(),
  storageSchemaStatus: z.enum(["missing", "current", "unsupported"]),
  storageSchemaPath: boundedSummaryStringSchema,
  storageSchemaExpectedVersion: boundedSummaryStringSchema,
  storageSchemaVersion: optionalBoundedStringSchema,
  storageSchemaMessage: boundedSummaryStringSchema,
  fileCount: nonNegativeIntegerSchema,
  totalBytes: nonNegativeIntegerSchema,
  topLevelEntryCount: nonNegativeIntegerSchema,
  rawContentIncluded: z.literal(false),
  nativePreflight: agentMemoryNativePreflightSchema.optional(),
  runtimeSnapshots: z.array(agentMemoryRuntimeSnapshotSchema).max(MAX_AGENT_MEMORY_RUNTIME_SNAPSHOTS),
  errors: boundedErrorMessagesSchema,
});

const agentMemoryStarterEmbeddingSettingsSchema = z.object({
  enabled: z.boolean(),
  providerMode: z.literal("ambient-managed"),
  providerCapabilityId: optionalBoundedStringSchema,
  autoStartProvider: z.boolean(),
  modelId: optionalBoundedStringSchema,
  dimensions: nonNegativeIntegerSchema.optional(),
  sendDimensions: z.boolean(),
  maxInputChars: nonNegativeIntegerSchema,
  timeoutMs: nonNegativeIntegerSchema,
  preflightEnabled: z.boolean(),
});

const agentMemoryStarterSettingsSchema = z.object({
  featureFlags: z.object({
    tencentDbMemory: z.boolean(),
  }),
  memory: z.object({
    enabled: z.boolean(),
    defaultThreadEnabled: z.boolean(),
    adapter: z.literal("tencentdb"),
    shortTermOffloadEnabled: z.boolean(),
    embeddings: agentMemoryStarterEmbeddingSettingsSchema,
    storageScope: z.literal("workspace"),
  }),
});

const agentMemoryStarterAssetStatusSchema = z.object({
  state: z.enum(["unknown", "missing", "mismatch", "installing", "present", "unsupported"]),
  path: optionalBoundedStringSchema,
  expectedBytes: nonNegativeIntegerSchema.optional(),
  actualBytes: nonNegativeIntegerSchema.optional(),
  expectedSha256: optionalBoundedStringSchema,
  artifactId: optionalBoundedStringSchema,
  receiptPath: optionalBoundedStringSchema,
  message: optionalBoundedStringSchema,
});

const agentMemoryStarterRuntimeStatusSchema = z.object({
  state: z.enum(["unknown", "stopped", "starting", "running", "blocked", "failed"]),
  runtimeId: optionalBoundedStringSchema,
  leaseId: optionalBoundedStringSchema,
  endpoint: optionalBoundedStringSchema,
  ownerThreadId: optionalBoundedStringSchema,
  message: optionalBoundedStringSchema,
});

const agentMemoryStarterThreadScopeSchema = z.object({
  activeThreadId: optionalBoundedStringSchema,
  activeThreadMemoryEnabled: z.boolean(),
  defaultThreadEnabled: z.boolean(),
  enabledThreadCount: nonNegativeIntegerSchema.optional(),
  activeThreadCount: nonNegativeIntegerSchema.optional(),
});

const agentMemoryStarterBlockerSchema = z.object({
  code: z.enum(AGENT_MEMORY_STARTER_BLOCKER_CODES),
  message: boundedSummaryStringSchema,
  detail: optionalBoundedStringSchema,
  retryable: z.boolean(),
});

const agentMemoryStarterStatusSchema = z.object({
  schemaVersion: z.literal("ambient-agent-memory-starter-status-v1"),
  checkedAt: boundedSummaryStringSchema,
  operationId: optionalBoundedStringSchema,
  state: z.enum(AGENT_MEMORY_STARTER_STATES),
  settings: agentMemoryStarterSettingsSchema,
  threadScope: agentMemoryStarterThreadScopeSchema,
  assets: z.object({
    model: agentMemoryStarterAssetStatusSchema,
    runtime: agentMemoryStarterAssetStatusSchema,
  }),
  runtime: agentMemoryStarterRuntimeStatusSchema,
  embedding: agentMemoryEmbeddingDiagnosticsSchema,
  nativePreflight: agentMemoryNativePreflightSchema,
  blockers: z.array(agentMemoryStarterBlockerSchema).max(MAX_ERROR_MESSAGES),
  nextActions: z.array(z.enum(AGENT_MEMORY_STARTER_NEXT_ACTIONS)).max(8),
}).transform((status): AgentMemoryStarterStatus => status);

const localRuntimeCapabilitySchema = z.enum(["local-deep-research", "minicpm-v", "local-text", "voice", "embeddings"]);
const localRuntimeTrackingStatusSchema = z.enum(["managed", "tracked", "untracked"]);
const localRuntimeLeaseStatusSchema = z.enum(["acquiring", "running", "idle", "releasing", "released", "crashed"]);
const localRuntimeActionKindSchema = z.enum(["stop", "restart", "load", "unload"]);
const localRuntimeNextActionKindSchema = z.enum([
  "inspect-status",
  "start-runtime",
  "stop-runtime",
  "restart-runtime",
  "force-stop-runtime",
  "force-restart-runtime",
  "wait-for-owner",
  "ask-user-to-stop-untracked",
  "review-memory-policy",
]);
const localRuntimeNextActionSafetySchema = z.enum(["safe", "requires-approval", "blocked", "external"]);
const localRuntimeToolNameSchema = z.enum([
  "ambient_local_model_runtime_status",
  "ambient_local_model_runtime_start",
  "ambient_local_model_runtime_stop",
  "ambient_local_model_runtime_restart",
]);
const localRuntimeBoundedIdArraySchema = z.array(boundedSummaryStringSchema).max(MAX_LOCAL_RUNTIME_EVIDENCE_IDS);

const localRuntimeEvidenceCountsSchema = z.object({
  runtimes: nonNegativeIntegerSchema,
  activeOwners: nonNegativeIntegerSchema,
  blockedActions: nonNegativeIntegerSchema,
  nextSafeActions: nonNegativeIntegerSchema,
});

const localRuntimeEvidenceRuntimeItemSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  runtimeEntryId: boundedSummaryStringSchema,
  capability: localRuntimeCapabilitySchema,
  trackingStatus: localRuntimeTrackingStatusSchema,
  running: z.boolean(),
  providerId: optionalBoundedStringSchema,
  modelRuntimeId: optionalBoundedStringSchema,
  modelProfileId: optionalBoundedStringSchema,
  modelId: optionalBoundedStringSchema,
  pid: nonNegativeIntegerSchema.optional(),
  endpoint: optionalBoundedStringSchema,
  estimatedResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
  actualResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
  memorySampledAt: optionalBoundedStringSchema,
  ownerLabels: localRuntimeBoundedIdArraySchema,
  activeLeaseIds: localRuntimeBoundedIdArraySchema,
  staleLeaseIds: localRuntimeBoundedIdArraySchema,
  releasedLeaseIds: localRuntimeBoundedIdArraySchema,
  crashedLeaseIds: localRuntimeBoundedIdArraySchema,
  ordinaryStopAllowed: z.boolean(),
  ordinaryRestartAllowed: z.boolean(),
  stopReason: boundedSummaryStringSchema,
  restartReason: boundedSummaryStringSchema,
  forceStopAllowed: z.boolean(),
  forceRestartAllowed: z.boolean(),
  forceStopRequiresSubagentCancellation: z.boolean(),
  forceRestartRequiresSubagentCancellation: z.boolean(),
  untracked: z.boolean(),
});

const localRuntimeEvidenceOwnerItemSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  runtimeEntryId: boundedSummaryStringSchema,
  leaseId: boundedSummaryStringSchema,
  displayName: boundedSummaryStringSchema,
  status: localRuntimeLeaseStatusSchema,
  parentThreadId: optionalBoundedStringSchema,
  subagentThreadId: optionalBoundedStringSchema,
  subagentRunId: optionalBoundedStringSchema,
  capabilityKind: localRuntimeCapabilitySchema,
  providerId: optionalBoundedStringSchema,
  modelRuntimeId: optionalBoundedStringSchema,
  modelProfileId: optionalBoundedStringSchema,
  modelId: optionalBoundedStringSchema,
  estimatedResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
  actualResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
  pid: nonNegativeIntegerSchema.optional(),
  endpoint: optionalBoundedStringSchema,
  acquiredAt: boundedSummaryStringSchema,
  lastHeartbeatAt: boundedSummaryStringSchema,
});

const localRuntimeEvidenceBlockedActionSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  runtimeEntryId: boundedSummaryStringSchema,
  action: localRuntimeActionKindSchema,
  reason: boundedSummaryStringSchema,
  blockerLeaseIds: localRuntimeBoundedIdArraySchema,
  affectedSubagentLabels: localRuntimeBoundedIdArraySchema,
  affectedSubagentThreadIds: localRuntimeBoundedIdArraySchema,
  forceAllowed: z.boolean(),
  forceRequiresSubagentCancellation: z.boolean(),
  untracked: z.boolean(),
});

const localRuntimeEvidenceNextSafeActionSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  action: localRuntimeNextActionKindSchema,
  safety: localRuntimeNextActionSafetySchema,
  reason: boundedSummaryStringSchema,
  runtimeEntryId: optionalBoundedStringSchema,
  runtimeId: optionalBoundedStringSchema,
  capability: localRuntimeCapabilitySchema.optional(),
  toolName: localRuntimeToolNameSchema.optional(),
  blockerLeaseIds: localRuntimeBoundedIdArraySchema.optional(),
  affectedSubagentLabels: localRuntimeBoundedIdArraySchema.optional(),
  ownershipResolution: z.object({
    lifecycleAction: z.enum(["stop", "restart"]),
    resolution: z.literal("cancel-or-mark-affected-subagents"),
    requiresInventoryRefresh: z.literal(true),
    reason: boundedSummaryStringSchema,
    blockerLeaseIds: localRuntimeBoundedIdArraySchema,
    affectedSubagentLabels: localRuntimeBoundedIdArraySchema,
  }).optional(),
  untracked: z.boolean().optional(),
});

const localRuntimeEvidenceSchema = z.object({
  schemaVersion: z.literal("ambient-local-runtime-diagnostic-evidence-v1"),
  source: z.literal("diagnostic_export"),
  capturedAt: boundedSummaryStringSchema,
  truncated: z.boolean(),
  counts: localRuntimeEvidenceCountsSchema,
  shownCounts: localRuntimeEvidenceCountsSchema,
  runtimes: z.array(localRuntimeEvidenceRuntimeItemSchema).max(MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
  activeOwners: z.array(localRuntimeEvidenceOwnerItemSchema).max(MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
  blockedActions: z.array(localRuntimeEvidenceBlockedActionSchema).max(MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
  nextSafeActions: z.array(localRuntimeEvidenceNextSafeActionSchema).max(MAX_LOCAL_RUNTIME_EVIDENCE_ROWS),
  memoryEvidence: z.object({
    activeEstimatedResidentMemoryBytes: nonNegativeIntegerSchema,
    activeActualResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
    activeResidentMemoryBasis: z.enum(["actual-rss", "estimated", "mixed", "none"]).optional(),
    requestedEstimatedResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
    projectedEstimatedResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
    projectedResidentMemoryBytes: nonNegativeIntegerSchema.optional(),
    projectedSystemMemoryUtilization: z.number().finite().nonnegative().optional(),
    projectedFreeMemoryBytes: nonNegativeIntegerSchema.optional(),
    projectedFreeMemoryRatio: z.number().finite().nonnegative().optional(),
    uncertaintyReasons: localRuntimeBoundedIdArraySchema,
    entryCountWithActualRss: nonNegativeIntegerSchema,
    entryCountWithOnlyEstimate: nonNegativeIntegerSchema,
    entryCountWithUnknownMemory: nonNegativeIntegerSchema,
  }),
});

const featureFlagResolutionSchema = z.object({
  id: z.enum([AMBIENT_SUBAGENTS_FEATURE_FLAG, AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG, AMBIENT_SLASH_COMMANDS_FEATURE_FLAG]),
  enabled: z.boolean(),
  source: z.enum([
    "default",
    "settings",
    "startup_arg_enable",
    "startup_arg_disable",
    "harness_enable",
    "harness_disable",
  ]),
  defaultEnabled: z.boolean(),
  settingsEnabled: z.boolean().optional(),
});

const featureFlagSnapshotSchema = z.object({
  schemaVersion: z.literal("ambient-feature-flags-v1"),
  generatedAt: boundedSummaryStringSchema,
  flags: z.object({
    [AMBIENT_SUBAGENTS_FEATURE_FLAG]: featureFlagResolutionSchema,
    [AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG]: featureFlagResolutionSchema.optional(),
    [AMBIENT_SLASH_COMMANDS_FEATURE_FLAG]: featureFlagResolutionSchema.optional(),
  }),
}).transform((snapshot): AmbientFeatureFlagSnapshot => ({
  ...snapshot,
  flags: {
    [AMBIENT_SUBAGENTS_FEATURE_FLAG]: snapshot.flags[AMBIENT_SUBAGENTS_FEATURE_FLAG],
    [AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG]: snapshot.flags[AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG] ?? {
      id: AMBIENT_TENCENTDB_MEMORY_FEATURE_FLAG,
      enabled: false,
      source: "default",
      defaultEnabled: false,
    },
    [AMBIENT_SLASH_COMMANDS_FEATURE_FLAG]: snapshot.flags[AMBIENT_SLASH_COMMANDS_FEATURE_FLAG] ?? {
      id: AMBIENT_SLASH_COMMANDS_FEATURE_FLAG,
      enabled: false,
      source: "default",
      defaultEnabled: false,
    },
  },
}));

const diagnosticSummarySchema = z.object({
  featureFlags: featureFlagSnapshotSchema.optional(),
  agentMemory: agentMemoryStorageDiagnosticsSchema.optional(),
  agentMemoryStarter: agentMemoryStarterStatusSchema.optional(),
  subagents: z.object({
    repairDiagnostics: repairSummarySchema,
    observability: observabilitySummarySchema,
    attribution: attributionSummarySchema,
    replayEvidence: replaySummarySchema,
  }),
  localRuntimes: localRuntimeSummarySchema.optional(),
});

const subagentRepairIssueKindSchema = z.enum([
  "missing_parent_thread",
  "missing_child_thread",
  "orphan_child_thread",
  "thread_run_mismatch",
  "active_run_interrupted",
  "missing_lifecycle_start",
  "missing_lifecycle_stop",
  "missing_feature_flag_snapshot",
  "subagent_feature_flag_disabled",
  "missing_model_runtime_snapshot",
  "model_runtime_snapshot_mismatch",
  "missing_capacity_lease",
  "capacity_lease_mismatch",
  "missing_prompt_snapshot",
  "prompt_snapshot_mismatch",
  "missing_tool_scope_snapshot",
  "tool_scope_snapshot_mismatch",
  "missing_result_artifact",
  "invalid_result_artifact",
  "result_artifact_mismatch",
  "missing_spawn_edge",
  "dangling_spawn_edge",
  "spawn_edge_mismatch",
  "dangling_wait_barrier_child",
  "parent_cancel_control_unreconciled",
]);

const replayTimelineItemSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  createdAt: boundedSummaryStringSchema,
  runId: boundedSummaryStringSchema,
  parentRunId: boundedSummaryStringSchema,
  childThreadId: boundedSummaryStringSchema,
  canonicalTaskPath: optionalBoundedStringSchema,
  roleId: optionalBoundedStringSchema,
  source: optionalBoundedStringSchema,
  type: boundedSummaryStringSchema,
  status: optionalBoundedStringSchema,
  toolName: optionalBoundedStringSchema,
  textPreview: optionalBoundedStringSchema,
  messagePreview: optionalBoundedStringSchema,
  artifactPath: optionalBoundedStringSchema,
  approvalId: optionalBoundedStringSchema,
  approvalSource: optionalBoundedStringSchema,
  worktreeIsolated: z.boolean().optional(),
  worktreePath: optionalBoundedStringSchema,
});

const completionGuardSummarySchema = z.object({
  valid: z.boolean().optional(),
  synthesisAllowed: z.boolean().optional(),
  required: z.boolean().optional(),
  structuredEvidenceCount: nonNegativeIntegerSchema.optional(),
  ambientEvidenceCount: nonNegativeIntegerSchema.optional(),
  isolatedWorktreeEvidenceCount: nonNegativeIntegerSchema.optional(),
  approvalEvidenceCount: nonNegativeIntegerSchema.optional(),
  reason: optionalBoundedStringSchema,
});

const lifecycleSummarySchema = z.object({
  action: optionalBoundedStringSchema,
  source: optionalBoundedStringSchema,
  status: optionalBoundedStringSchema,
  waitBarrierId: optionalBoundedStringSchema,
  barrierStatus: optionalBoundedStringSchema,
  reason: optionalBoundedStringSchema,
  userDecisionPreview: optionalBoundedStringSchema,
  partialSummaryPreview: optionalBoundedStringSchema,
  detachedRunIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  cancelledRunIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  stoppedChildRunIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  unchangedRunIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  cancelledWaitBarrierIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  cancelledMailboxEventIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  parentCancellationRequested: z.boolean().optional(),
});

const replayParentMailboxItemSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  id: boundedSummaryStringSchema,
  createdAt: boundedSummaryStringSchema,
  updatedAt: boundedSummaryStringSchema,
  parentThreadId: boundedSummaryStringSchema,
  parentRunId: boundedSummaryStringSchema,
  parentMessageId: optionalBoundedStringSchema,
  type: boundedSummaryStringSchema,
  deliveryState: z.enum(["queued", "delivered", "consumed", "failed", "cancelled"]),
  childRunIds: z.array(boundedSummaryStringSchema).max(80),
  childThreadIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  canonicalTaskPaths: z.array(boundedSummaryStringSchema).max(80).optional(),
  childSourceLabels: z.array(boundedSummaryStringSchema).max(80).optional(),
  idempotencyKey: optionalBoundedStringSchema,
  payloadPreview: optionalBoundedStringSchema,
  failureStage: optionalBoundedStringSchema,
  approvalMode: optionalBoundedStringSchema,
  approvalUnavailable: z.boolean().optional(),
  deniedCategoryIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  deniedToolIds: z.array(boundedSummaryStringSchema).max(80).optional(),
  deniedCategoryLabels: z.array(boundedSummaryStringSchema).max(80).optional(),
  deniedToolLabels: z.array(boundedSummaryStringSchema).max(80).optional(),
  completionGuardSummary: completionGuardSummarySchema.optional(),
  lifecycleSummary: lifecycleSummarySchema.optional(),
});

const replayTranscriptItemSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  createdAt: boundedSummaryStringSchema,
  threadId: boundedSummaryStringSchema,
  role: z.enum(["user", "assistant", "system", "tool"]),
  childRunId: optionalBoundedStringSchema,
  childThreadId: optionalBoundedStringSchema,
  contentPreview: boundedSummaryStringSchema,
});

const replayCallableWorkflowTaskItemSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  taskId: boundedSummaryStringSchema,
  launchId: boundedSummaryStringSchema,
  createdAt: boundedSummaryStringSchema,
  updatedAt: boundedSummaryStringSchema,
  parentThreadId: boundedSummaryStringSchema,
  parentRunId: boundedSummaryStringSchema,
  parentMessageId: optionalBoundedStringSchema,
  toolName: boundedSummaryStringSchema,
  sourceKind: boundedSummaryStringSchema,
  title: boundedSummaryStringSchema,
  status: callableWorkflowTaskStatusSchema,
  statusLabel: boundedSummaryStringSchema,
  blocking: z.boolean(),
  runnerDeferredReason: boundedSummaryStringSchema,
  workflowThreadId: optionalBoundedStringSchema,
  workflowArtifactId: optionalBoundedStringSchema,
  workflowArtifactTitle: optionalBoundedStringSchema,
  workflowArtifactStatus: workflowArtifactStatusSchema.optional(),
  workflowRunId: optionalBoundedStringSchema,
  workflowRunStatus: workflowRunStatusSchema.optional(),
  workflowRunEventTypes: z.array(boundedSummaryStringSchema).max(80),
  artifactLinkState: z.enum(["not_linked", "linked", "missing"]),
  runLinkState: z.enum(["not_linked", "linked", "missing", "artifact_mismatch"]),
  callerKind: optionalBoundedStringSchema,
  childThreadId: optionalBoundedStringSchema,
  childRunId: optionalBoundedStringSchema,
  subagentRunId: optionalBoundedStringSchema,
  canonicalTaskPath: optionalBoundedStringSchema,
  approvalSource: optionalBoundedStringSchema,
  approvalScope: optionalBoundedStringSchema,
  worktreeIsolated: z.boolean().optional(),
  worktreeStatus: optionalBoundedStringSchema,
  nestedFanoutSource: optionalBoundedStringSchema,
  lastEventType: optionalBoundedStringSchema,
  lastEventMessage: optionalBoundedStringSchema,
  tokenCount: nonNegativeIntegerSchema.optional(),
  costMicros: nonNegativeIntegerSchema.optional(),
});

const replayCallableWorkflowRestartIssueItemSchema = z.object({
  sequence: nonNegativeIntegerSchema,
  issueId: boundedSummaryStringSchema,
  kind: callableWorkflowTaskRestartIssueKindSchema,
  severity: diagnosticSeveritySchema,
  messagePreview: boundedSummaryStringSchema,
  taskId: boundedSummaryStringSchema,
  taskStatus: callableWorkflowTaskStatusSchema.optional(),
  taskStatusLabel: optionalBoundedStringSchema,
  blocking: z.boolean().optional(),
  runnerDeferredReason: optionalBoundedStringSchema,
  parentThreadId: boundedSummaryStringSchema,
  parentRunId: boundedSummaryStringSchema,
  workflowArtifactId: optionalBoundedStringSchema,
  workflowRunId: optionalBoundedStringSchema,
  callerKind: optionalBoundedStringSchema,
  callerThreadId: optionalBoundedStringSchema,
  callerRunId: optionalBoundedStringSchema,
  childThreadId: optionalBoundedStringSchema,
  childRunId: optionalBoundedStringSchema,
  subagentRunId: optionalBoundedStringSchema,
  canonicalTaskPath: optionalBoundedStringSchema,
  childParentThreadId: optionalBoundedStringSchema,
  childParentRunId: optionalBoundedStringSchema,
  approvalSource: optionalBoundedStringSchema,
  approvalScope: optionalBoundedStringSchema,
  worktreeRequired: z.boolean().optional(),
  worktreeIsolated: z.boolean().optional(),
  worktreeStatus: optionalBoundedStringSchema,
  nestedFanoutRequired: z.boolean().optional(),
  nestedFanoutSource: optionalBoundedStringSchema,
});

const replayEvidenceSchema = z.object({
  schemaVersion: z.literal("ambient-subagent-replay-evidence-v1"),
  source: z.literal("diagnostic_export"),
  createdAt: boundedSummaryStringSchema,
  liveTokens: z.literal(false),
  truncated: z.boolean(),
  counts: z.object({
    runs: nonNegativeIntegerSchema,
    childThreads: nonNegativeIntegerSchema,
    persistedRunEvents: nonNegativeIntegerSchema,
    runtimeEvents: nonNegativeIntegerSchema,
    parentMailboxEvents: nonNegativeIntegerSchema,
    transcriptMessages: nonNegativeIntegerSchema,
    callableWorkflowTasks: nonNegativeIntegerSchema.default(0),
  }),
  shownCounts: z.object({
    runs: nonNegativeIntegerSchema,
    childThreads: nonNegativeIntegerSchema,
    persistedRunEvents: nonNegativeIntegerSchema,
    runtimeEvents: nonNegativeIntegerSchema,
    parentMailboxEvents: nonNegativeIntegerSchema,
    transcriptMessages: nonNegativeIntegerSchema,
    callableWorkflowTasks: nonNegativeIntegerSchema.default(0),
  }),
  childThreads: z.array(z.object({
    threadId: boundedSummaryStringSchema,
    runId: optionalBoundedStringSchema,
    parentThreadId: optionalBoundedStringSchema,
    parentRunId: optionalBoundedStringSchema,
    canonicalTaskPath: optionalBoundedStringSchema,
    collapsedByDefault: z.boolean().optional(),
    status: optionalBoundedStringSchema,
  })).max(MAX_REPLAY_ROWS),
  runtimeEventTimeline: z.array(replayTimelineItemSchema).max(MAX_REPLAY_ROWS),
  persistedRunEventTimeline: z.array(replayTimelineItemSchema).max(MAX_REPLAY_ROWS),
  parentMailboxTimeline: z.array(replayParentMailboxItemSchema).max(MAX_REPLAY_ROWS),
  transcriptTimeline: z.array(replayTranscriptItemSchema).max(MAX_REPLAY_ROWS),
  callableWorkflowTaskTimeline: z.array(replayCallableWorkflowTaskItemSchema).max(MAX_REPLAY_ROWS).default([]),
  restartRepair: z.object({
    observedIssueKinds: z.array(subagentRepairIssueKindSchema).max(MAX_RESTART_REPAIR_IDS),
    repairedRunIds: z.array(boundedSummaryStringSchema).max(MAX_RESTART_REPAIR_IDS),
    repairedBarrierIds: z.array(boundedSummaryStringSchema).max(MAX_RESTART_REPAIR_IDS),
    repairedParentControlBarrierIds: z.array(boundedSummaryStringSchema).max(MAX_RESTART_REPAIR_IDS),
    repairableSpawnEdgeRunIds: z.array(boundedSummaryStringSchema).max(MAX_RESTART_REPAIR_IDS),
    danglingSpawnEdgeRunIds: z.array(boundedSummaryStringSchema).max(MAX_RESTART_REPAIR_IDS),
    diagnosticRunIds: z.array(boundedSummaryStringSchema).max(MAX_RESTART_REPAIR_IDS),
    callableWorkflowTaskIssues: z.array(replayCallableWorkflowRestartIssueItemSchema).max(MAX_REPLAY_ROWS).default([]),
  }),
});

export async function importDiagnosticBundleFromFile(filePath: string): Promise<DiagnosticExportResult> {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error("Selected diagnostic bundle is not a file.");
  if (metadata.size > MAX_DIAGNOSTIC_IMPORT_BYTES) {
    throw new Error(`Selected diagnostic bundle is too large to import (${metadata.size} bytes).`);
  }
  const text = await readFile(filePath, "utf8");
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_DIAGNOSTIC_IMPORT_BYTES) {
    throw new Error(`Selected diagnostic bundle is too large to import (${bytes} bytes).`);
  }
  return diagnosticImportResultFromBundleText({ path: filePath, bytes, text });
}

export function diagnosticImportResultFromBundleText(input: {
  path: string;
  bytes: number;
  text: string;
}): DiagnosticExportResult {
  let bundle: unknown;
  try {
    bundle = JSON.parse(input.text);
  } catch {
    throw new Error("Selected diagnostic bundle is not valid JSON.");
  }
  return diagnosticImportResultFromBundleJson({
    path: input.path,
    bytes: input.bytes,
    bundle,
  });
}

export function diagnosticImportResultFromBundleJson(input: {
  path: string;
  bytes: number;
  bundle: unknown;
}): DiagnosticExportResult {
  const bundle = diagnosticBundleImportSchema.parse(input.bundle);
  const replayEvidence = safeParseDiagnosticReplayEvidence(bundle.subagents?.replayEvidence);
  const localRuntimeEvidence = safeParseDiagnosticLocalRuntimeEvidence(bundle.localRuntimes?.evidence);
  return {
    path: input.path,
    bytes: input.bytes,
    createdAt: bundle.createdAt,
    summary: bundle.summary,
    ...(replayEvidence
      ? {
          subagents: {
            replayEvidence,
          },
        }
      : {}),
    ...(localRuntimeEvidence
      ? {
          localRuntimes: {
            evidence: localRuntimeEvidence,
          },
        }
      : {}),
  };
}

function safeParseDiagnosticReplayEvidence(input: unknown): DiagnosticExportSubagentReplayEvidence | undefined {
  if (!input) return undefined;
  const parsed = replayEvidenceSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

function safeParseDiagnosticLocalRuntimeEvidence(input: unknown): DiagnosticExportLocalRuntimeEvidence | undefined {
  if (!input) return undefined;
  const parsed = localRuntimeEvidenceSchema.safeParse(input);
  return parsed.success ? parsed.data : undefined;
}

const diagnosticBundleImportSchema = z.object({
  schemaVersion: z.literal(1),
  createdAt: boundedSummaryStringSchema,
  summary: diagnosticSummarySchema.transform((summary): DiagnosticExportSummary => summary),
  subagents: z.object({
    replayEvidence: z.unknown().optional(),
  }).optional(),
  localRuntimes: z.object({
    evidence: z.unknown().optional(),
  }).optional(),
});

function truncateText(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 3))}...`;
}
