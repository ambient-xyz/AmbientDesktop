import type { LocalModelHostMemorySnapshot, LocalModelResourceSettings } from "../../shared/localRuntimeTypes";
import {
  resolveSubagentCapacityLease,
  type ResolveSubagentCapacityLeaseInput,
  type SubagentCapacityLeaseSnapshot,
  type SubagentCapacityLocalMemorySnapshot,
} from "../../shared/subagentCapacity";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  buildLocalModelResourceRegistry,
  localTextRequestedLaunch,
  type LocalTextRuntimeManagerLike,
} from "./agentRuntimeLocalRuntimeFacade";

type AgentRuntimeSubagentCapacityStore = Pick<ProjectStore, "getThread">;

export interface AgentRuntimeSubagentCapacityControllerOptions {
  store: AgentRuntimeSubagentCapacityStore;
  runtimeManager: LocalTextRuntimeManagerLike;
  readLocalModelResourceSettings?: () => LocalModelResourceSettings | undefined;
  localModelHostMemory?: () => LocalModelHostMemorySnapshot;
}

export class AgentRuntimeSubagentCapacityController {
  constructor(private readonly options: AgentRuntimeSubagentCapacityControllerOptions) {}

  async resolveCapacityLease(input: ResolveSubagentCapacityLeaseInput): Promise<SubagentCapacityLeaseSnapshot> {
    const localMemory = input.localMemory ?? (input.model.locality === "local"
      ? await this.resolveLocalMemoryCapacity(input)
      : undefined);
    return resolveSubagentCapacityLease({
      ...input,
      ...(localMemory ? { localMemory } : {}),
    });
  }

  private async resolveLocalMemoryCapacity(
    input: ResolveSubagentCapacityLeaseInput,
  ): Promise<SubagentCapacityLocalMemorySnapshot> {
    const parentThread = this.options.store.getThread(input.parentThreadId);
    const registry = await buildLocalModelResourceRegistry({
      workspacePath: parentThread.workspacePath,
      settings: this.options.readLocalModelResourceSettings?.(),
      ...(this.options.localModelHostMemory ? { hostMemory: this.options.localModelHostMemory() } : {}),
      requestedLaunch: localTextRequestedLaunch({
        id: `${input.parentRunId}:${input.canonicalTaskPath}`,
        ownerThreadId: parentThread.id,
        modelId: input.model.modelId,
        profileId: input.model.profileId,
        contextTokens: input.model.contextWindowTokens,
        estimatedResidentMemoryBytes: input.model.estimatedResidentMemoryBytes,
      }),
      leases: this.options.runtimeManager.activeRuntimeLeases?.() ?? [],
    });
    const decision = registry.policyDecision;
    const allowed = decision.outcome === "unlimited" || decision.outcome === "within-limit" || decision.outcome === "warn";
    return {
      outcome: decision.outcome,
      allowed,
      reason: decision.reason,
      ...(decision.requestedEstimatedResidentMemoryBytes !== undefined
        ? { requestedEstimatedResidentMemoryBytes: decision.requestedEstimatedResidentMemoryBytes }
        : {}),
      activeEstimatedResidentMemoryBytes: decision.activeEstimatedResidentMemoryBytes,
      ...(decision.activeActualResidentMemoryBytes !== undefined ? { activeActualResidentMemoryBytes: decision.activeActualResidentMemoryBytes } : {}),
      projectedEstimatedResidentMemoryBytes: decision.projectedEstimatedResidentMemoryBytes,
      ...(decision.maxResidentMemoryBytes !== undefined ? { maxResidentMemoryBytes: decision.maxResidentMemoryBytes } : {}),
      ...(decision.exceededByBytes !== undefined ? { exceededByBytes: decision.exceededByBytes } : {}),
      unloadCandidateIds: decision.unloadCandidateIds,
    };
  }
}
