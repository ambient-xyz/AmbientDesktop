import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { DesktopEvent, DesktopState } from "../../shared/desktopTypes";
import type { RunStatus } from "../../shared/threadTypes";
import { RUN_ABORT_ARM_DELAY_MS } from "../../shared/runStatus";
import { applyDocumentAppearance } from "./appearance";
import { useAppMessageScrollControls } from "./AppMessageScrollControls";
import { useAppRunActivityControls } from "./AppRunActivity";
import {
  useAppComposerModeThreadLifecycleEffects,
  useAppSpeechProviderLifecycleEffects,
  useAppUnmountCleanupLifecycleEffect,
  useAppWelcomePluginRegistryLifecycleEffect,
} from "./AppShellLifecycleEffects";
import { useAppShellGlobalEffects } from "./AppShellGlobalEffects";
import { appBootstrapRunStatus, useAppStartupLifecycleEffects } from "./AppStartupLifecycleEffects";
import { useAppStatusSubscriptions } from "./AppStatusSubscriptions";
import { useAppSttLifecycleEffects } from "./AppSttLifecycleEffects";
import { useAppThreadLifecycleEffects } from "./AppThreadLifecycleEffects";
import { welcomeOnboardingPageKindForMessages } from "./welcomeSetupUiModel";

type StartupOptions = Parameters<typeof useAppStartupLifecycleEffects>[0];
type SpeechProviderOptions = Parameters<typeof useAppSpeechProviderLifecycleEffects>[0];
type SttLifecycleOptions = Parameters<typeof useAppSttLifecycleEffects>[0];
type ComposerModeOptions = Parameters<typeof useAppComposerModeThreadLifecycleEffects>[0];
type UnmountCleanupOptions = Parameters<typeof useAppUnmountCleanupLifecycleEffect>[0];
type ShellGlobalOptions = Parameters<typeof useAppShellGlobalEffects>[0];
type MessageScrollOptions = Parameters<typeof useAppMessageScrollControls>[0];
type MessageScrollControls = ReturnType<typeof useAppMessageScrollControls>;
type ThreadLifecycleOptions = Parameters<typeof useAppThreadLifecycleEffects>[0];
type RunActivityOptions = Parameters<typeof useAppRunActivityControls>[0];
type RunActivityControls = ReturnType<typeof useAppRunActivityControls>;
type StatusSubscriptionOptions = Parameters<typeof useAppStatusSubscriptions>[0];

