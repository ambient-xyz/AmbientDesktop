import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { LocalModelHostMemorySnapshot, LocalModelResourceSettings } from "../../shared/localRuntimeTypes";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  createLocalTextSubagentRuntimeAdapter,
  type CreateLocalTextSubagentRuntimeAdapterOptions,
  type LocalTextRuntimeManagerLike,
  type LocalTextSubagentRuntimeStore,
} from "./agentRuntimeLocalRuntimeFacade";
import type {
  SubagentChildRuntimeAdapter,
  SubagentChildRuntimeApprovalResponseInput,
  SubagentChildRuntimeApprovalResponseResult,
  SubagentChildRuntimeCancelInput,
  SubagentChildRuntimeCancelResult,
  SubagentChildRuntimeFollowupInput,
  SubagentChildRuntimeFollowupResult,
  SubagentChildRuntimeRetryInput,
  SubagentChildRuntimeRetryResult,
  SubagentChildRuntimeStartInput,
  SubagentChildRuntimeStartResult,
  SubagentChildRuntimeWaitInput,
  SubagentChildRuntimeWaitResult,
} from "./agentRuntimePiFacade";
import { isLocalTextSubagentProfile } from "./subagents/agentRuntimeSubagentRuntimeHelpers";

type AgentRuntimeSubagentChildRuntimeRouterStore = Pick<ProjectStore, "getSubagentRun">;

export interface AgentRuntimeLocalTextSubagentRuntimeFeature {
  resolveRuntimeForLaunch?: CreateLocalTextSubagentRuntimeAdapterOptions["resolveRuntimeForLaunch"];
  resolveRuntime?: CreateLocalTextSubagentRuntimeAdapterOptions["resolveRuntime"];
  runtimeManager?: LocalTextRuntimeManagerLike;
  buildResourceRegistry?: CreateLocalTextSubagentRuntimeAdapterOptions["buildResourceRegistry"];
  buildResourceRegistryForLaunch?: CreateLocalTextSubagentRuntimeAdapterOptions["buildResourceRegistryForLaunch"];
  buildPrompt?: CreateLocalTextSubagentRuntimeAdapterOptions["buildPrompt"];
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface AgentRuntimeSubagentChildRuntimeDefaultRuntime {
  refuseStartBecauseFeatureDisabled(
    input: SubagentChildRuntimeStartInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeStartResult;
  refuseFollowupBecauseFeatureDisabled(
    input: SubagentChildRuntimeFollowupInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeFollowupResult;
  refuseRetryBecauseFeatureDisabled(
    input: SubagentChildRuntimeRetryInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeRetryResult;
  refuseApprovalResponseBecauseFeatureDisabled(
    input: SubagentChildRuntimeApprovalResponseInput,
    featureFlagSnapshot: AmbientFeatureFlagSnapshot,
  ): SubagentChildRuntimeApprovalResponseResult;
  startChildRun(input: SubagentChildRuntimeStartInput): SubagentChildRuntimeStartResult;
  waitForChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult>;
  cancelChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult>;
  followupChildRun(input: SubagentChildRuntimeFollowupInput): SubagentChildRuntimeFollowupResult;
  retryChildRun(input: SubagentChildRuntimeRetryInput): SubagentChildRuntimeRetryResult;
  resolveApprovalResponse(input: SubagentChildRuntimeApprovalResponseInput): SubagentChildRuntimeApprovalResponseResult;
}

export interface AgentRuntimeSubagentChildRuntimeRouterOptions {
  store: AgentRuntimeSubagentChildRuntimeRouterStore;
  runtimeFeature?: AgentRuntimeLocalTextSubagentRuntimeFeature;
  defaultRuntime: AgentRuntimeSubagentChildRuntimeDefaultRuntime;
  createEventingStore: () => LocalTextSubagentRuntimeStore;
  fallbackRuntimeManager: LocalTextRuntimeManagerLike;
  readLocalModelResourceSettings?: () => LocalModelResourceSettings | undefined;
  localModelHostMemory?: () => LocalModelHostMemorySnapshot;
  subagentsDisabledRuntimeSnapshot: () => AmbientFeatureFlagSnapshot | undefined;
}

export class AgentRuntimeSubagentChildRuntimeRouter {
  private localTextSubagentRuntime?: SubagentChildRuntimeAdapter;

  constructor(private readonly options: AgentRuntimeSubagentChildRuntimeRouterOptions) {}

  startResolvedChildRun(
    input: SubagentChildRuntimeStartInput,
  ): Promise<SubagentChildRuntimeStartResult> | SubagentChildRuntimeStartResult {
    const disabledSnapshot = this.options.subagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.options.defaultRuntime.refuseStartBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (!runtime?.startChildRun) {
        const current = this.options.store.getSubagentRun(input.run.id);
        input.emitEvent({
          type: "status",
          source: "child_runtime",
          status: current.status,
          message: "Local text sub-agent runtime is not configured.",
        });
        return {
          started: false,
          run: current,
          message: "Local text sub-agent runtime is not configured.",
        };
      }
      return runtime.startChildRun(input);
    }
    return this.options.defaultRuntime.startChildRun(input);
  }

  async waitForResolvedChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> {
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (!runtime?.waitForChildRun) return { run: this.options.store.getSubagentRun(input.run.id), timedOut: false };
      return runtime.waitForChildRun(input);
    }
    return this.options.defaultRuntime.waitForChildRun(input);
  }

  async cancelResolvedChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult> {
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.cancelChildRun) return runtime.cancelChildRun(input);
    }
    return this.options.defaultRuntime.cancelChildRun(input);
  }

