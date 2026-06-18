import type { AutomationRunSummary, AutomationScheduleTargetKind } from "./automationTypes";
import type { ThreadActionInput } from "./threadCoreTypes";
import type { WorkflowRecordingReviewDraftUpdate } from "./workflowRecordingTypes";
import type {
  PermissionGrantActionKind,
  PermissionGrantScopeKind,
  PermissionGrantTargetKind,
  PermissionPromptResponseMode,
  PermissionRisk,
} from "./permissionTypes";
import type { GoogleWorkspaceMethodSideEffect } from "./pluginTypes";
import type { SubagentPatternGraphSnapshot } from "./subagentPatternGraph";
import type { SymphonyWorkflowPatternId } from "./symphonyWorkflowRecipes";

export type * from "./workflowRecordingTypes";

export interface SaveSymphonyWorkflowRecipeInput extends ThreadActionInput {
  patternId: SymphonyWorkflowPatternId;
  goal: string;
  blocking?: boolean;
  stepAnswers?: Record<string, { choiceId?: string; customText?: string }>;
  metricCustomizations?: Record<string, string>;
}

export interface ArchiveWorkflowRecordingInput {
  id: string;
  baseVersion: number;
  reason?: string;
}

export interface UnarchiveWorkflowRecordingInput {
  id: string;
  baseVersion: number;
}

export interface RestoreWorkflowRecordingVersionInput {
  id: string;
  version: number;
}

export type WorkflowLabRunStatus = "draft" | "running" | "completed" | "stopped" | "failed";

export type WorkflowLabVariantStatus = "proposed" | "evaluating" | "accepted" | "rejected" | "failed";

export type WorkflowLabMetricEmphasis = "reliability" | "speed" | "recovery" | "clarity" | "balanced";

export interface WorkflowLabCandidatePatch {
  title?: string;
  draft: WorkflowRecordingReviewDraftUpdate;
  summary: string;
  changedFields: Array<keyof WorkflowRecordingReviewDraftUpdate | "title">;
}

export interface WorkflowLabEvaluationCase {
  id: string;
  label: string;
  prompt: string;
  heldOut: boolean;
  createdAt: string;
}

export interface WorkflowLabEvaluationMetrics {
  completed: boolean;
  toolCallCount: number;
  retryCount: number;
  elapsedMs: number;
  validationIssueCount: number;
  explicitValidationCount: number;
  recoveryCueCount: number;
}

export interface WorkflowLabGateResult {
  id: string;
  label: string;
  status: "passed" | "failed";
  detail: string;
}

export interface WorkflowLabJudgeResult {
  provider: "deterministic" | "ambient";
  score: number;
  clarity: number;
  robustness: number;
  generalization: number;
  intentPreservation: number;
  rationale: string;
  model?: string;
  telemetry?: {
    promptCharCount: number;
    responseCharCount: number;
    requestDurationMs: number;
  };
}

export interface WorkflowLabEvaluationResult {
  caseId: string;
  metrics: WorkflowLabEvaluationMetrics;
  gates: WorkflowLabGateResult[];
  judge: WorkflowLabJudgeResult;
  traceArtifactRefs: string[];
  createdAt: string;
}

export interface WorkflowLabVariant {
  id: string;
  runId: string;
  parentVariantId?: string;
  attempt: number;
  hypothesis: string;
  patch: WorkflowLabCandidatePatch;
  status: WorkflowLabVariantStatus;
  score?: number;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
  evaluatedAt?: string;
  evaluations: WorkflowLabEvaluationResult[];
}

export interface WorkflowLabRun {
  id: string;
  workflowId: string;
  workflowTitle: string;
  baseVersion: number;
  goal: string;
  metricEmphasis: WorkflowLabMetricEmphasis;
  attemptBudget: number;
  plateauThreshold: number;
  heldOutEnabled: boolean;
  status: WorkflowLabRunStatus;
  bestVariantId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  artifactPath: string;
  evaluationCases: WorkflowLabEvaluationCase[];
  variants: WorkflowLabVariant[];
  audit: string[];
}

export interface CreateWorkflowLabRunInput {
  workflowId: string;
  goal: string;
  metricEmphasis?: WorkflowLabMetricEmphasis;
  attemptBudget?: number;
  plateauThreshold?: number;
  heldOutEnabled?: boolean;
}

export interface ListWorkflowLabRunsInput {
  workflowId?: string;
  limit?: number;
}

export interface GetWorkflowLabRunInput {
  runId: string;
}

export interface StartWorkflowLabRunInput {
  runId: string;
}

export interface StopWorkflowLabRunInput {
  runId: string;
}

export interface AdoptWorkflowLabVariantInput {
  runId: string;
  variantId: string;
}

