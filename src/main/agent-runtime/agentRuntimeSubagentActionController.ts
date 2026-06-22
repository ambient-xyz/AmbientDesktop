import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  CancelSubagentRunInput,
  CloseSubagentRunInput,
  ResolveSubagentWaitBarrierInput,
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierResolutionResult,
  SubagentWaitBarrierSummary,
} from "../../shared/subagentTypes";
import type { LocalTextSubagentRuntimeStore } from "./agentRuntimeLocalRuntimeFacade";
import type {
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeCancelResult,
  SubagentChildRuntimeRetryInput,
  SubagentChildRuntimeRetryResult,
  SubagentRuntimeEventEmitter,
} from "./agentRuntimePiFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  appendMappedSubagentRuntimeEvent,
  assertCanCloseSubagentRun,
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  executeSubagentBarrierDecision,
  executeSubagentCancelAgent,
  executeSubagentCloseAgent,
  type SubagentPiToolStore,
} from "./agentRuntimeSubagentsFacade";
import { createAgentRuntimeSubagentEventingStore } from "./subagents/agentRuntimeSubagentEventingStore";

type AgentRuntimeSubagentActionStore = SubagentPiToolStore & LocalTextSubagentRuntimeStore & Pick<
  ProjectStore,
  "getSubagentWaitBarrier" | "listSubagentRunEvents"
>;
type ExecuteSubagentBarrierDecision = typeof executeSubagentBarrierDecision;
type ExecuteSubagentCancelAgent = typeof executeSubagentCancelAgent;
type ExecuteSubagentCloseAgent = typeof executeSubagentCloseAgent;
type AppendMappedSubagentRuntimeEvent = typeof appendMappedSubagentRuntimeEvent;
type CreateAgentRuntimeSubagentEventingStore = typeof createAgentRuntimeSubagentEventingStore;

export interface AgentRuntimeSubagentActionDependencies {
  executeSubagentBarrierDecision: ExecuteSubagentBarrierDecision;
  executeSubagentCancelAgent: ExecuteSubagentCancelAgent;
  executeSubagentCloseAgent: ExecuteSubagentCloseAgent;
  appendMappedSubagentRuntimeEvent: AppendMappedSubagentRuntimeEvent;
  createAgentRuntimeSubagentEventingStore: CreateAgentRuntimeSubagentEventingStore;
  assertCanCloseSubagentRun: typeof assertCanCloseSubagentRun;
}

export interface AgentRuntimeSubagentActionControllerOptions {
  store: AgentRuntimeSubagentActionStore;
  cancelChildRun: (input: SubagentChildRuntimeCancelInput) => Promise<SubagentChildRuntimeCancelResult>;
  retryChildRun: (input: SubagentChildRuntimeRetryInput) => Promise<SubagentChildRuntimeRetryResult>;
  emit: (event: DesktopEvent) => void;
  dependencies?: Partial<AgentRuntimeSubagentActionDependencies>;
}

const defaultDependencies: AgentRuntimeSubagentActionDependencies = {
  executeSubagentBarrierDecision,
  executeSubagentCancelAgent,
  executeSubagentCloseAgent,
  appendMappedSubagentRuntimeEvent,
  createAgentRuntimeSubagentEventingStore,
  assertCanCloseSubagentRun,
};

export class AgentRuntimeSubagentActionController {
  private readonly dependencies: AgentRuntimeSubagentActionDependencies;

  constructor(private readonly options: AgentRuntimeSubagentActionControllerOptions) {
    this.dependencies = {
      ...defaultDependencies,
      ...options.dependencies,
    };
  }

  createEventingStore(): SubagentPiToolStore & LocalTextSubagentRuntimeStore {
    return this.dependencies.createAgentRuntimeSubagentEventingStore({
      store: this.options.store,
      emit: (event) => this.options.emit(event),
      emitSubagentRunAndChildThreadUpdated: (run) => this.emitRunAndChildThreadUpdated(run),
      emitSubagentRunEventCreated: (run, event) => this.emitRunEventCreated(run, event),
      emitSubagentToolScopeSnapshotRecorded: (run, snapshot) => this.emitToolScopeSnapshotRecorded(run, snapshot),
      emitSubagentWaitBarrierUpdated: (barrier) => this.emitWaitBarrierUpdated(barrier),
      emitSubagentMailboxEventUpdated: (run, event) => this.emitMailboxEventUpdated(run, event),
      emitSubagentParentMailboxEventUpdated: (event) => this.emitParentMailboxEventUpdated(event),
      emitSubagentRunEventsSince: (run, sequence) => this.emitRunEventsSince(run, sequence),
      latestSubagentRunEventSequence: (runId) => this.latestRunEventSequence(runId),
    });
  }

  createCancelEventEmitter(run: SubagentRunSummary): SubagentRuntimeEventEmitter {
    return (eventInput) => {
      const { runEvent } = this.dependencies.appendMappedSubagentRuntimeEvent(this.options.store, {
        run,
        source: "cancel_agent",
        event: eventInput,
      });
      this.emitRunEventCreated(this.options.store.getSubagentRun(run.id), runEvent);
      return runEvent;
    };
  }

  createRetryEventEmitter(run: SubagentRunSummary): SubagentRuntimeEventEmitter {
    return (eventInput) => {
      const { runEvent } = this.dependencies.appendMappedSubagentRuntimeEvent(this.options.store, {
        run,
        source: "retry_child",
        event: eventInput,
      });
      this.emitRunEventCreated(this.options.store.getSubagentRun(run.id), runEvent);
      return runEvent;
    };
  }

