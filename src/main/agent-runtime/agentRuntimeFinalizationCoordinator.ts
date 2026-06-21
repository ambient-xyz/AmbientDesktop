import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  SubagentParentMailboxEventSummary,
  SubagentRunSummary,
} from "../../shared/subagentTypes";
import { piAssistantMessageMetadata } from "./agentRuntimeAssistantMessageMetadata";
import type { CallableWorkflowParentBlockingBlock } from "./agentRuntimeCallableWorkflowFacade";
import {
  callableWorkflowFinalizationBlock as resolveCallableWorkflowFinalizationBlock,
  recordCallableWorkflowFinalizationBlockedParentMailbox as recordCallableWorkflowFinalizationBlockedParentMailboxEvent,
  recordSubagentFinalizationBlockedParentMailbox as recordSubagentFinalizationBlockedParentMailboxEvents,
  subagentFinalizationBarrierBlock as resolveSubagentFinalizationBarrierBlock,
  type SubagentFinalizationBarrierBlock,
} from "./agentRuntimeFinalizationBlocking";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { isSubagentTerminalStatus } from "./agentRuntimeSubagentsFacade";
import type { SymphonyParentModeVerifiedLaunch } from "./agentRuntimeSymphonyParentMode";

type AgentRuntimeFinalizationStore = Pick<
  ProjectStore,
  | "appendSubagentParentMailboxEvent"
  | "getSubagentRun"
  | "getSubagentWaitBarrier"
  | "getThread"
  | "listCallableWorkflowTasksForParentRun"
  | "listMessages"
  | "listSubagentMailboxEvents"
  | "listSubagentRunEvents"
  | "listSubagentWaitBarriersForParentRun"
  | "replaceMessage"
>;

export interface AgentRuntimeFinalizationCoordinatorOptions {
  store: AgentRuntimeFinalizationStore;
  emit: (event: DesktopEvent) => void;
  resolveTerminalChildWaitBarriers: (run: SubagentRunSummary, reason: string) => void;
}

export class AgentRuntimeFinalizationCoordinator {
  constructor(private readonly options: AgentRuntimeFinalizationCoordinatorOptions) {}

  recordSubagentFinalizationBlockedParentMailbox(
    parentThreadId: string,
    parentRunId: string,
    block: SubagentFinalizationBarrierBlock,
  ): SubagentParentMailboxEventSummary[] {
    return recordSubagentFinalizationBlockedParentMailboxEvents({
      parentThreadId,
      parentRunId,
      block,
      getSubagentWaitBarrier: (barrierId) => this.options.store.getSubagentWaitBarrier(barrierId),
      getSubagentRun: (runId) => this.options.store.getSubagentRun(runId),
      appendSubagentParentMailboxEvent: (event) => this.options.store.appendSubagentParentMailboxEvent(event),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitSubagentParentMailboxEventUpdated(event),
    });
  }

  recordCallableWorkflowFinalizationBlockedParentMailbox(
    parentThreadId: string,
    parentRunId: string,
    block: CallableWorkflowParentBlockingBlock,
  ): SubagentParentMailboxEventSummary {
    return recordCallableWorkflowFinalizationBlockedParentMailboxEvent({
      parentThreadId,
      parentRunId,
      block,
      appendSubagentParentMailboxEvent: (event) => this.options.store.appendSubagentParentMailboxEvent(event),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitSubagentParentMailboxEventUpdated(event),
    });
  }

  subagentFinalizationBarrierBlock(parentThreadId: string, parentRunId: string): SubagentFinalizationBarrierBlock | undefined {
    this.reconcileParentRunWaitBarriersForFinalization(parentThreadId, parentRunId);
    return resolveSubagentFinalizationBarrierBlock({
      parentThreadId,
      parentRunId,
      listSubagentWaitBarriersForParentRun: (runId) => this.options.store.listSubagentWaitBarriersForParentRun(runId),
      listCallableWorkflowTasksForParentRun: (runId) => this.options.store.listCallableWorkflowTasksForParentRun(runId),
      getSubagentRun: (runId) => this.options.store.getSubagentRun(runId),
      listSubagentRunEvents: (runId) => this.options.store.listSubagentRunEvents(runId),
      listSubagentMailboxEvents: (runId) => this.options.store.listSubagentMailboxEvents(runId),
    });
  }

