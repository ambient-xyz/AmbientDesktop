import type { MessageRole, ThreadActionInput } from "./threadCoreTypes";

export type WorkflowRecordingStatus = "recording" | "stopped";

export type WorkflowRecordingEventKind = "user_message" | "assistant_message" | "tool_result";

export type WorkflowRecordingEventStatus =
  | "succeeded"
  | "failed"
  | "running"
  | "skipped"
  | "permission_blocked"
  | "user_corrected"
  | "unknown";

export interface WorkflowRecordingEvent {
  id: string;
  messageId: string;
  kind: WorkflowRecordingEventKind;
  status: WorkflowRecordingEventStatus;
  role: MessageRole;
  createdAt: string;
  preview: string;
  inputPreview?: string;
  resultPreview?: string;
  toolName?: string;
  toolCallId?: string;
  artifactPath?: string;
  redacted?: boolean;
  redactionCount?: number;
}

export interface WorkflowRecordingCapture {
  capturedAt: string;
  messageCount: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolResultCount: number;
  successfulToolResultCount: number;
  failedToolResultCount: number;
  skippedToolResultCount?: number;
  permissionBlockedToolResultCount?: number;
  userCorrectedEventCount?: number;
  redactedEventCount?: number;
  redactionCount?: number;
  events: WorkflowRecordingEvent[];
}

export interface WorkflowRecordingPlaybookToolExample {
  toolName: string;
  inputPreview?: string;
  resultPreview?: string;
  artifactPath?: string;
}

export interface WorkflowRecordingPlaybookAvoidPattern {
  toolName?: string;
  status: Extract<WorkflowRecordingEventStatus, "failed" | "skipped" | "permission_blocked">;
  reason: string;
}

export interface WorkflowRecordingPlaybookDraft {
  status: "draft" | "confirmed";
  source: "deterministic_capture" | "pi_summary" | "user_edit" | "symphony_recipe";
  generatedAt: string;
  confirmedAt?: string;
  sourceCapturedAt: string;
  intent: string;
  inputs: string[];
  successfulExamples: WorkflowRecordingPlaybookToolExample[];
  doNot: WorkflowRecordingPlaybookAvoidPattern[];
  validation: string[];
  outputShape: string[];
  evidenceSummary: {
    messageCount: number;
    toolResultCount: number;
    successfulToolResultCount: number;
    failedToolResultCount: number;
    skippedToolResultCount: number;
    permissionBlockedToolResultCount: number;
    redactionCount: number;
  };
}

export interface WorkflowRecordingReviewValidationIssue {
  field: string;
  term: string;
  reason: "local_path" | "run_specific_file";
  message: string;
  suggestion: string;
}

export interface WorkflowRecordingSavedPlaybook {
  id: string;
  title: string;
  version: number;
  enabled: boolean;
  savedAt: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedReason?: string;
  rootPath: string;
  manifestPath: string;
  markdownPath: string;
  sidecarPath: string;
  transcriptPath: string;
  indexPath: string;
}

export interface WorkflowRecordingLibraryVersion {
  version: number;
  title: string;
  savedAt: string;
  manifestPath: string;
  markdownPath: string;
  sidecarPath: string;
  transcriptPath: string;
  restoredFromVersion?: number;
}

export interface WorkflowRecordingLibraryEntry {
  id: string;
  title: string;
  version: number;
  enabled: boolean;
  savedAt: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedReason?: string;
  threadId?: string;
  manifestPath: string;
  markdownPath: string;
  sidecarPath: string;
  transcriptPath: string;
  summary: string;
  toolNames: string[];
  outputShape: string[];
  versions: WorkflowRecordingLibraryVersion[];
  score?: number;
}

export interface WorkflowRecordingEditContext {
  id: string;
  title: string;
  version: number;
  manifestPath: string;
  markdownPath: string;
  sidecarPath: string;
  transcriptPath: string;
}

