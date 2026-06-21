import type { DesktopEvent } from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  SubagentRunSummary,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { agentRuntimeThreadWorkspacePath } from "./agentRuntimeEventWorkspaceScope";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  cancelPendingParentToChildMailboxEvents,
  resolveActiveSubagentWaitBarriersForRun,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
} from "./agentRuntimeSubagentsFacade";
import {
  runtimeSubagentDirectChildStoppedActivity,
  runtimeSubagentParentStopCascadeActivity,
} from "./subagents/agentRuntimeSubagentParentControlActivity";
import { isSubagentTerminalStatus } from "./subagents/agentRuntimeSubagentRuntimeHelpers";

export interface AgentRuntimeSubagentStopCascadeControllerOptions {
  store: ProjectStore;
  activeRuns: Pick<Map<string, unknown>, "has">;
  currentFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  abortChildThread: (threadId: string) => Promise<void>;
  latestSubagentRunEventSequence: (runId: string) => number;
  emit: (event: DesktopEvent) => void;
  emitSubagentRunAndChildThreadUpdated: (run: SubagentRunSummary) => void;
  emitSubagentRunEventsSince: (run: SubagentRunSummary, sequence: number) => void;
  emitSubagentWaitBarrierUpdated: (barrier: SubagentWaitBarrierSummary) => void;
  emitSubagentParentMailboxEventUpdated: (
    event: ReturnType<ProjectStore["getSubagentParentMailboxEvent"]>,
  ) => void;
}

export class AgentRuntimeSubagentStopCascadeController {
  constructor(private readonly options: AgentRuntimeSubagentStopCascadeControllerOptions) {}

  cancelSubagentRunForStoppedChildThread(
    threadId: string,
    reason: string,
  ): SubagentRunSummary | undefined {
    const { store } = this.options;
    let thread;
    try {
      thread = store.getThread(threadId);
    } catch {
      return undefined;
    }
    if (thread.kind !== "subagent_child" || !thread.subagentRunId) return undefined;
    const current = store.getSubagentRun(thread.subagentRunId);
    if (current.closedAt || isSubagentTerminalStatus(current.status)) return current;
    const previousSequence = this.options.latestSubagentRunEventSequence(current.id);
    const resultArtifact = {
      schemaVersion: "ambient-subagent-result-artifact-v1" as const,
      runId: current.id,
      status: "cancelled" as const,
      partial: false,
      summary: reason,
      childThreadId: current.childThreadId,
    };
    const cancelled = store.markSubagentRunStatus(current.id, "cancelled", {
      resultArtifact,
    });
    const cancelledMailbox = cancelPendingParentToChildMailboxEvents(store, {
      runId: cancelled.id,
    });
    store.appendSubagentMailboxEvent(cancelled.id, {
      direction: "child_to_parent",
      type: "subagent.cancelled",
      payload: {
        status: "cancelled",
        reason,
        source: "child_stop",
        childThreadId: cancelled.childThreadId,
      },
    });
    store.appendSubagentRunEvent(cancelled.id, {
      type: "subagent.child_stopped",
      preview: {
        previousStatus: current.status,
        status: "cancelled",
        reason,
        source: "direct_child_stop",
        childThreadId: cancelled.childThreadId,
        parentThreadId: cancelled.parentThreadId,
        parentRunId: cancelled.parentRunId,
        cancelledMailboxEvents: cancelledMailbox.events.map((event) => ({
          id: event.id,
          type: event.type,
          direction: event.direction,
          deliveryState: event.deliveryState,
        })),
      },
    });
    const parentMailboxEvent = store.appendSubagentLifecycleInterruptionParentMailboxEvent({
      run: cancelled,
      previousStatus: current.status,
      source: "direct_child_stop",
      reason,
      resultArtifact,
      waitBarrierIds: store
        .listSubagentWaitBarriersForParentRun(cancelled.parentRunId)
        .filter((barrier) => barrier.status === "waiting_on_children" && barrier.childRunIds.includes(cancelled.id))
        .map((barrier) => barrier.id),
      cancelledMailboxEventIds: cancelledMailbox.events.map((event) => event.id),
    });
    this.options.emitSubagentParentMailboxEventUpdated(parentMailboxEvent);
    const childMessage = store.addMessage({
      threadId: cancelled.childThreadId,
      role: "system",
      content: `Sub-agent stopped by user.\n\nReason: ${reason}`,
      metadata: {
        runtime: "ambient-subagent-runtime",
        phase: "direct-child-stop",
        status: "cancelled",
        subagentRunId: cancelled.id,
        resultArtifact,
      },
    });
    this.options.emitSubagentRunAndChildThreadUpdated(cancelled);
    this.options.emitSubagentRunEventsSince(cancelled, previousSequence);
    this.options.emit({ type: "message-created", message: childMessage as ChatMessage });
    this.options.emit({ type: "thread-updated", thread: store.getThread(cancelled.childThreadId) });
    this.resolveCancelledDirectChildWaitBarriers(cancelled, reason);
    this.options.emit({
      type: "runtime-activity",
      activity: runtimeSubagentDirectChildStoppedActivity({
        threadId: cancelled.parentThreadId,
        canonicalTaskPath: cancelled.canonicalTaskPath,
      }),
    });
    return store.getSubagentRun(cancelled.id);
  }

