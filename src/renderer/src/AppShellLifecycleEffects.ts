import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { AmbientPluginRegistry } from "../../shared/pluginTypes";
import type { WelcomeOnboardingPageKind } from "../../shared/welcomeOnboarding";
import type { SttMicrophoneRecorder } from "./sttMicrophoneRecorder";

export function shouldDisarmComposerModesForCollaborationMode(
  collaborationMode: DesktopState["settings"]["collaborationMode"] | undefined,
): boolean {
  return collaborationMode === "planner";
}

export function shouldDisarmLocalDeepResearchMode(localDeepResearchReady: boolean): boolean {
  return !localDeepResearchReady;
}

export function shouldLoadWelcomePluginRegistry(pageKind: WelcomeOnboardingPageKind | undefined): boolean {
  return pageKind === "plugin_setup";
}

export function useAppSpeechProviderLifecycleEffects({
  activeWorkspacePath,
  loadSttMicrophoneDeviceList,
  loadSttProviders,
  loadVoiceProviders,
  pluginCatalogRevision,
  previousRunningRef,
  running,
  stateAvailable,
}: {
  activeWorkspacePath: string | undefined;
  loadSttMicrophoneDeviceList: () => void | Promise<void>;
  loadSttProviders: (reason: string) => void | Promise<void>;
  loadVoiceProviders: (reason: string) => void | Promise<void>;
  pluginCatalogRevision: number;
  previousRunningRef: MutableRefObject<boolean>;
  running: boolean;
  stateAvailable: boolean;
}): void {
  useEffect(() => {
    if (!stateAvailable) return;
    void loadVoiceProviders("workspace/plugin catalog");
    void loadSttProviders("workspace/plugin catalog");
    void loadSttMicrophoneDeviceList();
  }, [activeWorkspacePath, pluginCatalogRevision]);

  useEffect(() => {
    if (stateAvailable) previousRunningRef.current = running;
  }, [running, activeWorkspacePath, stateAvailable]);
}

export function useAppComposerModeThreadLifecycleEffects({
  activeThreadId,
  collaborationMode,
  setGoalMenuOpen,
  setGoalModeArmed,
  setLocalDeepResearchModeArmed,
}: {
  activeThreadId: string | undefined;
  collaborationMode: DesktopState["settings"]["collaborationMode"] | undefined;
  setGoalMenuOpen: Dispatch<SetStateAction<boolean>>;
  setGoalModeArmed: Dispatch<SetStateAction<boolean>>;
  setLocalDeepResearchModeArmed: (next: boolean) => void;
}): void {
  useEffect(() => {
    setGoalModeArmed(false);
    setGoalMenuOpen(false);
    setLocalDeepResearchModeArmed(false);
  }, [activeThreadId]);

  useEffect(() => {
    if (!shouldDisarmComposerModesForCollaborationMode(collaborationMode)) return;
    setGoalModeArmed(false);
    setLocalDeepResearchModeArmed(false);
  }, [collaborationMode]);
}

export function useAppUnmountCleanupLifecycleEffect({
  goalCompletionCelebrationTimerRef,
  sttComposerRecorderRef,
  sttComposerShortcutActiveRef,
  sttMicRecorderRef,
  sttProviderRefreshTimerRef,
  voiceProviderRefreshTimerRef,
}: {
  goalCompletionCelebrationTimerRef: MutableRefObject<number | undefined>;
  sttComposerRecorderRef: MutableRefObject<SttMicrophoneRecorder | undefined>;
  sttComposerShortcutActiveRef: MutableRefObject<boolean>;
  sttMicRecorderRef: MutableRefObject<SttMicrophoneRecorder | undefined>;
  sttProviderRefreshTimerRef: MutableRefObject<number | undefined>;
  voiceProviderRefreshTimerRef: MutableRefObject<number | undefined>;
}): void {
  useEffect(() => {
    return () => {
      if (voiceProviderRefreshTimerRef.current) window.clearTimeout(voiceProviderRefreshTimerRef.current);
      if (sttProviderRefreshTimerRef.current) window.clearTimeout(sttProviderRefreshTimerRef.current);
      if (goalCompletionCelebrationTimerRef.current) window.clearTimeout(goalCompletionCelebrationTimerRef.current);
      sttMicRecorderRef.current?.cancel();
      sttMicRecorderRef.current = undefined;
      sttComposerRecorderRef.current?.cancel();
      sttComposerRecorderRef.current = undefined;
      sttComposerShortcutActiveRef.current = false;
    };
  }, []);
}

export function useAppWelcomePluginRegistryLifecycleEffect({
  pageKind,
  pluginCatalogRevision,
  setWelcomeAmbientPluginRegistry,
}: {
  pageKind: WelcomeOnboardingPageKind | undefined;
  pluginCatalogRevision: number;
  setWelcomeAmbientPluginRegistry: Dispatch<SetStateAction<AmbientPluginRegistry | undefined>>;
}): void {
  useEffect(() => {
    if (!shouldLoadWelcomePluginRegistry(pageKind)) return;
    let cancelled = false;
    window.ambientDesktop
      .listAmbientPluginRegistry()
      .then((registry) => {
        if (!cancelled) setWelcomeAmbientPluginRegistry(registry);
      })
      .catch(() => {
        if (!cancelled) setWelcomeAmbientPluginRegistry(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [pageKind, pluginCatalogRevision]);
}

export function useAppLocalDeepResearchReadinessLifecycleEffect({
  localDeepResearchReady,
  setLocalDeepResearchModeArmed,
}: {
  localDeepResearchReady: boolean;
  setLocalDeepResearchModeArmed: (next: boolean) => void;
}): void {
  useEffect(() => {
    if (shouldDisarmLocalDeepResearchMode(localDeepResearchReady)) setLocalDeepResearchModeArmed(false);
  }, [localDeepResearchReady]);
}
