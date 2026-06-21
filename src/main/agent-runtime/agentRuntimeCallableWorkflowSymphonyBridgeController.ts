import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
  isCallableWorkflowSymphonyChildWaitPreCompilePause,
} from "../../shared/callableWorkflowTaskGuards";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type {
  CallableWorkflowRunnerLaunchInput,
  CallableWorkflowSubagentLaunchResult,
} from "./agentRuntimeCallableWorkflowFacade";
import type {
  SubagentRuntimeEventEmitter,
} from "./agentRuntimePiFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  createSubagentPiToolDefinitions,
  executeSubagentBarrierDecision,
  executeSubagentCancelAgent,
  isSubagentTerminalStatus,
  resolveActiveSubagentWaitBarriersForRun,
  SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
  type CreateSubagentPiToolDefinitionsOptions,
} from "./agentRuntimeSubagentsFacade";

type AgentRuntimeCallableWorkflowSymphonyBridgeStore = Pick<
  ProjectStore,
  | "getCallableWorkflowTask"
  | "listSubagentWaitBarriersForParentRun"
  | "getSubagentRun"
  | "listSubagentRunEvents"
  | "getSubagentWaitBarrier"
  | "updateSubagentWaitBarrierStatus"
  | "pauseCallableWorkflowTask"
  | "cancelCallableWorkflowTask"
  | "failCallableWorkflowTask"
>;
type ExecuteSubagentCancelAgent = typeof executeSubagentCancelAgent;
type ExecuteSubagentBarrierDecision = typeof executeSubagentBarrierDecision;
type CallableWorkflowSymphonyBridgeEventingStore =
  & CreateSubagentPiToolDefinitionsOptions["store"]
  & Parameters<ExecuteSubagentCancelAgent>[0]["store"]
  & Parameters<ExecuteSubagentBarrierDecision>[0]["store"];
type CallableWorkflowSymphonyBridgeRuntime = Required<Pick<
  NonNullable<CreateSubagentPiToolDefinitionsOptions["runtime"]>,
  | "startChildRun"
  | "waitForChildRun"
  | "cancelChildRun"
  | "followupChildRun"
  | "retryChildRun"
  | "resolveChildApprovalResponse"
>>;

export interface AgentRuntimeCallableWorkflowSymphonyBridgeDependencies {
  createSubagentPiToolDefinitions: typeof createSubagentPiToolDefinitions;
  executeSubagentBarrierDecision: ExecuteSubagentBarrierDecision;
  executeSubagentCancelAgent: ExecuteSubagentCancelAgent;
}

export interface AgentRuntimeCallableWorkflowSymphonyBridgeControllerOptions {
  store: AgentRuntimeCallableWorkflowSymphonyBridgeStore;
  createSubagentEventingStore: () => CallableWorkflowSymphonyBridgeEventingStore;
  getFeatureFlagSnapshot: CreateSubagentPiToolDefinitionsOptions["getFeatureFlagSnapshot"];
  resolveSymphonyLaunchContract?: CreateSubagentPiToolDefinitionsOptions["resolveSymphonyLaunchContract"];
  resolveModelRuntimeProfile: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveModelRuntimeProfile"]>;
  resolveCapacityLease: NonNullable<CreateSubagentPiToolDefinitionsOptions["resolveCapacityLease"]>;
  prepareChildWorktree: NonNullable<CreateSubagentPiToolDefinitionsOptions["prepareChildWorktree"]>;
  runtime: CallableWorkflowSymphonyBridgeRuntime;
  createRuntimeCancelEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
  createRuntimeRetryEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
  emitCallableWorkflowTaskUpdated: (task: CallableWorkflowTaskSummary) => void;
  emitSubagentWaitBarrierUpdated: (barrier: SubagentWaitBarrierSummary) => void;
  dependencies?: Partial<AgentRuntimeCallableWorkflowSymphonyBridgeDependencies>;
}

