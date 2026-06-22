import type {
  ComponentProps,
  Dispatch,
  SetStateAction,
} from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type {
  LocalDeepResearchEffort,
  LocalDeepResearchRunBudget,
  SttProviderCandidate,
} from "../../shared/localRuntimeTypes";
import type { PermissionMode } from "../../shared/permissionTypes";
import type { PlannerPlanArtifact } from "../../shared/plannerTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { AppComposerShell } from "./AppComposerShell";
import type { AppProjectBoardActions } from "./AppProjectBoardActions";
import { sttShortcutLabel } from "./sttShortcut";
import {
  queuedSpeechFollowUpCount,
  sttProviderForCapabilityId,
  sttQueuedCountLabel,
  sttRuntimeQueuedCount,
} from "./sttUiModel";

type AppComposerShellProps = ComponentProps<typeof AppComposerShell>;
type MaybePromise<T = unknown> = T | Promise<T>;
type ThreadSettingsPatch = Partial<Pick<
  ThreadSummary,
  "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled"
>>;
type LocalDeepResearchBudgetOverride =
  Partial<Pick<LocalDeepResearchRunBudget, "effort" | "maxToolCalls" | "onExhausted">> | undefined;

type CreatedComposerShellPropKey =
  | "showSttComposerStrip"
  | "sttQueuedSpeechLabel"
  | "sttComposerStripStatus"
  | "sttComposerRecording"
  | "sttComposerBusy"
  | "sttComposerDisabled"
  | "sttComposerShortcutLabel"
  | "sttComposerTitle"
  | "showRevisePlanControl"
  | "onRecoverActiveThreadContext"
  | "onRecoverAndRetryLatest"
  | "onDuplicateActiveThreadFromTranscript"
  | "onDismissChatExportStatus"
  | "onPreviewSttArtifact"
  | "onRetrySttComposerTranscription"
  | "onAttachComposerFiles"
  | "onSelectLocalDeepResearchEffort"
  | "onLocalDeepResearchCustomMaxToolCallsChange"
  | "onCompactActiveThread"
  | "onExportActiveChat"
  | "onCollaborationModeChange"
  | "onRunSymphonyOnce"
  | "onSaveSymphonyRecipe"
  | "onToggleGoalMode"
  | "onPermissionModeChange"
  | "onReviseLatestPlannerPlan"
  | "onRunProjectBoardThreadPlanAction"
  | "onAddPlannerPlanToBoard"
  | "onThinkingDisplayModeChange"
  | "onThinkingLevelChange"
  | "onSelectComposerModel"
  | "onStartSttComposerRecording"
  | "onStopSttComposerRecording"
  | "onAbortRun"
  | "onAttachExistingWorktree"
  | "onOpenGitSummary"
  | "onSwitchBranch"
  | "onToggleGoalMenu"
  | "onPauseResumeGoal"
  | "onEditGoalObjective"
  | "onSetGoalBudget"
  | "onClearGoal";

