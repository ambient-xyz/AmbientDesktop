import type { DesktopEvent, SendMessageInput } from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { resolveAmbientModelRuntimeProfile } from "../../shared/ambientModels";
import type {
  AgentRuntimeActiveRunHandoffController,
  AgentRuntimeActiveRunHandoffActiveRun,
} from "./agentRuntimeActiveRunHandoffController";
import type { AgentRuntimeImageInputResolution } from "./agentRuntimeImageInputs";
import { resolveAgentRuntimeImageInputs } from "./agentRuntimeImageInputs";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import type {
  AgentRuntimeSendPreparationController,
  RuntimeSendLoopContext,
  RuntimeSendMessageInput,
} from "./agentRuntimeSendPreparationController";
import type { AgentRuntimeSendPreflightController } from "./agentRuntimeSendPreflightController";
import {
  carrySymphonyParentModePolicy,
  resolveSymphonyParentModePolicyForRuntimeSend,
  type SymphonyParentModePolicy,
} from "./agentRuntimeSymphonyParentMode";
import { createRuntimeRunEventScope, type RuntimeRunEventScope } from "./runtimeRunEventScope";

export interface AgentRuntimeSendStartHooks {
  onActivity?: () => void;
  awaitQueuedDeliveryCompletion?: boolean;
}

export interface AgentRuntimeSendStartContextInput {
  input: SendMessageInput;
  hooks?: AgentRuntimeSendStartHooks | undefined;
  activeRuns: {
    get(threadId: string): AgentRuntimeActiveRunHandoffActiveRun | undefined;
  };
  activeRunHandoff: Pick<AgentRuntimeActiveRunHandoffController, "handleSendActiveRunHandoff">;
  sendPreparation: Pick<AgentRuntimeSendPreparationController, "prepareRuntimeSendLoopContext">;
  sendPreflight: Pick<
    AgentRuntimeSendPreflightController,
    "runBeforePrompt" | "sendInputWithSymphonyParentModeToolCapableModel"
  >;
  store: Pick<ProjectStore, "finishPlannerPlanFinalizationAttempt" | "getThread" | "getWorkspace">;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  emit: (event: DesktopEvent) => void;
}

export interface AgentRuntimeSendStartContext {
  runtimeInput: RuntimeSendMessageInput;
  sendInputWithSymphonyParentModePolicy: SendMessageInput;
  usesDedicatedReviewSession: boolean;
  visibleUserContent: string;
  hasWorkflowPlanEditIntent: boolean;
  thread: ThreadSummary;
  plannerFinalizationSources: PlannerPlanArtifact[];
  runWorkspacePath: string;
  piPreStreamTimeoutMs: number;
  piStreamIdleTimeoutMs: number;
  defaultToolExecutionIdleTimeoutMs: number;
  emptyAssistantStallTimeoutMs: number;
  promptContent: string;
  retrySourceUserMessageId?: string | undefined;
  activeAssistantFinalizationRetry?: RuntimeSendLoopContext["activeAssistantFinalizationRetry"];
  assistantFinalizationRetryMaxRetries: number;
  interruptedToolCallRecoveryMaxRetries: number;
  interruptedToolCallRecoveryAttemptsUsed: number;
  canScheduleInterruptedToolCallRecovery: boolean;
  symphonyParentModePolicy?: SymphonyParentModePolicy | undefined;
  promptImageInputs: AgentRuntimeImageInputResolution;
  runEventScope: RuntimeRunEventScope;
  runtimeModel: string;
}

export type AgentRuntimeSendStartContextResult =
  | { kind: "handled" }
  | {
    kind: "continue";
    context: AgentRuntimeSendStartContext;
  };

