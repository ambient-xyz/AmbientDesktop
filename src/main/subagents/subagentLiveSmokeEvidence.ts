import { validateSubagentResultArtifactForSynthesis, type SubagentRuntimeEvent } from "../../shared/subagentProtocol";
import type { SubagentMaturityEvidence } from "../../shared/subagentMaturity";
import type { PermissionRequest } from "../../shared/permissionTypes";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";

export const SUBAGENT_LIVE_SMOKE_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-live-smoke-evidence-v1" as const;
export const SUBAGENT_LIVE_APPROVAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION = "ambient-subagent-live-approval-authority-evidence-v1" as const;

export interface SubagentLiveSmokeEvidenceStore {
  recordSubagentMaturityEvidence(input: {
    kind: "live_dogfood_run" | "live_pi_smoke";
    status: "passed";
    evidenceKey?: string;
    runId?: string;
    parentRunId?: string;
    artifactPath?: string;
    notes?: string;
    details?: Record<string, unknown>;
    createdAt?: string;
  }): SubagentMaturityEvidence;
}

export interface RecordSubagentLiveSmokeEvidenceInput {
  run: SubagentRunSummary;
  runtimeEvents: readonly unknown[];
  provider: string;
  parentCompletionText: string;
  childCompletionText: string;
  parentCompletionSentinel?: string;
  childCompletionSentinel?: string;
  reportPath?: string;
  evidenceKey?: string;
  createdAt?: string;
  notes?: string;
}

export interface SubagentLiveSmokeEvidenceRecord {
  schemaVersion: typeof SUBAGENT_LIVE_SMOKE_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  runId: string;
  parentRunId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  provider: string;
  reportPath?: string;
  dogfoodRunEvidence: SubagentMaturityEvidence;
  livePiSmokeEvidence: SubagentMaturityEvidence;
}

export interface RecordSubagentLiveApprovalAuthorityEvidenceInput {
  run: SubagentRunSummary;
  provider: string;
  waitDetails: unknown;
  pendingPermissions: readonly PermissionRequest[];
  parentMailboxEvents: readonly SubagentParentMailboxEventSummary[];
  childTranscript: string;
  deniedContentSentinel: string;
  expectedToolName: string;
  expectedAction: string;
  reportPath?: string;
  evidenceKey?: string;
  createdAt?: string;
  notes?: string;
}

export interface SubagentLiveApprovalAuthorityEvidenceRecord {
  schemaVersion: typeof SUBAGENT_LIVE_APPROVAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION;
  createdAt: string;
  runId: string;
  parentRunId: string;
  childThreadId: string;
  canonicalTaskPath: string;
  provider: string;
  reportPath?: string;
  dogfoodRunEvidence: SubagentMaturityEvidence;
  livePiSmokeEvidence: SubagentMaturityEvidence;
}

const DEFAULT_PARENT_COMPLETION_SENTINEL = "SUBAGENT_LIVE_DONE";
const DEFAULT_CHILD_COMPLETION_SENTINEL = "SUBAGENT_CHILD_DONE";

