import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

import type { AmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { ResolveSubagentCapacityLeaseInput, SubagentCapacityLeaseSnapshot } from "../../shared/subagentCapacity";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadWorktreeSummary } from "../../shared/threadTypes";
import type { AgentRuntimeFeatures } from "./agentRuntimeFeatures";
import { prepareThreadWorktree } from "./agentRuntimeGitFacade";
import { createDefaultModelRuntimeRegistry } from "./agentRuntimeModelProviderFacade";
import type {
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
import type { PluginMcpToolRegistration } from "./agentRuntimePluginsFacade";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type { AgentRuntimeSubagentActionController } from "./agentRuntimeSubagentActionController";
import type { AgentRuntimeSubagentCapacityController } from "./agentRuntimeSubagentCapacityController";
import type { AgentRuntimeSubagentChildRuntimeRouter } from "./agentRuntimeSubagentChildRuntimeRouter";
import type { SubagentPiToolStore } from "./agentRuntimeSubagentsFacade";
import { createAgentRuntimeSubagentToolExtension, type AgentRuntimeSubagentParentRunStore } from "./subagents/agentRuntimeSubagentTools";

type AgentRuntimeSubagentToolExtensionStore = SubagentPiToolStore &
  AgentRuntimeSubagentParentRunStore &
  Pick<ProjectStore, "getWorkspace" | "setThreadWorktree">;

type SubagentModelRuntimeRegistry = Pick<ReturnType<typeof createDefaultModelRuntimeRegistry>, "resolveProfile">;

export interface AgentRuntimeSubagentToolExtensionDependencies {
  createAgentRuntimeSubagentToolExtension: typeof createAgentRuntimeSubagentToolExtension;
  prepareThreadWorktree: typeof prepareThreadWorktree;
  modelRuntimeRegistry: SubagentModelRuntimeRegistry;
}

export interface AgentRuntimeSubagentToolExtensionControllerOptions {
  store: AgentRuntimeSubagentToolExtensionStore;
  features: Pick<AgentRuntimeFeatures, "modelRuntime" | "localTextSubagents" | "symphonyLaunchContracts">;
  activeRunIds: Pick<Map<string, string>, "get">;
  subagentActions: Pick<AgentRuntimeSubagentActionController, "createEventingStore">;
  subagentCapacity: Pick<AgentRuntimeSubagentCapacityController, "resolveCapacityLease">;
  subagentChildRuntimeRouter: Pick<
    AgentRuntimeSubagentChildRuntimeRouter,
    | "startResolvedChildRun"
    | "waitForResolvedChildRun"
    | "cancelResolvedChildRun"
    | "followupResolvedChildRun"
    | "retryResolvedChildRun"
    | "resolveResolvedChildApprovalResponse"
  >;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  emit: (event: DesktopEvent) => void;
  dependencies?: Partial<AgentRuntimeSubagentToolExtensionDependencies>;
}

const defaultDependencies: AgentRuntimeSubagentToolExtensionDependencies = {
  createAgentRuntimeSubagentToolExtension,
  prepareThreadWorktree,
  modelRuntimeRegistry: createDefaultModelRuntimeRegistry(),
};

export class AgentRuntimeSubagentToolExtensionController {
  private readonly dependencies: AgentRuntimeSubagentToolExtensionDependencies;

  constructor(private readonly options: AgentRuntimeSubagentToolExtensionControllerOptions) {
    this.dependencies = {
      ...defaultDependencies,
      ...options.dependencies,
    };
  }

  createToolExtension(threadId: string, pluginMcpTools: readonly PluginMcpToolRegistration[] = []): ExtensionFactory {
    return this.dependencies.createAgentRuntimeSubagentToolExtension({
      threadId,
      pluginMcpTools,
      store: this.options.subagentActions.createEventingStore(),
      activeRunIds: this.options.activeRunIds,
      activeRunStore: this.options.store,
      getFeatureFlagSnapshot: () => this.options.getFeatureFlagSnapshot(),
      resolveSymphonyLaunchContract: this.options.features.symphonyLaunchContracts?.resolve,
      resolveModelRuntimeProfile: (modelId) => this.resolveModelRuntimeProfile(modelId),
      resolveCapacityLease: (input) => this.resolveCapacityLease(input),
      prepareChildWorktree: (input) => this.prepareChildWorktree(input.run),
      runtime: {
        startChildRun: (input) => this.startResolvedChildRun(input),
        waitForChildRun: (input) => this.waitForResolvedChildRun(input),
        cancelChildRun: (input) => this.cancelResolvedChildRun(input),
        followupChildRun: (input) => this.followupResolvedChildRun(input),
        retryChildRun: (input) => this.retryResolvedChildRun(input),
        resolveChildApprovalResponse: (input) => this.resolveResolvedChildApprovalResponse(input),
      },
    });
  }

  resolveModelRuntimeProfile(modelId?: string): AmbientModelRuntimeProfile {
    return (
      this.options.features.modelRuntime?.resolveModelRuntimeProfile?.(modelId) ??
      this.options.features.localTextSubagents?.resolveModelRuntimeProfile?.(modelId) ??
      this.dependencies.modelRuntimeRegistry.resolveProfile(modelId)
    );
  }

  async resolveCapacityLease(input: ResolveSubagentCapacityLeaseInput): Promise<SubagentCapacityLeaseSnapshot> {
    return this.options.subagentCapacity.resolveCapacityLease(input);
  }

  startResolvedChildRun(input: SubagentChildRuntimeStartInput): Promise<SubagentChildRuntimeStartResult> | SubagentChildRuntimeStartResult {
    return this.options.subagentChildRuntimeRouter.startResolvedChildRun(input);
  }

  async waitForResolvedChildRun(input: SubagentChildRuntimeWaitInput): Promise<SubagentChildRuntimeWaitResult> {
    return this.options.subagentChildRuntimeRouter.waitForResolvedChildRun(input);
  }

  async cancelResolvedChildRun(input: SubagentChildRuntimeCancelInput): Promise<SubagentChildRuntimeCancelResult> {
    return this.options.subagentChildRuntimeRouter.cancelResolvedChildRun(input);
  }

  async followupResolvedChildRun(input: SubagentChildRuntimeFollowupInput): Promise<SubagentChildRuntimeFollowupResult> {
    return this.options.subagentChildRuntimeRouter.followupResolvedChildRun(input);
  }

  async retryResolvedChildRun(input: SubagentChildRuntimeRetryInput): Promise<SubagentChildRuntimeRetryResult> {
    return this.options.subagentChildRuntimeRouter.retryResolvedChildRun(input);
  }

  async resolveResolvedChildApprovalResponse(
    input: SubagentChildRuntimeApprovalResponseInput,
  ): Promise<SubagentChildRuntimeApprovalResponseResult> {
    return this.options.subagentChildRuntimeRouter.resolveResolvedChildApprovalResponse(input);
  }

  async prepareChildWorktree(run: SubagentRunSummary): Promise<ThreadWorktreeSummary | undefined> {
    const childThread = this.options.store.getThread(run.childThreadId);
    const parentThread = this.options.store.getThread(run.parentThreadId);
    const projectRoot =
      childThread.gitWorktree?.projectRoot ?? parentThread.gitWorktree?.projectRoot ?? this.options.store.getWorkspace().path;
    const worktree = await this.dependencies.prepareThreadWorktree(projectRoot, childThread);
    if (!worktree) return undefined;
    this.options.store.setThreadWorktree(worktree);
    if (worktree.status === "active") {
      this.options.store.updateThreadWorkspacePath(childThread.id, worktree.worktreePath);
    }
    this.options.emit({ type: "thread-updated", thread: this.options.store.getThread(childThread.id) });
    return this.options.store.getThread(childThread.id).gitWorktree ?? worktree;
  }
}
