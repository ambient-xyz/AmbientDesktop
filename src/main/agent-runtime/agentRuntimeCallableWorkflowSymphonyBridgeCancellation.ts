import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  isSubagentTerminalStatus,
  resolveActiveSubagentWaitBarriersForRun,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
} from "./agentRuntimeSubagentsFacade";
import type {
  AgentRuntimeCallableWorkflowSymphonyBridgeControllerOptions,
  AgentRuntimeCallableWorkflowSymphonyBridgeDependencies,
} from "./agentRuntimeCallableWorkflowSymphonyBridgeTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";

type CallableWorkflowSymphonyBridgeCancellationOptions = Pick<
  AgentRuntimeCallableWorkflowSymphonyBridgeControllerOptions,
  | "store"
  | "createSubagentEventingStore"
  | "runtime"
  | "createRuntimeCancelEventEmitter"
  | "createRuntimeRetryEventEmitter"
  | "emitSubagentWaitBarrierUpdated"
>;

type CallableWorkflowSymphonyBridgeCancellationDependencies = Pick<
  AgentRuntimeCallableWorkflowSymphonyBridgeDependencies,
  "executeSubagentBarrierDecision" | "executeSubagentCancelAgent"
>;

export async function cancelCallableWorkflowSymphonyChildWait(input: {
  task: CallableWorkflowTaskSummary;
  reason?: string;
  options: CallableWorkflowSymphonyBridgeCancellationOptions;
  dependencies: CallableWorkflowSymphonyBridgeCancellationDependencies;
}): Promise<void> {
  const taskChildRunIds = callableWorkflowPatternGraphChildRunIds(input.task);
  if (taskChildRunIds.size === 0) return;
  const ownedBarriers = input.options.store
    .listSubagentWaitBarriersForParentRun(input.task.parentRunId)
    .filter(
      (barrier) =>
        barrier.status !== "satisfied" &&
        barrier.status !== "cancelled" &&
        barrier.ownerKind === "callable_workflow_symphony_launch_bridge" &&
        barrier.ownerId === input.task.id,
    );
  const userDecision = input.reason?.trim() || `Callable workflow task ${input.task.id} was canceled while waiting on Symphony child runs.`;
  const barrierChildRunIds = new Set<string>();
  for (const barrier of ownedBarriers) {
    for (const childRunId of barrier.childRunIds) barrierChildRunIds.add(childRunId);
    const payloadFingerprint = createSubagentPayloadFingerprint({
      taskId: input.task.id,
      waitBarrierId: barrier.id,
      decision: input.task.blocking ? "cancel_parent" : "cancel_workflow_task",
      userDecision,
    });
    const idempotencyKey = createSubagentIdempotencyKey({
      operation: "barrier-decision",
      parentRunId: input.task.parentRunId,
      payloadFingerprint,
    });
    if (input.task.blocking) {
      await input.dependencies.executeSubagentBarrierDecision({
        store: input.options.createSubagentEventingStore(),
        runtime: {
          cancelChildRun: (cancelInput) => input.options.runtime.cancelChildRun(cancelInput),
          retryChildRun: (retryInput) => input.options.runtime.retryChildRun(retryInput),
        },
        barrier,
        decision: "cancel_parent",
        userDecision,
        idempotencyKey,
        toolCallId: "callable-workflow-cancel-child-wait",
        createRuntimeCancelEventEmitter: (targetRun) => input.options.createRuntimeCancelEventEmitter(targetRun),
        createRuntimeRetryEventEmitter: (targetRun) => input.options.createRuntimeRetryEventEmitter(targetRun),
      });
      for (const childRunId of barrier.childRunIds) {
        try {
          resolveCancelledChildWaitBarriers({
            run: input.options.store.getSubagentRun(childRunId),
            reason: userDecision,
            idempotencyKey,
            options: input.options,
          });
        } catch {
          // Missing children are already represented in the bridge barrier evidence.
        }
      }
    } else {
      await cancelBackgroundBarrier({
        task: input.task,
        barrier,
        userDecision,
        idempotencyKey,
        options: input.options,
        dependencies: input.dependencies,
      });
    }
  }
  for (const childRunId of taskChildRunIds) {
    if (barrierChildRunIds.has(childRunId)) continue;
    let run: SubagentRunSummary;
    try {
      run = input.options.store.getSubagentRun(childRunId);
    } catch {
      continue;
    }
    if (isSubagentTerminalStatus(run.status)) continue;
    await cancelCallableWorkflowSymphonyTaskChildRun({
      task: input.task,
      run,
      reason: userDecision,
      operation: "cancel",
      toolCallId: "callable-workflow-cancel-orphan-child",
      options: input.options,
      dependencies: input.dependencies,
    });
  }
}