export function recordSubagentLiveSmokeEvidence(
  store: SubagentLiveSmokeEvidenceStore,
  input: RecordSubagentLiveSmokeEvidenceInput,
): SubagentLiveSmokeEvidenceRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const validation = validateSubagentResultArtifactForSynthesis(input.run.resultArtifact);
  if (input.run.status !== "completed") {
    throw new Error(`Live sub-agent smoke evidence requires a completed child run; got ${input.run.status}.`);
  }
  if (!validation.synthesisAllowed) {
    throw new Error(`Live sub-agent smoke evidence requires synthesizable child output: ${validation.reason ?? "validation failed"}`);
  }
  const runtimeStarted = input.runtimeEvents.some((event) => isRuntimeEvent(event, "started", input.run.id));
  const runtimeAssistantDelta = input.runtimeEvents.some((event) => isRuntimeEvent(event, "assistant_delta", input.run.id));
  const runtimeCompleted = input.runtimeEvents.some((event) => isRuntimeEvent(event, "completed", input.run.id));
  if (!runtimeStarted || !runtimeCompleted) {
    throw new Error("Live sub-agent smoke evidence requires started and completed runtime events for the child run.");
  }
  if (!runtimeAssistantDelta) {
    throw new Error("Live sub-agent smoke evidence requires at least one assistant_delta runtime event for the child run.");
  }
  const parentCompletionSentinel = input.parentCompletionSentinel ?? DEFAULT_PARENT_COMPLETION_SENTINEL;
  const childCompletionSentinel = input.childCompletionSentinel ?? DEFAULT_CHILD_COMPLETION_SENTINEL;
  const parentReturned = input.parentCompletionText.includes(parentCompletionSentinel);
  if (!parentReturned) {
    throw new Error(`Live sub-agent smoke evidence requires the parent return sentinel ${parentCompletionSentinel}.`);
  }
  const childTranscriptContainsSentinel = input.childCompletionText.includes(childCompletionSentinel);
  const childSummaryReturned = JSON.stringify(input.run.resultArtifact ?? {}).includes(childCompletionSentinel);
  if (!childTranscriptContainsSentinel || !childSummaryReturned) {
    throw new Error(`Live sub-agent smoke evidence requires the child summary sentinel ${childCompletionSentinel} in both child transcript and result artifact.`);
  }

  const baseKey = input.evidenceKey ?? `live-smoke:${input.run.id}`;
  const details = {
    schemaVersion: SUBAGENT_LIVE_SMOKE_EVIDENCE_SCHEMA_VERSION,
    provider: input.provider,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    status: input.run.status,
    runtimeStarted,
    runtimeAssistantDelta,
    runtimeCompleted,
    parentReturned,
    parentCompletionSentinel,
    childTranscriptContainsSentinel,
    childSummaryReturned,
    childCompletionSentinel,
    resultArtifact: {
      valid: validation.valid,
      synthesisAllowed: validation.synthesisAllowed,
      partial: validation.partial,
      status: validation.status,
    },
    ...(input.reportPath ? { reportPath: input.reportPath } : {}),
  };
  const notes = input.notes ?? "Live Ambient/Pi sub-agent smoke completed with streamed child output, synthesizable child summary, and parent return proof.";
  const dogfoodRunEvidence = store.recordSubagentMaturityEvidence({
    kind: "live_dogfood_run",
    status: "passed",
    evidenceKey: `dogfood:${baseKey}`,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    artifactPath: input.reportPath,
    notes,
    details,
    createdAt,
  });
  const livePiSmokeEvidence = store.recordSubagentMaturityEvidence({
    kind: "live_pi_smoke",
    status: "passed",
    evidenceKey: `pi-smoke:${baseKey}`,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    artifactPath: input.reportPath,
    notes,
    details,
    createdAt,
  });
  return {
    schemaVersion: SUBAGENT_LIVE_SMOKE_EVIDENCE_SCHEMA_VERSION,
    createdAt,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    provider: input.provider,
    ...(input.reportPath ? { reportPath: input.reportPath } : {}),
    dogfoodRunEvidence,
    livePiSmokeEvidence,
  };
}

