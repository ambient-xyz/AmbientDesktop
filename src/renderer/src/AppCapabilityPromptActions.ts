import type { Dispatch, SetStateAction } from "react";

import type {
  DesktopState,
  ProviderCatalogSettingsCard,
  RunStatus,
  WorkspaceContextReference,
} from "../../shared/types";
import type { VoiceOnboardingHostFacts } from "../../shared/localRuntimeTypes";
import {
  buildFirstRunCapabilityOnboardingPrompt,
  buildProviderCatalogCardOnboardingPrompt,
  buildRemoteSurfaceActivationPrompt,
} from "./pluginUiModel";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type RemoteSurfaceActivationProvider = "telegram" | "signal" | "choose";

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
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => void;
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
  startCapabilityBuilderPrompt: (prompt: string, newChat: boolean, activityLine?: string) => Promise<void>;
  startWelcomeFirstRunCapabilityOnboarding: () => Promise<void>;
  startWelcomeProviderCatalogCardOnboarding: (card: ProviderCatalogSettingsCard) => Promise<void>;
  startWelcomeRemoteSurfaceActivation: (provider: RemoteSurfaceActivationProvider) => Promise<void>;
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

  async function startCapabilityBuilderPrompt(prompt: string, newChat: boolean, activityLine = "Capability Builder prompt sent to Ambient."): Promise<void> {
    if (!state || running || !prompt.trim()) return;
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
        applyCreatedThreadState(targetState, previousWorkspacePath);
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
    } catch (err) {
      setError(errorMessage(err));
      setRunStatus("error");
    }
  }

  async function voiceOnboardingHostFacts(): Promise<VoiceOnboardingHostFacts | undefined> {
    try {
      return await window.ambientDesktop.getVoiceOnboardingHostFacts();
    } catch {
      return undefined;
    }
  }

  async function startWelcomeProviderCatalogCardOnboarding(card: ProviderCatalogSettingsCard): Promise<void> {
    if (running) return;
    const hostFacts = await voiceOnboardingHostFacts();
    await startCapabilityBuilderPrompt(buildProviderCatalogCardOnboardingPrompt(card, hostFacts), true);
  }

  async function startWelcomeFirstRunCapabilityOnboarding(): Promise<void> {
    if (running || !state) return;
    const hostFacts = await voiceOnboardingHostFacts();
    await startCapabilityBuilderPrompt(buildFirstRunCapabilityOnboardingPrompt(hostFacts, state.providerCatalog.cards), true);
  }

  async function startWelcomeRemoteSurfaceActivation(provider: RemoteSurfaceActivationProvider): Promise<void> {
    if (running) return;
    await startCapabilityBuilderPrompt(buildRemoteSurfaceActivationPrompt(provider), true, remoteSurfaceActivationActivityLine(provider));
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