export interface AppCoreLifecycleControlsOptions {
  state: DesktopState | undefined;
  running: boolean;
  activeRunActivityLines: MessageScrollOptions["activeRunActivityLines"];
  loadPendingPermissionRequests: StartupOptions["loadPendingPermissionRequests"];
  loadPermissionAudit: StartupOptions["loadPermissionAudit"];
  loadPermissionGrants: StartupOptions["loadPermissionGrants"];
  mcpContainerRuntimeStartupCheckRef: StartupOptions["mcpContainerRuntimeStartupCheckRef"];
  rememberDesktopState: (next: DesktopState) => DesktopState | false;
  handleEvent: (event: DesktopEvent) => void;
  openMcpRuntimeSettings: StartupOptions["openMcpRuntimeSettings"];
  permissionAuditRevision: StartupOptions["permissionAuditRevision"];
  setError: (error: string) => void;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  loadSttMicrophoneDeviceList: SpeechProviderOptions["loadSttMicrophoneDeviceList"];
  loadSttProviders: SpeechProviderOptions["loadSttProviders"];
  loadVoiceProviders: SpeechProviderOptions["loadVoiceProviders"];
  pluginCatalogRevision: SpeechProviderOptions["pluginCatalogRevision"];
  previousRunningRef: SpeechProviderOptions["previousRunningRef"];
  cancelSttComposerRecording: SttLifecycleOptions["cancelSttComposerRecording"];
  startSttComposerRecording: SttLifecycleOptions["startSttComposerRecording"];
  stopSttComposerRecording: SttLifecycleOptions["stopSttComposerRecording"];
  sttComposerRecorderRef: SttLifecycleOptions["sttComposerRecorderRef"];
  sttComposerShortcutActiveRef: SttLifecycleOptions["sttComposerShortcutActiveRef"];
  sttComposerStatus: SttLifecycleOptions["sttComposerStatus"];
  sttComposerThreadRef: SttLifecycleOptions["sttComposerThreadRef"];
  setGoalMenuOpen: ComposerModeOptions["setGoalMenuOpen"];
  setGoalModeArmed: ComposerModeOptions["setGoalModeArmed"];
  setLocalDeepResearchModeArmed: ComposerModeOptions["setLocalDeepResearchModeArmed"];
  goalCompletionCelebrationTimerRef: UnmountCleanupOptions["goalCompletionCelebrationTimerRef"];
  sttMicRecorderRef: UnmountCleanupOptions["sttMicRecorderRef"];
  sttProviderRefreshTimerRef: UnmountCleanupOptions["sttProviderRefreshTimerRef"];
  voiceProviderRefreshTimerRef: UnmountCleanupOptions["voiceProviderRefreshTimerRef"];
  chatFindInputRef: ShellGlobalOptions["chatFindInputRef"];
  contextMenusOpen: ShellGlobalOptions["contextMenusOpen"];
  closeContextMenus: ShellGlobalOptions["onCloseContextMenus"];
  setChatFindOpen: ShellGlobalOptions["setChatFindOpen"];
  setCommandPaletteOpen: ShellGlobalOptions["setCommandPaletteOpen"];
  setCommandPaletteQuery: ShellGlobalOptions["setCommandPaletteQuery"];
  setSidebarAgeNow: ShellGlobalOptions["setSidebarAgeNow"];
  setSidebarWidth: ShellGlobalOptions["setSidebarWidth"];
  activeThreadIdRef: MessageScrollOptions["activeThreadIdRef"] & ThreadLifecycleOptions["activeThreadIdRef"];
  chatBrowserUserActionId: MessageScrollOptions["chatBrowserUserActionId"];
  chatBrowserUserActionStatus: MessageScrollOptions["chatBrowserUserActionStatus"];
  setWelcomeAmbientPluginRegistry: Parameters<typeof useAppWelcomePluginRegistryLifecycleEffect>[0]["setWelcomeAmbientPluginRegistry"];
  activeProjectRootRef: ThreadLifecycleOptions["activeProjectRootRef"];
  errorScope: ThreadLifecycleOptions["errorScope"];
  messageKindsRef: ThreadLifecycleOptions["messageKindsRef"];
  resetPromptHistory: ThreadLifecycleOptions["resetPromptHistory"];
  setAutomationFolders: ThreadLifecycleOptions["setAutomationFolders"];
  setContextAttachments: ThreadLifecycleOptions["setContextAttachments"];
  setContextError: ThreadLifecycleOptions["setContextError"];
  setErrorScope: ThreadLifecycleOptions["setErrorScope"];
  setErrorState: ThreadLifecycleOptions["setErrorState"];
  setWorkflowAgentFolders: ThreadLifecycleOptions["setWorkflowAgentFolders"];
  thinkingDeltaBuffersRef: ThreadLifecycleOptions["thinkingDeltaBuffersRef"] & RunActivityOptions["thinkingDeltaBuffersRef"];
  workspaceProjectAliasesRef: ThreadLifecycleOptions["workspaceProjectAliasesRef"];
  runActivityCounterRef: RunActivityOptions["runActivityCounterRef"];
  runActivityHeartbeatIndexRef: RunActivityOptions["runActivityHeartbeatIndexRef"] &
    StatusSubscriptionOptions["runActivityHeartbeatIndexRef"];
  runActivityLastEventAtRef: RunActivityOptions["runActivityLastEventAtRef"] & StatusSubscriptionOptions["runActivityLastEventAtRef"];
  runActivityLinesByThreadRef: RunActivityOptions["runActivityLinesByThreadRef"];
  setRetryStatsByThread: RunActivityOptions["setRetryStatsByThread"];
  setRunActivityLinesByThread: RunActivityOptions["setRunActivityLinesByThread"];
  threadRunStatuses: StatusSubscriptionOptions["threadRunStatuses"];
  chatBrowserUserAction: StatusSubscriptionOptions["chatBrowserUserAction"];
  browserRevision: StatusSubscriptionOptions["browserRevision"];
  workspaceRevision: StatusSubscriptionOptions["workspaceRevision"];
  setChatBrowserUserAction: StatusSubscriptionOptions["setChatBrowserUserAction"];
  setRightPanel: StatusSubscriptionOptions["setRightPanel"];
  setAbortArmed: StatusSubscriptionOptions["setAbortArmed"];
  setGitStatus: StatusSubscriptionOptions["setGitStatus"];
  setGitStatusError: StatusSubscriptionOptions["setGitStatusError"];
  setActiveGitReview: StatusSubscriptionOptions["setActiveGitReview"];
  setActiveGitReviewError: StatusSubscriptionOptions["setActiveGitReviewError"];
}

