import type { Dispatch, SetStateAction } from "react";

import type { DesktopState, SendMessageInput } from "../../shared/desktopTypes";
import type { RunStatus, ThreadSummary } from "../../shared/threadTypes";
import type { WorkflowRecordingLibraryEntry, WorkflowRecordingReviewDraftUpdate, WorkflowRecordingState } from "../../shared/workflowTypes";
import type { SidebarArea } from "./AppShellSidebar";

export function workflowRecordingGoalFromInput(goalInput: string): string | undefined {
  const goal = goalInput.trim();
  return goal || undefined;
}

export function workflowRecordingStartInput(
  goalInput: string,
  workspacePath: string,
): { goal?: string; workspacePath: string } {
  const goal = workflowRecordingGoalFromInput(goalInput);
  return {
    ...(goal ? { goal } : {}),
    workspacePath,
  };
}

export function activeWorkflowRecordingForState(
  state: Pick<DesktopState, "activeThreadId" | "threads">,
): WorkflowRecordingState | undefined {
  return state.threads.find((thread) => thread.id === state.activeThreadId)?.workflowRecording;
}

export function activeThreadHasWorkflowRecordingStatus(
  activeThread: Pick<ThreadSummary, "workflowRecording"> | undefined,
  status: WorkflowRecordingState["status"],
): boolean {
  return activeThread?.workflowRecording?.status === status;
}

export function workflowRecordingArchiveConfirmation(playbook: Pick<WorkflowRecordingLibraryEntry, "title">): string {
  return `Archive "${playbook.title}"? It will be hidden from default workflow search and suggestions, but its package and versions will be kept.`;
}

export function workflowRecordingArchiveInput(
  playbook: Pick<WorkflowRecordingLibraryEntry, "id" | "version">,
): { id: string; baseVersion: number; reason: string } {
  return {
    id: playbook.id,
    baseVersion: playbook.version,
    reason: "Archived from Workflow Recordings.",
  };
}

