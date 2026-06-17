export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_ASSISTANT_TEXT =
  "Ambient is coordinating a parent task while required child work stays visible.";

export const SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_USER_TEXT =
  "Parent delegated a focused review task to this child thread.";

export const SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_ASSISTANT_TEXT =
  "Review worker is live in the child transcript and blocked on a scoped approval request.";

export const SUBAGENT_DESKTOP_DOGFOOD_REVIEW_CHILD_TOOL_RESULT_TEXT =
  "Workspace Read returned a bounded child-thread tool result with parent tool-card chrome.";

export const SUBAGENT_DESKTOP_DOGFOOD_SUMMARIZER_CHILD_ASSISTANT_TEXT =
  "Context summarizer completed with a readable summary retained in the child transcript.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_RUN_ID = "desktop-dogfood-parent-run";

export const SUBAGENT_DESKTOP_DOGFOOD_FIXED_NOW = "2026-06-11T12:00:00.000Z";

export const SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ID = "local-text-runtime";

export const SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_LEASE_ID = "desktop-dogfood-local-runtime-lease";

export const SUBAGENT_DESKTOP_DOGFOOD_LOCAL_RUNTIME_ENDPOINT = "http://127.0.0.1:43123/health";

export const SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_ARTIFACT_ID = "desktop-dogfood-workflow-artifact";

export const SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_TOOL_CALL_ID = "desktop-dogfood-workflow-tool-call";

export const SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_RUN_ID =
  "desktop-dogfood-overflow-mapper-run";

export const SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_CHILD_THREAD_ID =
  "desktop-dogfood-overflow-mapper-thread";

export const SUBAGENT_DESKTOP_DOGFOOD_OVERFLOW_MAPPER_LABEL = "Archive scanner";

export const SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_RELATIVE_PATH =
  ".ambient-codex/workflows/desktop-dogfood-map-reduce/main.ts";

export const SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_STATE_RELATIVE_PATH =
  ".ambient-codex/workflows/desktop-dogfood-map-reduce/state.json";

export const SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_SOURCE_CONTENT =
  "export const workflow = 'desktop dogfood map reduce';\n";

export const SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_ARTIFACT_ID =
  "desktop-dogfood-mutating-worker-artifact";

export const SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_TOOL_CALL_ID =
  "desktop-dogfood-mutating-worker-tool-call";

export const SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_SOURCE_RELATIVE_PATH =
  ".ambient-codex/workflows/desktop-dogfood-mutating-worker/main.ts";

export const SUBAGENT_DESKTOP_DOGFOOD_MUTATING_WORKFLOW_STATE_RELATIVE_PATH =
  ".ambient-codex/workflows/desktop-dogfood-mutating-worker/state.json";

export const SUBAGENT_DESKTOP_DOGFOOD_MUTATING_STAGED_RELATIVE_PATH = "src/feature.txt";

export const SUBAGENT_DESKTOP_DOGFOOD_MUTATING_REPORT_RELATIVE_PATH =
  ".ambient-codex/workflows/desktop-dogfood-mutating-worker/mutation-report.md";

export const SUBAGENT_DESKTOP_DOGFOOD_MUTATING_PROGRESS_MESSAGE =
  "Staged mutation: src/feature.txt; output preview retained; parent workspace unchanged.";

export const SUBAGENT_DESKTOP_DOGFOOD_WORKFLOW_HIGH_LOAD_PATTERN_LABELS = [
  "Symphony Map-Reduce",
  "Symphony Adversarial Debate",
  "Symphony Imitate and Verify",
  "Symphony Pipeline",
  "Symphony Ensemble",
  "Symphony Self-Healing Loop",
] as const;

export const SUBAGENT_DESKTOP_DOGFOOD_STRESS_PARENT_TEXT_PREFIX = "Ambient high-load dogfood parent";

export const SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARENT_ASSISTANT_TEXT =
  "Ambient lifecycle edge dogfood parent: timeout, partial, retry, and detached children stay visible.";

export const SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_USER_TEXT =
  "Parent delegated a timeout edge task to this child thread.";

export const SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_TIMEOUT_CHILD_ASSISTANT_TEXT =
  "Timeout edge worker started the delegated work, then stopped before producing synthesis-safe output.";