export interface OrchestrationTask {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: string;
  priority?: number;
  labels: string[];
  blockedBy: string[];
  projectPath?: string;
  branchName?: string;
  workspacePath?: string;
  sourceKind: string;
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrchestrationRun {
  id: string;
  taskId: string;
  attemptNumber: number;
  status: string;
  workspacePath: string;
  threadId?: string;
  piSessionFile?: string;
  startedAt: string;
  finishedAt?: string;
  lastEventAt?: string;
  error?: string;
  proofOfWork?: Record<string, unknown>;
}

export interface CreateOrchestrationTaskInput {
  title: string;
  description?: string;
  state?: string;
  priority?: number;
  labels?: string[];
  blockedBy?: string[];
  projectPath?: string;
}

export type WorkflowAgentFolderKind = "home" | "custom";

export type WorkflowAgentThreadPhase =
  | "request"
  | "discovery"
  | "planned"
  | "compiling"
  | "ready_for_review"
  | "approved"
  | "running"
  | "paused"
  | "failed"
  | "succeeded"
  | "revision";

export type WorkflowTraceMode = "production" | "debug";

export type WorkflowGraphSnapshotSource = "discovery" | "exploration" | "compile" | "revision" | "run";

export type WorkflowDiscoveryQuestionCategory = "scope" | "data_sources" | "model_role" | "side_effects" | "schedule" | "review" | "error_handling";

export type WorkflowDiscoveryProviderKind = "deterministic" | "ambient";

export type WorkflowGraphNodeType =
  | "request"
  | "data_source"
  | "deterministic_step"
  | "agent_exploration"
  | "model_call"
  | "connector_call"
  | "review_gate"
  | "mutation"
  | "output"
  | "error_handler";

export type WorkflowGraphEdgeType = "data_flow" | "control_flow" | "condition" | "retry" | "resume";

export type WorkflowGraphRunState = "pending" | "active" | "completed" | "paused" | "failed" | "skipped" | "retrying";

export type WorkflowSourceRangeKind =
  | "ambient_call"
  | "connector_call"
  | "review_gate"
  | "mutation"
  | "workflow_step"
  | "workflow_batch"
  | "output_assignment"
  | "workflow_checkpoint"
  | "workflow_emit";

export interface WorkflowSourceRange {
  kind: WorkflowSourceRangeKind;
  start: number;
  end: number;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  snippet: string;
}

export interface WorkflowGraphNode {
  id: string;
  type: WorkflowGraphNodeType;
  label: string;
  description?: string;
  modelRole?: string;
  dataSummary?: string;
  inputSummary?: string;
  outputSummary?: string;
  toolNames?: string[];
  connectorIds?: string[];
  retryPolicy?: string;
  retentionPolicy?: string;
  reviewPolicy?: string;
  runState?: WorkflowGraphRunState;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  sourceRanges?: WorkflowSourceRange[];
}

export interface WorkflowGraphEdge {
  id: string;
  source: string;
  target: string;
  type: WorkflowGraphEdgeType;
  label?: string;
  dataSummary?: string;
  runState?: WorkflowGraphRunState;
}

export interface WorkflowDiscoveryGraphPatch {
  summary?: string;
  upsertNodes?: WorkflowGraphNode[];
  upsertEdges?: WorkflowGraphEdge[];
  removeNodeIds?: string[];
  removeEdgeIds?: string[];
  blockedReasons?: string[];
}

export interface WorkflowGraphSnapshot {
  id: string;
  workflowThreadId: string;
  version: number;
  source: WorkflowGraphSnapshotSource;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  summary: string;
  artifactPath?: string;
  createdAt: string;
}

export interface CreateWorkflowExplorationTraceInput {
  id?: string;
  workflowThreadId: string;
  explorationId: string;
  explorationNodeId: string;
  request: string;
  model?: string;
  capabilityManifest: unknown;
  observations: unknown[];
  events?: WorkflowExplorationEventSummary[];
  distillation: unknown;
  status?: WorkflowExplorationRunStatus;
  graphSnapshotId?: string;
  latestProgress?: WorkflowExplorationProgress;
  providerHealth?: unknown;
  retryMetadata?: unknown;
  error?: string;
  completedAt?: string;
}

export interface UpdateWorkflowExplorationTraceInput {
  id: string;
  status?: WorkflowExplorationRunStatus;
  observations?: unknown[];
  events?: WorkflowExplorationEventSummary[];
  distillation?: unknown;
  latestProgress?: WorkflowExplorationProgress;
  providerHealth?: unknown;
  retryMetadata?: unknown;
  error?: string;
  completedAt?: string | null;
}

export interface WorkflowExplorationEventSummary {
  seq: number;
  type: string;
  message?: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowExplorationTraceSummary {
  id: string;
  workflowThreadId: string;
  explorationId: string;
  explorationNodeId: string;
  request: string;
  model?: string;
  capabilityManifest: unknown;
  observations: unknown[];
  events: WorkflowExplorationEventSummary[];
  distillation: unknown;
  status?: WorkflowExplorationRunStatus;
  graphSnapshotId?: string;
  latestProgress?: WorkflowExplorationProgress;
  providerHealth?: unknown;
  retryMetadata?: unknown;
  error?: string;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
}

export type WorkflowExplorationRunStatus = "running" | "succeeded" | "failed" | "canceled" | "fallback";

export interface WorkflowExplorationProgress {
  workflowThreadId: string;
  explorationId: string;
  graphNodeId?: string;
  eventType: string;
  phase: "starting" | "provider" | "tool" | "connector" | "ambient" | "finished" | "failed";
  status: "running" | "succeeded" | "failed";
  message: string;
  turn?: number;
  outputChars?: number;
  thinkingChars?: number;
  elapsedMs?: number;
  idleElapsedMs?: number;
  idleTimeoutMs?: number;
  updatedAt: string;
}

export interface RunWorkflowThreadExplorationInput {
  workflowThreadId: string;
  maxModelTurns?: number;
  maxToolCalls?: number;
  maxConnectorCalls?: number;
  maxAmbientCalls?: number;
  maxElapsedMs?: number;
}

export interface WorkflowThreadExplorationResult {
  folders: WorkflowAgentFolderSummary[];
  thread: WorkflowAgentThreadSummary;
  trace: WorkflowExplorationTraceSummary;
  graphSnapshot: WorkflowGraphSnapshot;
}

export type WorkflowVersionStatus = "ready_for_review" | "approved" | "rejected" | "archived";

export type WorkflowVersionCreatedBy = "compiler" | "user_source_edit" | "ambient_debug_rewrite" | "version_revert" | "workflow_revision";

export type WorkflowRevisionStatus = "draft" | "proposed" | "applied" | "rejected";

export type WorkflowPromptCacheStage = "discovery" | "revision_discovery" | "compile" | "revision_compile" | "runtime_call";

export interface WorkflowPromptCacheCheckpoint {
  id: string;
  stage: WorkflowPromptCacheStage;
  workflowThreadId?: string;
  revisionId?: string;
  graphSnapshotId?: string;
  stablePrefixHash: string;
  stablePrefixChars: number;
  stablePrefixEstimatedTokens: number;
  mutableSuffixHash: string;
  mutableSuffixChars: number;
  mutableSuffixEstimatedTokens: number;
  requestHash: string;
  requestEstimatedTokens: number;
  boundaryLabel: string;
  createdAt: string;
}

export interface WorkflowVersionSummary {
  id: string;
  workflowThreadId: string;
  artifactId: string;
  version: number;
  graphSnapshotId?: string;
  sourcePath: string;
  repoPath: string;
  gitCommitHash?: string;
  status: WorkflowVersionStatus;
  createdBy: WorkflowVersionCreatedBy;
  createdAt: string;
}

export interface WorkflowRevisionSummary {
  id: string;
  workflowThreadId: string;
  baseVersionId?: string;
  baseArtifactId?: string;
  proposedVersionId?: string;
  proposedArtifactId?: string;
  requestedChange: string;
  proposedGraphSnapshotId?: string;
  graphDiff?: unknown;
  sourceDiff?: string;
  status: WorkflowRevisionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDiscoveryChoice {
  id: string;
  label: string;
  description: string;
  recommended?: boolean;
}

export type WorkflowDiscoveryContextCapability =
  | "request_text"
  | "prior_answers"
  | "graph_summary"
  | "file_metadata"
  | "file_content"
  | "secret_path_metadata"
  | "connector_metadata"
  | "connector_account_data"
  | "connector_content"
  | "plugin_metadata"
  | "plugin_tool_execute"
  | "shell_command"
  | "browser_network"
  | "browser_control"
  | "browser_profile"
  | "local_file_write"
  | "remote_mutation";

export type WorkflowDiscoveryAccessRequestStatus = "pending" | "allowed" | "denied";

export interface WorkflowDiscoveryContextEvidenceItem {
  id: string;
  title: string;
  snippet: string;
  sourceLabel: string;
  sourceUrl?: string;
  publishedAt?: string;
}

export interface WorkflowDiscoveryContextEvidence {
  id: string;
  capability: WorkflowDiscoveryContextCapability;
  targetLabel: string;
  gatheredAt: string;
  provider: string;
  summary: string;
  items: WorkflowDiscoveryContextEvidenceItem[];
  truncated?: boolean;
  redacted?: boolean;
  error?: string;
  timingMs?: number;
}

export type WorkflowDiscoveryActivityKind =
  | "scan"
  | "capability_search"
  | "access_request"
  | "evidence_gather"
  | "provider_wait"
  | "provider_fallback"
  | "question_generated"
  | "graph_patch";

export type WorkflowDiscoveryActivityStatus = "pending" | "completed" | "failed" | "skipped";

export interface WorkflowDiscoveryActivityEvent {
  id: string;
  kind: WorkflowDiscoveryActivityKind;
  status: WorkflowDiscoveryActivityStatus;
  label: string;
  detail?: string;
  targetLabel?: string;
  evidenceId?: string;
  durationMs?: number;
  createdAt: string;
}

export type WorkflowDiscoveryCapabilitySearchResultKind =
  | "connector"
  | "plugin_tool"
  | "ambient_cli"
  | "browser_fallback"
  | "base_directory";

export type WorkflowDiscoveryCapabilitySearchResultStatus = "workflow_safe" | "requires_grant" | "needs_trust" | "fallback";

export type WorkflowDiscoveryCapabilitySearchRecommendation = "recommended" | "available" | "fallback" | "blocked";

export interface WorkflowDiscoveryCapabilitySearchResult {
  id: string;
  kind: WorkflowDiscoveryCapabilitySearchResultKind;
  label: string;
  providerLabel?: string;
  description: string;
  status: WorkflowDiscoveryCapabilitySearchResultStatus;
  recommendation: WorkflowDiscoveryCapabilitySearchRecommendation;
  reason: string;
  matchedTerms: string[];
  connectorId?: string;
  registeredToolName?: string;
  capabilityId?: string;
  permissionCapability?: WorkflowDiscoveryContextCapability;
  targetLabel?: string;
}

export interface WorkflowDiscoveryCapabilitySearch {
  query: string;
  policy: string;
  results: WorkflowDiscoveryCapabilitySearchResult[];
  totalCandidateCount: number;
  omittedCandidateCount: number;
}

export type WorkflowDiscoveryCapabilityMutationClass = "read_only" | "staged_mutation" | "external_mutation" | "plugin_defined" | "none";

export interface WorkflowDiscoveryCapabilityDescription {
  id: string;
  kind: WorkflowDiscoveryCapabilitySearchResultKind;
  label: string;
  providerLabel?: string;
  description: string;
  status: WorkflowDiscoveryCapabilitySearchResultStatus;
  recommendation: WorkflowDiscoveryCapabilitySearchRecommendation;
  policy: string;
  permissionCapability?: WorkflowDiscoveryContextCapability;
  targetLabel?: string;
  mutationClass: WorkflowDiscoveryCapabilityMutationClass;
  inputShapeSummary?: string;
  outputShapeSummary?: string;
  accountSummary?: string;
  availabilitySummary?: string;
  examples: string[];
  warnings: string[];
  operations?: Array<{
    name: string;
    label: string;
    description: string;
    sideEffects: string;
    supportsDryRun: boolean;
    mutationPolicy: string;
    defaultTimeoutMs: number;
  }>;
}

export interface SearchWorkflowDiscoveryCapabilitiesInput {
  workflowThreadId?: string;
  projectPath?: string;
  query: string;
  limit?: number;
}

export interface DescribeWorkflowDiscoveryCapabilityInput {
  workflowThreadId?: string;
  projectPath?: string;
  capabilityId: string;
  query?: string;
}

export type WorkflowNativeToolName =
  | "workflow_current_context"
  | "workflow_get_artifact"
  | "workflow_get_source"
  | "workflow_get_run_trace"
  | "workflow_get_versions"
  | "workflow_capability_search"
  | "workflow_capability_describe"
  | "workflow_propose_manifest_revision"
  | "workflow_propose_revision"
  | "workflow_validate_revision"
  | "workflow_explain_revision_diff"
  | "workflow_apply_revision"
  | "workflow_update_run_settings"
  | "workflow_restore_version"
  | "workflow_run_preview"
  | "workflow_run_version";

export interface InvokeWorkflowNativeToolInput {
  toolName: WorkflowNativeToolName;
  arguments?: Record<string, unknown>;
}

export interface WorkflowNativeToolInvocationResult {
  toolName: WorkflowNativeToolName;
  text: string;
  data: unknown;
}

export interface WorkflowDiscoveryAccessRequest {
  id: string;
  capability: WorkflowDiscoveryContextCapability;
  actionKind: PermissionGrantActionKind;
  targetKind: PermissionGrantTargetKind;
  targetLabel: string;
  targetHash: string;
  reason: string;
  auditDetail: string;
  risk: PermissionRisk;
  reusableScopes: PermissionGrantScopeKind[];
  recommendedResponse: PermissionPromptResponseMode;
  status: WorkflowDiscoveryAccessRequestStatus;
  response?: PermissionPromptResponseMode;
  grantId?: string;
  resolvedAt?: string;
  evidence?: WorkflowDiscoveryContextEvidence;
}

export interface WorkflowDiscoveryAnswer {
  choiceId?: string;
  freeform?: string;
  answeredAt: string;
}

export interface WorkflowDiscoveryQuestion {
  id: string;
  workflowThreadId: string;
  revisionId?: string;
  category: WorkflowDiscoveryQuestionCategory;
  context: string;
  question: string;
  choices: WorkflowDiscoveryChoice[];
  allowFreeform: boolean;
  answer?: WorkflowDiscoveryAnswer;
  graphImpact?: string;
  provider?: WorkflowDiscoveryProviderKind;
  providerModel?: string;
  policyContextSummary?: string;
  capabilitySearch?: WorkflowDiscoveryCapabilitySearch;
  capabilityDescriptions?: WorkflowDiscoveryCapabilityDescription[];
  blockedReasons?: string[];
  accessRequests?: WorkflowDiscoveryAccessRequest[];
  activityEvents?: WorkflowDiscoveryActivityEvent[];
  cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
  graphPatch?: WorkflowDiscoveryGraphPatch;
  createdAt: string;
  answeredAt?: string;
}

export interface WorkflowAgentThreadSummary {
  id: string;
  folderId: string;
  chatThreadId?: string;
  projectName: string;
  projectPath: string;
  title: string;
  phase: WorkflowAgentThreadPhase;
  initialRequest: string;
  preview: string;
  status: string;
  traceMode: WorkflowTraceMode;
  activeArtifactId?: string;
  activeGraphSnapshotId?: string;
  latestVersion?: WorkflowVersionSummary;
  latestRun?: AutomationRunSummary;
  graph?: WorkflowGraphSnapshot;
  discoveryQuestions: WorkflowDiscoveryQuestion[];
  badges: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAgentFolderSummary {
  id: string;
  name: string;
  kind: WorkflowAgentFolderKind;
  createdAt: string;
  updatedAt: string;
  threads: WorkflowAgentThreadSummary[];
}

export interface CreateWorkflowAgentFolderInput {
  name: string;
}

export interface MoveWorkflowAgentThreadInput {
  threadId: string;
  folderId: string;
}

export interface CreateWorkflowAgentThreadInput {
  title?: string;
  initialRequest: string;
  projectPath?: string;
  folderId?: string;
  traceMode?: WorkflowTraceMode;
  phase?: WorkflowAgentThreadPhase;
}

export interface StartWorkflowDiscoveryInput {
  title?: string;
  initialRequest: string;
  projectPath?: string;
  folderId?: string;
  traceMode?: WorkflowTraceMode;
}

export interface StartWorkflowRevisionDiscoveryInput {
  workflowThreadId: string;
  artifactId: string;
  requestedChange?: string;
}

export interface AnswerWorkflowDiscoveryQuestionInput {
  questionId: string;
  choiceId?: string;
  freeform?: string;
}

export interface ResolveWorkflowDiscoveryAccessRequestInput {
  questionId: string;
  accessRequestId: string;
  response: PermissionPromptResponseMode;
}

export interface WorkflowAgentDiscoveryResult {
  folders: WorkflowAgentFolderSummary[];
  thread: WorkflowAgentThreadSummary;
}

export interface CreateWorkflowGraphSnapshotInput {
  workflowThreadId: string;
  source: WorkflowGraphSnapshotSource;
  summary: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
  artifactPath?: string;
  activate?: boolean;
}

export interface CreateWorkflowVersionInput {
  workflowThreadId: string;
  artifactId: string;
  graphSnapshotId?: string;
  sourcePath: string;
  repoPath: string;
  gitCommitHash?: string;
  status: WorkflowVersionStatus;
  createdBy: WorkflowVersionCreatedBy;
}

export interface CreateWorkflowRevisionInput {
  workflowThreadId: string;
  requestedChange: string;
  baseVersionId?: string;
  baseArtifactId?: string;
  proposedGraphSnapshotId?: string;
  graphDiff?: unknown;
  sourceDiff?: string;
  status?: WorkflowRevisionStatus;
}

export interface ListWorkflowRevisionsInput {
  workflowThreadId: string;
}

export interface ListWorkflowAgentChatMessagesInput {
  workflowThreadId: string;
}

export interface ListWorkflowVersionsInput {
  workflowThreadId: string;
}

export interface RestoreWorkflowVersionInput {
  versionId: string;
  approveRestored?: boolean;
}

export interface UpdateWorkflowRevisionInput {
  id: string;
  requestedChange?: string;
  proposedGraphSnapshotId?: string | null;
  graphDiff?: unknown;
  sourceDiff?: string | null;
  status?: WorkflowRevisionStatus;
}

export interface ResolveWorkflowRevisionInput {
  id: string;
  decision: "applied" | "rejected";
}

export interface UpdateOrchestrationTaskInput {
  id: string;
  title?: string;
  description?: string;
  state?: string;
  priority?: number | null;
  labels?: string[];
  blockedBy?: string[];
}

export interface OrchestrationBoard {
  tasks: OrchestrationTask[];
  runs: OrchestrationRun[];
  workflowReadiness?: OrchestrationWorkflowReadiness;
}

export type OrchestrationWorkflowReadinessStatus = "ready" | "missing" | "invalid";

export interface OrchestrationWorkflowRepairPreview {
  workspaceStrategy: "git-worktree" | "directory";
  currentText: string;
  proposedText: string;
  diff: string;
  currentLineCount: number;
  proposedLineCount: number;
  currentTextTruncated?: boolean;
  diffTruncated?: boolean;
}

export interface OrchestrationWorkflowReadiness {
  status: OrchestrationWorkflowReadinessStatus;
  path: string;
  checkedAt: string;
  workflowHash?: string;
  rawContent?: string;
  rawContentTruncated?: boolean;
  code?: string;
  message?: string;
  warnings: string[];
  autoDispatch?: boolean;
  maxConcurrentAgents?: number;
  maxTurns?: number;
  workspaceStrategy?: "git-worktree" | "directory";
  proofOfWork?: {
    requireTests: boolean;
    requireDiffSummary: boolean;
    requireScreenshots: boolean;
  };
  repairPreview?: OrchestrationWorkflowRepairPreview;
}

export type WorkflowArtifactStatus = "draft" | "ready_for_preview" | "approved" | "rejected" | "archived";

export type WorkflowRunStatus = "created" | "previewed" | "running" | "paused" | "needs_input" | "succeeded" | "failed" | "canceled" | "skipped";

export type WorkflowConnectorDataRetention = "none" | "redacted_audit" | "run_artifact";

export interface WorkflowConnectorManifestGrant {
  connectorId: string;
  accountId?: string;
  scopes: string[];
  operations: string[];
  dataRetention: WorkflowConnectorDataRetention;
}

export interface WorkflowPluginCapabilityGrant {
  capabilityId: string;
  pluginId: string;
  pluginName: string;
  serverName: string;
  toolName: string;
  registeredName: string;
}

export interface WorkflowAmbientCliCapabilityGrant {
  capabilityId: string;
  registryPluginId: string;
  packageId: string;
  packageName: string;
  command: string;
}

export interface WorkflowGoogleWorkspaceMethodGrant {
  methodId: string;
  accountHint?: string;
  accountProvenance: "literal" | "google_workspace_status" | "unspecified";
  service: string;
  resource: string;
  method: string;
  httpMethod: string;
  path?: string;
  scopes: string[];
  sideEffect: GoogleWorkspaceMethodSideEffect;
  dataRetention: WorkflowConnectorDataRetention;
  dryRunSupported: boolean;
  catalogVersion?: string;
  requiresTimeRange?: boolean;
  materializesFile?: boolean;
}

export interface WorkflowManifest {
  tools: string[];
  pluginCapabilities?: WorkflowPluginCapabilityGrant[];
  ambientCliCapabilities?: WorkflowAmbientCliCapabilityGrant[];
  connectors?: WorkflowConnectorManifestGrant[];
  googleWorkspaceMethods?: WorkflowGoogleWorkspaceMethodGrant[];
  mutationPolicy: "read_only" | "staged_until_approved" | "apply_after_approval";
  defaultIdleTimeoutMs?: number;
  maxToolCalls?: number;
  maxModelCalls?: number;
  maxConnectorCalls?: number;
  maxRunMs?: number;
  requiresReviewBelowConfidence?: number;
}

export interface WorkflowSpec {
  goal: string;
  summary?: string;
  successCriteria?: string[];
  inputs?: Record<string, unknown>;
}

export interface WorkflowArtifactSummary {
  id: string;
  workflowThreadId?: string;
  title: string;
  status: WorkflowArtifactStatus;
  manifest: WorkflowManifest;
  spec: WorkflowSpec;
  sourcePath: string;
  statePath: string;
  createdAt: string;
  updatedAt: string;
  compileAudit?: WorkflowCompileAuditSummary;
}

export interface WorkflowRunSummary {
  id: string;
  artifactId: string;
  status: WorkflowRunStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  reportPath?: string;
  scheduledBy?: WorkflowRunScheduleSummary;
  graphSnapshotId?: string;
  providerHealth?: WorkflowRunProviderHealth;
  retryMetadata?: WorkflowRunRetryMetadata;
  recoveryContext?: WorkflowRecoveryContext;
}

export type CallableWorkflowTaskStatus =
  | "queued"
  | "compiling"
  | "running"
  | "paused"
  | "succeeded"
  | "failed"
  | "canceled";

export interface CallableWorkflowTaskProgressSnapshot {
  workflowRunStatus: WorkflowRunStatus;
  eventCount: number;
  modelCallCount: number;
  completedStepCount: number;
  activeStepCount: number;
  lastEventType?: string;
  lastEventMessage?: string;
  lastEventAt?: string;
}

export interface CallableWorkflowTaskUsageSnapshot {
  modelCallCount: number;
  tokenCount?: number;
  tokenCountEstimated: boolean;
  costMicros?: number;
  costEstimated: boolean;
}

export type CallableWorkflowLaunchCardRiskLevel = "low" | "medium" | "high";

export interface CallableWorkflowSourcePreview {
  schemaVersion: "ambient-callable-workflow-source-preview-v1";
  label: string;
  format: "ambient_symphony_recipe_preview" | "recorded_workflow_markdown_preview";
  executable: false;
  dslStatus: "readable_preview_only" | "recorded_invocation_preview";
  text: string;
  searchTerms: string[];
}

export interface CallableWorkflowLaunchCardSummary {
  schemaVersion: "ambient-callable-workflow-launch-card-v1";
  title: string;
  sourceKind: string;
  riskLevel: CallableWorkflowLaunchCardRiskLevel;
  estimatedAgents: number;
  maxFanout: number;
  maxDepth: number;
  estimatedTokenBudget: number;
  tokenBudgetEstimated: true;
  estimatedLocalMemoryBytes: number;
  localMemoryEstimated: true;
  costEstimateLabel: string;
  toolMutationScope: string;
  checkpointResume: string;
  approvalFailureHandling: string;
  defaultCollapsed: boolean;
  blocking: boolean;
  smallSliceRecommended: boolean;
  requireConfirmation: boolean;
  requirementIds: string[];
  metricTemplateIds: string[];
  sourcePreview?: CallableWorkflowSourcePreview;
  policyWarnings: string[];
}

export interface CallableWorkflowTaskSummary {
  id: string;
  launchId: string;
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  toolCallId: string;
  toolId: string;
  toolName: string;
  sourceKind: string;
  title: string;
  status: CallableWorkflowTaskStatus;
  statusLabel: string;
  blocking: boolean;
  defaultCollapsed: boolean;
  progressVisible: boolean;
  tokenCostTracking: boolean;
  pauseResumeCancel: boolean;
  cancelHandle: string;
  runnerTarget: string;
  runnerDeferredReason: string;
  workflowThreadId?: string;
  workflowArtifactId?: string;
  workflowRunId?: string;
  errorMessage?: string;
  progressSnapshot?: CallableWorkflowTaskProgressSnapshot;
  usageSnapshot?: CallableWorkflowTaskUsageSnapshot;
  launchCard?: CallableWorkflowLaunchCardSummary;
  executionPlan: unknown;
  patternGraphSnapshot?: SubagentPatternGraphSnapshot;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type CallableWorkflowTaskRestartIssueKind =
  | "missing_parent_thread"
  | "missing_parent_run"
  | "parent_run_thread_mismatch"
  | "active_task_interrupted"
  | "missing_workflow_artifact"
  | "missing_workflow_thread"
  | "missing_workflow_run"
  | "workflow_run_artifact_mismatch"
  | "missing_task_artifact_link"
  | "workflow_run_terminal_task_unfinished";

export interface CallableWorkflowTaskRestartIssue {
  id: string;
  kind: CallableWorkflowTaskRestartIssueKind;
  severity: "info" | "warning" | "error";
  message: string;
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

export interface CallableWorkflowTaskRestartReconciliationSummary {
  schemaVersion: "ambient-callable-workflow-task-restart-v1";
  createdAt: string;
  issueCount: number;
  repairedTaskIds: string[];
  diagnosticTaskIds: string[];
  staleWorkflowArtifactTaskIds: string[];
  staleWorkflowRunTaskIds: string[];
  issues: CallableWorkflowTaskRestartIssue[];
}

export interface CallableWorkflowTaskRestartDiagnosticItem {
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

export interface CallableWorkflowTaskRestartDiagnosticsReport {
  schemaVersion: "ambient-callable-workflow-task-restart-diagnostics-v1";
  createdAt: string;
  issueCount: number;
  shownIssueCount: number;
  truncatedIssues: boolean;
  repairedTaskIds: string[];
  diagnosticTaskIds: string[];
  staleWorkflowArtifactTaskIds: string[];
  staleWorkflowRunTaskIds: string[];
  issues: CallableWorkflowTaskRestartDiagnosticItem[];
}

export interface CancelCallableWorkflowTaskInput {
  taskId: string;
  reason?: string;
}

export interface PauseCallableWorkflowTaskInput {
  taskId: string;
  reason?: string;
}

export interface ResumeCallableWorkflowTaskInput {
  taskId: string;
}

export type WorkflowRunProviderHealthStatus = "unknown" | "ok" | "provider_degraded" | "product_failed";

export interface WorkflowRunProviderHealth {
  status: WorkflowRunProviderHealthStatus;
  providerEventCount: number;
  providerProgressEventCount: number;
  providerErrorEventCount: number;
  latestProviderEventType?: string;
  latestProviderEventAt?: string;
  error?: string;
}

export interface WorkflowRunRetryMetadata {
  retryEventCount: number;
  providerRetryEventCount: number;
  recoveryAttemptCount: number;
  latestRetryEventType?: string;
  latestRetryEventAt?: string;
  latestRecoveryAction?: WorkflowRecoveryAction;
  sourceRunId?: string;
  sourceEventId?: string;
  targetKind?: WorkflowRecoveryTargetKind;
  targetItemKey?: string;
}

export interface WorkflowRunScheduleSummary {
  scheduleId: string;
  outcome: "started" | "skipped";
  targetKind?: AutomationScheduleTargetKind;
  targetId?: string;
  targetLabel?: string;
  targetVersionId?: string;
  createdTargetVersionId?: string;
  grantDecisionSource?: string;
}

export interface WorkflowRunEvent {
  id: string;
  runId: string;
  artifactId: string;
  seq: number;
  type: string;
  createdAt: string;
  message?: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  data?: Record<string, unknown>;
}

export interface WorkflowUserInputChoice {
  id: string;
  label: string;
  description?: string;
}

export interface WorkflowUserInputResponse {
  requestId: string;
  choiceId?: string;
  text?: string;
  data?: unknown;
}

export type WorkflowModelCallStatus = "succeeded" | "failed" | "invalid";

export interface WorkflowModelCallRecord {
  id: string;
  runId?: string;
  artifactId?: string;
  task: string;
  status: WorkflowModelCallStatus;
  input: unknown;
  output?: unknown;
  cacheKey?: string;
  cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
  model?: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  validationError?: string;
  startedAt: string;
  completedAt: string;
  latencyMs: number;
}

export interface WorkflowCheckpointSummary {
  key: string;
  updatedAt?: string;
  runId?: string;
  valuePreview: string;
}

export type WorkflowApprovalStatus = "pending" | "approved" | "rejected";

export interface WorkflowApprovalSummary {
  id: string;
  status: WorkflowApprovalStatus;
  createdAt: string;
  decidedAt?: string;
  changeSet?: unknown;
  changeSetPreview: string;
}

export interface CreateWorkflowArtifactInput {
  id?: string;
  workflowThreadId?: string;
  title: string;
  status?: WorkflowArtifactStatus;
  manifest: WorkflowManifest;
  spec: WorkflowSpec;
  sourcePath: string;
  statePath: string;
  activate?: boolean;
}

export interface UpdateWorkflowArtifactInput {
  id: string;
  workflowThreadId?: string;
  title?: string;
  status?: WorkflowArtifactStatus;
  manifest?: WorkflowManifest;
  spec?: WorkflowSpec;
  sourcePath?: string;
  statePath?: string;
}

export interface RecordWorkflowModelCallInput {
  runId?: string;
  artifactId?: string;
  task: string;
  status: WorkflowModelCallStatus;
  input: unknown;
  output?: unknown;
  cacheKey?: string;
  cacheCheckpoint?: WorkflowPromptCacheCheckpoint;
  model?: string;
  graphNodeId?: string;
  graphEdgeId?: string;
  itemKey?: string;
  validationError?: string;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
}

export interface WorkflowDashboard {
  artifacts: WorkflowArtifactSummary[];
  runs: WorkflowRunSummary[];
}

export type WorkflowCompileProgressPhase = "context" | "prompt" | "model" | "validated" | "persisted" | "recorded" | "completed" | "failed";

export type WorkflowCompileProgressStatus = "running" | "completed" | "failed";

export type WorkflowDiscoveryProgressPhase = "context" | "model" | "completed" | "failed";

export type WorkflowDiscoveryProgressStatus = "running" | "completed" | "failed";

export interface WorkflowCompileProgress {
  compileId: string;
  phase: WorkflowCompileProgressPhase;
  status: WorkflowCompileProgressStatus;
  message: string;
  current: number;
  total: number;
  createdAt: string;
  detail?: string;
  error?: string;
  metrics?: Record<string, string | number | boolean>;
}

export interface WorkflowDiscoveryProgress {
  operationId: string;
  workflowThreadId: string;
  revisionId?: string;
  phase: WorkflowDiscoveryProgressPhase;
  status: WorkflowDiscoveryProgressStatus;
  message: string;
  createdAt: string;
  provider?: WorkflowDiscoveryProviderKind;
  providerModel?: string;
  detail?: string;
  error?: string;
  metrics?: Record<string, string | number | boolean>;
}

export interface WorkflowRunDetailInput {
  runId: string;
}

export interface WorkflowRunDetail {
  artifact: WorkflowArtifactSummary;
  run: WorkflowRunSummary;
  events: WorkflowRunEvent[];
  modelCalls: WorkflowModelCallRecord[];
  checkpoints: WorkflowCheckpointSummary[];
  approvals: WorkflowApprovalSummary[];
  auditReport: string;
  sourceContent?: string;
  sourceReadError?: string;
  sourceProvenance?: WorkflowArtifactSourceProvenance;
  compileAudit?: WorkflowCompileAuditSummary;
}

export interface WorkflowArtifactSourceProvenance {
  kind: "program_ir_generated" | "legacy_source";
  editable: boolean;
  validationMode: "program_ir_artifact" | "legacy_source";
  reason: string;
  loweredPlanPath?: string;
  compileContextPath?: string;
  promptAssemblyPath?: string;
  repairHistoryPath?: string;
  validationReportPath?: string;
  compilerMode?: string;
}

export interface WorkflowCompileAuditModuleSummary {
  id: string;
  layer?: string;
  scope?: string;
  reason?: string;
  ruleIds: string[];
  selectedRecipeIds: string[];
  selectedToolNames: string[];
  selectedConnectorIds: string[];
}

export interface WorkflowCompileAuditSummary {
  compilerMode?: string;
  compileContextPath?: string;
  promptAssemblyPath?: string;
  validationReportPath?: string;
  promptModuleCount: number;
  stablePrefixModuleCount?: number;
  mutableSuffixModuleCount?: number;
  promptModules: WorkflowCompileAuditModuleSummary[];
  selectedRecipeIds: string[];
  rejectedRecipeIds: string[];
  policyImplicationIds: string[];
  validatorIds: string[];
  failedValidatorIds: string[];
  validationStatus?: string;
  diagnosticCount?: number;
  mutationPolicy?: string;
  connectorOperationCount?: number;
  connectorWriteOperationCount?: number;
}

export interface CompileWorkflowPreviewInput {
  userRequest: string;
  workflowThreadId?: string;
  revisionId?: string;
}

export interface CompileWorkflowDebugRewriteInput {
  runId: string;
  eventId?: string;
  userNotes?: string;
}

export type WorkflowExecutionMode = "execute" | "dry_run";

export type WorkflowRunRuntime = "workflow" | "automation";

export type WorkflowRecoveryAction = "retry_step" | "resume_checkpoint" | "skip_item";

export type WorkflowRecoveryTargetKind = "step" | "page" | "item" | "chunk";

export interface WorkflowRunLimitOverrides {
  idleTimeoutMs?: number;
  maxRunMs?: number | null;
}

export interface WorkflowRecoveryContext {
  action: WorkflowRecoveryAction;
  sourceRunId: string;
  sourceEventId: string;
  targetGraphNodeId?: string;
  targetGraphEdgeId?: string;
  targetItemKey?: string;
  targetKind?: WorkflowRecoveryTargetKind;
  targetIndex?: number;
  targetCheckpointKey?: string;
  reason?: string;
  createdAt: string;
}

export interface RunWorkflowArtifactInput {
  artifactId: string;
  mode?: WorkflowExecutionMode;
  runtime?: WorkflowRunRuntime;
  resumeFromRunId?: string;
  allowUnapproved?: boolean;
  runLimits?: WorkflowRunLimitOverrides;
  userInputs?: WorkflowUserInputResponse[];
}

export interface RecoverWorkflowRunInput {
  runId: string;
  eventId: string;
  action: WorkflowRecoveryAction;
  graphNodeId?: string;
  itemKey?: string;
  allowUnapproved?: boolean;
}

export interface CancelWorkflowRunInput {
  runId: string;
}

export interface ReviewWorkflowArtifactInput {
  artifactId: string;
  decision: "approved" | "rejected";
}

export interface UpdateWorkflowConnectorGrantInput {
  artifactId: string;
  connectorId: string;
  accountId?: string;
  nextAccountId?: string;
  dataRetention?: WorkflowConnectorDataRetention;
  decision?: "rejected";
  removeScope?: string;
}

export interface RevalidateWorkflowArtifactInput {
  artifactId: string;
}

export interface UpdateWorkflowArtifactSourceInput {
  artifactId: string;
  source: string;
}

export interface ResolveWorkflowApprovalInput {
  runId: string;
  approvalId: string;
  decision: "approved" | "rejected";
}

export interface OrchestrationHookLog {
  hook: string;
  command: string;
  cwd: string;
  exitCode?: number;
  signal?: string;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
  truncated: boolean;
  ok: boolean;
}

export interface PreparedOrchestrationTask {
  taskId: string;
  identifier: string;
  title: string;
  priority?: number;
  dispatchRank: number;
  workflowPath?: string;
  workflowHash?: string;
  workspacePath: string;
  workspaceKey: string;
  createdNow: boolean;
  strategy: "git-worktree" | "directory";
  branchName?: string;
  baseRefs?: string[];
  hooks: OrchestrationHookLog[];
}

export interface SkippedOrchestrationTask {
  taskId: string;
  identifier: string;
  title: string;
  reason: string;
}

export interface OrchestrationPrepareResult {
  workflowPath?: string;
  warnings: string[];
  prepared: PreparedOrchestrationTask[];
  skipped: SkippedOrchestrationTask[];
}

export type ResolveOrchestrationWorkflowImpactAction = "continue_old_prep" | "prepare_again";

export interface ResolveOrchestrationWorkflowImpactInput {
  action: ResolveOrchestrationWorkflowImpactAction;
  runIds: string[];
}

export interface OrchestrationWorkflowImpactSkippedRun {
  runId: string;
  reason: string;
}

export interface OrchestrationWorkflowImpactResolutionResult {
  action: ResolveOrchestrationWorkflowImpactAction;
  clearedRunIds: string[];
  skippedRuns: OrchestrationWorkflowImpactSkippedRun[];
  prepared: OrchestrationPrepareResult;
  board: OrchestrationBoard;
}

export type RepairOrchestrationWorkflowAction = "restore_generated_default" | "use_existing_anyway";

export interface RepairOrchestrationWorkflowInput {
  action: RepairOrchestrationWorkflowAction;
}

export interface OrchestrationWorkflowRepairResult {
  action: RepairOrchestrationWorkflowAction;
  workflowPath: string;
  workflowHash?: string;
  previousWorkflowHash?: string;
  backupPath?: string;
  status: OrchestrationWorkflowReadinessStatus;
  message?: string;
  board: OrchestrationBoard;
}

export interface UpdateOrchestrationWorkflowSettingsInput {
  autoDispatch?: boolean;
  maxConcurrentAgents?: number;
  maxTurns?: number;
  workspaceStrategy?: "git-worktree" | "directory";
  requireTests?: boolean;
  requireDiffSummary?: boolean;
  requireScreenshots?: boolean;
}

export interface UpdateOrchestrationWorkflowRawInput {
  markdown: string;
}

export interface OrchestrationWorkflowSettingsUpdateResult {
  workflowPath: string;
  workflowHash?: string;
  previousWorkflowHash?: string;
  backupPath?: string;
  changedFields: string[];
  diff: string;
  status: OrchestrationWorkflowReadinessStatus;
  message?: string;
  board: OrchestrationBoard;
}

export interface OrchestrationWorkflowRawUpdateResult {
  workflowPath: string;
  workflowHash?: string;
  previousWorkflowHash?: string;
  backupPath?: string;
  changed: boolean;
  diff: string;
  status: OrchestrationWorkflowReadinessStatus;
  message?: string;
  board: OrchestrationBoard;
}

export interface StartOrchestrationRunInput {
  runId: string;
}

export interface CancelOrchestrationRunInput {
  runId: string;
}

export interface RevealOrchestrationWorkspaceInput {
  workspacePath: string;
}

export interface OrchestrationAutoDispatchStartedRun {
  runId: string;
  taskId: string;
  identifier: string;
  title: string;
  priority?: number;
  dispatchRank?: number;
  dispatchKind?: "prepared" | "scheduled" | "restart_interrupted_resume";
}

export interface OrchestrationAutoDispatchStatus {
  enabled: boolean;
  workflowAllows: boolean;
  pollIntervalMs?: number;
  inFlight: boolean;
  lastTickAt?: string;
  lastError?: string;
  lastStartedRunIds: string[];
  lastStartedRuns: OrchestrationAutoDispatchStartedRun[];
}

export interface SetOrchestrationAutoDispatchInput {
  enabled: boolean;
}