export function workflowRecordingVersionInput(
  playbook: Pick<WorkflowRecordingLibraryEntry, "id" | "version">,
): { id: string; baseVersion: number } {
  return {
    id: playbook.id,
    baseVersion: playbook.version,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function workflowRecordingInitialGoalMessageInput(
  state: Pick<DesktopState, "activeThreadId" | "settings">,
  goal: string,
): SendMessageInput {
  return {
    threadId: state.activeThreadId,
    content: goal,
    permissionMode: state.settings.permissionMode,
    collaborationMode: state.settings.collaborationMode,
    model: state.settings.model,
    thinkingLevel: state.settings.thinkingLevel,
    delivery: "prompt",
    context: [],
  };
}

export function workflowRecordingRunStatusesWithStarting(
  current: Record<string, RunStatus>,
  threadId: string,
): Record<string, RunStatus> {
  return { ...current, [threadId]: "starting" };
}

export function createAppWorkflowRecordingActions({
  activeThread,
  applyCreatedThreadState,
  applyRunStatusDesktopState,
  closeProjectBoard,
  refreshWorkflowRecordingLibraryOverride,
  resetPromptHistory,
  resetRunActivityLines,
  scheduleComposerDraftFocus,
  sendWorkflowRecordingReviewPromptForState,
  setError,
  setRunStatus,
  setSelectedWorkflowRecordingId,
  setSidebarArea,
  setThreadRunStatuses,
  state,
  workflowLibraryIncludeArchived,
}: {
  activeThread: Pick<ThreadSummary, "workflowRecording"> | undefined;
  applyCreatedThreadState: (next: DesktopState, previousWorkspacePath?: string) => void;
  applyRunStatusDesktopState: (next: DesktopState) => void;
  closeProjectBoard: () => void;
  refreshWorkflowRecordingLibraryOverride: (includeArchived?: boolean) => Promise<void>;
  resetPromptHistory: () => void;
  resetRunActivityLines: (initialText?: string, threadId?: string) => void;
  scheduleComposerDraftFocus: (draft: string) => void;
  sendWorkflowRecordingReviewPromptForState: (threadId: string, recording: WorkflowRecordingState) => Promise<void>;
  setError: (message: string | undefined) => void;
  setRunStatus: Dispatch<SetStateAction<RunStatus>>;
  setSelectedWorkflowRecordingId: Dispatch<SetStateAction<string | undefined>>;
  setSidebarArea: Dispatch<SetStateAction<SidebarArea>>;
  setThreadRunStatuses: Dispatch<SetStateAction<Record<string, RunStatus>>>;
  state: DesktopState | undefined;
  workflowLibraryIncludeArchived: boolean;
}): {
  applyLatestWorkflowRecordingSummary: () => Promise<void>;
  archiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  confirmActiveWorkflowRecordingReview: () => Promise<void>;
  restoreWorkflowRecordingVersion: (id: string, version: number) => Promise<void>;
  setWorkflowRecordingEnabled: (id: string, enabled: boolean) => Promise<void>;
  startWorkflowRecording: (goalInput?: string) => Promise<void>;
  stopActiveWorkflowRecording: (input?: { requestReview?: boolean }) => Promise<void>;
  unarchiveWorkflowRecordingPlaybook: (playbook: WorkflowRecordingLibraryEntry) => Promise<void>;
  updateActiveWorkflowRecordingReview: (draft: WorkflowRecordingReviewDraftUpdate) => Promise<void>;
} {
  async function startWorkflowRecording(goalInput = ""): Promise<void> {
    if (!state) return;
    const input = workflowRecordingStartInput(goalInput, state.workspace.path);
    const previousWorkspacePath = state.activeWorkspace.path;
    try {
      setError(undefined);
      const next = await window.ambientDesktop.startWorkflowRecording(input);
      applyCreatedThreadState(next, previousWorkspacePath);
      setSidebarArea("projects");
      closeProjectBoard();
      if (input.goal) {
        resetPromptHistory();
        resetRunActivityLines("Workflow recording prompt sent to Ambient.", next.activeThreadId);
        setRunStatus("starting");
        setThreadRunStatuses((statuses) => workflowRecordingRunStatusesWithStarting(statuses, next.activeThreadId));
        await window.ambientDesktop
          .sendMessage(workflowRecordingInitialGoalMessageInput(next, input.goal))
          .catch((error) => {
            setError(errorMessage(error));
            setRunStatus("error");
            scheduleComposerDraftFocus(input.goal!);
          });
      }
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function stopActiveWorkflowRecording(input: { requestReview?: boolean } = {}): Promise<void> {
    if (!state || !activeThreadHasWorkflowRecordingStatus(activeThread, "recording")) return;
    try {
      const next = await window.ambientDesktop.stopWorkflowRecording({ threadId: state.activeThreadId });
      applyRunStatusDesktopState(next);
      if (input.requestReview) {
        const stoppedRecording = activeWorkflowRecordingForState(next);
        if (stoppedRecording) {
          await sendWorkflowRecordingReviewPromptForState(next.activeThreadId, stoppedRecording);
        } else {
          setError("Workflow recording stopped, but no review draft was available to send to Ambient.");
        }
      }
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function confirmActiveWorkflowRecordingReview(): Promise<void> {
    if (!state || !activeThreadHasWorkflowRecordingStatus(activeThread, "stopped")) return;
    try {
      const next = await window.ambientDesktop.confirmWorkflowRecording({ threadId: state.activeThreadId });
      applyRunStatusDesktopState(next);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function applyLatestWorkflowRecordingSummary(): Promise<void> {
    if (!state || !activeThreadHasWorkflowRecordingStatus(activeThread, "stopped")) return;
    try {
      const next = await window.ambientDesktop.applyWorkflowRecordingSummary({ threadId: state.activeThreadId });
      applyRunStatusDesktopState(next);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function updateActiveWorkflowRecordingReview(draft: WorkflowRecordingReviewDraftUpdate): Promise<void> {
    if (!state || !activeThreadHasWorkflowRecordingStatus(activeThread, "stopped")) return;
    try {
      const next = await window.ambientDesktop.updateWorkflowRecordingReview({ threadId: state.activeThreadId, draft });
      applyRunStatusDesktopState(next);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function setWorkflowRecordingEnabled(id: string, enabled: boolean): Promise<void> {
    if (!state) return;
    try {
      setError(undefined);
      const next = await window.ambientDesktop.setWorkflowRecordingEnabled({ id, enabled });
      applyRunStatusDesktopState(next);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function restoreWorkflowRecordingVersion(id: string, version: number): Promise<void> {
    if (!state) return;
    try {
      setError(undefined);
      const next = await window.ambientDesktop.restoreWorkflowRecordingVersion({ id, version });
      applyRunStatusDesktopState(next);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function archiveWorkflowRecordingPlaybook(playbook: WorkflowRecordingLibraryEntry): Promise<void> {
    if (!state) return;
    const confirmed = window.confirm(workflowRecordingArchiveConfirmation(playbook));
    if (!confirmed) return;
    try {
      setError(undefined);
      const next = await window.ambientDesktop.archiveWorkflowRecording(workflowRecordingArchiveInput(playbook));
      applyRunStatusDesktopState(next);
      if (workflowLibraryIncludeArchived) await refreshWorkflowRecordingLibraryOverride(true);
      else setSelectedWorkflowRecordingId(undefined);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  async function unarchiveWorkflowRecordingPlaybook(playbook: WorkflowRecordingLibraryEntry): Promise<void> {
    if (!state) return;
    try {
      setError(undefined);
      const next = await window.ambientDesktop.unarchiveWorkflowRecording(workflowRecordingVersionInput(playbook));
      applyRunStatusDesktopState(next);
      await refreshWorkflowRecordingLibraryOverride(workflowLibraryIncludeArchived);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return {
    applyLatestWorkflowRecordingSummary,
    archiveWorkflowRecordingPlaybook,
    confirmActiveWorkflowRecordingReview,
    restoreWorkflowRecordingVersion,
    setWorkflowRecordingEnabled,
    startWorkflowRecording,
    stopActiveWorkflowRecording,
    unarchiveWorkflowRecordingPlaybook,
    updateActiveWorkflowRecordingReview,
  };
}
