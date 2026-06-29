import type { SendMessageInput } from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot } from "../../shared/featureFlags";
import type { MessageDelivery } from "../../shared/threadTypes";
import {
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import { resolveAgentRuntimeImageInputs } from "./agentRuntimeImageInputs";
import type { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { agentRuntimeUserMessageMetadata } from "./agentRuntimeUserMessageMetadata";
import {
  hasRuntimeThreadSettingsUpdate,
  runtimeThreadSettingsUpdateFromSendInput,
} from "./agentRuntimeThreadSettingsUpdate";
import {
  handleRuntimeActiveRunHandoff,
  type RuntimeActiveRunHandoffActiveRun,
  type RuntimeActiveRunHandoffHooks,
} from "./runtimeActiveRunHandoff";
import type { RuntimeQueuedMessageSnapshot } from "./runtimeQueuedMessageController";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import {
  resolveSymphonyParentModePolicyForRuntimeSend,
  shouldRejectSymphonyParentModeActiveRunHandoff,
  SYMPHONY_PARENT_MODE_ACTIVE_RUN_HANDOFF_ERROR,
} from "./agentRuntimeSymphonyParentMode";

export interface AgentRuntimeActiveRunHandoffActiveRun extends RuntimeActiveRunHandoffActiveRun {
  queue: (message: RuntimeQueuedMessageSnapshot) => Promise<void>;
}

export interface AgentRuntimeActiveRunHandoffControllerOptions {
  store: Pick<ProjectStore, "addMessage" | "getThread" | "markThreadRead" | "updateThreadSettings">;
  getFeatureFlagSnapshot: () => AmbientFeatureFlagSnapshot;
  applyThreadModelSettings: (threadId: string) => Promise<unknown>;
  resolveModelRuntimeProfile?: (modelId?: string) => AmbientModelRuntimeProfile;
  modelContentForSendInput: (input: SendMessageInput) => string;
  emit: (event: { type: "message-created"; message: ReturnType<ProjectStore["addMessage"]> } | { type: "thread-updated"; thread: ReturnType<ProjectStore["markThreadRead"]> }) => void;
}

export class AgentRuntimeActiveRunHandoffController {
  constructor(private readonly options: AgentRuntimeActiveRunHandoffControllerOptions) {}

  async handleSendActiveRunHandoff<ActiveRun extends AgentRuntimeActiveRunHandoffActiveRun>(
    input: SendMessageInput,
    activeRun: ActiveRun | undefined,
    hooks: RuntimeActiveRunHandoffHooks = {},
  ): Promise<boolean> {
    const runtimeInput = input as RuntimeSendMessageInput;
    if (activeRun) this.assertActiveRunHandoffAllowed(input, runtimeInput);
    return handleRuntimeActiveRunHandoff({
      sendInput: input,
      incomingDedicatedSessionKind: runtimeInput.dedicatedSessionKind,
      activeRun,
      hooks,
      queueDuringRun: (queuedInput, run, delivery) => this.queueDuringRun(queuedInput, run, delivery),
    });
  }

  private assertActiveRunHandoffAllowed(input: SendMessageInput, runtimeInput: RuntimeSendMessageInput): void {
    const thread = this.options.store.getThread(input.threadId);
    const incomingSymphonyParentModePolicy = resolveSymphonyParentModePolicyForRuntimeSend({
      thread,
      composerIntent: runtimeInput.composerIntent,
      carriedPolicy: runtimeInput.symphonyParentModePolicy,
      featureFlagSnapshot: this.options.getFeatureFlagSnapshot(),
    });
    if (shouldRejectSymphonyParentModeActiveRunHandoff({
      activeRunPresent: true,
      policy: incomingSymphonyParentModePolicy,
    })) {
      throw new Error(SYMPHONY_PARENT_MODE_ACTIVE_RUN_HANDOFF_ERROR);
    }
  }

  private async queueDuringRun<ActiveRun extends AgentRuntimeActiveRunHandoffActiveRun>(
    input: SendMessageInput,
    activeRun: ActiveRun,
    delivery: Exclude<MessageDelivery, "prompt">,
  ): Promise<void> {
    const runtimeInput = input as RuntimeSendMessageInput;
    const threadSettingsUpdate = runtimeThreadSettingsUpdateFromSendInput(input);
    const thread = hasRuntimeThreadSettingsUpdate(threadSettingsUpdate)
      ? this.options.store.updateThreadSettings(input.threadId, threadSettingsUpdate)
      : this.options.store.getThread(input.threadId);
    if (input.model !== undefined) await this.options.applyThreadModelSettings(input.threadId);
    const imageInputs = await resolveAgentRuntimeImageInputs({
      sendInput: input,
      workspacePath: thread.workspacePath,
      modelProfile: this.options.resolveModelRuntimeProfile?.(thread.model) ?? resolveAmbientModelRuntimeProfile(thread.model),
    });
    const queuedMessage = this.options.store.addMessage({
      threadId: input.threadId,
      role: "user",
      content: input.content,
      metadata: agentRuntimeUserMessageMetadata(input, {
        delivery,
        dedicatedSessionKind: runtimeInput.dedicatedSessionKind,
        includeWorkflowRecordingEditContext: false,
      }),
    });
    this.options.emit({ type: "message-created", message: queuedMessage });
    this.options.emit({ type: "thread-updated", thread: this.options.store.markThreadRead(input.threadId) });
    await activeRun.queue({
      id: queuedMessage.id,
      content: input.content,
      modelContent: runtimeInput.modelContentOverride ?? this.options.modelContentForSendInput(input),
      context: input.context,
      workflowThreadId: input.workflowThreadId,
      stt: input.stt,
      ...(imageInputs.images.length ? { imageInputs: imageInputs.images } : {}),
      delivery,
      status: "queued",
    });
  }
}
