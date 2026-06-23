import { releaseSubagentCapacityLease } from "../../shared/subagentCapacity";
import type { SubagentParentMailboxEventSummary, SubagentRunEventSummary, SubagentRunSummary } from "../../shared/subagentTypes";
import type { SubagentRunStatus } from "../../shared/subagentProtocol";
import {
  buildSubagentGroupedCompletionNotificationDraft,
  releaseSymphonyMutationWorkspaceLease,
  SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE,
  SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
  subagentLifecycleEventType,
  subagentLifecycleHookPreview,
  type SubagentLifecycleInterruptionSource,
  subagentLifecycleInterruptionIdempotencyKey,
  subagentLifecycleInterruptionParentMailboxPayload,
} from "./projectStoreSubagentsFacade";
import {
  compactSubagentCapacityLeasePreview,
  subagentLifecycleArtifactPath,
  subagentRunStatusIsTerminal,
} from "./projectStoreSubagentMappers";
import type { AppendSubagentParentMailboxEventInput, UpdateSubagentParentMailboxPayloadInput } from "./subagentParentMailboxRepository";
import type { AppendSubagentRunEventInput, CloseSubagentRunInput, UpdateSubagentRunStatusInput } from "./subagentRunRepository";

export interface AppendSubagentLifecycleInterruptionParentMailboxEventInput {
  run: SubagentRunSummary;
  previousStatus?: SubagentRunStatus;
  source: SubagentLifecycleInterruptionSource;
  reason: string;
  resultArtifact?: unknown;
  toolCallId?: string;
  waitBarrierIds?: readonly string[];
  cancelledMailboxEventIds?: readonly string[];
  idempotencyKey?: string;
  createdAt?: string;
}

export interface UpsertSubagentGroupedCompletionNotificationInput {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  child: {
    runId: string;
    childThreadId: string;
    canonicalTaskPath: string;
    roleId: string;
    status: SubagentRunStatus;
    summary: string;
    completedAt?: string;
  };
  createdAt?: string;
}

export interface MarkSubagentRunStatusOptions {
  resultArtifact?: unknown;
  now?: string;
}

export interface ProjectStoreSubagentRunCompletionRepositoryDeps {
  appendSubagentParentMailboxEvent(input: AppendSubagentParentMailboxEventInput): SubagentParentMailboxEventSummary;
  appendSubagentRunEventInternal(runId: string, input: AppendSubagentRunEventInput): void;
  closeSubagentRun(input: CloseSubagentRunInput): SubagentRunSummary;
  getSubagentRun(runId: string): SubagentRunSummary;
  latestQueuedSubagentParentMailboxEvent(parentRunId: string, type: string): SubagentParentMailboxEventSummary | undefined;
  listSubagentRunEvents(runId: string): SubagentRunEventSummary[];
  parentMessageIdForSubagentRun(runId: string): string | undefined;
  updateSubagentChildStatus(childThreadId: string, status: SubagentRunStatus, now: string): void;
  updateSubagentParentMailboxPayload(input: UpdateSubagentParentMailboxPayloadInput): SubagentParentMailboxEventSummary;
  updateSubagentRunStatus(input: UpdateSubagentRunStatusInput): SubagentRunSummary;
}

export class ProjectStoreSubagentRunCompletionRepository {
  constructor(private readonly deps: ProjectStoreSubagentRunCompletionRepositoryDeps) {}

  appendSubagentLifecycleInterruptionParentMailboxEvent(
    input: AppendSubagentLifecycleInterruptionParentMailboxEventInput,
  ): SubagentParentMailboxEventSummary {
    return this.deps.appendSubagentParentMailboxEvent({
      parentThreadId: input.run.parentThreadId,
      parentRunId: input.run.parentRunId,
      parentMessageId: input.run.parentMessageId,
      type: SUBAGENT_LIFECYCLE_INTERRUPTION_PARENT_MAILBOX_TYPE,
      payload: subagentLifecycleInterruptionParentMailboxPayload(input),
      idempotencyKey: subagentLifecycleInterruptionIdempotencyKey({
        runId: input.run.id,
        source: input.source,
        idempotencyKey: input.idempotencyKey,
      }),
      createdAt: input.createdAt,
    });
  }

