import type { AmbientModelRuntimeProfile, AmbientProviderDescriptor } from "./ambientModels";
import type {
  ModelProviderCapabilityEligibility,
  ModelProviderCapabilityProbeId,
  ModelProviderCapabilityProbeReport,
  ModelProviderEndpointCompatibility,
  ModelProviderSecretFlow,
} from "./modelProviderInstallTemplates";
import type { PermissionMode, PermissionPromptResponseMode, PermissionRisk } from "./permissionTypes";
import type { ModelProviderEndpointProbeServiceResult } from "./pluginTypes";
import type { SubagentRunStatus } from "./subagentProtocol";
import type { WorkflowRecordingState } from "./workflowTypes";

export type CollaborationMode = "agent" | "planner";

export type ThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

export type RunStatus = "idle" | "starting" | "streaming" | "tool" | "retrying" | "compacting" | "error";

export type MessageDelivery = "prompt" | "steer" | "follow-up";

export interface QueueState {
  threadId?: string;
  steering: string[];
  followUp: string[];
}

export type RuntimeActivity =
  | {
      threadId: string;
      kind: "retry";
      status: "starting";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
      message: string;
    }
  | {
      threadId: string;
      kind: "retry";
      status: "finished";
      success: boolean;
      attempt: number;
      message?: string;
    }
  | {
      threadId: string;
      kind: "compaction";
      status: "starting";
      reason: "manual" | "threshold" | "overflow";
    }
  | {
      threadId: string;
      kind: "compaction";
      status: "finished";
      reason: "manual" | "threshold" | "overflow";
      aborted: boolean;
      willRetry: boolean;
      message?: string;
    }
  | {
      threadId: string;
      kind: "browser";
      status: "finished";
      message: string;
    }
  | {
      threadId: string;
      kind: "permission";
      status: "waiting" | "finished";
      toolName: string;
      requestId?: string;
      title?: string;
      risk?: PermissionRisk;
      allowed?: boolean;
      mode?: PermissionPromptResponseMode;
      message: string;
    }
  | {
      threadId: string;
      kind: "runtime-settings";
      status: "applied" | "deferred";
      aggressiveRetries: boolean;
      disposedSession: boolean;
      deferredSession: boolean;
      message: string;
    }
  | {
      threadId: string;
      kind: "tool";
      status: "running" | "timeout";
      toolName: string;
      message: string;
      idleElapsedMs?: number;
      idleTimeoutMs?: number;
      diagnostic?: unknown;
    }
  | {
      threadId: string;
      kind: "stream";
      status: "running" | "timeout";
      outputChars: number;
      thinkingChars?: number;
      idleElapsedMs?: number;
      idleTimeoutMs?: number;
      message?: string;
      diagnostic?: unknown;
    }
  | {
      threadId: string;
      kind: "goal";
      status: "continuing" | "paused" | "completed" | "blocked" | "skipped";
      message: string;
      goalId?: string;
    };

export type ContextUsageSource =
  | "provider"
  | "provider-plus-estimate"
  | "estimate"
  | "unknown-after-compaction"
  | "unavailable";

export interface ContextUsageSnapshot {
  threadId: string;
  source: ContextUsageSource;
  tokens?: number;
  contextWindow?: number;
  percent?: number;
  latestCompactionAt?: string;
  compactionCount: number;
  updatedAt: string;
  diagnostics?: {
    piSessionFile?: string;
    piSessionFileExists?: boolean;
    activeSession: boolean;
    message?: string;
    ambientCliSkillMount?: {
      lazyModeEnabled: boolean;
      installedCliPackageCount: number;
      eagerCliSkillCount: number;
      mountedCliSkillCount: number;
    };
    providerPayload?: {
      requestType: "normal" | "compaction" | "retry" | "title" | "workflow" | "unknown";
      model?: string;
      messageCount?: number;
      roles?: string[];
      contentBytes?: number;
      toolSchemaBytes?: number;
      totalBytes?: number;
      estimatedTokens?: number;
    };
  };
}

export type ThreadGoalStatus = "active" | "paused" | "blocked" | "usage_limited" | "budget_limited" | "complete";

export interface ThreadGoal {
  threadId: string;
  goalId: string;
  objective: string;
  status: ThreadGoalStatus;
  tokenBudget?: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  continuationTurns: number;
  noProgressTurns: number;
  statusReason?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  lastContinuedAt?: string;
}

export interface ThreadGoalGetInput {
  threadId: string;
}

export interface ThreadGoalSetInput {
  threadId: string;
  objective?: string;
  status?: ThreadGoalStatus;
  tokenBudget?: number | null;
  expectedGoalId?: string;
  statusReason?: string | null;
}