export async function prepareAgentRuntimeSendStartContext(
  input: AgentRuntimeSendStartContextInput,
): Promise<AgentRuntimeSendStartContextResult> {
  const hooks = input.hooks ?? {};
  const incomingRuntimeInput = input.input as RuntimeSendMessageInput;
  const activeRun = input.activeRuns.get(input.input.threadId);
  const activeRunHandoffHandled = await input.activeRunHandoff.handleSendActiveRunHandoff(input.input, activeRun, hooks);
  if (activeRunHandoffHandled) return { kind: "handled" };

  const initialThread = input.store.getThread(input.input.threadId);
  const initialSymphonyParentModePolicy = resolveSymphonyParentModePolicyForRuntimeSend({
    thread: initialThread,
    composerIntent: incomingRuntimeInput.composerIntent,
    carriedPolicy: incomingRuntimeInput.symphonyParentModePolicy,
    featureFlagSnapshot: input.getFeatureFlagSnapshot(),
  });
  const sendLoopInput = input.sendPreflight.sendInputWithSymphonyParentModeToolCapableModel(
    input.input,
    initialThread,
    initialSymphonyParentModePolicy,
  );
  const sendLoop = input.sendPreparation.prepareRuntimeSendLoopContext(sendLoopInput);
  let { promptContent } = sendLoop;
  const {
    runtimeInput,
    usesDedicatedReviewSession,
    visibleUserContent,
    hasWorkflowPlanEditIntent,
    thread,
    plannerFinalizationSources,
    runWorkspacePath,
    piPreStreamTimeoutMs,
    piStreamIdleTimeoutMs,
    defaultToolExecutionIdleTimeoutMs,
    emptyAssistantStallTimeoutMs,
    retrySourceUserMessageId,
    shouldInjectBootstrap,
    activeAssistantFinalizationRetry,
    assistantFinalizationRetryMaxRetries,
    interruptedToolCallRecoveryMaxRetries,
    interruptedToolCallRecoveryAttemptsUsed,
    canScheduleInterruptedToolCallRecovery,
  } = sendLoop;
  const symphonyParentModePolicy = resolveSymphonyParentModePolicyForRuntimeSend({
    thread,
    composerIntent: runtimeInput.composerIntent,
    carriedPolicy: runtimeInput.symphonyParentModePolicy,
    featureFlagSnapshot: input.getFeatureFlagSnapshot(),
  });
  const sendInputWithSymphonyParentModePolicy = carrySymphonyParentModePolicy(
    runtimeInput,
    symphonyParentModePolicy,
  );
  const promptImageInputs = await resolveAgentRuntimeImageInputs({
    sendInput: runtimeInput,
    workspacePath: thread.workspacePath,
    modelProfile: resolveAmbientModelRuntimeProfile(thread.model),
  });
  const runEventScope = createRuntimeRunEventScope({
    runWorkspacePath,
    plannerFinalizationSources,
    getCurrentWorkspacePath: () => input.store.getWorkspace().path,
    emit: input.emit,
    finishPlannerPlanFinalizationAttempt: (artifactId, finalizationInput) =>
      input.store.finishPlannerPlanFinalizationAttempt(artifactId, finalizationInput),
    onActivity: hooks.onActivity,
  });
  const {
    emitRunEvent,
    finishPlannerFinalizationSources,
  } = runEventScope;

  const sendPreflight = await input.sendPreflight.runBeforePrompt({
    sendInput: input.input,
    runtimeInput,
    thread,
    visibleUserContent,
    promptContent,
    usesDedicatedReviewSession,
    shouldInjectBootstrap,
    symphonyParentModePolicy,
    runWorkspacePath,
    finishPlannerFinalizationSources,
    emitRunEvent,
    hooks,
  });
  if (sendPreflight.kind === "handled") return { kind: "handled" };
  promptContent = sendPreflight.promptContent;

  return {
    kind: "continue",
    context: {
      runtimeInput,
      sendInputWithSymphonyParentModePolicy,
      usesDedicatedReviewSession,
      visibleUserContent,
      hasWorkflowPlanEditIntent,
      thread,
      plannerFinalizationSources,
      runWorkspacePath,
      piPreStreamTimeoutMs,
      piStreamIdleTimeoutMs,
      defaultToolExecutionIdleTimeoutMs,
      emptyAssistantStallTimeoutMs,
      promptContent,
      retrySourceUserMessageId,
      activeAssistantFinalizationRetry,
      assistantFinalizationRetryMaxRetries,
      interruptedToolCallRecoveryMaxRetries,
      interruptedToolCallRecoveryAttemptsUsed,
      canScheduleInterruptedToolCallRecovery,
      symphonyParentModePolicy,
      promptImageInputs,
      runEventScope,
      runtimeModel: sendPreflight.runtimeModel,
    },
  };
}