  upsertSubagentGroupedCompletionNotification(input: UpsertSubagentGroupedCompletionNotificationInput): SubagentParentMailboxEventSummary {
    const now = input.createdAt ?? new Date().toISOString();
    const parentMessageId = input.parentMessageId ?? this.deps.parentMessageIdForSubagentRun(input.child.runId);
    const latest = this.deps.latestQueuedSubagentParentMailboxEvent(input.parentRunId, SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE);
    const draft = buildSubagentGroupedCompletionNotificationDraft({
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      ...(parentMessageId ? { parentMessageId } : {}),
      existingPayload: latest?.payload,
      child: input.child,
    });
    if (!latest) {
      return this.deps.appendSubagentParentMailboxEvent({
        parentThreadId: input.parentThreadId,
        parentRunId: input.parentRunId,
        parentMessageId,
        type: SUBAGENT_GROUPED_COMPLETION_PARENT_MAILBOX_TYPE,
        payload: draft.payload,
        idempotencyKey: draft.idempotencyKey,
        createdAt: now,
      });
    }
    return this.deps.updateSubagentParentMailboxPayload({
      id: latest.id,
      parentMessageId,
      payload: draft.payload,
      idempotencyKey: draft.idempotencyKey,
      updatedAt: now,
    });
  }

  markSubagentRunStatus(runId: string, status: SubagentRunStatus, options: MarkSubagentRunStatusOptions = {}): SubagentRunSummary {
    const current = this.deps.getSubagentRun(runId);
    const now = options.now ?? new Date().toISOString();
    const terminalLifecycleAlreadyRecorded = this.deps
      .listSubagentRunEvents(runId)
      .some((event) => event.type === subagentLifecycleEventType("SubagentStop"));
    const startedAt = ["starting", "running", "waiting"].includes(status) ? (current.startedAt ?? now) : (current.startedAt ?? null);
    const completedAt = ["completed", "failed", "stopped", "cancelled", "timed_out", "detached", "aborted_partial"].includes(status)
      ? now
      : (current.completedAt ?? null);
    const updated = this.deps.updateSubagentRunStatus({
      runId,
      status,
      startedAt,
      completedAt,
      updatedAt: now,
      ...(options.resultArtifact !== undefined ? { resultArtifact: options.resultArtifact } : {}),
    });
    this.deps.updateSubagentChildStatus(current.childThreadId, status, now);
    this.deps.appendSubagentRunEventInternal(runId, { type: "subagent.status_changed", preview: { status }, createdAt: now });
    if (subagentRunStatusIsTerminal(status) && !terminalLifecycleAlreadyRecorded) {
      const artifactPath = subagentLifecycleArtifactPath(options.resultArtifact ?? updated.resultArtifact);
      this.deps.appendSubagentRunEventInternal(runId, {
        type: subagentLifecycleEventType("SubagentStop"),
        preview: subagentLifecycleHookPreview({
          hook: "SubagentStop",
          run: updated,
          resultArtifact: options.resultArtifact,
          createdAt: now,
        }),
        artifactPath,
        createdAt: now,
      });
    }
    return updated;
  }

  closeSubagentRun(runId: string, now = new Date().toISOString()): SubagentRunSummary {
    const current = this.deps.getSubagentRun(runId);
    if (current.closedAt) return current;
    const releasedCapacityLease = releaseSubagentCapacityLease(current.capacityLeaseSnapshot, {
      releasedAt: now,
      reason: "close_agent released live sub-agent capacity while preserving transcript history.",
    });
    const releasedMutationLease = releaseSymphonyMutationWorkspaceLease(current.symphonyMutationWorkspaceLease, { now });
    const closed = this.deps.closeSubagentRun({
      runId,
      closedAt: now,
      capacityLeaseSnapshot: releasedCapacityLease,
      ...(releasedMutationLease ? { symphonyMutationWorkspaceLease: releasedMutationLease } : {}),
    });
    this.deps.appendSubagentRunEventInternal(runId, {
      type: "subagent.closed",
      preview: {
        childThreadId: current.childThreadId,
        capacityLease: compactSubagentCapacityLeasePreview(releasedCapacityLease),
        ...(releasedMutationLease
          ? {
              mutationWorkspaceLease: {
                leaseId: releasedMutationLease.leaseId,
                kind: releasedMutationLease.kind,
                status: releasedMutationLease.status,
                rootPath: releasedMutationLease.rootPath,
              },
            }
          : {}),
      },
      createdAt: now,
    });
    const artifactPath = subagentLifecycleArtifactPath(closed.resultArtifact);
    this.deps.appendSubagentRunEventInternal(runId, {
      type: subagentLifecycleEventType("SubagentClose"),
      preview: subagentLifecycleHookPreview({
        hook: "SubagentClose",
        run: closed,
        createdAt: now,
      }),
      artifactPath,
      createdAt: now,
    });
    return closed;
  }
}