export interface ThreadGoalClearInput {
  threadId: string;
  expectedGoalId?: string;
}

export interface ThreadGoalAccountInput {
  threadId: string;
  goalId: string;
  tokensUsedDelta?: number;
  timeUsedSecondsDelta?: number;
  continuationTurnDelta?: number;
  noProgressTurnDelta?: number;
  statusReason?: string | null;
}

export interface ThreadGoalCreateInput {
  threadId: string;
  objective: string;
  tokenBudget?: number | null;
}

export interface ThreadGoalToolResponse {
  goal?: ThreadGoal;
  message: string;
  remainingTokenBudget?: number;
}

export interface AmbientCompactionSettings {
  autoCompactionEnabled: boolean;
  reserveTokens: number;
  keepRecentTokens: number;
  softWarningPercent: number;
  hardPreflightPercent: number;
}

export interface ModelRuntimeSettings {
  aggressiveRetries: boolean;
  providerPreStreamTimeoutMs: number;
  providerStreamIdleTimeoutMs: number;
  installedProviders: ModelRuntimeInstalledProvider[];
}

export interface ModelRuntimeInstalledProviderSecretRef {
  schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1";
  flow: ModelProviderSecretFlow;
  configured: boolean;
  label?: string;
  ref?: string;
}

export interface ModelRuntimeInstalledProviderEndpointConfig {
  schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1";
  compatibility: Exclude<ModelProviderEndpointCompatibility, "local-text">;
  baseUrl: string;
  anthropicVersion?: string;
}

export interface ModelRuntimeInstalledProvider {
  schemaVersion: "ambient-model-runtime-installed-provider-v1";
  source: "settings-provider-onboarding";
  templateId: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  provider: AmbientProviderDescriptor;
  profile: AmbientModelRuntimeProfile;
  endpoint?: ModelRuntimeInstalledProviderEndpointConfig;
  secretRef?: ModelRuntimeInstalledProviderSecretRef;
  probeReport?: ModelProviderCapabilityProbeReport;
  eligibility?: ModelProviderCapabilityEligibility;
}

export interface InstallModelProviderEndpointCredentialRefInput {
  flow: Extract<ModelProviderSecretFlow, "ambient_cli_secret_request" | "ambient_cli_env_bind">;
  managedSecretRef: string;
  label?: string;
}

export interface SaveModelProviderCredentialInput {
  templateId: string;
  providerId?: string;
  modelId: string;
  baseUrl: string;
  label?: string;
  value: string;
}

export interface InstallModelProviderEndpointInput {
  templateId: string;
  providerId?: string;
  providerLabel?: string;
  modelId: string;
  modelLabel?: string;
  baseUrl: string;
  credentialRef: InstallModelProviderEndpointCredentialRefInput;
  generatedAt?: string;
  measuredAt?: string;
  timeoutMs?: number;
  anthropicVersion?: string;
  reliabilitySampleCount?: number;
  extraProbeIds?: ModelProviderCapabilityProbeId[];
  enabled?: boolean;
}

export interface InstallModelProviderEndpointResult {
  schemaVersion: "ambient-model-provider-settings-install-v1";
  installedProviderKey: string;
  settings: ModelRuntimeSettings;
  probeResult: ModelProviderEndpointProbeServiceResult;
}

export interface ThreadWorktreeSummary {
  threadId: string;
  projectRoot: string;
  worktreePath: string;
  branchName: string;
  baseRef?: string;
  upstream?: string;
  status: "active" | "shared" | "failed" | "missing";
  createdAt: string;
  updatedAt: string;
  lastCheckpointId?: string;
  error?: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  workspacePath: string;
  kind?: ThreadKind;
  parentThreadId?: string;
  parentMessageId?: string;
  parentRunId?: string;
  subagentRunId?: string;
  canonicalTaskPath?: string;
  childOrder?: number;
  collapsedByDefault?: boolean;
  childStatus?: SubagentRunStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  lastReadAt?: string;
  lastMessagePreview: string;
  permissionMode: PermissionMode;
  collaborationMode: CollaborationMode;
  model: string;
  thinkingLevel: ThinkingLevel;
  memoryEnabled?: boolean;
  piSessionFile?: string;
  gitWorktree?: ThreadWorktreeSummary;
  pinned?: boolean;
  workflowRecording?: WorkflowRecordingState;
}

export type ThreadKind = "chat" | "subagent_child";

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ToolLongformInputPreviewItem {
  label: string;
  fieldPath: string;
  path?: string;
  language?: string;
  preview: string;
  chars: number;
  truncated: boolean;
  note?: string;
}