export type AppComposerShellPropsInput = {
  attachComposerFiles: () => MaybePromise;
  attachExistingWorktreeFromFooter: () => MaybePromise;
  clearActiveGoal: () => MaybePromise;
  compactActiveThread: () => MaybePromise;
  duplicateActiveThreadFromTranscript: () => MaybePromise;
  editActiveGoalObjective: () => MaybePromise;
  exportActiveChat: () => MaybePromise;
  getComposerDraft: () => string;
  latestDurablePlannerPlanArtifact?: PlannerPlanArtifact;
  openGitSummaryPanel: () => MaybePromise;
  openPlannerRevisionDialog: (artifact: PlannerPlanArtifact) => MaybePromise;
  pauseOrResumeActiveGoal: () => MaybePromise;
  previewArtifact: (path: string) => MaybePromise;
  projectBoardActions: Pick<AppProjectBoardActions, "addPlannerPlanToBoard">;
  recoverActiveThreadContext: () => MaybePromise;
  recoverActiveThreadContextAndRetryLatest: () => MaybePromise;
  requestThreadPermissionModeChange: (permissionMode: PermissionMode) => MaybePromise;
  retrySttComposerTranscription: () => MaybePromise;
  runProjectBoardThreadPlanAction: () => MaybePromise;
  sendPlannerDurableRevision: (
    artifact: PlannerPlanArtifact,
    feedback: string,
    options: { clearComposer: true },
  ) => MaybePromise;
  setActiveGoalBudget: () => MaybePromise;
  setChatExportStatus: Dispatch<SetStateAction<AppComposerShellProps["chatExportStatus"]>>;
  setGoalMenuOpen: Dispatch<SetStateAction<boolean>>;
  setLocalDeepResearchBudgetOverride: Dispatch<SetStateAction<LocalDeepResearchBudgetOverride>>;
  startSttComposerRecording: () => MaybePromise;
  state: DesktopState;
  stopSttComposerRecording: () => MaybePromise;
  sttComposer: AppComposerShellProps["sttComposer"];
  sttProviders: SttProviderCandidate[];
  submitSymphonyBuilderAction: (action: "run-once" | "save-recipe") => MaybePromise;
  switchBranch: (branch: string) => MaybePromise;
  toggleGoalMode: () => MaybePromise;
  updateThinkingDisplaySettings: (thinkingDisplay: DesktopState["settings"]["thinkingDisplay"]) => MaybePromise;
  updateThreadSettings: (input: ThreadSettingsPatch) => MaybePromise;
};