const defaultDependencies: AgentRuntimeCallableWorkflowSymphonyBridgeDependencies = {
  createSubagentPiToolDefinitions,
  executeSubagentBarrierDecision,
  executeSubagentCancelAgent,
};
const bridgeToolContext = {} as ExtensionContext;

export class AgentRuntimeCallableWorkflowSymphonyBridgeController {
  private readonly dependencies: AgentRuntimeCallableWorkflowSymphonyBridgeDependencies;

  constructor(private readonly options: AgentRuntimeCallableWorkflowSymphonyBridgeControllerOptions) {
    this.dependencies = {
      ...defaultDependencies,
      ...options.dependencies,
    };
  }

  async cancelChildWait(
    task: CallableWorkflowTaskSummary,
    reason?: string,
  ): Promise<void> {
    const taskChildRunIds = callableWorkflowPatternGraphChildRunIds(task);
    if (taskChildRunIds.size === 0) return;
    const ownedBarriers = this.options.store.listSubagentWaitBarriersForParentRun(task.parentRunId)
      .filter((barrier) =>
        barrier.status !== "satisfied" &&
        barrier.status !== "cancelled" &&
        barrier.ownerKind === "callable_workflow_symphony_launch_bridge" &&
        barrier.ownerId === task.id);
    const userDecision = reason?.trim() ||
      `Callable workflow task ${task.id} was canceled while waiting on Symphony child runs.`;
    const barrierChildRunIds = new Set<string>();
    for (const barrier of ownedBarriers) {
      for (const childRunId of barrier.childRunIds) barrierChildRunIds.add(childRunId);
      const payloadFingerprint = createSubagentPayloadFingerprint({
        taskId: task.id,
        waitBarrierId: barrier.id,
        decision: task.blocking ? "cancel_parent" : "cancel_workflow_task",
        userDecision,
      });
      const idempotencyKey = createSubagentIdempotencyKey({
        operation: "barrier-decision",
        parentRunId: task.parentRunId,
        payloadFingerprint,
      });
      if (task.blocking) {
        await this.dependencies.executeSubagentBarrierDecision({
          store: this.options.createSubagentEventingStore(),
          runtime: {
            cancelChildRun: (cancelInput) => this.options.runtime.cancelChildRun(cancelInput),
            retryChildRun: (retryInput) => this.options.runtime.retryChildRun(retryInput),
          },
          barrier,
          decision: "cancel_parent",
          userDecision,
          idempotencyKey,
          toolCallId: "callable-workflow-cancel-child-wait",
          createRuntimeCancelEventEmitter: (targetRun) => this.options.createRuntimeCancelEventEmitter(targetRun),
          createRuntimeRetryEventEmitter: (targetRun) => this.options.createRuntimeRetryEventEmitter(targetRun),
        });
        for (const childRunId of barrier.childRunIds) {
          try {
            this.resolveCancelledChildWaitBarriers(
              this.options.store.getSubagentRun(childRunId),
              userDecision,
              idempotencyKey,
            );
          } catch {
            // Missing children are already represented in the bridge barrier evidence.
          }
        }
      } else {
        await this.cancelBackgroundBarrier({
          task,
          barrier,
          userDecision,
          idempotencyKey,
        });
      }
    }
    for (const childRunId of taskChildRunIds) {
      if (barrierChildRunIds.has(childRunId)) continue;
      let run: SubagentRunSummary;
      try {
        run = this.options.store.getSubagentRun(childRunId);
      } catch {
        continue;
      }
      if (isSubagentTerminalStatus(run.status)) continue;
      const payloadFingerprint = createSubagentPayloadFingerprint({
        taskId: task.id,
        childRunId,
        decision: task.blocking ? "cancel_parent" : "cancel_workflow_task",
        userDecision,
      });
      const idempotencyKey = createSubagentIdempotencyKey({
        operation: "cancel",
        parentRunId: task.parentRunId,
        childRunId,
        payloadFingerprint,
      });
      await this.cancelChildRun({
        run,
        reason: userDecision,
        idempotencyKey,
        toolCallId: "callable-workflow-cancel-orphan-child",
      });
    }
  }

