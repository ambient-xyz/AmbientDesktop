import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import { useAppLocalDeepResearchLifecycle } from "./AppLocalDeepResearchLifecycle";
import { createAppLocalRuntimeActionsForRuntimeState } from "./AppLocalRuntimeActions";
import { createAppMessageVoiceActions } from "./AppMessageVoiceActions";
import type { useAppComposerShellState } from "./AppComposerShellState";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import type { useAppRightPanelState } from "./AppRightPanelState";
import type { useAppRunActivityState } from "./AppRunActivityState";
import { createAppSpeechProviderActionsForRuntimeState } from "./AppSpeechProviderActions";
import { createAppSttComposerActions } from "./AppSttComposerActions";
import { createAppSttMicrophoneActionsForRuntimeState } from "./AppSttMicrophoneActions";
import { useAppVoiceThreadControls } from "./AppVoiceThreadControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";

export type AppProviderRuntimeActionsForAppInput = {
  appendRunActivityLine: (line: string) => void;
  composerShellState: Pick<ReturnType<typeof useAppComposerShellState>, "getComposerDraft" | "setComposerDraft">;
  providerRuntimeState: ReturnType<typeof useAppProviderRuntimeState>;
  resetPromptHistory: () => void;
  resetRunActivityLines: (line: string) => void;
  rightPanelState: Pick<ReturnType<typeof useAppRightPanelState>, "rightPanel">;
  runActivityState: Pick<ReturnType<typeof useAppRunActivityState>, "setRunStatus" | "setThreadRunStatuses">;
  running: boolean;
  setError: (message: string | undefined) => void;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState | undefined;
  workflowRuntimeState: Pick<
    ReturnType<typeof useAppWorkflowRuntimeState>,
    "localRuntimeInventorySettingsRefreshKeyRef" | "setContextError"
  >;
};

export function useAppProviderRuntimeActionsForApp(input: AppProviderRuntimeActionsForAppInput) {
  const {
    appendRunActivityLine,
    composerShellState,
    providerRuntimeState,
    resetPromptHistory,
    resetRunActivityLines,
    rightPanelState,
    runActivityState,
    running,
    setError,
    setState,
    state,
    workflowRuntimeState,
  } = input;

  const voiceThreadControls = useAppVoiceThreadControls({
    activeThreadId: state?.activeThreadId,
    messages: state?.messages,
    messageVoiceStates: state?.messageVoiceStates,
    settings: state?.settings.voice,
    voiceProviders: providerRuntimeState.voiceProviders,
  });

  const speechProviderActions = createAppSpeechProviderActionsForRuntimeState({
    providerRuntimeState,
    state,
    setState,
  });

  const sttMicrophoneActions = createAppSttMicrophoneActionsForRuntimeState({
    providerRuntimeState,
    setupSttProvider: speechProviderActions.setupSttProvider,
    state,
  });

  const localRuntimeActions = createAppLocalRuntimeActionsForRuntimeState(providerRuntimeState);
  useAppLocalDeepResearchLifecycle({
    localDeepResearchSetup: providerRuntimeState.localDeepResearchSetup,
    localRuntimeInventorySettingsRefreshKeyRef: workflowRuntimeState.localRuntimeInventorySettingsRefreshKeyRef,
    panel: rightPanelState.rightPanel,
    setLocalDeepResearchSetup: providerRuntimeState.setLocalDeepResearchSetup,
    setupLocalDeepResearchFromSettings: localRuntimeActions.setupLocalDeepResearchFromSettings,
    workspacePath: state?.workspace.path,
  });

  const sttComposerActions = createAppSttComposerActions({
    activeVoiceMessageId: voiceThreadControls.activeVoiceMessageId,
    appendRunActivityLine,
    getComposerDraft: composerShellState.getComposerDraft,
    resetPromptHistory,
    resetRunActivityLines,
    running,
    setActiveVoiceMessageId: voiceThreadControls.setActiveVoiceMessageId,
    setComposerDraft: composerShellState.setComposerDraft,
    setContextError: workflowRuntimeState.setContextError,
    setError,
    setRunStatus: runActivityState.setRunStatus,
    setSttComposer: providerRuntimeState.setSttComposer,
    setSttDraftMetadata: providerRuntimeState.setSttDraftMetadata,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    state,
    sttComposer: providerRuntimeState.sttComposer,
    sttComposerOperationIdRef: providerRuntimeState.sttComposerOperationIdRef,
    sttComposerRecorderRef: providerRuntimeState.sttComposerRecorderRef,
    sttComposerShortcutActiveRef: providerRuntimeState.sttComposerShortcutActiveRef,
    sttComposerSilenceRef: providerRuntimeState.sttComposerSilenceRef,
    sttComposerThreadRef: providerRuntimeState.sttComposerThreadRef,
    sttProvidersRef: providerRuntimeState.sttProvidersRef,
  });

  const messageVoiceActions = createAppMessageVoiceActions({
    scheduleVoiceProviderRefresh: speechProviderActions.scheduleVoiceProviderRefresh,
    setError,
    setState,
  });

  return {
    voiceThreadControls,
    ...voiceThreadControls,
    speechProviderActions,
    ...speechProviderActions,
    sttMicrophoneActions,
    ...sttMicrophoneActions,
    localRuntimeActions,
    ...localRuntimeActions,
    sttComposerActions,
    ...sttComposerActions,
    messageVoiceActions,
    ...messageVoiceActions,
  };
}
