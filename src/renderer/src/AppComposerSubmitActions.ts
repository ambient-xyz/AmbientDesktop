import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopState, SendMessageComposerIntent } from "../../shared/desktopTypes";
import type { LocalDeepResearchRunBudget } from "../../shared/localRuntimeTypes";
import type { SlashCommandSelection } from "../../shared/slashCommandTypes";
import type { CollaborationMode, MessageDelivery, RunStatus, ThreadGoal, ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowRecordingEditContext } from "../../shared/workflowTypes";
import type { WorkspaceContextReference } from "../../shared/workspaceTypes";
import { resolveMessageDelivery } from "../../shared/messageDelivery";
import {
  parseCollaborationSlashCommand,
  parseSecretSlashCommand,
} from "./plannerModeUiModel";
import { mergeContextAttachments } from "./AppComposerControls";
import type { AppPendingSubmittedPromptControls } from "./AppComposerInteractionControls";
import type { useAppComposerShellState } from "./AppComposerShellState";
import type { useAppCoreLifecycleControlsForApp } from "./AppCoreLifecycleControls";
import type { createAppCredentialDialogActions } from "./AppCredentialDialogActions";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";
import {
  sttDraftMetadataForSubmit,
  type SttDraftMetadataState,
} from "./sttUiModel";
import type { AppendRunActivityLine } from "./AppRunActivity";
import type { useAppRunActivityState } from "./AppRunActivityState";
import type { AppShellCommandActions } from "./AppShellCommandActions";
import type { useAppShellUiState } from "./AppShellUiState";
import type { AppThreadMaintenanceActions } from "./AppThreadMaintenanceActions";
import type { useAppWorkflowRecordingReviewControls } from "./AppWorkflowRecordingReviewControls";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";

export type SubmitDraftOptions = {
  composerIntent?: SendMessageComposerIntent;
  activityLine?: string;
};

export type PendingWorkflowRecordingEditContext = WorkflowRecordingEditContext & {
  draftPrefix: string;
};

type ThreadSettingsPatch = Partial<Pick<
  ThreadSummary,
  "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled"
>>;

export interface AppComposerSubmitActionsOptions {
  activeThreadWorkflowRecordingStopped: boolean;
  appendRunActivityLine: AppendRunActivityLine;
  compactActiveThread: (customInstructions?: string) => Promise<void>;
  contextAttachments: WorkspaceContextReference[];
  getComposerDraft: () => string;
  getSlashCommandSelection: () => SlashCommandSelection | undefined;
  goalModeArmed: boolean;
  localDeepResearchRunActive: boolean;
  localDeepResearchModeArmedRef: MutableRefObject<boolean>;
  localDeepResearchRunBudgetRef: MutableRefObject<LocalDeepResearchRunBudget>;
  openAmbientCliSecretDialog: (input: { packageName?: string; envName?: string }) => void;
  registerPendingSubmittedPrompt: (input: { threadId: string; content: string; delivery: MessageDelivery }) => string | undefined;
  pendingWorkflowRecordingEditContext: PendingWorkflowRecordingEditContext | undefined;
  resetPromptHistory: () => void;
  removePendingSubmittedPrompt: (id: string | undefined) => void;
  resetRunActivityLines: (initialText?: string, threadId?: string) => void;
  running: boolean;
  setComposerDraft: (value: string, options?: { focusEnd?: boolean }) => void;
  setContextAttachments: Dispatch<SetStateAction<WorkspaceContextReference[]>>;
  setContextError: Dispatch<SetStateAction<string | undefined>>;
  setError: (message: string | undefined) => void;
  setGoalModeArmed: Dispatch<SetStateAction<boolean>>;
  setLocalDeepResearchModeArmed: (next: boolean) => void;
  setPendingWorkflowRecordingEditContext: Dispatch<SetStateAction<PendingWorkflowRecordingEditContext | undefined>>;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setSlashCommandSelection: (selection: SlashCommandSelection | undefined) => void;
  setSttDraftMetadata: Dispatch<SetStateAction<SttDraftMetadataState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state: DesktopState | undefined;
  sttDraftMetadata: SttDraftMetadataState | undefined;
  updateThreadSettings: (input: ThreadSettingsPatch) => Promise<ThreadSummary | undefined>;
  workflowRecordingReviewFeedbackActive: boolean;
}