  async launchSubagents(input: CallableWorkflowRunnerLaunchInput): Promise<CallableWorkflowSubagentLaunchResult | void> {
    const contract = input.handoffPlan.compiler.launchBridgeContract;
    if (!contract) return;
    if (
      contract.workflowTaskId !== input.task.id ||
      contract.launchId !== input.task.launchId ||
      contract.parentThreadId !== input.task.parentThreadId ||
      contract.parentRunId !== input.task.parentRunId ||
      contract.expectedWorkflowToolName !== input.task.toolName ||
      contract.sourceKind !== "symphony_recipe"
    ) {
      throw new Error(`Callable workflow task ${input.task.id} has a Symphony launch bridge contract that does not match the queued task.`);
    }
    const [tool] = this.dependencies.createSubagentPiToolDefinitions({
      store: this.options.createSubagentEventingStore(),
      threadId: contract.parentThreadId,
      getFeatureFlagSnapshot: () => this.options.getFeatureFlagSnapshot(),
      getParentRun: () => ({
        id: contract.parentRunId,
        ...(contract.parentMessageId ? { assistantMessageId: contract.parentMessageId } : {}),
      }),
      resolveSymphonyLaunchContract: this.options.resolveSymphonyLaunchContract,
      resolveModelRuntimeProfile: (modelId) => this.options.resolveModelRuntimeProfile(modelId),
      resolveCapacityLease: (leaseInput) => this.options.resolveCapacityLease(leaseInput),
      prepareChildWorktree: (worktreeInput) => this.options.prepareChildWorktree(worktreeInput),
      trustedWaitBarrierOwner: {
        ownerKind: "callable_workflow_symphony_launch_bridge",
        ownerId: input.task.id,
      },
      runtime: this.options.runtime,
    });
    if (!tool) throw new Error("Symphony launch bridge could not create the Ambient sub-agent tool.");
    const childRunBindings: Array<{ roleNodeId: string; childRunId: string }> = [];
    const terminalIfTaskCanceled = async (): Promise<CallableWorkflowSubagentLaunchResult | undefined> => {
      const currentTask = this.options.store.getCallableWorkflowTask(input.task.id);
      if (currentTask.status !== "canceled") return undefined;
      const childRunIds = [...new Set(childRunBindings.map((binding) => binding.childRunId))];
      const reason = currentTask.errorMessage?.trim() ||
        `Callable workflow task ${input.task.id} was canceled during Symphony child launch.`;
      for (const childRunId of childRunIds) {
        let run: SubagentRunSummary;
        try {
          run = this.options.store.getSubagentRun(childRunId);
        } catch {
          continue;
        }
        if (isSubagentTerminalStatus(run.status)) continue;
        const payloadFingerprint = createSubagentPayloadFingerprint({
          taskId: input.task.id,
          childRunId,
          decision: input.task.blocking ? "cancel_parent" : "cancel_workflow_task",
          userDecision: reason,
        });
        const idempotencyKey = createSubagentIdempotencyKey({
          operation: "cancel",
          parentRunId: input.task.parentRunId,
          childRunId,
          payloadFingerprint,
        });
        await this.cancelChildRun({
          run,
          reason,
          idempotencyKey,
          toolCallId: "callable-workflow-cancel-launch-child",
        });
      }
      return {
        status: "terminal",
        task: this.options.store.getCallableWorkflowTask(input.task.id),
        launchBridgeEvidence: callableWorkflowSymphonyLaunchBridgeEvidence({
          contract,
          childRunIds,
          childRunBindings,
          childRuns: childRunIds.flatMap((runId) => {
            try {
              return [this.options.store.getSubagentRun(runId)];
            } catch {
              return [];
            }
          }),
        }),
      };
    };
    for (const child of contract.childLaunches) {
      const canceledBeforeSpawn = await terminalIfTaskCanceled();
      if (canceledBeforeSpawn) return canceledBeforeSpawn;
      const result = await tool.execute(`callable-workflow:${input.task.id}:spawn:${child.roleNodeId}`, {
        action: "spawn_agent",
        task: child.task,
        title: child.title,
        roleId: child.roleId,
        dependencyMode: child.dependencyMode,
        forkMode: child.forkMode,
        promptMode: child.promptMode,
        effectiveRole: {
          patternRole: child.patternRole,
          overlayLabels: child.effectiveRole.overlays.map((overlay) => overlay.label),
          ...(child.effectiveRole.outputContract ? { outputContract: child.effectiveRole.outputContract } : {}),
        },
        patternGraphBinding: child.patternGraphBinding,
        idempotencyKey: child.idempotencyKey,
      }, undefined, undefined, bridgeToolContext);
      const childRunId = subagentRunIdFromToolResult(result);
      if (childRunId) childRunBindings.push({ roleNodeId: child.roleNodeId, childRunId });
      const canceledAfterSpawn = await terminalIfTaskCanceled();
      if (canceledAfterSpawn) return canceledAfterSpawn;
    }
    const canceledBeforeWait = await terminalIfTaskCanceled();
    if (canceledBeforeWait) return canceledBeforeWait;
    const boundRoleNodeIds = new Set(childRunBindings.map((binding) => binding.roleNodeId));
    const missingRoleNodeIds = contract.childLaunches
      .filter((child) => !boundRoleNodeIds.has(child.roleNodeId))
      .map((child) => child.roleNodeId);
    if (missingRoleNodeIds.length > 0) {
      const paused = this.options.store.pauseCallableWorkflowTask({
        id: input.task.id,
        statusLabel: "Child launch needs attention",
        runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
        errorMessage:
          `Callable workflow task ${input.task.id} blocked because required Symphony children did not launch: ${missingRoleNodeIds.join(", ")}.`,
      });
      this.options.emitCallableWorkflowTaskUpdated(paused);
      return {
        status: "blocked",
        task: paused,
        launchBridgeEvidence: callableWorkflowSymphonyLaunchBridgeEvidence({
          contract,
          childRunIds: childRunBindings.map((binding) => binding.childRunId),
          childRunBindings,
          childRuns: childRunBindings.map((binding) => this.options.store.getSubagentRun(binding.childRunId)),
        }),
      };
    }
    const uniqueChildRunIds = [...new Set(childRunBindings.map((binding) => binding.childRunId))];
    if (!uniqueChildRunIds.length) {
      return {
        status: "ready",
        task: this.options.store.getCallableWorkflowTask(input.task.id),
        launchBridgeEvidence: callableWorkflowSymphonyLaunchBridgeEvidence({
          contract,
          childRunIds: uniqueChildRunIds,
          childRunBindings,
          childRuns: [],
        }),
      };
    }
    const waitResult = await tool.execute(`callable-workflow:${input.task.id}:wait`, {
      action: "wait_agent",
      childRunIds: uniqueChildRunIds,
      waitBarrierMode: contract.wait.mode,
      failurePolicy: contract.wait.failurePolicy,
      timeoutMs: contract.wait.timeoutMs,
      idempotencyKey: `callable-workflow:${input.task.id}:symphony-wait:${contract.wait.mode}`,
    }, undefined, undefined, bridgeToolContext);
    const postWaitChildRuns = uniqueChildRunIds.map((runId) => this.options.store.getSubagentRun(runId));
    const waitEvidence = callableWorkflowSymphonyLaunchBridgeEvidence({
      contract,
      childRunIds: uniqueChildRunIds,
      childRunBindings,
      childRuns: postWaitChildRuns,
      waitResult,
    });
    const currentTask = this.options.store.getCallableWorkflowTask(input.task.id);
    if (currentTask.status === "canceled") {
      return {
        status: "terminal",
        task: currentTask,
        launchBridgeEvidence: waitEvidence,
      };
    }
    const waitBarrierId = callableWorkflowSymphonyWaitBarrierId(waitResult);
    const persistedWaitBarrier = waitBarrierId ? this.options.store.getSubagentWaitBarrier(waitBarrierId) : undefined;
    if (callableWorkflowSymphonyWaitAllowsCompile(waitResult)) {
      return {
        status: "ready",
        task: this.options.store.getCallableWorkflowTask(input.task.id),
        launchBridgeEvidence: waitEvidence,
      };
    }
    const terminalDecision = callableWorkflowSymphonyTerminalWaitDecisionAction(waitResult, persistedWaitBarrier);
    if (terminalDecision) {
      const terminalMessage = callableWorkflowSymphonyTerminalWaitDecisionMessage(input.task.id, terminalDecision, waitResult);
      const terminalTask = terminalDecision === "cancel_parent"
        ? this.options.store.cancelCallableWorkflowTask({ id: input.task.id, reason: terminalMessage })
        : this.options.store.failCallableWorkflowTask({ id: input.task.id, errorMessage: terminalMessage });
      this.options.emitCallableWorkflowTaskUpdated(terminalTask);
      return {
        status: "terminal",
        task: terminalTask,
        launchBridgeEvidence: waitEvidence,
      };
    }
    const paused = this.options.store.pauseCallableWorkflowTask({
      id: input.task.id,
      statusLabel: "Child wait needs attention",
      runnerDeferredReason: CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
      errorMessage: callableWorkflowSymphonyWaitBlockMessage(input.task.id, waitResult),
    });
    this.options.emitCallableWorkflowTaskUpdated(paused);
    return {
      status: "blocked",
      task: paused,
      launchBridgeEvidence: waitEvidence,
    };
  }