  resolveTerminalChildWaitBarriers(run: SubagentRunSummary, reason: string): void {
    const waitBarriers = resolveActiveSubagentWaitBarriersForRun({
      store: this.options.store,
      run,
      evidence: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
        kind: run.status === "timed_out" ? "child_runtime_timeout" : "child_terminal",
        source: "child_runtime",
        childRunId: run.id,
        reason,
        idempotencyKey: `child-terminal:${run.id}:${run.status}:${run.updatedAt ?? ""}`,
      },
    });
    for (const barrier of waitBarriers) this.options.emitSubagentWaitBarrierUpdated(barrier);
  }

  async cascadeSubagentsForStoppedParentRun(
    threadId: string,
    parentRunId: string,
    reason: string,
  ): Promise<void> {
    const { store } = this.options;
    let cascade: ReturnType<ProjectStore["cascadeSubagentParentRunStopped"]>;
    const previousEventSequences = new Map(
      store
        .listAllSubagentRuns()
        .filter((run) => run.parentThreadId === threadId && run.parentRunId === parentRunId)
        .map((run) => [run.id, this.options.latestSubagentRunEventSequence(run.id)]),
    );
    try {
      cascade = store.cascadeSubagentParentRunStopped({
        parentThreadId: threadId,
        parentRunId,
        reason,
        featureFlagSnapshot: this.options.currentFeatureFlagSnapshot(),
      });
    } catch (error) {
      console.warn(`Failed to cascade stopped parent run ${parentRunId} to sub-agents: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const changedRunIds = [...cascade.cancelledRunIds, ...cascade.detachedRunIds];
    for (const runId of changedRunIds) {
      const run = store.getSubagentRun(runId);
      this.options.emitSubagentRunAndChildThreadUpdated(run);
      this.options.emitSubagentRunEventsSince(run, previousEventSequences.get(run.id) ?? 0);
    }
    for (const barrierId of cascade.cancelledWaitBarrierIds) {
      this.options.emitSubagentWaitBarrierUpdated(store.getSubagentWaitBarrier(barrierId));
    }
    if (cascade.parentMailboxEventId) {
      this.options.emitSubagentParentMailboxEventUpdated(store.getSubagentParentMailboxEvent(cascade.parentMailboxEventId));
    }
    await this.abortActiveCancelledSubagentChildren(cascade.cancelledRunIds, reason);
    if (!changedRunIds.length && !cascade.cancelledWaitBarrierIds.length) return;
    this.options.emit({
      type: "runtime-activity",
      activity: runtimeSubagentParentStopCascadeActivity({
        threadId,
        cancelledRunCount: cascade.cancelledRunIds.length,
        detachedRunCount: cascade.detachedRunIds.length,
        changedRunCount: changedRunIds.length,
      }),
    });
  }

  private resolveCancelledDirectChildWaitBarriers(run: SubagentRunSummary, reason: string): void {
    const waitBarriers = resolveActiveSubagentWaitBarriersForRun({
      store: this.options.store,
      run,
      evidence: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
        kind: "child_cancelled",
        source: "cancel_agent",
        childRunId: run.id,
        reason,
        idempotencyKey: `direct-child-stop:${run.id}`,
      },
    });
    for (const barrier of waitBarriers) this.options.emitSubagentWaitBarrierUpdated(barrier);
  }

  private async abortActiveCancelledSubagentChildren(
    cancelledRunIds: string[],
    reason: string,
  ): Promise<void> {
    const { store } = this.options;
    for (const runId of cancelledRunIds) {
      const run = store.getSubagentRun(runId);
      if (!this.options.activeRuns.has(run.childThreadId)) continue;
      try {
        await this.options.abortChildThread(run.childThreadId);
        const previousSequence = this.options.latestSubagentRunEventSequence(run.id);
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.child_runtime_aborted",
          preview: {
            reason,
            childThreadId: run.childThreadId,
            source: "parent_stop_cascade",
          },
        });
        this.options.emitSubagentRunEventsSince(store.getSubagentRun(run.id), previousSequence);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to abort active sub-agent child thread ${run.childThreadId}: ${message}`);
        this.options.emit({
          type: "error",
          message: `Failed to abort active sub-agent child thread ${run.childThreadId}: ${message}`,
          threadId: run.childThreadId,
          workspacePath: agentRuntimeThreadWorkspacePath(store, run.childThreadId),
        });
      }
    }
  }
}