  callableWorkflowFinalizationBlock(
    parentThreadId: string,
    parentRunId: string,
    carriedLaunch?: SymphonyParentModeVerifiedLaunch | undefined,
  ): CallableWorkflowParentBlockingBlock | undefined {
    return resolveCallableWorkflowFinalizationBlock({
      parentThreadId,
      parentRunId,
      listCallableWorkflowTasksForParentRun: (runId) => this.options.store.listCallableWorkflowTasksForParentRun(runId),
      additionalTasks: carriedLaunch?.parentThreadId === parentThreadId
        ? this.options.store.listCallableWorkflowTasksForParentRun(carriedLaunch.parentRunId)
          .filter((task) => task.id === carriedLaunch.taskId)
        : [],
    });
  }

  suppressCallableWorkflowParentAssistantMessages(
    block: CallableWorkflowParentBlockingBlock,
    options: { preserveMessageId?: string | undefined } = {},
  ): void {
    const parentThreadId = block.parentThreadId;
    if (!parentThreadId) return;
    const cutoff = block.tasks
      .map((task) => task.createdAt)
      .filter((value) => typeof value === "string" && value.length > 0)
      .sort()[0];
    const parentMessageIds = new Set(
      [block.parentMessageId, ...block.tasks.map((task) => task.parentMessageId)]
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    );
    if (!cutoff && parentMessageIds.size === 0) return;
    const taskIds = block.taskIds;
    let suppressedCount = 0;
    for (const message of this.options.store.listMessages(parentThreadId)) {
      if (message.id === options.preserveMessageId) continue;
      if (message.role !== "assistant") continue;
      const explicitlyOwnedByWorkflow = parentMessageIds.has(message.id);
      const createdAfterWorkflowTask = cutoff ? message.createdAt >= cutoff : false;
      if (!explicitlyOwnedByWorkflow && !createdAfterWorkflowTask) continue;
      if (message.content.trim().length === 0) continue;
      const updated = this.options.store.replaceMessage(message.id, "", {
        ...piAssistantMessageMetadata("error"),
        callableWorkflowParentOutputSuppressed: {
          reason: block.reason,
          taskIds,
          ...(cutoff ? { cutoffCreatedAt: cutoff } : {}),
          ...(explicitlyOwnedByWorkflow ? { parentMessageId: message.id } : {}),
        },
      });
      suppressedCount += 1;
      this.options.emit({ type: "message-updated", message: updated });
    }
    if (suppressedCount > 0) {
      this.options.emit({ type: "thread-updated", thread: this.options.store.getThread(parentThreadId) });
    }
  }

  private reconcileParentRunWaitBarriersForFinalization(parentThreadId: string, parentRunId: string): void {
    const reconciledRunIds = new Set<string>();
    const barriers = this.options.store
      .listSubagentWaitBarriersForParentRun(parentRunId)
      .filter((barrier) =>
        barrier.parentThreadId === parentThreadId &&
        barrier.status === "waiting_on_children" &&
        barrier.dependencyMode !== "optional_background");
    for (const barrier of barriers) {
      for (const childRunId of barrier.childRunIds) {
        if (reconciledRunIds.has(childRunId)) continue;
        let run: SubagentRunSummary;
        try {
          run = this.options.store.getSubagentRun(childRunId);
        } catch {
          continue;
        }
        if (!isSubagentTerminalStatus(run.status)) continue;
        reconciledRunIds.add(childRunId);
        this.options.resolveTerminalChildWaitBarriers(run, `finalization_reconciliation:${run.status}`);
      }
    }
  }

  private emitSubagentParentMailboxEventUpdated(event: SubagentParentMailboxEventSummary): void {
    this.options.emit({ type: "subagent-parent-mailbox-event-updated", mailboxEvent: event });
  }
}