export type AppComposerSubmitActions = {
  submitComposerDraft: (requestedDelivery: MessageDelivery, followUpModifier?: boolean) => Promise<void>;
  submitDraft: (requestedDelivery: MessageDelivery, followUpModifier?: boolean, options?: SubmitDraftOptions) => Promise<void>;
};

type AppComposerShellStateForComposerSubmitActions = Pick<
  ReturnType<typeof useAppComposerShellState>,
  "getComposerDraft" | "selectedSlashCommandRef" | "setComposerDraft" | "setSelectedSlashCommand"
>;

type AppCoreLifecycleControlsForComposerSubmitActions = Pick<
  ReturnType<typeof useAppCoreLifecycleControlsForApp>,
  "appendRunActivityLine" | "resetRunActivityLines"
>;

type AppCredentialDialogActionsForComposerSubmitActions = Pick<
  ReturnType<typeof createAppCredentialDialogActions>,
  "openAmbientCliSecretDialog"
>;

type AppProviderRuntimeStateForComposerSubmitActions = Pick<
  ReturnType<typeof useAppProviderRuntimeState>,
  "setSttDraftMetadata" | "sttDraftMetadata"
>;

type AppRunActivityStateForComposerSubmitActions = Pick<
  ReturnType<typeof useAppRunActivityState>,
  "setRunStatus" | "setThreadRunStatuses"
>;

type AppShellCommandActionsForComposerSubmitActions = Pick<AppShellCommandActions, "updateThreadSettings">;

type AppShellUiStateForComposerSubmitActions = Pick<ReturnType<typeof useAppShellUiState>, "setError">;

type AppThreadMaintenanceActionsForComposerSubmitActions = Pick<AppThreadMaintenanceActions, "compactActiveThread">;

type AppWorkflowRecordingReviewControlsForComposerSubmitActions = Pick<
  ReturnType<typeof useAppWorkflowRecordingReviewControls>,
  "workflowRecordingReviewFeedbackActive"
>;

type AppWorkflowRuntimeStateForComposerSubmitActions = Pick<
  ReturnType<typeof useAppWorkflowRuntimeState>,
  | "contextAttachments"
  | "goalModeArmed"
  | "localDeepResearchModeArmedRef"
  | "localDeepResearchRunBudgetRef"
  | "pendingWorkflowRecordingEditContext"
  | "setContextAttachments"
  | "setContextError"
  | "setGoalModeArmed"
  | "setPendingWorkflowRecordingEditContext"
>;