export const SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_USER_TEXT =
  "Parent delegated a partial recovery task to this child thread.";

export const SUBAGENT_DESKTOP_DOGFOOD_LIFECYCLE_PARTIAL_CHILD_ASSISTANT_TEXT =
  "Partial recovery worker retained a partial summary while clearly marking missing child evidence.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_CASCADE_PARENT_ASSISTANT_TEXT =
  "Ambient parent-stop cascade dogfood parent: stopped parent work cancels required child work without hiding the child threads.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_USER_TEXT =
  "Parent delegated required work before the stop cascade.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_REQUIRED_CHILD_ASSISTANT_TEXT =
  "Parent-stop required worker was still running when the parent stop cascade arrived.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_USER_TEXT =
  "Parent delegated optional background work before the stop cascade.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_BACKGROUND_CHILD_ASSISTANT_TEXT =
  "Parent-stop background worker was detached because it was optional background work.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_USER_TEXT =
  "Parent delegated required work that completed before the stop cascade.";

export const SUBAGENT_DESKTOP_DOGFOOD_PARENT_STOP_COMPLETED_CHILD_ASSISTANT_TEXT =
  "Parent-stop completed worker already produced synthesis-safe output before the stop.";

export const SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_RUN_ID = "desktop-dogfood-denied-scope-run";

export const SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_CHILD_THREAD_ID = "desktop-dogfood-denied-scope-thread";

export const SUBAGENT_DESKTOP_DOGFOOD_DENIED_SCOPE_TOOL_CALL_ID = "desktop-dogfood-denied-scope-tool-call";

export interface SubagentDesktopDogfoodSeedResult {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId: string;
  childRunIds: string[];
  childThreadIds: string[];
  approvalRequestParentMailboxEventId: string;
  approvalWaitBarrierId: string;
  approvalId: string;
  approvalChildRunId: string;
  approvalChildThreadId: string;
  completedChildRunId: string;
  completedChildThreadId: string;
  overflowChildRunId: string;
  overflowChildThreadId: string;
  overflowChildLabel: string;
  cancelControlChildRunId: string;
  closeControlChildRunIds: string[];
  localRuntimeLeaseId: string;
  localRuntimeId: string;
  localRuntimePid: number;
  workflowTaskId: string;
  workflowArtifactId: string;
  workflowArtifactSourceRelativePath: string;
  workflowArtifactStateRelativePath: string;
  workflowArtifactSourceContent: string;
  workflowRunId: string;
  workflowThreadId: string;
  workflowParentMailboxEventId: string;
  mutatingWorkflowTaskId: string;
  mutatingWorkflowArtifactId: string;
  mutatingWorkflowRunId: string;
  mutatingWorkflowThreadId: string;
  mutatingWorkflowChildRunId: string;
  mutatingWorkflowChildThreadId: string;
  mutatingWorkflowStagedRelativePath: string;
  mutatingWorkflowReportRelativePath: string;
  mutatingWorkflowProgressMessage: string;
  mutatingWorkflowParentWorkspaceUnchanged: boolean;
  workflowHighLoadTaskIds: string[];
  workflowHighLoadArtifactIds: string[];
  workflowHighLoadRunIds: string[];
  workflowHighLoadThreadIds: string[];
  workflowHighLoadPatternLabels: string[];
  deniedScopeParentMailboxEventId: string;
  deniedScopeChildRunId: string;
  deniedScopeChildThreadId: string;
  lifecycleEdgeParentMessageId: string;
  lifecycleEdgeChildRunIds: string[];
  lifecycleEdgeChildThreadIds: string[];
  lifecycleEdgeWaitBarrierIds: string[];
  parentStopCascadeParentMessageId: string;
  parentStopCascadeParentMailboxEventId: string;
  parentStopCascadeChildRunIds: string[];
  parentStopCascadeChildThreadIds: string[];
  parentStopCascadeWaitBarrierIds: string[];
  parentStopCascadeCancelledRunIds: string[];
  parentStopCascadeDetachedRunIds: string[];
  parentStopCascadeUnchangedRunIds: string[];
  parentStopCascadeCancelledWaitBarrierIds: string[];
  parentStopCascadeCancelledMailboxEventIds: string[];
  stressParentMessageIds: string[];
  stressChildRunIds: string[];
  stressChildThreadIds: string[];
}
