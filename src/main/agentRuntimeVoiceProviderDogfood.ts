import type { MessageVoiceState, ThreadSummary, VoiceSettings, WorkspaceState } from "../shared/types";
import {
  synthesizeQueuedVoiceState as defaultSynthesizeQueuedVoiceState,
  type SynthesizeQueuedVoiceStateInput,
} from "./voiceRuntime";
import type { AmbientCliVoiceRunner } from "./voiceProvider";
import type { WorkspaceMediaUrlInput } from "./workspaceMedia";

export interface AgentRuntimeVoiceProviderDogfoodOptions {
  text?: string;
}

export interface AgentRuntimeVoiceProviderDogfoodResult {
  status: "succeeded";
  audioPath?: string;
  mimeType?: string;
  durationMs?: number;
}

export interface AgentRuntimeVoiceProviderDogfoodDeps {
  voiceProviderWorkspacePathForCapabilityId: (providerCapabilityId: string | undefined) => Promise<string>;
  runner: AmbientCliVoiceRunner;
  createMediaUrl?: (input: WorkspaceMediaUrlInput) => string;
  enforceArtifactBudget?: (workspacePath: string) => Promise<void> | void;
  synthesizeQueuedVoiceState?: (input: SynthesizeQueuedVoiceStateInput) => Promise<MessageVoiceState>;
  now?: () => Date;
  nowMs?: () => number;
}

export async function dogfoodAgentRuntimeSelectedVoiceProvider(
  thread: ThreadSummary,
  workspace: WorkspaceState,
  settings: VoiceSettings,
  deps: AgentRuntimeVoiceProviderDogfoodDeps,
  options: AgentRuntimeVoiceProviderDogfoodOptions = {},
): Promise<AgentRuntimeVoiceProviderDogfoodResult> {
  const nowDate = deps.now?.() ?? new Date();
  const now = nowDate.toISOString();
  const messageId = `voice-provider-dogfood-${deps.nowMs?.() ?? Date.now()}`;
  const spokenText = options.text ?? "Ambient voice provider test.";
  const states: MessageVoiceState[] = [];
  const store = {
    setMessageVoiceState(input: Omit<MessageVoiceState, "createdAt" | "updatedAt">): MessageVoiceState {
      const state = { ...input, createdAt: now, updatedAt: (deps.now?.() ?? new Date()).toISOString() };
      states.push(state);
      return state;
    },
  };
  const synthesizeQueuedVoiceState = deps.synthesizeQueuedVoiceState ?? defaultSynthesizeQueuedVoiceState;
  const result = await synthesizeQueuedVoiceState({
    workspacePath: workspace.path,
    packageWorkspacePath: await deps.voiceProviderWorkspacePathForCapabilityId(settings.providerCapabilityId),
    state: {
      messageId,
      threadId: thread.id,
      status: "queued",
      source: "assistant-text",
      sourceMessageId: messageId,
      providerCapabilityId: settings.providerCapabilityId,
      voiceId: settings.voiceId,
      spokenText,
      spokenTextChars: [...spokenText].length,
      sourceTextChars: [...spokenText].length,
      createdAt: now,
      updatedAt: now,
    },
    settings,
    store,
    runner: deps.runner,
    createMediaUrl: deps.createMediaUrl,
  });
  if (result.status !== "ready") {
    throw new Error(`Registered voice provider runtime dogfood failed: ${result.error ?? result.status}`);
  }
  await deps.enforceArtifactBudget?.(workspace.path);
  return {
    status: "succeeded",
    ...(result.audioPath ? { audioPath: result.audioPath } : {}),
    ...(result.mimeType ? { mimeType: result.mimeType } : {}),
    ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
  };
}