export type AppComposerSubmitActionsForAppInput = {
  activeThread: Pick<ThreadSummary, "workflowRecording"> | undefined;
  composerShellState: AppComposerShellStateForComposerSubmitActions;
  coreLifecycleControls: AppCoreLifecycleControlsForComposerSubmitActions;
  credentialDialogActions: AppCredentialDialogActionsForComposerSubmitActions;
  localDeepResearchRunActive: boolean;
  pendingSubmittedPromptControls: AppPendingSubmittedPromptControls;
  providerRuntimeState: AppProviderRuntimeStateForComposerSubmitActions;
  resetPromptHistory: AppComposerSubmitActionsOptions["resetPromptHistory"];
  runActivityState: AppRunActivityStateForComposerSubmitActions;
  running: boolean;
  setLocalDeepResearchModeArmed: AppComposerSubmitActionsOptions["setLocalDeepResearchModeArmed"];
  shellCommandActions: AppShellCommandActionsForComposerSubmitActions;
  shellUiState: AppShellUiStateForComposerSubmitActions;
  state: DesktopState | undefined;
  threadMaintenanceActions: AppThreadMaintenanceActionsForComposerSubmitActions;
  workflowRecordingReviewControls: AppWorkflowRecordingReviewControlsForComposerSubmitActions;
  workflowRuntimeState: AppWorkflowRuntimeStateForComposerSubmitActions;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function localDeepResearchSubmitOptions(running: boolean, budget: LocalDeepResearchRunBudget): SubmitDraftOptions {
  return {
    composerIntent: {
      kind: "local-deep-research",
      localDeepResearch: budget,
    },
    activityLine: running ? "Queued Local Deep Research for the current run." : "Local Deep Research request sent to Ambient.",
  };
}

export function submittedComposerDelivery(input: {
  followUpModifier: boolean;
  localDeepResearchModeRequested: boolean;
  requestedDelivery: MessageDelivery;
  running: boolean;
}): MessageDelivery {
  const requested = input.localDeepResearchModeRequested && input.running && input.requestedDelivery === "prompt"
    ? "follow-up"
    : input.requestedDelivery;
  return resolveMessageDelivery({ running: input.running, requested, followUpModifier: input.followUpModifier });
}

export function shouldArmComposerGoal(input: {
  activeThreadGoal: ThreadGoal | undefined;
  delivery: MessageDelivery;
  goalModeArmed: boolean;
  mode: CollaborationMode;
  running: boolean;
}): boolean {
  return input.goalModeArmed && !input.activeThreadGoal && !input.running && input.delivery === "prompt" && input.mode !== "planner";
}

export function workflowRecordingEditContextForContent(
  pending: PendingWorkflowRecordingEditContext | undefined,
  content: string,
): PendingWorkflowRecordingEditContext | undefined {
  return pending && content.startsWith(pending.draftPrefix) ? pending : undefined;
}

export function createAppComposerSubmitActionsForApp({
  activeThread,
  composerShellState,
  coreLifecycleControls,
  credentialDialogActions,
  localDeepResearchRunActive,
  pendingSubmittedPromptControls,
  providerRuntimeState,
  resetPromptHistory,
  runActivityState,
  running,
  setLocalDeepResearchModeArmed,
  shellCommandActions,
  shellUiState,
  state,
  threadMaintenanceActions,
  workflowRecordingReviewControls,
  workflowRuntimeState,
}: AppComposerSubmitActionsForAppInput): AppComposerSubmitActions {
  return createAppComposerSubmitActions({
    activeThreadWorkflowRecordingStopped: activeThread?.workflowRecording?.status === "stopped",
    appendRunActivityLine: coreLifecycleControls.appendRunActivityLine,
    compactActiveThread: threadMaintenanceActions.compactActiveThread,
    contextAttachments: workflowRuntimeState.contextAttachments,
    getComposerDraft: composerShellState.getComposerDraft,
    getSlashCommandSelection: () => composerShellState.selectedSlashCommandRef.current,
    goalModeArmed: workflowRuntimeState.goalModeArmed,
    localDeepResearchRunActive,
    localDeepResearchModeArmedRef: workflowRuntimeState.localDeepResearchModeArmedRef,
    localDeepResearchRunBudgetRef: workflowRuntimeState.localDeepResearchRunBudgetRef,
    openAmbientCliSecretDialog: credentialDialogActions.openAmbientCliSecretDialog,
    registerPendingSubmittedPrompt: pendingSubmittedPromptControls.registerPendingSubmittedPrompt,
    pendingWorkflowRecordingEditContext: workflowRuntimeState.pendingWorkflowRecordingEditContext,
    resetPromptHistory,
    removePendingSubmittedPrompt: pendingSubmittedPromptControls.removePendingSubmittedPrompt,
    resetRunActivityLines: coreLifecycleControls.resetRunActivityLines,
    running,
    setComposerDraft: composerShellState.setComposerDraft,
    setContextAttachments: workflowRuntimeState.setContextAttachments,
    setContextError: workflowRuntimeState.setContextError,
    setError: shellUiState.setError,
    setGoalModeArmed: workflowRuntimeState.setGoalModeArmed,
    setLocalDeepResearchModeArmed,
    setPendingWorkflowRecordingEditContext: workflowRuntimeState.setPendingWorkflowRecordingEditContext,
    setRunStatus: runActivityState.setRunStatus,
    setSlashCommandSelection: composerShellState.setSelectedSlashCommand,
    setSttDraftMetadata: providerRuntimeState.setSttDraftMetadata,
    setThreadRunStatuses: runActivityState.setThreadRunStatuses,
    state,
    sttDraftMetadata: providerRuntimeState.sttDraftMetadata,
    updateThreadSettings: shellCommandActions.updateThreadSettings,
    workflowRecordingReviewFeedbackActive: workflowRecordingReviewControls.workflowRecordingReviewFeedbackActive,
  });
}

export function createAppComposerSubmitActions({
  activeThreadWorkflowRecordingStopped,
  appendRunActivityLine,
  compactActiveThread,
  contextAttachments,
  getComposerDraft,
  getSlashCommandSelection,
  goalModeArmed,
  localDeepResearchRunActive,
  localDeepResearchModeArmedRef,
  localDeepResearchRunBudgetRef,
  openAmbientCliSecretDialog,
  registerPendingSubmittedPrompt,
  pendingWorkflowRecordingEditContext,
  resetPromptHistory,
  removePendingSubmittedPrompt,
  resetRunActivityLines,
  running,
  setComposerDraft,
  setContextAttachments,
  setContextError,
  setError,
  setGoalModeArmed,
  setLocalDeepResearchModeArmed,
  setPendingWorkflowRecordingEditContext,
  setRunStatus,
  setSlashCommandSelection,
  setSttDraftMetadata,
  setThreadRunStatuses,
  state,
  sttDraftMetadata,
  updateThreadSettings,
  workflowRecordingReviewFeedbackActive,
}: AppComposerSubmitActionsOptions): AppComposerSubmitActions {
  function restoreSubmittedDraftIfComposerEmpty(draft: string): boolean {
    if (getComposerDraft().trim()) return false;
    setComposerDraft(draft, { focusEnd: true });
    return true;
  }

  function restoreSubmittedSlashCommandSelection(
    selection: SlashCommandSelection | undefined,
    restoredDraft: boolean,
  ): void {
    if (!selection || getSlashCommandSelection()) return;
    if (!restoredDraft && getComposerDraft().trim()) return;
    setSlashCommandSelection(selection);
  }

  function clearSubmittedComposerModes(input: {
    shouldArmGoal: boolean;
    localDeepResearchModeRequested: boolean;
  }): void {
    if (input.shouldArmGoal) setGoalModeArmed(false);
    if (input.localDeepResearchModeRequested) setLocalDeepResearchModeArmed(false);
  }

  async function submitComposerDraft(requestedDelivery: MessageDelivery, followUpModifier = false): Promise<void> {
    const localDeepResearchModeRequested = localDeepResearchModeArmedRef.current;
    await submitDraft(requestedDelivery, followUpModifier, {
      ...(localDeepResearchModeRequested ? localDeepResearchSubmitOptions(running, localDeepResearchRunBudgetRef.current) : {}),
    });
  }

  async function submitDraft(requestedDelivery: MessageDelivery, followUpModifier = false, options: SubmitDraftOptions = {}): Promise<void> {
    const draft = getComposerDraft();
    const slashCommandSelection = getSlashCommandSelection();
    const slashCommandIntent: SendMessageComposerIntent | undefined = slashCommandSelection
      ? { kind: "slash-command", selection: slashCommandSelection }
      : undefined;
    const composerIntent = options.composerIntent ?? slashCommandIntent;
    const localDeepResearchModeRequested = composerIntent?.kind === "local-deep-research";
    const hasSubmittableDraft = Boolean(draft.trim()) || Boolean(slashCommandSelection);
    if (!state) {
      return;
    }
    if (slashCommandSelection?.requiresParameters && !draft.trim()) {
      setContextError(`Add input for ${slashCommandSelection.title} before sending this slash command.`);
      setComposerDraft(draft, { focusEnd: true });
      return;
    }
    if (!hasSubmittableDraft) {
      if (state && localDeepResearchModeRequested) {
        setContextError("Enter a research question to use Local Deep Research.");
        setComposerDraft(draft, { focusEnd: true });
      }
      return;
    }
    if (options.composerIntent && slashCommandSelection) {
      setContextError("Remove the selected slash command before using this composer action.");
      setComposerDraft(draft, { focusEnd: true });
      return;
    }
    if (localDeepResearchRunActive) {
      setContextError("Local Deep Research is running in this thread. Stop it or wait for it to finish before sending another message.");
      setComposerDraft(draft, { focusEnd: true });
      return;
    }
    const secretCommand = parseSecretSlashCommand(draft);
    if (secretCommand.isSecretCommand) {
      if (slashCommandSelection) {
        setContextError("Remove the selected slash command before using this composer action.");
        setComposerDraft(draft, { focusEnd: true });
        return;
      }
      setComposerDraft("");
      setSttDraftMetadata(undefined);
      resetPromptHistory();
      openAmbientCliSecretDialog({
        packageName: secretCommand.packageName,
        envName: secretCommand.envName,
      });
      return;
    }
    const parsedCommand = parseCollaborationSlashCommand(draft, state.settings.collaborationMode);
    const parsedContent = parsedCommand.content;
    const content = parsedContent.trim() ? parsedContent : slashCommandSelection?.command ?? parsedContent;
    if (!running && (parsedContent === "/compact" || parsedContent.startsWith("/compact "))) {
      if (slashCommandSelection) {
        setContextError("Remove the selected slash command before using this composer action.");
        setComposerDraft(draft, { focusEnd: true });
        return;
      }
      const customInstructions = parsedContent.slice("/compact".length).trim() || undefined;
      setComposerDraft("");
      setSttDraftMetadata(undefined);
      resetPromptHistory();
      await compactActiveThread(customInstructions);
      return;
    }
    if (parsedCommand.settingsOnly) {
      if (slashCommandSelection) {
        setContextError("Remove the selected slash command before using this composer action.");
        setComposerDraft(draft, { focusEnd: true });
        return;
      }
      setComposerDraft("");
      setSttDraftMetadata(undefined);
      resetPromptHistory();
      await updateThreadSettings({ collaborationMode: parsedCommand.mode });
      return;
    }
    if (!content.trim()) return;
    if (localDeepResearchModeRequested && parsedCommand.mode === "planner") {
      setContextError("Switch to Agent mode before running Local Deep Research.");
      return;
    }
    if (workflowRecordingReviewFeedbackActive && slashCommandSelection) {
      setContextError("Remove the selected slash command before sending Ambient Review feedback.");
      setComposerDraft(draft, { focusEnd: true });
      return;
    }
    if (slashCommandSelection) {
      setComposerDraft("");
      setSttDraftMetadata(undefined);
      setSlashCommandSelection(undefined);
      try {
        await validateSlashCommandSelectionForSubmit(slashCommandSelection);
      } catch (error) {
        const restoredDraft = restoreSubmittedDraftIfComposerEmpty(draft);
        restoreSubmittedSlashCommandSelection(slashCommandSelection, restoredDraft);
        setContextError(errorMessage(error));
        return;
      }
      if (getComposerDraft().trim() || getSlashCommandSelection()) {
        setContextError("Slash command send was canceled because the composer changed. Send again when ready.");
        return;
      }
    }
    if (parsedCommand.mode !== state.settings.collaborationMode) {
      await updateThreadSettings({ collaborationMode: parsedCommand.mode });
    }
    const context = contextAttachments;
    const delivery = submittedComposerDelivery({
      followUpModifier,
      localDeepResearchModeRequested,
      requestedDelivery,
      running,
    });
    const sttMetadata = sttDraftMetadataForSubmit({ draft, content, draftMetadata: sttDraftMetadata });
    const workflowRecordingEditContext = workflowRecordingEditContextForContent(pendingWorkflowRecordingEditContext, content);
    const shouldArmGoal = shouldArmComposerGoal({
      activeThreadGoal: state.activeThreadGoal,
      delivery,
      goalModeArmed,
      mode: parsedCommand.mode,
      running,
    });
    if (workflowRecordingReviewFeedbackActive && activeThreadWorkflowRecordingStopped) {
      if (context.length > 0) {
        setError("Ambient Review feedback cannot include file attachments. Remove attachments, or close the review panel to send a normal message.");
        return;
      }
      setComposerDraft("");
      setSttDraftMetadata(undefined);
      resetPromptHistory();
      setContextAttachments([]);
      setError(undefined);
      setContextError(undefined);
      if (!running) {
        resetRunActivityLines("Workflow recording review feedback sent to Ambient.", state.activeThreadId);
        setRunStatus("starting");
        setThreadRunStatuses((statuses) => ({ ...statuses, [state.activeThreadId]: "starting" }));
      } else {
        appendRunActivityLine("Steering Ambient Review with your feedback.", "state", {}, state.activeThreadId);
      }
      await window.ambientDesktop
        .requestWorkflowRecordingReview({ threadId: state.activeThreadId, feedback: content })
        .catch((err) => {
          setError(errorMessage(err));
          restoreSubmittedDraftIfComposerEmpty(draft);
          setContextAttachments((current) => mergeContextAttachments(context, current));
          if (sttDraftMetadata) setSttDraftMetadata(sttDraftMetadata);
          if (!running) setRunStatus("error");
        });
      return;
    }
    const pendingSubmittedPromptId = registerPendingSubmittedPrompt({
      threadId: state.activeThreadId,
      content,
      delivery,
    });
    setComposerDraft("");
    setSttDraftMetadata(undefined);
    if (slashCommandSelection) setSlashCommandSelection(undefined);
    setPendingWorkflowRecordingEditContext(undefined);
    resetPromptHistory();
    setContextAttachments([]);
    setError(undefined);
    setContextError(undefined);
    if (!running) {
      resetRunActivityLines(options.activityLine ?? "Prompt sent to Ambient.");
      setRunStatus("starting");
      setThreadRunStatuses((statuses) => ({ ...statuses, [state.activeThreadId]: "starting" }));
    } else {
      appendRunActivityLine(options.activityLine ?? (delivery === "follow-up" ? "Queued follow-up for the current run." : "Steering the current run."));
    }
    await window.ambientDesktop
      .sendMessage({
        threadId: state.activeThreadId,
        content,
        permissionMode: state.settings.permissionMode,
        collaborationMode: parsedCommand.mode,
        model: state.settings.model,
        thinkingLevel: state.settings.thinkingLevel,
        delivery,
        context,
        ...(composerIntent ? { composerIntent } : {}),
        ...(workflowRecordingEditContext ? { workflowRecordingEditContext } : {}),
        ...(sttMetadata ? { stt: sttMetadata } : {}),
        ...(shouldArmGoal ? { goalMode: { enabled: true } } : {}),
      })
      .then(() => {
        clearSubmittedComposerModes({
          shouldArmGoal,
          localDeepResearchModeRequested,
        });
      })
      .catch((err) => {
        setError(errorMessage(err));
        removePendingSubmittedPrompt(pendingSubmittedPromptId);
        const restoredDraft = restoreSubmittedDraftIfComposerEmpty(draft);
        restoreSubmittedSlashCommandSelection(slashCommandSelection, restoredDraft);
        if (workflowRecordingEditContext) setPendingWorkflowRecordingEditContext(workflowRecordingEditContext);
        setContextAttachments((current) => mergeContextAttachments(context, current));
        if (sttDraftMetadata) setSttDraftMetadata(sttDraftMetadata);
        if (!running) setRunStatus("error");
      });
  }

  return {
    submitComposerDraft,
    submitDraft,
  };
}

async function validateSlashCommandSelectionForSubmit(selection: SlashCommandSelection): Promise<void> {
  const description = await window.ambientDesktop.describeSlashCommand({
    entryId: selection.entryId,
    includeUnavailable: true,
  });
  if (description.status !== "described" || !description.entry) {
    throw new Error("Selected slash command is no longer available.");
  }
  if (description.entry.availability !== "available") {
    throw new Error(description.entry.availabilityReason ?? `${description.entry.title} is ${description.entry.availability}.`);
  }
  if (selection.sourceFingerprint && description.entry.sourceFingerprint && selection.sourceFingerprint !== description.entry.sourceFingerprint) {
    throw new Error("Selected slash command changed. Select it again before sending.");
  }
}