export interface WorkflowRecordingLibraryDescription extends WorkflowRecordingLibraryEntry {
  markdownPreview: string;
  playbook?: WorkflowRecordingPlaybookDraft;
  manifest?: Record<string, unknown>;
  callableInvocation?: WorkflowRecordingCallableInvocationSummary;
  callableInvocationPath?: string;
  diagnosticsTracePath?: string;
}

export interface WorkflowRecordingCallableInvocationSummary {
  schemaVersion: "ambient-workflow-recording-callable-invocation-v1";
  mode: "compact_callable_invocation";
  source: "workflow_recorder";
  workflowId: string;
  workflowVersion: number;
  title: string;
  enabled: boolean;
  savedAt: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedReason?: string;
  thread?: {
    id: string;
    title: string;
  };
  input: Record<string, unknown>;
  inputSchemaHints?: {
    required?: string[];
    properties?: Record<string, string>;
  };
  playbook?: {
    status?: WorkflowRecordingPlaybookDraft["status"];
    source?: WorkflowRecordingPlaybookDraft["source"];
    intent?: string;
    inputs?: string[];
    validation?: string[];
    outputShape?: string[];
    successfulToolNames?: string[];
    doNotCount?: number;
  };
  captureSummary?: {
    capturedAt?: string;
    messageCount?: number;
    toolResultCount?: number;
    successfulToolResultCount?: number;
    failedToolResultCount?: number;
    skippedToolResultCount?: number;
    permissionBlockedToolResultCount?: number;
    redactionCount?: number;
  };
  callableWorkflow: {
    defaultInvocation: string;
    invocation: string;
    diagnosticsTrace: string;
    recorderCompactInvocationByDefault: boolean;
    fullTraceArtifact: boolean;
  };
}

export interface WorkflowInjectedPlaybookMetadata {
  id: string;
  title?: string;
  version: number;
  status: "preflight-description" | "injected";
  injected: boolean;
  toolNames: string[];
  outputShape: string[];
  markdownTruncated: boolean;
}

export interface WorkflowRecordingReviewState {
  status: "draft" | "confirmed";
  draft: WorkflowRecordingPlaybookDraft;
  confirmed?: WorkflowRecordingPlaybookDraft;
  savedPlaybook?: WorkflowRecordingSavedPlaybook;
  validationIssues?: WorkflowRecordingReviewValidationIssue[];
  validationRejectedAt?: string;
}

export interface WorkflowRecordingState {
  status: WorkflowRecordingStatus;
  goal?: string;
  startedAt: string;
  stoppedAt?: string;
  capture?: WorkflowRecordingCapture;
  review?: WorkflowRecordingReviewState;
}

export interface StartWorkflowRecordingInput {
  goal?: string;
  workspacePath?: string;
}

export interface StopWorkflowRecordingInput extends ThreadActionInput {}

export interface RequestWorkflowRecordingReviewInput extends ThreadActionInput {
  feedback?: string;
}

export interface ConfirmWorkflowRecordingInput extends ThreadActionInput {}

export interface WorkflowRecordingReviewDraftUpdate {
  intent: string;
  inputs: string[];
  successfulExamples: WorkflowRecordingPlaybookToolExample[];
  doNot: WorkflowRecordingPlaybookAvoidPattern[];
  validation: string[];
  outputShape: string[];
}

export interface UpdateWorkflowRecordingReviewInput extends ThreadActionInput {
  draft: WorkflowRecordingReviewDraftUpdate;
}

export interface SearchWorkflowRecordingsInput {
  query?: string;
  includeDisabled?: boolean;
  includeArchived?: boolean;
  limit?: number;
}

export interface DescribeWorkflowRecordingInput {
  id: string;
  includeArchived?: boolean;
}

export interface SetWorkflowRecordingEnabledInput {
  id: string;
  enabled: boolean;
}

export interface UpdateWorkflowRecordingPlaybookInput {
  id: string;
  baseVersion: number;
  title?: string;
  draft: WorkflowRecordingReviewDraftUpdate;
}