export function createAppComposerShellProps({
  attachComposerFiles,
  attachExistingWorktreeFromFooter,
  clearActiveGoal,
  compactActiveThread,
  duplicateActiveThreadFromTranscript,
  editActiveGoalObjective,
  exportActiveChat,
  getComposerDraft,
  latestDurablePlannerPlanArtifact,
  openGitSummaryPanel,
  openPlannerRevisionDialog,
  pauseOrResumeActiveGoal,
  previewArtifact,
  projectBoardActions,
  recoverActiveThreadContext,
  recoverActiveThreadContextAndRetryLatest,
  requestThreadPermissionModeChange,
  retrySttComposerTranscription,
  runProjectBoardThreadPlanAction,
  sendPlannerDurableRevision,
  setActiveGoalBudget,
  setChatExportStatus,
  setGoalMenuOpen,
  setLocalDeepResearchBudgetOverride,
  startSttComposerRecording,
  state,
  stopSttComposerRecording,
  sttComposer,
  sttProviders,
  submitSymphonyBuilderAction,
  switchBranch,
  toggleGoalMode,
  updateThinkingDisplaySettings,
  updateThreadSettings,
}: AppComposerShellPropsInput): Pick<AppComposerShellProps, CreatedComposerShellPropKey> {
  const composerSttProvider = sttProviderForCapabilityId(sttProviders, state.settings.stt.providerCapabilityId);
  const sttComposerRecording = sttComposer.status === "recording";
  const sttComposerBusy = sttComposer.status === "saving" || sttComposer.status === "transcribing";
  const sttComposerDisabled =
    sttComposerBusy || (!sttComposerRecording && (!state.settings.stt.enabled || !state.settings.stt.providerCapabilityId || !composerSttProvider?.available));
  const sttComposerShortcutLabel = state.settings.stt.pushToTalkShortcut
    ? sttShortcutLabel(state.settings.stt.pushToTalkShortcut)
    : undefined;
  const sttRuntimeQueueCount = sttRuntimeQueuedCount(state.sttQueue);
  const sttSpeechFollowUpCount = queuedSpeechFollowUpCount(state.messages);
  const sttQueuedSpeechCount = sttRuntimeQueueCount + sttSpeechFollowUpCount;
  const sttQueuedSpeechLabel = sttQueuedCountLabel(sttQueuedSpeechCount);
  const showSttComposerStrip = (sttComposer.status !== "idle" && Boolean(sttComposer.message)) || sttQueuedSpeechCount > 0;
  const sttComposerStripStatus = sttComposer.status === "idle" && sttQueuedSpeechCount > 0 ? "queued" : sttComposer.status;
  const sttComposerTitle = sttComposerRecording
    ? "Stop recording and transcribe"
    : !state.settings.stt.enabled || !state.settings.stt.providerCapabilityId || !composerSttProvider?.available
      ? "Enable speech input and select an available STT provider in Settings"
      : sttComposerBusy
        ? sttComposer.message ?? "Processing speech"
        : `Push to talk${sttComposerShortcutLabel ? ` (${sttComposerShortcutLabel})` : ""}`;

  return {
    showSttComposerStrip,
    sttQueuedSpeechLabel,
    sttComposerStripStatus,
    sttComposerRecording,
    sttComposerBusy,
    sttComposerDisabled,
    sttComposerShortcutLabel,
    sttComposerTitle,
    showRevisePlanControl: Boolean(latestDurablePlannerPlanArtifact),
    onRecoverActiveThreadContext: () => {
      void recoverActiveThreadContext();
    },
    onRecoverAndRetryLatest: () => {
      void recoverActiveThreadContextAndRetryLatest();
    },
    onDuplicateActiveThreadFromTranscript: () => {
      void duplicateActiveThreadFromTranscript();
    },
    onDismissChatExportStatus: () => setChatExportStatus(undefined),
    onPreviewSttArtifact: previewArtifact,
    onRetrySttComposerTranscription: () => {
      void retrySttComposerTranscription();
    },
    onAttachComposerFiles: () => {
      void attachComposerFiles();
    },
    onSelectLocalDeepResearchEffort: (effort: LocalDeepResearchEffort) => {
      setLocalDeepResearchBudgetOverride({ effort });
    },
    onLocalDeepResearchCustomMaxToolCallsChange: (maxToolCalls: number) => {
      setLocalDeepResearchBudgetOverride({ effort: "custom", maxToolCalls });
    },
    onCompactActiveThread: () => {
      void compactActiveThread();
    },
    onExportActiveChat: () => {
      void exportActiveChat();
    },
    onCollaborationModeChange: (collaborationMode) => {
      void updateThreadSettings({ collaborationMode });
    },
    onRunSymphonyOnce: () => {
      void submitSymphonyBuilderAction("run-once");
    },
    onSaveSymphonyRecipe: () => {
      void submitSymphonyBuilderAction("save-recipe");
    },
    onToggleGoalMode: () => {
      void toggleGoalMode();
    },
    onPermissionModeChange: (permissionMode) => {
      void requestThreadPermissionModeChange(permissionMode);
    },
    onReviseLatestPlannerPlan: () => {
      if (!latestDurablePlannerPlanArtifact) return;
      const feedback = getComposerDraft().trim();
      if (feedback) {
        void sendPlannerDurableRevision(latestDurablePlannerPlanArtifact, feedback, { clearComposer: true });
      } else {
        void openPlannerRevisionDialog(latestDurablePlannerPlanArtifact);
      }
    },
    onRunProjectBoardThreadPlanAction: () => {
      void runProjectBoardThreadPlanAction();
    },
    onAddPlannerPlanToBoard: (artifact) => {
      void projectBoardActions.addPlannerPlanToBoard(artifact);
    },
    onThinkingDisplayModeChange: (mode) => {
      void updateThinkingDisplaySettings({ ...state.settings.thinkingDisplay, mode });
    },
    onThinkingLevelChange: (thinkingLevel) => {
      void updateThreadSettings({ thinkingLevel });
    },
    onSelectComposerModel: (model) => {
      void updateThreadSettings({ model });
    },
    onStartSttComposerRecording: () => {
      void startSttComposerRecording();
    },
    onStopSttComposerRecording: () => {
      void stopSttComposerRecording();
    },
    onAbortRun: () => {
      void window.ambientDesktop.abortRun(state.activeThreadId);
    },
    onAttachExistingWorktree: () => {
      void attachExistingWorktreeFromFooter();
    },
    onOpenGitSummary: () => {
      void openGitSummaryPanel();
    },
    onSwitchBranch: (branch) => {
      void switchBranch(branch);
    },
    onToggleGoalMenu: () => setGoalMenuOpen((open) => !open),
    onPauseResumeGoal: () => {
      void pauseOrResumeActiveGoal();
    },
    onEditGoalObjective: () => {
      void editActiveGoalObjective();
    },
    onSetGoalBudget: () => {
      void setActiveGoalBudget();
    },
    onClearGoal: () => {
      void clearActiveGoal();
    },
  };
}
