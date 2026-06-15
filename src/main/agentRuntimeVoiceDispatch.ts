import type { ChatMessage, MessageVoiceState, ProviderStatus, ThreadSummary, VoiceSettings } from "../shared/types";
import { recordVoiceDispatchForMessage } from "./voiceDispatch";
import {
  ambientCliVoiceProviderFromSettings,
  synthesizeQueuedVoiceState as defaultSynthesizeQueuedVoiceState,
  type SynthesizeQueuedVoiceStateInput,
  type VoiceRuntimeStore,
} from "./voiceRuntime";
import type { AmbientCliVoiceRunner } from "./voiceProvider";
import type { WorkspaceMediaUrlInput } from "./workspaceMedia";

export type AgentRuntimeVoiceDispatchStore = VoiceRuntimeStore & {
  getThread(threadId: string): ThreadSummary;
};

export interface AgentRuntimeVoiceDispatchDeps {
  readSettings: () => VoiceSettings | undefined;
  store: AgentRuntimeVoiceDispatchStore;
  voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId: string | undefined) => Promise<string>;
  getProviderStatus: (model: string) => Pick<ProviderStatus, "baseUrl">;
  readAmbientApiKey: () => string | undefined;
  runner: AmbientCliVoiceRunner;
  createMediaUrl?: (input: WorkspaceMediaUrlInput) => string;
  onStateUpdated?: () => void;
  enforceArtifactBudget?: (workspacePath: string) => Promise<void> | void;
  synthesizeQueuedVoiceState?: (input: SynthesizeQueuedVoiceStateInput) => Promise<MessageVoiceState>;
  warn?: (message: string) => void;
}

export function recordAgentRuntimeVoiceDispatch(
  message: ChatMessage,
  deps: AgentRuntimeVoiceDispatchDeps,
): Promise<void> | undefined {
  const settings = deps.readSettings();
  if (!settings?.enabled) return undefined;

  const dispatch = recordVoiceDispatchForMessage({ message, settings, store: deps.store });
  deps.onStateUpdated?.();
  if (!ambientCliVoiceProviderFromSettings(settings)) return undefined;

  const thread = deps.store.getThread(message.threadId);
  const provider = deps.getProviderStatus(thread.model);
  const synthesizeQueuedVoiceState = deps.synthesizeQueuedVoiceState ?? defaultSynthesizeQueuedVoiceState;
  return (async () => {
    await synthesizeQueuedVoiceState({
      workspacePath: thread.workspacePath,
      packageWorkspacePath: await deps.voiceProviderWorkspacePathForCapabilityId(settings.providerCapabilityId),
      state: dispatch.state,
      sourceText: dispatch.decision.kind === "summarize" ? dispatch.decision.sourceText : undefined,
      settings,
      store: deps.store,
      runner: deps.runner,
      createMediaUrl: deps.createMediaUrl,
      summary: {
        model: thread.model,
        apiKey: deps.readAmbientApiKey(),
        baseUrl: provider.baseUrl,
      },
    });
  })()
    .catch((error) => {
      (deps.warn ?? console.warn)(`Ambient voice synthesis failed: ${error instanceof Error ? error.message : String(error)}`);
    })
    .finally(() => {
      deps.onStateUpdated?.();
      void deps.enforceArtifactBudget?.(thread.workspacePath);
    });
}
