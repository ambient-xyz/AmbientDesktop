import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type {
  CollaborationMode,
  DesktopState,
  MessageDelivery,
  RunStatus,
  LocalDeepResearchRunBudget,
  SendMessageComposerIntent,
  ThreadGoal,
  ThreadSummary,
  WorkflowRecordingEditContext,
  WorkspaceContextReference,
} from "../../shared/types";
import { resolveMessageDelivery } from "../../shared/messageDelivery";
import {
  parseCollaborationSlashCommand,
  parseSecretSlashCommand,
} from "./plannerModeUiModel";
import { mergeContextAttachments } from "./AppComposerControls";
import {
  sttDraftMetadataForSubmit,
  type SttDraftMetadataState,
} from "./sttUiModel";
import type { AppendRunActivityLine } from "./AppRunActivity";

export type SubmitDraftOptions = {
  composerIntent?: SendMessageComposerIntent;
  activityLine?: string;
};

export type PendingWorkflowRecordingEditContext = WorkflowRecordingEditContext & {
  draftPrefix: string;
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

export function createAppComposerSubmitActions({
  activeThreadWorkflowRecordingStopped,
  appendRunActivityLine,
  compactActiveThread,
  contextAttachments,
  getComposerDraft,
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
  setSttDraftMetadata,
  setThreadRunStatuses,
  state,
  sttDraftMetadata,
  updateThreadSettings,
  workflowRecordingReviewFeedbackActive,
}: {
  activeThreadWorkflowRecordingStopped: boolean;
  appendRunActivityLine: AppendRunActivityLine;
  compactActiveThread: (customInstructions?: string) => Promise<void>;
  contextAttachments: WorkspaceContextReference[];
  getComposerDraft: () => string;
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
  setSttDraftMetadata: Dispatch<SetStateAction<SttDraftMetadataState | undefined>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state: DesktopState | undefined;
  sttDraftMetadata: SttDraftMetadataState | undefined;
  updateThreadSettings: (
    input: Partial<Pick<ThreadSummary, "collaborationMode" | "model" | "thinkingLevel" | "memoryEnabled">>,
  ) => Promise<ThreadSummary | undefined>;
  workflowRecordingReviewFeedbackActive: boolean;
}): {
  submitComposerDraft: (requestedDelivery: MessageDelivery, followUpModifier?: boolean) => Promise<void>;
  submitDraft: (requestedDelivery: MessageDelivery, followUpModifier?: boolean, options?: SubmitDraftOptions) => Promise<void>;
} {
  function restoreSubmittedDraftIfComposerEmpty(draft: string): void {
    if (getComposerDraft().trim()) return;
    setComposerDraft(draft, { focusEnd: true });
  }

  function clearSubmittedComposerModes(input: { shouldArmGoal: boolean; localDeepResearchModeRequested: boolean }): void {
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
    const localDeepResearchModeRequested = options.composerIntent?.kind === "local-deep-research";
    if (!state || !draft.trim()) {
      if (state && localDeepResearchModeRequested) {
        setContextError("Enter a research question to use Local Deep Research.");
        setComposerDraft(draft, { focusEnd: true });
      }
      return;
    }
    if (localDeepResearchRunActive) {
      setContextError("Local Deep Research is running in this thread. Stop it or wait for it to finish before sending another message.");
      setComposerDraft(draft, { focusEnd: true });
      return;
    }
    const secretCommand = parseSecretSlashCommand(draft);
    if (secretCommand.isSecretCommand) {
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
    const content = parsedCommand.content;
    if (!running && (content === "/compact" || content.startsWith("/compact "))) {
      const customInstructions = content.slice("/compact".length).trim() || undefined;
      setComposerDraft("");
      setSttDraftMetadata(undefined);
      resetPromptHistory();
      await compactActiveThread(customInstructions);
      return;
    }
    if (parsedCommand.settingsOnly) {
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
        ...(options.composerIntent ? { composerIntent: options.composerIntent } : {}),
        ...(workflowRecordingEditContext ? { workflowRecordingEditContext } : {}),
        ...(sttMetadata ? { stt: sttMetadata } : {}),
        ...(shouldArmGoal ? { goalMode: { enabled: true } } : {}),
      })
      .then(() => {
        clearSubmittedComposerModes({ shouldArmGoal, localDeepResearchModeRequested });
      })
      .catch((err) => {
        setError(errorMessage(err));
        removePendingSubmittedPrompt(pendingSubmittedPromptId);
        restoreSubmittedDraftIfComposerEmpty(draft);
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