  emitRunAndChildThreadUpdated(run: SubagentRunSummary): void {
    this.options.emit({ type: "subagent-run-updated", run });
    this.options.emit({ type: "thread-updated", thread: this.options.store.getThread(run.childThreadId) });
  }

  emitRunEventCreated(run: SubagentRunSummary, event: SubagentRunEventSummary): void {
    this.options.emit({ type: "subagent-run-event-created", run, event });
  }

  emitToolScopeSnapshotRecorded(run: SubagentRunSummary, snapshot: SubagentToolScopeSnapshotSummary): void {
    this.options.emit({ type: "subagent-tool-scope-snapshot-recorded", run, snapshot });
  }

  emitWaitBarrierUpdated(barrier: SubagentWaitBarrierSummary): void {
    this.options.emit({ type: "subagent-wait-barrier-updated", barrier });
  }

  emitMailboxEventUpdated(run: SubagentRunSummary, event: SubagentMailboxEventSummary): void {
    this.options.emit({ type: "subagent-mailbox-event-updated", run, mailboxEvent: event });
  }

  emitParentMailboxEventUpdated(event: SubagentParentMailboxEventSummary): void {
    this.options.emit({ type: "subagent-parent-mailbox-event-updated", mailboxEvent: event });
  }

  emitRunEventsSince(run: SubagentRunSummary, sequence: number): void {
    for (const event of this.options.store.listSubagentRunEvents(run.id)) {
      if (event.sequence > sequence) this.emitRunEventCreated(run, event);
    }
  }

  latestRunEventSequence(runId: string): number {
    return this.options.store.listSubagentRunEvents(runId).at(-1)?.sequence ?? 0;
  }

  async resolveWaitBarrier(input: ResolveSubagentWaitBarrierInput): Promise<SubagentWaitBarrierResolutionResult> {
    const barrier = this.options.store.getSubagentWaitBarrier(input.waitBarrierId);
    if (barrier.dependencyMode === "optional_background") {
      throw new Error(`Sub-agent wait barrier ${barrier.id} is optional background work and does not need a user resolution.`);
    }
    if (input.decision === "continue_with_partial") {
      if (!input.userDecision) throw new Error("userDecision is required when resolving a barrier with continue_with_partial.");
      if (!input.partialSummary) throw new Error("partialSummary is required when resolving a barrier with continue_with_partial.");
    }
    if ((input.decision === "detach_child" || input.decision === "cancel_parent") && !input.userDecision) {
      throw new Error(`userDecision is required when resolving a barrier with ${input.decision}.`);
    }
    const payloadFingerprint = createSubagentPayloadFingerprint({
      waitBarrierId: barrier.id,
      decision: input.decision,
      userDecision: input.userDecision,
      partialSummary: input.partialSummary,
    });
    const idempotencyKey = input.idempotencyKey ??
      createSubagentIdempotencyKey({
        operation: "barrier-decision",
        parentRunId: barrier.parentRunId,
        payloadFingerprint,
      });
    const result = await this.dependencies.executeSubagentBarrierDecision({
      store: this.createEventingStore(),
      runtime: {
        cancelChildRun: (cancelInput) => this.options.cancelChildRun(cancelInput),
        retryChildRun: (retryInput) => this.options.retryChildRun(retryInput),
      },
      barrier,
      decision: input.decision,
      userDecision: input.userDecision,
      partialSummary: input.partialSummary,
      idempotencyKey,
      toolCallId: "desktop-parent-cluster-resolve-barrier",
      createRuntimeCancelEventEmitter: (targetRun) => this.createCancelEventEmitter(targetRun),
      createRuntimeRetryEventEmitter: (targetRun) => this.createRetryEventEmitter(targetRun),
    });
    return {
      schemaVersion: "ambient-subagent-wait-barrier-resolution-result-v1",
      replay: result.replay,
      waitBarrier: result.barrier,
      childRuns: result.childRuns,
      decision: result.decision,
      parentMailboxEvent: result.parentMailboxEvent,
    };
  }

  async cancelRun(input: CancelSubagentRunInput): Promise<SubagentRunSummary> {
    const run = this.options.store.getSubagentRun(input.childRunId);
    if (run.closedAt) throw new Error(`Cannot cancel closed sub-agent ${run.id}; close already released capacity.`);
    const result = await this.dependencies.executeSubagentCancelAgent({
      store: this.createEventingStore(),
      runtime: {
        cancelChildRun: (cancelInput) => this.options.cancelChildRun(cancelInput),
      },
      run,
      reason: input.reason,
      toolCallId: "desktop-parent-cluster-cancel",
      createRuntimeCancelEventEmitter: (targetRun) => this.createCancelEventEmitter(targetRun),
    });
    this.emitRunAndChildThreadUpdated(result.run);
    return result.run;
  }

  closeRun(input: CloseSubagentRunInput): SubagentRunSummary {
    const run = this.options.store.getSubagentRun(input.childRunId);
    this.dependencies.assertCanCloseSubagentRun(run);
    const result = this.dependencies.executeSubagentCloseAgent({
      store: this.createEventingStore(),
      run,
      reason: input.reason,
      toolCallId: "desktop-parent-cluster-close",
    });
    this.emitRunAndChildThreadUpdated(result.run);
    return result.run;
  }
}
