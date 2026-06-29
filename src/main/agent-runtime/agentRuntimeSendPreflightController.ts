import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import {
  AMBIENT_DEFAULT_MODEL,
  normalizeAmbientModelId,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type {
  LocalDeepResearchSettings,
  LocalModelHostMemorySnapshot,
} from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { applyAgentBootstrapToPrompt, buildAgentBootstrapContext } from "./agentRuntimeAgentFacade";
import { resolveAgentHarnessVariant } from "./agentRuntimeAgentFacade";
import { formatRuntimeError as formatAgentRuntimeError } from "./agentRuntimeErrorFormatting";
import {
  type LocalTextRuntimeManagerLike,
  type LocalTextSubagentRuntimeConfig,
  runAgentRuntimeLocalTextMainRun,
} from "./agentRuntimeLocalRuntimeFacade";
import { createDefaultModelRuntimeRegistry } from "./agentRuntimeModelProviderFacade";
import {
  ambientSubagentRegisteredToolNamesForThread,
} from "./agentRuntimeSubagentsFacade";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import type { SymphonyParentModePolicy } from "./agentRuntimeSymphonyParentMode";
import { isLocalTextSubagentProfile } from "./subagents/agentRuntimeSubagentRuntimeHelpers";
import {
  applyExplicitSubagentRequestGuidance,
  explicitSubagentRequestPreflight,
} from "./subagents/agentRuntimeSubagentIntentPreflight";
import { finalizeRuntimeSubagentPreflightBlock } from "./runtimeSubagentPreflightBlock";
import type { RuntimeRunEventScope } from "./runtimeRunEventScope";

type LocalTextMainRunOptions = Parameters<typeof runAgentRuntimeLocalTextMainRun>[1];

export interface AgentRuntimeSendPreflightFeatures {
  modelRuntime?: {
    resolveModelRuntimeProfile?: (modelId?: string) => AmbientModelRuntimeProfile;
  };
  localTextSubagents?: {
    resolveModelRuntimeProfile?: (modelId?: string) => AmbientModelRuntimeProfile;
    resolveRuntimeForMain?: (input: {
      thread: ThreadSummary;
      runId: string;
      model: AmbientModelRuntimeProfile;
      prompt: string;
    }) => LocalTextSubagentRuntimeConfig | undefined;
    runtimeManager?: LocalTextRuntimeManagerLike;
    fetchImpl?: typeof fetch;
  };
  localDeepResearch?: {
    readSettings?: () => LocalDeepResearchSettings;
  };
  localModelHostMemory?: () => LocalModelHostMemorySnapshot;
}

export interface AgentRuntimeSendPreflightControllerOptions {
  store: LocalTextMainRunOptions["store"];
  features: AgentRuntimeSendPreflightFeatures;
  fallbackRuntimeManager: LocalTextMainRunOptions["fallbackRuntimeManager"];
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  setActiveRun: LocalTextMainRunOptions["setActiveRun"];
  deleteActiveRun: LocalTextMainRunOptions["deleteActiveRun"];
  setActiveRunId: LocalTextMainRunOptions["setActiveRunId"];
  deleteActiveRunId: LocalTextMainRunOptions["deleteActiveRunId"];
  emit: (event: DesktopEvent) => void;
  modelRuntimeRegistry?: {
    resolveProfile: (modelId?: string) => AmbientModelRuntimeProfile;
  };
  resolveAgentHarnessVariant?: typeof resolveAgentHarnessVariant;
  buildAgentBootstrapContext?: typeof buildAgentBootstrapContext;
  applyAgentBootstrapToPrompt?: typeof applyAgentBootstrapToPrompt;
  runLocalTextMainRun?: typeof runAgentRuntimeLocalTextMainRun;
  formatRuntimeError?: (message: string) => string;
  warn?: (message: string) => void;
}

export interface RunAgentRuntimeSendPreflightInput {
  sendInput: SendMessageInput;
  runtimeInput: RuntimeSendMessageInput;
  thread: ThreadSummary;
  visibleUserContent: string;
  promptContent: string;
  usesDedicatedReviewSession: boolean;
  shouldInjectBootstrap: boolean;
  symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
  runWorkspacePath: string;
  finishPlannerFinalizationSources: RuntimeRunEventScope["finishPlannerFinalizationSources"];
  emitRunEvent: (event: DesktopEvent) => void;
  hooks: {
    onActivity?: () => void;
  };
}

export type RunAgentRuntimeSendPreflightResult =
  | {
    kind: "continue";
    promptContent: string;
    runtimeModel: string;
  }
  | { kind: "handled" };

export class AgentRuntimeSendPreflightController {
  private readonly modelRuntimeRegistry: NonNullable<AgentRuntimeSendPreflightControllerOptions["modelRuntimeRegistry"]>;

  constructor(
    private readonly options: AgentRuntimeSendPreflightControllerOptions,
  ) {
    this.modelRuntimeRegistry = options.modelRuntimeRegistry ?? createDefaultModelRuntimeRegistry();
  }

  resolveMainModelRuntimeProfile(modelId?: string): AmbientModelRuntimeProfile {
    return this.options.features.modelRuntime?.resolveModelRuntimeProfile?.(modelId) ??
      this.options.features.localTextSubagents?.resolveModelRuntimeProfile?.(modelId) ??
      this.modelRuntimeRegistry.resolveProfile(modelId);
  }

  sendInputWithSymphonyParentModeToolCapableModel(
    input: SendMessageInput,
    thread: Pick<ThreadSummary, "model">,
    policy?: SymphonyParentModePolicy | undefined,
  ): SendMessageInput {
    if (!policy) return input;
    const requestedModel = input.model ?? thread.model;
    const profile = this.resolveMainModelRuntimeProfile(requestedModel);
    const toolCapable = profile.toolUse !== "none" && !isLocalTextSubagentProfile(profile);
    if (toolCapable || normalizeAmbientModelId(requestedModel) === normalizeAmbientModelId(AMBIENT_DEFAULT_MODEL)) {
      return input;
    }
    return {
      ...input,
      model: AMBIENT_DEFAULT_MODEL,
    };
  }

  async runBeforePrompt(input: RunAgentRuntimeSendPreflightInput): Promise<RunAgentRuntimeSendPreflightResult> {
    let promptContent = input.promptContent;
    if (input.shouldInjectBootstrap) {
      const variant = (this.options.resolveAgentHarnessVariant ?? resolveAgentHarnessVariant)();
      if (variant.warning) (this.options.warn ?? console.warn)(`[harness] ${variant.warning}`);
      if (variant.enabled) {
        const bootstrap = await (this.options.buildAgentBootstrapContext ?? buildAgentBootstrapContext)({
          workspacePath: input.thread.workspacePath,
          permissionMode: input.thread.permissionMode,
          collaborationMode: input.sendInput.collaborationMode,
          variant,
        });
        promptContent = (this.options.applyAgentBootstrapToPrompt ?? applyAgentBootstrapToPrompt)(
          promptContent,
          bootstrap,
        );
      }
    }

    const featureFlagSnapshotForPrompt = this.options.getFeatureFlagSnapshot();
    const subagentPreflight = input.symphonyParentModePolicy
      ? { kind: "none" as const }
      : explicitSubagentRequestPreflight({
        prompt: input.visibleUserContent,
        thread: input.thread,
        featureFlags: featureFlagSnapshotForPrompt,
        availableToolNames: ambientSubagentRegisteredToolNamesForThread(input.thread, featureFlagSnapshotForPrompt),
      });
    if (subagentPreflight.kind === "blocked") {
      finalizeRuntimeSubagentPreflightBlock({
        threadId: input.sendInput.threadId,
        workspacePath: input.runWorkspacePath,
        message: subagentPreflight.message,
        reason: subagentPreflight.reason,
        addAssistantMessage: (messageInput) => this.options.store.addMessage(messageInput),
        startRun: (runInput) => this.options.store.startRun(runInput),
        setActiveRunId: this.options.setActiveRunId,
        deleteActiveRunId: this.options.deleteActiveRunId,
        finishPlannerFinalizationSources: input.finishPlannerFinalizationSources,
        finishRun: (runId, status, errorMessage) => {
          this.options.store.finishRun(runId, status, errorMessage);
        },
        emitRunEvent: input.emitRunEvent,
        onActivity: input.hooks.onActivity,
      });
      return { kind: "handled" };
    }
    if (subagentPreflight.kind === "ready") {
      promptContent = applyExplicitSubagentRequestGuidance(promptContent, subagentPreflight.guidance);
    }

    const runtimeModel = input.runtimeInput.model ?? input.thread.model;
    const mainModelRuntimeProfile = this.resolveMainModelRuntimeProfile(runtimeModel);
    if (
      !input.symphonyParentModePolicy &&
      this.canUseLocalTextMainRuntime(mainModelRuntimeProfile, input.usesDedicatedReviewSession)
    ) {
      await (this.options.runLocalTextMainRun ?? runAgentRuntimeLocalTextMainRun)({
        input: input.sendInput,
        thread: input.thread,
        promptContent,
        model: mainModelRuntimeProfile,
        hooks: input.hooks,
      }, {
        store: this.options.store,
        runtimeFeature: this.options.features.localTextSubagents,
        fallbackRuntimeManager: this.options.fallbackRuntimeManager,
        readLocalDeepResearchSettings: this.options.features.localDeepResearch?.readSettings,
        localModelHostMemory: this.options.features.localModelHostMemory,
        setActiveRun: this.options.setActiveRun,
        deleteActiveRun: this.options.deleteActiveRun,
        setActiveRunId: this.options.setActiveRunId,
        deleteActiveRunId: this.options.deleteActiveRunId,
        emit: this.options.emit,
        formatRuntimeError: this.options.formatRuntimeError ?? formatAgentRuntimeError,
      });
      return { kind: "handled" };
    }

    return {
      kind: "continue",
      promptContent,
      runtimeModel,
    };
  }

  private canUseLocalTextMainRuntime(
    profile: AmbientModelRuntimeProfile,
    usesDedicatedReviewSession: boolean,
  ): boolean {
    return !usesDedicatedReviewSession &&
      profile.available &&
      profile.selectableAsMain &&
      isLocalTextSubagentProfile(profile) &&
      Boolean(this.options.features.localTextSubagents?.resolveRuntimeForMain);
  }
}
