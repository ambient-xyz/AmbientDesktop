import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type {
  LocalModelRuntimeRestartPlan,
  LocalModelRuntimeStopPlan,
  LocalRuntimeOwnershipResolutionRequest,
  LocalRuntimeOwnershipResolutionResult,
} from "./agentRuntimeLocalRuntimeFacade";
import {
  localRuntimeOwnershipResolutionRequest,
} from "./agentRuntimeLocalRuntimeFacade";
import type {
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeCancelResult,
  SubagentRuntimeEventEmitter,
} from "./agentRuntimePiFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  createSubagentIdempotencyKey,
  createSubagentPayloadFingerprint,
  executeSubagentCancelAgent,
  isSubagentTerminalStatus,
} from "./agentRuntimeSubagentsFacade";

type AgentRuntimeLocalRuntimeOwnershipStore = Pick<ProjectStore, "listAllSubagentRuns">;
type ExecuteSubagentCancelAgent = typeof executeSubagentCancelAgent;
type AgentRuntimeLocalRuntimeOwnershipEventingStore = Parameters<ExecuteSubagentCancelAgent>[0]["store"];

export interface AgentRuntimeLocalRuntimeOwnershipDependencies {
  executeSubagentCancelAgent: ExecuteSubagentCancelAgent;
}

export interface AgentRuntimeLocalRuntimeOwnershipControllerOptions {
  store: AgentRuntimeLocalRuntimeOwnershipStore;
  createSubagentEventingStore: () => AgentRuntimeLocalRuntimeOwnershipEventingStore;
  cancelChildRun: (input: SubagentChildRuntimeCancelInput) => Promise<SubagentChildRuntimeCancelResult>;
  createRuntimeCancelEventEmitter: (run: SubagentRunSummary) => SubagentRuntimeEventEmitter;
  emitSubagentRunAndChildThreadUpdated: (run: SubagentRunSummary) => void;
  dependencies?: Partial<AgentRuntimeLocalRuntimeOwnershipDependencies>;
}

const defaultDependencies: AgentRuntimeLocalRuntimeOwnershipDependencies = {
  executeSubagentCancelAgent,
};

export class AgentRuntimeLocalRuntimeOwnershipController {
  private readonly dependencies: AgentRuntimeLocalRuntimeOwnershipDependencies;

  constructor(private readonly options: AgentRuntimeLocalRuntimeOwnershipControllerOptions) {
    this.dependencies = {
      ...defaultDependencies,
      ...options.dependencies,
    };
  }