export async function cancelCallableWorkflowSymphonyTaskChildRun(input: {
  task: CallableWorkflowTaskSummary;
  run: SubagentRunSummary;
  reason: string;
  operation: "cancel";
  toolCallId: string;
  options: Pick<
    CallableWorkflowSymphonyBridgeCancellationOptions,
    "createSubagentEventingStore" | "runtime" | "createRuntimeCancelEventEmitter"
  >;
  dependencies: Pick<CallableWorkflowSymphonyBridgeCancellationDependencies, "executeSubagentCancelAgent">;
}): Promise<SubagentRunSummary> {
  const payloadFingerprint = createSubagentPayloadFingerprint({
    taskId: input.task.id,
    childRunId: input.run.id,
    decision: input.task.blocking ? "cancel_parent" : "cancel_workflow_task",
    userDecision: input.reason,
  });
  const idempotencyKey = createSubagentIdempotencyKey({
    operation: input.operation,
    parentRunId: input.task.parentRunId,
    childRunId: input.run.id,
    payloadFingerprint,
  });
  return cancelCallableWorkflowSymphonyChildRun({
    run: input.run,
    reason: input.reason,
    idempotencyKey,
    toolCallId: input.toolCallId,
    options: input.options,
    dependencies: input.dependencies,
  });
}

async function cancelCallableWorkflowSymphonyChildRun(input: {
  run: SubagentRunSummary;
  reason: string;
  idempotencyKey: string;
  toolCallId: string;
  options: Pick<
    CallableWorkflowSymphonyBridgeCancellationOptions,
    "createSubagentEventingStore" | "runtime" | "createRuntimeCancelEventEmitter"
  >;
  dependencies: Pick<CallableWorkflowSymphonyBridgeCancellationDependencies, "executeSubagentCancelAgent">;
}): Promise<SubagentRunSummary> {
  const result = await input.dependencies.executeSubagentCancelAgent({
    store: input.options.createSubagentEventingStore(),
    runtime: {
      cancelChildRun: (cancelInput) => input.options.runtime.cancelChildRun(cancelInput),
    },
    run: input.run,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    toolCallId: input.toolCallId,
    createRuntimeCancelEventEmitter: (targetRun) => input.options.createRuntimeCancelEventEmitter(targetRun),
  });
  return result.run;
}

function resolveCancelledChildWaitBarriers(input: {
  run: SubagentRunSummary;
  reason: string;
  idempotencyKey: string;
  options: Pick<CallableWorkflowSymphonyBridgeCancellationOptions, "store" | "emitSubagentWaitBarrierUpdated">;
}): void {
  const waitBarriers = resolveActiveSubagentWaitBarriersForRun({
    store: input.options.store,
    run: input.run,
    evidence: {
      schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
      kind: "child_cancelled",
      source: "cancel_agent",
      childRunId: input.run.id,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    },
  });
  for (const barrier of waitBarriers) input.options.emitSubagentWaitBarrierUpdated(barrier);
}

async function cancelBackgroundBarrier(input: {
  task: CallableWorkflowTaskSummary;
  barrier: SubagentWaitBarrierSummary;
  userDecision: string;
  idempotencyKey: string;
  options: CallableWorkflowSymphonyBridgeCancellationOptions;
  dependencies: CallableWorkflowSymphonyBridgeCancellationDependencies;
}): Promise<void> {
  const cancelledRuns: SubagentRunSummary[] = [];
  for (const childRunId of input.barrier.childRunIds) {
    let run: SubagentRunSummary;
    try {
      run = input.options.store.getSubagentRun(childRunId);
    } catch {
      continue;
    }
    if (!isSubagentTerminalStatus(run.status)) {
      const cancelled = await cancelCallableWorkflowSymphonyChildRun({
        run,
        reason: input.userDecision,
        idempotencyKey: input.idempotencyKey,
        toolCallId: "callable-workflow-cancel-background-child",
        options: input.options,
        dependencies: input.dependencies,
      });
      cancelledRuns.push(cancelled);
    } else {
      cancelledRuns.push(run);
    }
  }
  const childStatuses = input.barrier.childRunIds.flatMap((childRunId) => {
    try {
      const run = input.options.store.getSubagentRun(childRunId);
      return [{ childRunId: run.id, status: run.status }];
    } catch {
      return [];
    }
  });
  const updatedBarrier = input.options.store.updateSubagentWaitBarrierStatus(input.barrier.id, "cancelled", {
    resolutionArtifact: {
      schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
      childRunIds: input.barrier.childRunIds,
      childStatuses,
      synthesisAllowed: false,
      explicitPartial: false,
      resultArtifact: null,
      transitionEvidence: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
        kind: "parent_stopped",
        source: "barrier_controller",
        childRunIds: input.barrier.childRunIds,
        reason: input.userDecision,
        idempotencyKey: input.idempotencyKey,
        details: {
          workflowTaskId: input.task.id,
          callableWorkflowTaskCancellation: true,
          cancelledRunIds: cancelledRuns.filter((run) => run.status === "cancelled").map((run) => run.id),
        },
      },
      workflowTaskDecision: {
        schemaVersion: "ambient-callable-workflow-task-decision-v1",
        decision: "cancel_workflow_task",
        workflowTaskId: input.task.id,
        userDecision: input.userDecision,
        decidedAt: new Date().toISOString(),
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  input.options.emitSubagentWaitBarrierUpdated(updatedBarrier);
}

export function callableWorkflowPatternGraphChildRunIds(task: CallableWorkflowTaskSummary): Set<string> {
  return new Set(
    task.patternGraphSnapshot?.nodes
      .map((node) => node.childRunId)
      .filter((childRunId): childRunId is string => typeof childRunId === "string" && childRunId.length > 0) ?? [],
  );
}
