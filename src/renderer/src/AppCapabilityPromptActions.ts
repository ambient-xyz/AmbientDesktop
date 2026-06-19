import type { Dispatch, SetStateAction } from "react";

import type { DesktopState, ProviderCatalogSettingsCard } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import type { VoiceOnboardingHostFacts } from "../../shared/localRuntimeTypes";
import {
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
} from "./pluginUiModel";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const STALE_CREATED_THREAD_STATE_MESSAGE = "Created thread state was superseded before the launch could be applied.";

export type RemoteSurfaceActivationProvider = "telegram" | "signal" | "choose";
export type CapabilityBuilderPromptResult = "sent" | "skipped" | "send-failed";

export function remoteSurfaceActivationActivityLine(provider: RemoteSurfaceActivationProvider): string {
  if (provider === "telegram") return "Remote Ambient Surface Telegram setup sent to Ambient.";
  if (provider === "signal") return "Remote Ambient Surface Signal check sent to Ambient.";
  return "Remote Ambient Surface setup sent to Ambient.";
}

export function threadRunStatusesWithStarting(
  statuses: Record<string, RunStatus>,
  threadId: string,
): Record<string, RunStatus> {
  return { ...statuses, [threadId]: "starting" };
}

export function createAppCapabilityPromptActions({
  applyCreatedThreadState,
  resetPromptHistory,
  resetRunActivityLines,
  running,
  setContextAttachments,
  setContextError,
  setError,
  setRunStatus,
  setThreadRunStatuses,
  state,
}: {
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => boolean;
  resetPromptHistory: () => void;
  resetRunActivityLines: (initialText?: string, threadId?: string) => void;
  running: boolean;
  setContextAttachments: Dispatch<SetStateAction<WorkspaceContextReference[]>>;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setError: (message: string | undefined) => void;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state: DesktopState | undefined;
}): {
  sendRemoteSurfaceActivationPrompt: (prompt: string) => Promise<void>;
  sendTelegramSessionSetupPrompt: (prompt: string) => Promise<void>;
  sendToolActionPrompt: (prompt: string, activityLine: string) => Promise<void>;
  sendToolActionPromptForState: (targetState: DesktopState, threadId: string, prompt: string, activityLine: string) => Promise<void>;
  startCapabilityBuilderPrompt: (prompt: string, newChat: boolean, activityLine?: string) => Promise<CapabilityBuilderPromptResult>;
  startWelcomeFirstRunCapabilityOnboarding: () => Promise<CapabilityBuilderPromptResult>;
  startWelcomeProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => Promise<CapabilityBuilderPromptResult>;
  startWelcomeRemoteSurfaceActivation: (provider: RemoteSurfaceActivationProvider) => Promise<CapabilityBuilderPromptResult>;
} {
  async function sendToolActionPromptForState(targetState: DesktopState, threadId: string, prompt: string, activityLine: string): Promise<void> {
    if (running || !prompt.trim()) return;
    setError(undefined);
    setContextError(undefined);
    setContextAttachments([]);
    resetPromptHistory();
    resetRunActivityLines(activityLine);
    setRunStatus("starting");
    setThreadRunStatuses((statuses) => threadRunStatusesWithStarting(statuses, threadId));
    await window.ambientDesktop
      .sendMessage({
        threadId,
        content: prompt,
        permissionMode: targetState.settings.permissionMode,
        collaborationMode: targetState.settings.collaborationMode,
        model: targetState.settings.model,
        thinkingLevel: targetState.settings.thinkingLevel,
        delivery: "prompt",
      })
      .catch((err) => {
        setError(errorMessage(err));
        setRunStatus("error");
      });
  }

  async function sendToolActionPrompt(prompt: string, activityLine: string): Promise<void> {
    if (!state) return;
    await sendToolActionPromptForState(state, state.activeThreadId, prompt, activityLine);
  }

  async function sendTelegramSessionSetupPrompt(prompt: string): Promise<void> {
    await sendToolActionPrompt(prompt, "Telegram setup action sent to Ambient.");
  }

  async function sendRemoteSurfaceActivationPrompt(prompt: string): Promise<void> {
    await sendToolActionPrompt(prompt, "Remote Ambient Surface action sent to Ambient.");
  }

  async function startCapabilityBuilderPrompt(prompt: string, newChat: boolean, activityLine = "Capability Builder prompt sent to Ambient."): Promise<CapabilityBuilderPromptResult> {
    if (!state || running || !prompt.trim()) return "skipped";
    let promptTargetApplied = !newChat;
    setError(undefined);
    setContextError(undefined);
    try {
      let targetState = state;
      if (newChat) {
        const previousWorkspacePath = state.activeWorkspace.path;
        targetState = await window.ambientDesktop.createThread({
          permissionMode: state.settings.permissionMode,
          collaborationMode: state.settings.collaborationMode,
          model: state.settings.model,
          thinkingLevel: state.settings.thinkingLevel,
          workspacePath: state.workspace.path,
        });
        if (!applyCreatedThreadState(targetState, previousWorkspacePath)) {
          setError(STALE_CREATED_THREAD_STATE_MESSAGE);
          return "skipped";
        }
        promptTargetApplied = true;
      }
      resetPromptHistory();
      setContextAttachments([]);
      resetRunActivityLines(activityLine);
      setRunStatus("starting");
      setThreadRunStatuses((statuses) => threadRunStatusesWithStarting(statuses, targetState.activeThreadId));
      await window.ambientDesktop.sendMessage({
        threadId: targetState.activeThreadId,
        content: prompt,
        permissionMode: targetState.settings.permissionMode,
        collaborationMode: targetState.settings.collaborationMode,
        model: targetState.settings.model,
        thinkingLevel: targetState.settings.thinkingLevel,
        delivery: "prompt",
        context: [],
      });
      return "sent";
    } catch (err) {
      setError(errorMessage(err));
      if (promptTargetApplied) setRunStatus("error");
      return promptTargetApplied ? "send-failed" : "skipped";
    }
  }

  async function voiceOnboardingHostFacts(): Promise<VoiceOnboardingHostFacts | undefined> {
    try {
      return await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      return undefined;
    }
  }

  async function startWelcomeProviderCatalogCardOnboarding(card: ProviderCatalogSettingsCard): Promise<CapabilityBuilderPromptResult> {
    if (running) return "skipped";
    const hostFacts = await voiceOnboardingHostFacts();
    return startCapabilityBuilderPrompt(buildProviderCatalogCardOnboardingPrompt(card, hostFacts), true);
  }

  async function startWelcomeFirstRunCapabilityOnboarding(): Promise<CapabilityBuilderPromptResult> {
    if (running || !state) return "skipped";
    const hostFacts = await voiceOnboardingHostFacts();
    return startCapabilityBuilderPrompt(buildFirstRunCapabilityOnboardingPrompt(hostFacts, state.providerCatalog.cards), true);
  }

  async function startWelcomeRemoteSurfaceActivation(provider: RemoteSurfaceActivationProvider): Promise<CapabilityBuilderPromptResult> {
    if (running) return "skipped";
    return startCapabilityBuilderPrompt(buildRemoteSurfaceActivationPrompt(provider), true, remoteSurfaceActivationActivityLine(provider));
  }

  return {
    sendRemoteSurfaceActivationPrompt,
    sendTelegramSessionSetupPrompt,
    sendToolActionPrompt,
    sendToolActionPromptForState,
    startCapabilityBuilderPrompt,
    startWelcomeFirstRunCapabilityOnboarding,
    startWelcomeProviderCatalogCardOnboarding,
    startWelcomeRemoteSurfaceActivation,
  };
}