export type AppCoreLifecycleControls = MessageScrollControls &
  RunActivityControls & {
    activeWelcomeOnboardingPageKind: ReturnType<typeof welcomeOnboardingPageKindForMessages>;
  };

export function useAppCoreLifecycleControls({
  activeProjectRootRef,
  activeRunActivityLines,
  activeThreadIdRef,
  browserRevision,
  cancelSttComposerRecording,
  chatBrowserUserAction,
  chatBrowserUserActionId,
  chatBrowserUserActionStatus,
  chatFindInputRef,
  closeContextMenus,
  contextMenusOpen,
  errorScope,
  goalCompletionCelebrationTimerRef,
  handleEvent,
  loadPendingPermissionRequests,
  loadPermissionAudit,
  loadPermissionGrants,
  loadSttMicrophoneDeviceList,
  loadSttProviders,
  loadVoiceProviders,
  mcpContainerRuntimeStartupCheckRef,
  messageKindsRef,
  openMcpRuntimeSettings,
  permissionAuditRevision,
  pluginCatalogRevision,
  previousRunningRef,
  rememberDesktopState,
  resetPromptHistory,
  runActivityCounterRef,
  runActivityHeartbeatIndexRef,
  runActivityLastEventAtRef,
  runActivityLinesByThreadRef,
  running,
  setAbortArmed,
  setActiveGitReview,
  setActiveGitReviewError,
  setAutomationFolders,
  setChatBrowserUserAction,
  setChatFindOpen,
  setCommandPaletteOpen,
  setCommandPaletteQuery,
  setContextAttachments,
  setContextError,
  setError,
  setErrorScope,
  setErrorState,
  setGitStatus,
  setGitStatusError,
  setGoalMenuOpen,
  setGoalModeArmed,
  setLocalDeepResearchModeArmed,
  setRetryStatsByThread,
  setRightPanel,
  setRunActivityLinesByThread,
  setRunStatus,
  setSidebarAgeNow,
  setSidebarWidth,
  setState,
  setThreadRunStatuses,
  setWelcomeAmbientPluginRegistry,
  setWorkflowAgentFolders,
  startSttComposerRecording,
  state,
  stopSttComposerRecording,
  sttComposerRecorderRef,
  sttComposerShortcutActiveRef,
  sttComposerStatus,
  sttComposerThreadRef,
  sttMicRecorderRef,
  sttProviderRefreshTimerRef,
  thinkingDeltaBuffersRef,
  threadRunStatuses,
  voiceProviderRefreshTimerRef,
  workspaceProjectAliasesRef,
  workspaceRevision,
}: AppCoreLifecycleControlsOptions): AppCoreLifecycleControls {
  useAppStartupLifecycleEffects({
    loadPendingPermissionRequests,
    loadPermissionAudit,
    loadPermissionGrants,
    mcpContainerRuntimeStartupCheckRef,
    onBootstrapError: (err) => setError(String(err)),
    onBootstrapState: (next) => {
      const nextState = rememberDesktopState(next);
      if (!nextState) return;
      applyDocumentAppearance(nextState.appearance);
      setThreadRunStatuses(nextState.threadRunStatuses ?? {});
      setRunStatus(appBootstrapRunStatus(nextState));
      setState(nextState);
    },
    onDesktopEvent: handleEvent,
    openMcpRuntimeSettings,
    permissionAuditRevision,
    state,
  });

  useAppSpeechProviderLifecycleEffects({
    activeWorkspacePath: state?.activeWorkspace.path,
    loadSttMicrophoneDeviceList,
    loadSttProviders,
    loadVoiceProviders,
    pluginCatalogRevision,
    previousRunningRef,
    running,
    stateAvailable: Boolean(state),
  });

  useAppSttLifecycleEffects({
    cancelSttComposerRecording,
    loadSttMicrophoneDeviceList,
    running,
    startSttComposerRecording,
    state,
    stopSttComposerRecording,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttComposerStatus,
    sttComposerThreadRef,
  });

  useAppComposerModeThreadLifecycleEffects({
    activeThreadId: state?.activeThreadId,
    collaborationMode: state?.settings.collaborationMode,
    setGoalMenuOpen,
    setGoalModeArmed,
    setLocalDeepResearchModeArmed,
  });

  useAppUnmountCleanupLifecycleEffect({
    goalCompletionCelebrationTimerRef,
    sttComposerRecorderRef,
    sttComposerShortcutActiveRef,
    sttMicRecorderRef,
    sttProviderRefreshTimerRef,
    voiceProviderRefreshTimerRef,
  });

  useAppShellGlobalEffects({
    chatFindInputRef,
    contextMenusOpen,
    onCloseContextMenus: closeContextMenus,
    setChatFindOpen,
    setCommandPaletteOpen,
    setCommandPaletteQuery,
    setSidebarAgeNow,
    setSidebarWidth,
  });

  const activeWelcomeOnboardingPageKind = useMemo(() => welcomeOnboardingPageKindForMessages(state?.messages ?? []), [state?.messages]);
  const messageScrollControls = useAppMessageScrollControls({
    activeRunActivityLines,
    activeThreadId: state?.activeThreadId,
    activeThreadIdRef,
    chatBrowserUserActionId,
    chatBrowserUserActionStatus,
    messages: state?.messages,
    welcomeOnboardingPageKind: activeWelcomeOnboardingPageKind,
  });

  useAppWelcomePluginRegistryLifecycleEffect({
    pageKind: activeWelcomeOnboardingPageKind,
    pluginCatalogRevision,
    setWelcomeAmbientPluginRegistry,
  });

  useAppThreadLifecycleEffects({
    activeProjectRootRef,
    activeThreadIdRef,
    errorScope,
    messageKindsRef,
    resetPromptHistory,
    setAutomationFolders,
    setContextAttachments,
    setContextError,
    setErrorScope,
    setErrorState,
    setWorkflowAgentFolders,
    state,
    thinkingDeltaBuffersRef,
    workspaceProjectAliasesRef,
  });

  useEffect(() => {
    if (!state) return;
    applyDocumentAppearance(state.appearance);
    const nextRunStatuses = state.threadRunStatuses ?? {};
    setThreadRunStatuses((current) => {
      for (const [threadId, status] of Object.entries(nextRunStatuses)) {
        if (current[threadId] !== status) return { ...current, ...nextRunStatuses };
      }
      return current;
    });
    const nextRunStatus = nextRunStatuses[state.activeThreadId] ?? "idle";
    setRunStatus((current) => (current === nextRunStatus ? current : nextRunStatus));
  }, [state?.activeThreadId, state?.appearance, state?.threadRunStatuses]);

  const runActivityControls = useAppRunActivityControls({
    activeThreadIdRef,
    requestMessageTail: messageScrollControls.requestMessageTail,
    runActivityCounterRef,
    runActivityHeartbeatIndexRef,
    runActivityLastEventAtRef,
    runActivityLinesByThreadRef,
    setRetryStatsByThread,
    setRunActivityLinesByThread,
    thinkingDeltaBuffersRef,
  });

  useAppStatusSubscriptions({
    state,
    running,
    threadRunStatuses,
    chatBrowserUserAction,
    browserRevision,
    workspaceRevision,
    abortArmDelayMs: RUN_ABORT_ARM_DELAY_MS,
    runActivityLastEventAtRef,
    runActivityHeartbeatIndexRef,
    setState,
    setRunStatus,
    setChatBrowserUserAction,
    setRightPanel,
    setAbortArmed,
    appendRunActivityLine: runActivityControls.appendRunActivityLine,
    setGitStatus,
    setGitStatusError,
    setActiveGitReview,
    setActiveGitReviewError,
  });

  return {
    ...messageScrollControls,
    ...runActivityControls,
    activeWelcomeOnboardingPageKind,
  };
}