export interface ToolLongformInputPreview {
  kind: "longform-input";
  title?: string;
  runningTitle?: string;
  summary: string;
  items: ToolLongformInputPreviewItem[];
}

export type ToolArgumentStreamEventType = "toolcall_start" | "toolcall_delta" | "toolcall_end";

export type ToolArgumentProgressPhase = "argument_stream" | "execution" | "completed";

export interface InterruptedToolCallRecoverySnapshot {
  version: 1;
  status: "capturing" | "recoverable" | "completed";
  runId: string;
  toolCallId: string;
  toolName: string;
  source: "raw_tool_input" | "visible_tool_input";
  thresholdChars: number;
  capturedChars: number;
  observedArgumentChars: number;
  updatedAt: string;
  argumentPath: string;
  workspaceRelativeArgumentPath: string;
  argumentSha256: string;
  parseStatus: "valid_json" | "invalid_json" | "text";
  suffixPreview: string;
  writeTargetPath?: string;
  writeContentPrefixChars?: number;
  writeContentPrefixPreview?: string;
  recoveryApplyOriginalRunId?: string;
  recoveryApplyOriginalToolCallId?: string;
  recoveryApplyOriginalSha256?: string;
  recoveryApplySuffixPrefixChars?: number;
  recoveryApplySuffixTotalChars?: number;
  recoveryApplySuffixPrefixPreview?: string;
  recoveryApplySuffixPrefixTruncated?: boolean;
  recoveryApplySuffixPrefixOmittedChars?: number;
  resumeInstruction: string;
  intent?: ToolIntentSnapshot;
}

export interface InterruptedToolCallRecoveryDiagnostics {
  version: 1;
  lastUpdatedAt: string;
  active: InterruptedToolCallRecoverySnapshot[];
  completed: InterruptedToolCallRecoverySnapshot[];
}

export interface ToolArgumentProgressSnapshot {
  version: 1;
  phase: ToolArgumentProgressPhase;
  eventType: ToolArgumentStreamEventType | "tool_execution_start" | "tool_execution_end";
  toolCallId: string;
  toolName: string;
  uiStatus: string;
  argumentStartedAt: string;
  argumentUpdatedAt: string;
  argumentElapsedMs: number;
  argumentComplete: boolean;
  inputChars: number;
  deltaChars: number;
  totalDeltaChars: number;
  maxDeltaChars: number;
  observedArgumentChars: number;
  toolcallStartAt?: string;
  firstToolcallDeltaAt?: string;
  latestToolcallDeltaAt?: string;
  toolcallEndAt?: string;
  argumentEventCount: number;
  toolcallDeltaCount: number;
  meaningfulGrowthCount: number;
  lastMeaningfulGrowthAt?: string;
  lastMeaningfulGrowthMsAgo?: number;
  charsPerSecond: number;
  longformInputChars?: number;
  longformInputDeltaChars?: number;
  contentFieldChars?: number;
  contentFieldDeltaChars?: number;
  executionStartedAt?: string;
  executionCompletedAt?: string;
  executionElapsedMs?: number;
  interruptedToolCallRecovery?: InterruptedToolCallRecoverySnapshot;
}

export interface ToolArgumentStreamDiagnostics {
  version: 1;
  lastUpdatedAt: string;
  active: ToolArgumentProgressSnapshot[];
  completed: ToolArgumentProgressSnapshot[];
}

export type ProviderContinuationToolStatus = "preparing" | "prepared" | "started" | "completed" | "failed" | "interrupted";

export type ProviderContinuationToolCertainty = "preparing" | "prepared_only" | "started_unknown" | "completed" | "failed" | "awaiting_permission";

export type ToolIntentOperationKind =
  | "search"
  | "fetch_known_url"
  | "verify_specific_source"
  | "read_context"
  | "write_or_mutate"
  | "tool_execution"
  | "unknown";

export type ToolIntentMateriality = "required_before_final_answer" | "important" | "optional";

export interface ToolIntentSnapshot {
  version: 1;
  toolCallId: string;
  toolName: string;
  sourceUserMessageId?: string;
  turnGoal?: string;
  declaredPurpose?: string;
  assistantLeadIn?: string;
  operationKind: ToolIntentOperationKind;
  targetSummary?: string;
  materiality: ToolIntentMateriality;
  substituteAllowed: boolean;
  createdAt: string;
}