  private async cancelChildRun(input: {
    run: SubagentRunSummary;
    reason: string;
    idempotencyKey: string;
    toolCallId: string;
  }): Promise<SubagentRunSummary> {
    const result = await this.dependencies.executeSubagentCancelAgent({
      store: this.options.createSubagentEventingStore(),
      runtime: {
        cancelChildRun: (cancelInput) => this.options.runtime.cancelChildRun(cancelInput),
      },
      run: input.run,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      toolCallId: input.toolCallId,
      createRuntimeCancelEventEmitter: (targetRun) => this.options.createRuntimeCancelEventEmitter(targetRun),
    });
    return result.run;
  }

  private resolveCancelledChildWaitBarriers(
    run: SubagentRunSummary,
    reason: string,
    idempotencyKey: string,
  ): void {
    const waitBarriers = resolveActiveSubagentWaitBarriersForRun({
      store: this.options.store,
      run,
      evidence: {
        schemaVersion: SUBAGENT_WAIT_BARRIER_TRANSITION_EVIDENCE_SCHEMA_VERSION,
        kind: "child_cancelled",
        source: "cancel_agent",
        childRunId: run.id,
        reason,
        idempotencyKey,
      },
    });
    for (const barrier of waitBarriers) this.options.emitSubagentWaitBarrierUpdated(barrier);
  }

