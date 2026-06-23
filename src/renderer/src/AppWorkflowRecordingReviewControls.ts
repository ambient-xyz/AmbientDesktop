import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import type { ThinkingDisplaySettings } from "../../shared/desktopTypes";
import type { RunStatus, ThreadSummary } from "../../shared/threadTypes";
import { shouldShowRunStatusCard } from "./thinkingDisplayUiModel";
import type { WorkflowRecorderSurfaceModel } from "./workflowRecorderUiModel";

export type WorkflowRecordingReviewThread = Pick<ThreadSummary, "id" | "workflowRecording">;

export function workflowRecordingReviewPanelKeyForThread(
  activeThread: WorkflowRecordingReviewThread | undefined,
): string | undefined {
  const recording = activeThread?.workflowRecording;
  if (!activeThread || !recording || recording.status === "recording") return undefined;
  const draft = recording.review?.confirmed ?? recording.review?.draft;
  if (!draft) return undefined;
  return `${activeThread.id}:${recording.review?.status ?? "draft"}:${draft.source}:${draft.generatedAt}`;
}

export function workflowRecordingReviewFeedbackIsActive({
  activeThread,
  panelKey,
}: {
  activeThread: WorkflowRecordingReviewThread | undefined;
  panelKey: string | undefined;
}): boolean {
  return Boolean(panelKey && activeThread?.workflowRecording?.review?.status !== "confirmed");
}

export function workflowRecorderEmptyChatStateForThread({
  activeThread,
  workflowRecorderSurface,
}: {
  activeThread: WorkflowRecordingReviewThread | undefined;
  workflowRecorderSurface: WorkflowRecorderSurfaceModel;
}): WorkflowRecorderSurfaceModel["recordingChatEmptyState"] {
  return !workflowRecorderSurface.legacyCompilerEnabled && activeThread?.workflowRecording
    ? workflowRecorderSurface.recordingChatEmptyState
    : undefined;
}

export function workflowReviewRunStatusCardVisible({
  reviewRunning,
  running,
  runStatus,
  thinkingDisplay,
}: {
  reviewRunning: boolean;
  running: boolean;
  runStatus?: RunStatus;
  thinkingDisplay: Pick<ThinkingDisplaySettings, "showRunStatusCard"> | undefined;
}): boolean {
  return shouldShowRunStatusCard(thinkingDisplay, running, runStatus) && !reviewRunning;
}

export function useAppWorkflowRecordingReviewControls({
  activeThread,
  running,
  runStatus,
  thinkingDisplay,
  workflowRecorderSurface,
}: {
  activeThread: WorkflowRecordingReviewThread | undefined;
  running: boolean;
  runStatus?: RunStatus;
  thinkingDisplay: Pick<ThinkingDisplaySettings, "showRunStatusCard"> | undefined;
  workflowRecorderSurface: WorkflowRecorderSurfaceModel;
}): {
  conversationReviewPanelDocked: boolean;
  runStatusCardVisible: boolean;
  workflowRecorderEmptyChatState: WorkflowRecorderSurfaceModel["recordingChatEmptyState"];
  workflowRecordingReviewFeedbackActive: boolean;
  workflowRecordingReviewPanelKey: string | undefined;
  workflowRecordingReviewPanelOpen: boolean;
  setWorkflowRecordingReviewPanelOpen: Dispatch<SetStateAction<boolean>>;
  workflowRecordingReviewRunning: boolean;
} {
  const [workflowRecordingReviewPanelOpen, setWorkflowRecordingReviewPanelOpen] = useState(true);
  const workflowRecorderEmptyChatState = useMemo(
    () => workflowRecorderEmptyChatStateForThread({ activeThread, workflowRecorderSurface }),
    [activeThread, workflowRecorderSurface],
  );
  const workflowRecordingReviewPanelKey = useMemo(
    () => workflowRecordingReviewPanelKeyForThread(activeThread),
    [activeThread],
  );
  const workflowRecordingReviewFeedbackActive = workflowRecordingReviewFeedbackIsActive({
    activeThread,
    panelKey: workflowRecordingReviewPanelKey,
  });
  const workflowRecordingReviewRunning = Boolean(workflowRecordingReviewFeedbackActive && running);
  const runStatusCardVisible = workflowReviewRunStatusCardVisible({
    reviewRunning: workflowRecordingReviewRunning,
    running,
    runStatus,
    thinkingDisplay,
  });

  useEffect(() => {
    if (workflowRecordingReviewPanelKey) setWorkflowRecordingReviewPanelOpen(true);
  }, [workflowRecordingReviewPanelKey]);

  return {
    conversationReviewPanelDocked: Boolean(workflowRecordingReviewPanelOpen && workflowRecordingReviewPanelKey),
    runStatusCardVisible,
    workflowRecorderEmptyChatState,
    workflowRecordingReviewFeedbackActive,
    workflowRecordingReviewPanelKey,
    workflowRecordingReviewPanelOpen,
    setWorkflowRecordingReviewPanelOpen,
    workflowRecordingReviewRunning,
  };
}