export function recordSubagentLiveApprovalAuthorityEvidence(
  store: SubagentLiveSmokeEvidenceStore,
  input: RecordSubagentLiveApprovalAuthorityEvidenceInput,
): SubagentLiveApprovalAuthorityEvidenceRecord {
  const createdAt = input.createdAt ?? new Date().toISOString();
  if (input.run.status !== "needs_attention") {
    throw new Error(`Live child approval authority evidence requires a child paused for attention; got ${input.run.status}.`);
  }
  const waitDetails = objectRecord(input.waitDetails);
  if (waitDetails.status !== "needs_attention" || waitDetails.waitSatisfied !== false || waitDetails.synthesisAllowed !== false) {
    throw new Error("Live child approval authority evidence requires wait_agent to leave the parent blocked on a non-synthesizable approval request.");
  }
  const pendingPermission = input.pendingPermissions.find((permission) =>
    permission.threadId === input.run.childThreadId &&
    permission.toolName === input.expectedToolName &&
    permission.grantActionKind === input.expectedAction
  );
  if (!pendingPermission) {
    throw new Error("Live child approval authority evidence requires a pending permission request scoped to the child thread and expected tool/action.");
  }
  const approvalEvent = input.parentMailboxEvents.find((event) => {
    if (event.type !== "subagent.child_approval_requested" || event.deliveryState !== "queued") return false;
    const payload = objectRecord(event.payload);
    const parentBlockingState = objectRecord(payload.parentBlockingState);
    return payload.childRunId === input.run.id &&
      payload.childThreadId === input.run.childThreadId &&
      payload.approvalId === pendingPermission.id &&
      payload.requestedToolId === input.expectedToolName &&
      payload.requestedAction === input.expectedAction &&
      parentBlockingState.action === "forward_child_approval_then_wait" &&
      parentBlockingState.childRunId === input.run.id &&
      parentBlockingState.childThreadId === input.run.childThreadId &&
      parentBlockingState.resumeParentBlocking === true;
  });
  if (!approvalEvent) {
    throw new Error("Live child approval authority evidence requires a queued parent mailbox approval event that preserves child identity and parent blocking.");
  }
  if (input.childTranscript.includes(input.deniedContentSentinel)) {
    throw new Error("Live child approval authority evidence cannot include denied file content in the child transcript.");
  }

  const baseKey = input.evidenceKey ?? `approval-authority:${input.run.id}`;
  const details = {
    schemaVersion: SUBAGENT_LIVE_APPROVAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION,
    provider: input.provider,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    status: input.run.status,
    childPausedForApproval: true,
    parentRemainedBlocked: true,
    approvalForwardedToParent: true,
    approvalRequestChildThreadId: pendingPermission.threadId,
    approvalRequestToolName: pendingPermission.toolName,
    approvalRequestAction: pendingPermission.grantActionKind,
    approvalRequestId: pendingPermission.id,
    approvalRequestParentMailboxEventId: approvalEvent.id,
    parentMailboxDeliveryState: approvalEvent.deliveryState,
    deniedContentLeaked: false,
    waitDetails: {
      status: waitDetails.status,
      waitSatisfied: waitDetails.waitSatisfied,
      synthesisAllowed: waitDetails.synthesisAllowed,
      waitNotice: typeof waitDetails.waitNotice === "string" ? waitDetails.waitNotice : undefined,
    },
    ...(input.reportPath ? { reportPath: input.reportPath } : {}),
  };
  const notes = input.notes ??
    "Live Ambient/Pi child approval authority paused the child, forwarded a child-labeled approval request to the parent, and kept the parent blocked without leaking denied content.";
  const dogfoodRunEvidence = store.recordSubagentMaturityEvidence({
    kind: "live_dogfood_run",
    status: "passed",
    evidenceKey: `dogfood:${baseKey}`,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    artifactPath: input.reportPath,
    notes,
    details,
    createdAt,
  });
  const livePiSmokeEvidence = store.recordSubagentMaturityEvidence({
    kind: "live_pi_smoke",
    status: "passed",
    evidenceKey: `pi-smoke:${baseKey}`,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    artifactPath: input.reportPath,
    notes,
    details,
    createdAt,
  });
  return {
    schemaVersion: SUBAGENT_LIVE_APPROVAL_AUTHORITY_EVIDENCE_SCHEMA_VERSION,
    createdAt,
    runId: input.run.id,
    parentRunId: input.run.parentRunId,
    childThreadId: input.run.childThreadId,
    canonicalTaskPath: input.run.canonicalTaskPath,
    provider: input.provider,
    ...(input.reportPath ? { reportPath: input.reportPath } : {}),
    dogfoodRunEvidence,
    livePiSmokeEvidence,
  };
}

function isRuntimeEvent(event: unknown, type: SubagentRuntimeEvent["type"], runId: string): event is SubagentRuntimeEvent {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const record = event as Partial<SubagentRuntimeEvent>;
  return record.schemaVersion === "ambient-subagent-runtime-event-v1" &&
    record.type === type &&
    record.runId === runId;
}

function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}
