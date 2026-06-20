import type { DesktopEvent } from "../../../shared/desktopTypes";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
} from "../../../shared/subagentTypes";
import type { ChatMessage } from "../../../shared/threadTypes";
import type { LocalTextSubagentRuntimeStore } from "../agentRuntimeLocalRuntimeFacade";
import type { SubagentPiToolStore } from "../agentRuntimeSubagentsFacade";

export interface AgentRuntimeSubagentEventingStoreOptions {
  store: SubagentPiToolStore & LocalTextSubagentRuntimeStore;
  emit: (event: DesktopEvent) => void;
  emitSubagentRunAndChildThreadUpdated: (run: SubagentRunSummary) => void;
  emitSubagentRunEventCreated: (run: SubagentRunSummary, event: SubagentRunEventSummary) => void;
  emitSubagentToolScopeSnapshotRecorded: (run: SubagentRunSummary, snapshot: SubagentToolScopeSnapshotSummary) => void;
  emitSubagentWaitBarrierUpdated: (barrier: SubagentWaitBarrierSummary) => void;
  emitSubagentMailboxEventUpdated: (run: SubagentRunSummary, event: SubagentMailboxEventSummary) => void;
  emitSubagentParentMailboxEventUpdated: (event: SubagentParentMailboxEventSummary) => void;
  emitSubagentRunEventsSince: (run: SubagentRunSummary, sequence: number) => void;
  latestSubagentRunEventSequence: (runId: string) => number;
}

export function createAgentRuntimeSubagentEventingStore(
  options: AgentRuntimeSubagentEventingStoreOptions,
): SubagentPiToolStore & LocalTextSubagentRuntimeStore {
  const {
    store,
    emit,
    emitSubagentRunAndChildThreadUpdated,
    emitSubagentRunEventCreated,
    emitSubagentToolScopeSnapshotRecorded,
    emitSubagentWaitBarrierUpdated,
    emitSubagentMailboxEventUpdated,
    emitSubagentParentMailboxEventUpdated,
    emitSubagentRunEventsSince,
    latestSubagentRunEventSequence,
  } = options;

  return {
    getThread: (threadId) => store.getThread(threadId),
    createSubagentRun: (input) => {
      const run = store.createSubagentRun(input);
      emitSubagentRunEventsSince(run, 0);
      emitSubagentRunAndChildThreadUpdated(run);
      return run;
    },
    getSubagentRun: (runId) => store.getSubagentRun(runId),
    updateSubagentRunMutationWorkspaceLease: (runId, lease) => {
      const run = store.updateSubagentRunMutationWorkspaceLease(runId, lease);
      emitSubagentRunAndChildThreadUpdated(run);
      return run;
    },
    updateThreadWorkspacePath: (threadId, workspacePath) => {
      const thread = store.updateThreadWorkspacePath(threadId, workspacePath);
      emit({ type: "thread-updated", thread });
      return thread;
    },
    getSubagentWaitBarrier: (id) => store.getSubagentWaitBarrier(id),
    listSubagentRunsForParentThread: (parentThreadId) => store.listSubagentRunsForParentThread(parentThreadId),
    assertSubagentCanonicalTaskPathAvailableForSpawn: (input) => store.assertSubagentCanonicalTaskPathAvailableForSpawn(input),
    listSubagentRunEvents: (runId) => store.listSubagentRunEvents(runId),
    appendSubagentRunEvent: (runId, input) => {
      const event = store.appendSubagentRunEvent(runId, input);
      emitSubagentRunEventCreated(store.getSubagentRun(runId), event);
      return event;
    },
    recordSubagentToolScopeSnapshot: (runId, input) => {
      const snapshot = store.recordSubagentToolScopeSnapshot(runId, input);
      emitSubagentToolScopeSnapshotRecorded(store.getSubagentRun(runId), snapshot);
      return snapshot;
    },
    listSubagentToolScopeSnapshots: (runId) => store.listSubagentToolScopeSnapshots(runId),
    getCallableWorkflowTask: store.getCallableWorkflowTask
      ? (id) => store.getCallableWorkflowTask!(id)
      : undefined,
    listCallableWorkflowTasksForParentRun: store.listCallableWorkflowTasksForParentRun
      ? (parentRunId) => store.listCallableWorkflowTasksForParentRun!(parentRunId)
      : undefined,
    bindCallableWorkflowTaskPatternGraphChild: store.bindCallableWorkflowTaskPatternGraphChild
      ? (input) => {
        const task = store.bindCallableWorkflowTaskPatternGraphChild!(input);
        emit({ type: "callable-workflow-task-updated", task });
        return task;
      }
      : undefined,
    markSubagentRunStatus: (runId, status, options) => {
      const previousSequence = latestSubagentRunEventSequence(runId);
      const run = store.markSubagentRunStatus(runId, status, options);
      emitSubagentRunAndChildThreadUpdated(run);
      emitSubagentRunEventsSince(run, previousSequence);
      return run;
    },
    closeSubagentRun: (runId, now) => {
      const previousSequence = latestSubagentRunEventSequence(runId);
      const run = store.closeSubagentRun(runId, now);
      emitSubagentRunAndChildThreadUpdated(run);
      emitSubagentRunEventsSince(run, previousSequence);
      return run;
    },
    createSubagentWaitBarrier: (input) => {
      const barrier = store.createSubagentWaitBarrier(input);
      emitSubagentWaitBarrierUpdated(barrier);
      return barrier;
    },
    listSubagentWaitBarriersForParentRun: (parentRunId) => store.listSubagentWaitBarriersForParentRun(parentRunId),
    upsertSubagentGroupedCompletionNotification: (input) => {
      const event = store.upsertSubagentGroupedCompletionNotification(input);
      emitSubagentParentMailboxEventUpdated(event);
      return event;
    },
    appendSubagentParentMailboxEvent: (input) => {
      const event = store.appendSubagentParentMailboxEvent(input);
      emitSubagentParentMailboxEventUpdated(event);
      return event;
    },
    listSubagentParentMailboxEventsForParentRun: (parentRunId) => store.listSubagentParentMailboxEventsForParentRun(parentRunId),
    getSubagentParentMailboxEvent: (id) => store.getSubagentParentMailboxEvent(id),
    updateSubagentParentMailboxEventDeliveryState: (id, deliveryState, options) => {
      const event = store.updateSubagentParentMailboxEventDeliveryState(id, deliveryState, options);
      emitSubagentParentMailboxEventUpdated(event);
      return event;
    },
    updateSubagentWaitBarrierStatus: (id, status, options) => {
      const barrier = store.updateSubagentWaitBarrierStatus(id, status, options);
      emitSubagentWaitBarrierUpdated(barrier);
      return barrier;
    },
    appendSubagentMailboxEvent: (runId, input) => {
      const event = store.appendSubagentMailboxEvent(runId, input);
      emitSubagentMailboxEventUpdated(store.getSubagentRun(runId), event);
      return event;
    },
    listSubagentMailboxEvents: (runId) => store.listSubagentMailboxEvents(runId),
    updateSubagentMailboxEventDeliveryState: (id, deliveryState, options) => {
      const event = store.updateSubagentMailboxEventDeliveryState(id, deliveryState, options);
      emitSubagentMailboxEventUpdated(store.getSubagentRun(event.runId), event);
      return event;
    },
    addMessage: (input) => {
      const message = store.addMessage(input) as ChatMessage;
      emit({ type: "message-created", message });
      emit({ type: "thread-updated", thread: store.getThread(input.threadId) });
      return message;
    },
  };
}