  async followupResolvedChildRun(input: SubagentChildRuntimeFollowupInput): Promise<SubagentChildRuntimeFollowupResult> {
    const disabledSnapshot = this.options.subagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.options.defaultRuntime.refuseFollowupBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.followupChildRun) return runtime.followupChildRun(input);
      return {
        run: this.options.store.getSubagentRun(input.run.id),
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Local text sub-agent follow-up execution is not configured; the follow-up remains queued.",
      };
    }
    return this.options.defaultRuntime.followupChildRun(input);
  }

  async retryResolvedChildRun(input: SubagentChildRuntimeRetryInput): Promise<SubagentChildRuntimeRetryResult> {
    const disabledSnapshot = this.options.subagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.options.defaultRuntime.refuseRetryBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.retryChildRun) return runtime.retryChildRun(input);
      return {
        run: this.options.store.getSubagentRun(input.run.id),
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Local text sub-agent retry execution is not configured; the retry request remains queued.",
      };
    }
    return this.options.defaultRuntime.retryChildRun(input);
  }

  async resolveResolvedChildApprovalResponse(
    input: SubagentChildRuntimeApprovalResponseInput,
  ): Promise<SubagentChildRuntimeApprovalResponseResult> {
    const disabledSnapshot = this.options.subagentsDisabledRuntimeSnapshot();
    if (disabledSnapshot) return this.options.defaultRuntime.refuseApprovalResponseBecauseFeatureDisabled(input, disabledSnapshot);
    if (isLocalTextSubagentProfile(input.run.modelRuntimeSnapshot.profile)) {
      const runtime = this.getLocalTextSubagentRuntime();
      if (runtime?.resolveChildApprovalResponse) return runtime.resolveChildApprovalResponse(input);
      return {
        run: this.options.store.getSubagentRun(input.run.id),
        accepted: false,
        mailboxEvent: input.mailboxEvent,
        message: "Local text sub-agent approval-response execution is not configured; the approval response remains queued.",
      };
    }
    return this.options.defaultRuntime.resolveApprovalResponse(input);
  }

  private getLocalTextSubagentRuntime(): SubagentChildRuntimeAdapter | undefined {
    const feature = this.options.runtimeFeature;
    if (!feature?.resolveRuntime) return undefined;
    if (!this.localTextSubagentRuntime) {
      const localModelResourceSettings = this.options.readLocalModelResourceSettings?.();
      this.localTextSubagentRuntime = createLocalTextSubagentRuntimeAdapter({
        store: this.options.createEventingStore(),
        runtimeManager: feature.runtimeManager ?? this.options.fallbackRuntimeManager,
        ...(feature.resolveRuntimeForLaunch ? { resolveRuntimeForLaunch: feature.resolveRuntimeForLaunch } : {}),
        resolveRuntime: feature.resolveRuntime,
        ...(feature.buildResourceRegistry ? { buildResourceRegistry: feature.buildResourceRegistry } : {}),
        ...(feature.buildResourceRegistryForLaunch ? { buildResourceRegistryForLaunch: feature.buildResourceRegistryForLaunch } : {}),
        ...(feature.buildPrompt ? { buildPrompt: feature.buildPrompt } : {}),
        ...(feature.fetchImpl ? { fetchImpl: feature.fetchImpl } : {}),
        ...(feature.now ? { now: feature.now } : {}),
        ...(localModelResourceSettings ? { localModelResourceSettings } : {}),
        ...(this.options.localModelHostMemory ? { localModelHostMemory: this.options.localModelHostMemory } : {}),
      });
    }
    return this.localTextSubagentRuntime;
  }
}