export interface ProviderContinuationToolState {
  version: 1;
  toolCallId: string;
  toolName: string;
  status: ProviderContinuationToolStatus;
  certainty: ProviderContinuationToolCertainty;
  phase: ToolArgumentProgressPhase | "unknown";
  executionStarted: boolean;
  mayHaveSideEffects: boolean;
  argumentComplete: boolean;
  inputChars: number;
  observedArgumentChars: number;
  inputPreview?: string;
  artifactPath?: string;
  argumentStartedAt?: string;
  argumentUpdatedAt?: string;
  executionStartedAt?: string;
  executionCompletedAt?: string;
  failureReason?: string;
  recoveryArgumentPath?: string;
  workspaceRelativeRecoveryArgumentPath?: string;
  intent?: ToolIntentSnapshot;
}

export interface ProviderContinuationState {
  version: 1;
  stateId: string;
  createdAt: string;
  runId: string;
  threadId: string;
  assistantMessageId: string;
  provider: "ambient";
  model: string;
  failure: {
    kind: string;
    message: string;
  };
  retry: {
    scheduled: boolean;
    replaySafe: boolean;
    continuationSafe?: boolean;
    usesFreshSession?: boolean;
    attempt?: number;
    maxRetries?: number;
    reason?: string;
    delayMs?: number;
  };
  stream: {
    eventCount: number;
    approximatePayloadBytes: number;
    preStreamTimeoutMs: number;
    streamIdleTimeoutMs: number;
    firstEventAt?: string;
    firstEventType?: string;
    lastEventAt?: string;
    lastEventType?: string;
    idleSource?: string;
    firstVisibleTextAt?: string;
    firstToolArgumentAt?: string;
    firstToolExecutionStartedAt?: string;
    assistantOutputChars: number;
    thinkingOutputChars: number;
    currentAssistantFinalTextChars: number;
    semanticOutputSeen: boolean;
    receivedAnyText: boolean;
    trace?: {
      path: string;
      eventCount: number;
      recentEventCount: number;
      reason: string;
      recordedAt: string;
      promptStartLine?: number;
      promptUserLine?: number;
      promptContentSha256?: string;
    };
  };
  assistant: {
    messageId: string;
    hasVisibleOutput: boolean;
    outputChars: number;
    thinkingChars: number;
  };
  tools: {
    all: ProviderContinuationToolState[];
    open: ProviderContinuationToolState[];
    completed: ProviderContinuationToolState[];
    interrupted: ProviderContinuationToolState[];
    mayHaveSideEffects: ProviderContinuationToolState[];
    completedToolMessageCount: number;
  };
  sessionFile?: string;
}

export interface RunDiagnostics {
  toolArgumentStreams?: ToolArgumentStreamDiagnostics;
  providerContinuationState?: ProviderContinuationState;
  [key: string]: unknown;
}

export interface ToolEditTextPreview {
  preview: string;
  chars: number;
  truncated: boolean;
  omittedChars?: number;
}

export interface ToolEditInputPreviewEdit {
  oldText: ToolEditTextPreview;
  newText: ToolEditTextPreview;
}

export interface ToolEditInputPreview {
  kind: "edit-input";
  path?: string;
  language?: string;
  summary: string;
  edits: ToolEditInputPreviewEdit[];
}

export interface ToolLargeOutputPreviewItem {
  label: string;
  chars: number;
  previewChars: number;
  truncated: boolean;
  artifactKind?: "tool-output" | "stdout" | "stderr" | "long-log" | "external-model-response";
  verbatim?: boolean;
  artifactPath?: string;
  artifactBytes?: number;
  suggestedTools?: string[];
}

export interface ToolLargeOutputPreview {
  kind: "large-output";
  summary: string;
  items: ToolLargeOutputPreviewItem[];
}

export interface ToolExternalModelResponseArtifact {
  kind: "external-model-response";
  label: string;
  verbatim: true;
  chars: number;
  previewChars: number;
  truncated: boolean;
  text?: string;
  artifactPath?: string;
  artifactBytes?: number;
  model?: string;
  provider?: string;
  usage?: Record<string, unknown>;
}

export type ChatExportSource = "pi-session" | "visible-chat-fallback";
export type ChatPdfExportSource = "visible-chat-pdf";

export interface ExportChatInput {
  threadId: string;
}

export interface ExportChatResult {
  path: string;
  bytes: number;
  createdAt: string;
  source: ChatExportSource;
  fallbackReason?: string;
}

export interface ExportChatPdfInput {
  threadId: string;
  projectId?: string;
}

export interface ExportChatPdfResult {
  path: string;
  bytes: number;
  createdAt: string;
  source: ChatPdfExportSource;
  fallbackReason?: string;
}
