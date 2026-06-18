import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { MessageVoiceState } from "../../shared/localRuntimeTypes";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function desktopStateWithMessageVoiceState(
  current: DesktopState,
  voiceState: MessageVoiceState,
): DesktopState {
  return {
    ...current,
    messageVoiceStates: {
      ...current.messageVoiceStates,
      [voiceState.messageId]: voiceState,
    },
  };
}

export function createAppMessageVoiceActions({
  scheduleVoiceProviderRefresh,
  setError,
  setState,
}: {
  scheduleVoiceProviderRefresh: (delayMs?: number, trigger?: string) => void;
  setError: (message: string) => void;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
}): {
  clearMessageVoiceArtifact: (messageId: string) => Promise<void>;
  regenerateMessageVoice: (messageId: string) => Promise<void>;
  revealMessageVoiceArtifact: (messageId: string) => Promise<void>;
} {
  function replaceMessageVoiceState(voiceState: MessageVoiceState): void {
    setState((current) => (current ? desktopStateWithMessageVoiceState(current, voiceState) : current));
  }

  async function regenerateMessageVoice(messageId: string): Promise<void> {
    try {
      const voiceState = await window.ambientDesktop.regenerateMessageVoice({ messageId });
      scheduleVoiceProviderRefresh(150, "voice regeneration");
      replaceMessageVoiceState(voiceState);
    } catch (error) {
      scheduleVoiceProviderRefresh(150, "voice regeneration failed");
      setError(errorMessage(error));
    }
  }

  async function revealMessageVoiceArtifact(messageId: string): Promise<void> {
    try {
      await window.ambientDesktop.revealMessageVoiceArtifact({ messageId });
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function clearMessageVoiceArtifact(messageId: string): Promise<void> {
    try {
      const voiceState = await window.ambientDesktop.clearMessageVoiceArtifact({ messageId });
      replaceMessageVoiceState(voiceState);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return {
    clearMessageVoiceArtifact,
    regenerateMessageVoice,
    revealMessageVoiceArtifact,
  };
}