  private async cancelBackgroundBarrier(input: {
    task: CallableWorkflowTaskSummary;
    barrier: SubagentWaitBarrierSummary;
    userDecision: string;
    idempotencyKey: string;
  }): Promise<void> {
    const cancelledRuns: SubagentRunSummary[] = [];
    for (const childRunId of input.barrier.childRunIds) {
      let run: SubagentRunSummary;
      try {
        run = this.options.store.getSubagentRun(childRunId);
      } catch {
        continue;
      }
      if (!isSubagentTerminalStatus(run.status)) {
        const cancelled = await this.cancelChildRun({
          run,
          reason: input.userDecision,
          idempotencyKey: input.idempotencyKey,
          toolCallId: "callable-workflow-cancel-background-child",
        });
        cancelledRuns.push(cancelled);
      } else {
        cancelledRuns.push(run);
      }
    }
    const childStatuses = input.barrier.childRunIds.flatMap((childRunId) => {
      try {
        const run = this.options.store.getSubagentRun(childRunId);
        return [{ childRunId: run.id, status: run.status }];
      } catch {
        return [];
      }
    });
    const updatedBarrier = this.options.store.updateSubagentWaitBarrierStatus(input.barrier.id, "cancelled", {
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
    this.options.emitSubagentWaitBarrierUpdated(updatedBarrier);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function subagentRunIdFromToolResult(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;
  const details = result.details;
  if (!isRecord(details)) return undefined;
  const run = details.run;
  if (!isRecord(run)) return undefined;
  return typeof run.id === "string" && run.id.trim().length > 0 ? run.id : undefined;
}

function callableWorkflowSymphonyWaitAllowsCompile(result: unknown): boolean {
  if (!isRecord(result)) return false;
  const details = result.details;
  if (!isRecord(details)) return false;
  const waitSatisfied = details.waitSatisfied === true;
  const synthesisAllowed = details.synthesisAllowed === true;
  const waitBarrier = isRecord(details.waitBarrier) ? details.waitBarrier : undefined;
  const waitBarrierStatus = typeof waitBarrier?.status === "string" ? waitBarrier.status : "unknown";
  return waitSatisfied && synthesisAllowed && waitBarrierStatus === "satisfied";
}

function callableWorkflowSymphonyWaitBlockMessage(taskId: string, result: unknown): string {
  if (!isRecord(result)) {
    return `Callable workflow task ${taskId} blocked because the Symphony wait result was unavailable.`;
  }
  const details = result.details;
  if (!isRecord(details)) {
    return `Callable workflow task ${taskId} blocked because the Symphony wait details were unavailable.`;
  }
  const waitSatisfied = details.waitSatisfied === true;
  const synthesisAllowed = details.synthesisAllowed === true;
  const waitBarrier = isRecord(details.waitBarrier) ? details.waitBarrier : undefined;
  const waitBarrierStatus = typeof waitBarrier?.status === "string" ? waitBarrier.status : "unknown";
  const parentResolution = isRecord(details.parentResolution) ? details.parentResolution : undefined;
  const resolutionAction = typeof parentResolution?.action === "string" ? parentResolution.action : "none";
  return [
    `Callable workflow task ${taskId} blocked because Symphony children are not synthesis-safe.`,
    `waitSatisfied=${String(waitSatisfied)}; synthesisAllowed=${String(synthesisAllowed)}; waitBarrierStatus=${waitBarrierStatus}; parentResolution=${resolutionAction}.`,
  ].join(" ");
}

function callableWorkflowSymphonyWaitBarrierId(result: unknown): string | undefined {
  if (!isRecord(result) || !isRecord(result.details)) return undefined;
  const waitBarrier = isRecord(result.details.waitBarrier) ? result.details.waitBarrier : undefined;
  const id = typeof waitBarrier?.id === "string" ? waitBarrier.id.trim() : "";
  return id || undefined;
}

function callableWorkflowPatternGraphChildRunIds(task: CallableWorkflowTaskSummary): Set<string> {
  return new Set(
    task.patternGraphSnapshot?.nodes
      .map((node) => node.childRunId)
      .filter((childRunId): childRunId is string => typeof childRunId === "string" && childRunId.length > 0) ?? [],
  );
}

export function shouldCancelCallableWorkflowSymphonyLaunchChildren(task: CallableWorkflowTaskSummary): boolean {
  if (isCallableWorkflowSymphonyChildWaitPreCompilePause(task)) return true;
  if (task.status !== "compiling" || task.sourceKind !== "symphony_recipe") return false;
  return callableWorkflowPatternGraphChildRunIds(task).size > 0;
}

function callableWorkflowSymphonyTerminalWaitDecisionAction(
  result: unknown,
  waitBarrier?: SubagentWaitBarrierSummary,
): "fail_parent" | "cancel_parent" | "detach_child" | undefined {
  const artifact = isRecord(waitBarrier?.resolutionArtifact) ? waitBarrier.resolutionArtifact : undefined;
  const userDecision = isRecord(artifact?.userDecision) ? artifact.userDecision : undefined;
  const decision = typeof userDecision?.decision === "string" ? userDecision.decision : undefined;
  if (decision === "fail_parent" || decision === "cancel_parent" || decision === "detach_child") return decision;
  if (!isRecord(result) || !isRecord(result.details)) return undefined;
  const parentResolution = isRecord(result.details.parentResolution) ? result.details.parentResolution : undefined;
  const action = typeof parentResolution?.action === "string" ? parentResolution.action : undefined;
  if (action === "fail_parent" || action === "cancel_parent" || action === "detach_child") return action;
  return undefined;
}

function callableWorkflowSymphonyTerminalWaitDecisionMessage(
  taskId: string,
  action: "fail_parent" | "cancel_parent" | "detach_child",
  result: unknown,
): string {
  const details = isRecord(result) && isRecord(result.details) ? result.details : undefined;
  const parentResolution = isRecord(details?.parentResolution) ? details?.parentResolution : undefined;
  const reason = typeof parentResolution?.reason === "string" ? parentResolution.reason.trim() : "";
  const decisionLabel = action === "cancel_parent"
    ? "canceled"
    : action === "detach_child"
      ? "failed after a required child was detached"
      : "failed";
  return [
    `Callable workflow task ${taskId} ${decisionLabel} by Symphony wait-barrier decision ${action}.`,
    reason,
  ].filter(Boolean).join(" ");
}

function callableWorkflowSymphonyLaunchBridgeEvidence(input: {
  contract: NonNullable<CallableWorkflowRunnerLaunchInput["handoffPlan"]["compiler"]["launchBridgeContract"]>;
  childRunIds: readonly string[];
  childRunBindings?: readonly { roleNodeId: string; childRunId: string }[];
  childRuns?: readonly SubagentRunSummary[];
  waitResult?: unknown;
}): Record<string, unknown> {
  const details = isRecord(input.waitResult) && isRecord(input.waitResult.details)
    ? input.waitResult.details
    : undefined;
  const waitBarrier = isRecord(details?.waitBarrier) ? details?.waitBarrier : undefined;
  return {
    schemaVersion: "ambient-callable-workflow-symphony-launch-bridge-evidence-v1",
    workflowTaskId: input.contract.workflowTaskId,
    patternId: input.contract.pattern.id,
    childRunIds: [...input.childRunIds],
    childRoles: input.contract.childLaunches.map((child) => ({
      roleNodeId: child.roleNodeId,
      roleId: child.roleId,
      patternRole: child.patternRole,
      childRunId: input.childRunBindings?.find((binding) => binding.roleNodeId === child.roleNodeId)?.childRunId,
      outputContract: child.effectiveRole.outputContract,
    })),
    childResults: (input.childRuns ?? []).map((run) => ({
      childRunId: run.id,
      childThreadId: run.childThreadId,
      roleId: run.roleId,
      patternRole: run.effectiveRoleSnapshot?.patternRole,
      status: run.status,
      resultArtifact: compactCallableWorkflowSymphonyChildResultArtifact(run.resultArtifact),
    })),
    ...(details ? {
      wait: {
        waitSatisfied: details.waitSatisfied === true,
        synthesisAllowed: details.synthesisAllowed === true,
        waitTimedOut: details.waitTimedOut === true,
        waitSessionExpired: details.waitSessionExpired === true,
        waitBarrier: waitBarrier ? {
          id: waitBarrier.id,
          status: waitBarrier.status,
          dependencyMode: waitBarrier.dependencyMode,
          failurePolicy: waitBarrier.failurePolicy,
          childRunIds: waitBarrier.childRunIds,
        } : undefined,
        parentResolution: details.parentResolution,
        waitBarrierBlockers: details.waitBarrierBlockers,
        waitChildRuns: details.waitChildRuns,
      },
    } : {}),
  };
}

function compactCallableWorkflowSymphonyChildResultArtifact(artifact: unknown): Record<string, unknown> | undefined {
  if (!isRecord(artifact)) return undefined;
  return {
    schemaVersion: artifact.schemaVersion,
    runId: artifact.runId,
    status: artifact.status,
    partial: artifact.partial,
    summary: artifact.summary,
    childThreadId: artifact.childThreadId,
    artifactPath: artifact.artifactPath,
  };
}
