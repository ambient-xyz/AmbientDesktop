import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
import {
  CALLABLE_WORKFLOW_SYMPHONY_CHILD_WAIT_DEFERRED_REASON,
  isCallableWorkflowSymphonyChildWaitPreCompilePause,
} from "../../shared/callableWorkflowTaskGuards";
import type { SubagentRunSummary, SubagentWaitBarrierSummary } from "../../shared/subagentTypes";
import type { CallableWorkflowTaskSummary } from "../../shared/workflowTypes";
import type { CallableWorkflowRunnerLaunchInput, CallableWorkflowSubagentLaunchResult } from "./agentRuntimeCallableWorkflowFacade";
import {
  cancelCallableWorkflowSymphonyChildWait,
  cancelCallableWorkflowSymphonyTaskChildRun,
  callableWorkflowPatternGraphChildRunIds,
} from "./agentRuntimeCallableWorkflowSymphonyBridgeCancellation";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  createSubagentPiToolDefinitions,
  executeSubagentBarrierDecision,
  executeSubagentCancelAgent,
  isSubagentTerminalStatus,
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
type CallableWorkflowSymphonyBridgeEventingStore = CreateSubagentPiToolDefinitionsOptions["store"] &
  Parameters<ExecuteSubagentCancelAgent>[0]["store"] &
  Parameters<ExecuteSubagentBarrierDecision>[0]["store"];
type CallableWorkflowSymphonyBridgeRuntime = Required<
  Pick<
    NonNullable<CreateSubagentPiToolDefinitionsOptions["runtime"]>,
    "startChildRun" | "waitForChildRun" | "cancelChildRun" | "followupChildRun" | "retryChildRun" | "resolveChildApprovalResponse"
  >
>;

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

  async cancelChildWait(task: CallableWorkflowTaskSummary, reason?: string): Promise<void> {
    await cancelCallableWorkflowSymphonyChildWait({
      task,
      reason,
      options: this.options,
      dependencies: this.dependencies,
    });
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
      const reason =
        currentTask.errorMessage?.trim() || `Callable workflow task ${input.task.id} was canceled during Symphony child launch.`;
      for (const childRunId of childRunIds) {
        let run: SubagentRunSummary;
        try {
          run = this.options.store.getSubagentRun(childRunId);
        } catch {
          continue;
        }
        if (isSubagentTerminalStatus(run.status)) continue;
        await cancelCallableWorkflowSymphonyTaskChildRun({
          task: input.task,
          run,
          reason,
          operation: "cancel",
          toolCallId: "callable-workflow-cancel-launch-child",
          options: this.options,
          dependencies: this.dependencies,
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
      const result = await tool.execute(
        `callable-workflow:${input.task.id}:spawn:${child.roleNodeId}`,
        {
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
        },
        undefined,
        undefined,
        bridgeToolContext,
      );
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
        errorMessage: `Callable workflow task ${input.task.id} blocked because required Symphony children did not launch: ${missingRoleNodeIds.join(", ")}.`,
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
    const waitResult = await tool.execute(
      `callable-workflow:${input.task.id}:wait`,
      {
        action: "wait_agent",
        childRunIds: uniqueChildRunIds,
        waitBarrierMode: contract.wait.mode,
        failurePolicy: contract.wait.failurePolicy,
        timeoutMs: contract.wait.timeoutMs,
        idempotencyKey: `callable-workflow:${input.task.id}:symphony-wait:${contract.wait.mode}`,
      },
      undefined,
      undefined,
      bridgeToolContext,
    );
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
      const terminalTask =
        terminalDecision === "cancel_parent"
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
  const decisionLabel =
    action === "cancel_parent" ? "canceled" : action === "detach_child" ? "failed after a required child was detached" : "failed";
  return [`Callable workflow task ${taskId} ${decisionLabel} by Symphony wait-barrier decision ${action}.`, reason]
    .filter(Boolean)
    .join(" ");
}

function callableWorkflowSymphonyLaunchBridgeEvidence(input: {
  contract: NonNullable<CallableWorkflowRunnerLaunchInput["handoffPlan"]["compiler"]["launchBridgeContract"]>;
  childRunIds: readonly string[];
  childRunBindings?: readonly { roleNodeId: string; childRunId: string }[];
  childRuns?: readonly SubagentRunSummary[];
  waitResult?: unknown;
}): Record<string, unknown> {
  const details = isRecord(input.waitResult) && isRecord(input.waitResult.details) ? input.waitResult.details : undefined;
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
    ...(details
      ? {
          wait: {
            waitSatisfied: details.waitSatisfied === true,
            synthesisAllowed: details.synthesisAllowed === true,
            waitTimedOut: details.waitTimedOut === true,
            waitSessionExpired: details.waitSessionExpired === true,
            waitBarrier: waitBarrier
              ? {
                  id: waitBarrier.id,
                  status: waitBarrier.status,
                  dependencyMode: waitBarrier.dependencyMode,
                  failurePolicy: waitBarrier.failurePolicy,
                  childRunIds: waitBarrier.childRunIds,
                }
              : undefined,
            parentResolution: details.parentResolution,
            waitBarrierBlockers: details.waitBarrierBlockers,
            waitChildRuns: details.waitChildRuns,
          },
        }
      : {}),
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