  resolveForStopPlan(
    plan: LocalModelRuntimeStopPlan,
  ): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
    if (
      plan.status !== "blocked" ||
      !plan.forceRequested ||
      plan.dryRun ||
      !plan.entry ||
      !plan.entry.lifecycleDecision.stop.forceAllowed ||
      !plan.entry.lifecycleDecision.stop.forceRequiresSubagentCancellation
    ) {
      return Promise.resolve(undefined);
    }
    return this.resolveForForcedAction(localRuntimeOwnershipResolutionRequest({
      action: "stop",
      runtimeId: plan.runtimeId,
      entry: plan.entry,
    }));
  }

  resolveForRestartPlan(
    plan: LocalModelRuntimeRestartPlan,
  ): Promise<LocalRuntimeOwnershipResolutionResult | undefined> {
    if (
      plan.status !== "blocked" ||
      !plan.forceRequested ||
      plan.dryRun ||
      !plan.entry ||
      !plan.entry.lifecycleDecision.restart.forceAllowed ||
      !plan.entry.lifecycleDecision.restart.forceRequiresSubagentCancellation
    ) {
      return Promise.resolve(undefined);
    }
    return this.resolveForForcedAction(localRuntimeOwnershipResolutionRequest({
      action: "restart",
      runtimeId: plan.runtimeId,
      entry: plan.entry,
    }));
  }

  async resolveForForcedAction(
    request: LocalRuntimeOwnershipResolutionRequest,
  ): Promise<LocalRuntimeOwnershipResolutionResult> {
    const resolvedLeaseIds: string[] = [];
    const resolvedChildRunIds: string[] = [];
    const blockedLeaseIds: string[] = [];
    const blockedReasons: string[] = [];
    const cancelledRunIds = new Set<string>();

    for (const affected of request.affectedSubagents) {
      const run = this.findSubagentRunForLocalRuntimeOwner(
        affected.subagentThreadId,
        affected.parentThreadId,
        affected.subagentRunId,
      );
      if (!run) {
        blockedLeaseIds.push(affected.leaseId);
        const ownerHandle = affected.subagentRunId
          ? `run ${affected.subagentRunId} / child thread ${affected.subagentThreadId}`
          : `child thread ${affected.subagentThreadId}`;
        blockedReasons.push(`No active sub-agent run maps to ${ownerHandle}.`);
        continue;
      }
      if (run.closedAt) {
        blockedLeaseIds.push(affected.leaseId);
        blockedReasons.push(`Sub-agent run ${run.id} is already closed.`);
        continue;
      }
      if (run.status === "cancelled") {
        resolvedLeaseIds.push(affected.leaseId);
        resolvedChildRunIds.push(run.id);
        continue;
      }
      if (isSubagentTerminalStatus(run.status)) {
        blockedLeaseIds.push(affected.leaseId);
        blockedReasons.push(`Sub-agent run ${run.id} is already ${run.status}; its local runtime lease must be released by the runtime owner.`);
        continue;
      }
      if (!cancelledRunIds.has(run.id)) {
        const reason = `Forced local runtime ${request.action === "stop" ? "Stop" : "Restart"} requested for ${request.modelRuntimeId ?? request.runtimeId}; cancelling this sub-agent before Ambient changes its local model runtime.`;
        const idempotencyKey = createSubagentIdempotencyKey({
          operation: "cancel",
          childRunId: run.id,
          canonicalPath: run.canonicalTaskPath,
          payloadFingerprint: createSubagentPayloadFingerprint({
            source: "local-runtime-ownership-resolution",
            action: request.action,
            runtimeId: request.runtimeId,
            leaseId: affected.leaseId,
          }),
        });
        const result = await this.dependencies.executeSubagentCancelAgent({
          store: this.options.createSubagentEventingStore(),
          runtime: {
            cancelChildRun: (cancelInput) => this.options.cancelChildRun(cancelInput),
          },
          run,
          reason,
          idempotencyKey,
          toolCallId: `local-runtime-${request.action}-ownership`,
          createRuntimeCancelEventEmitter: (targetRun) => this.options.createRuntimeCancelEventEmitter(targetRun),
        });
        this.options.emitSubagentRunAndChildThreadUpdated(result.run);
        if (result.run.status !== "cancelled") {
          blockedLeaseIds.push(affected.leaseId);
          blockedReasons.push(`Sub-agent run ${result.run.id} could not be cancelled; current status is ${result.run.status}.`);
          continue;
        }
        cancelledRunIds.add(result.run.id);
      }
      resolvedLeaseIds.push(affected.leaseId);
      resolvedChildRunIds.push(run.id);
    }

    const uniqueResolvedLeaseIds = uniqueStrings(resolvedLeaseIds);
    const uniqueResolvedChildRunIds = uniqueStrings(resolvedChildRunIds);
    const uniqueBlockedLeaseIds = uniqueStrings(blockedLeaseIds);
    if (uniqueBlockedLeaseIds.length > 0) {
      return {
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: request.action,
        runtimeId: request.runtimeId,
        status: "blocked",
        reason: `Sub-agent ownership resolution could not resolve all local runtime blockers. ${uniqueStrings(blockedReasons).join(" ")}`,
        affectedSubagents: request.affectedSubagents,
        resolvedLeaseIds: uniqueResolvedLeaseIds,
        resolvedChildRunIds: uniqueResolvedChildRunIds,
        blockedLeaseIds: uniqueBlockedLeaseIds,
      };
    }
    return {
      schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
      action: request.action,
      runtimeId: request.runtimeId,
      status: "resolved",
      reason: `Cancelled ${uniqueResolvedChildRunIds.length} sub-agent run${uniqueResolvedChildRunIds.length === 1 ? "" : "s"} before forced local runtime ${request.action === "stop" ? "Stop" : "Restart"}.`,
      affectedSubagents: request.affectedSubagents,
      resolvedLeaseIds: uniqueResolvedLeaseIds,
      resolvedChildRunIds: uniqueResolvedChildRunIds,
    };
  }

  private findSubagentRunForLocalRuntimeOwner(
    subagentThreadId: string,
    parentThreadId: string | undefined,
    subagentRunId?: string,
  ): SubagentRunSummary | undefined {
    const exactRunId = subagentRunId?.trim();
    if (exactRunId) {
      const run = this.options.store.listAllSubagentRuns().find((candidate) => candidate.id === exactRunId);
      if (run && run.childThreadId === subagentThreadId && (!parentThreadId || run.parentThreadId === parentThreadId)) {
        return run;
      }
      return undefined;
    }
    const childThreadId = subagentThreadId.trim();
    if (!childThreadId) return undefined;
    const candidates = this.options.store.listAllSubagentRuns()
      .filter((run) => run.childThreadId === childThreadId)
      .filter((run) => !parentThreadId || run.parentThreadId === parentThreadId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return candidates.find((run) => !run.closedAt && !isSubagentTerminalStatus(run.status)) ?? candidates[0];
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim())));
}
