import { describe, expect, it } from "vitest";

import {
  workflowRecorderEmptyChatStateForThread,
  workflowRecordingReviewFeedbackIsActive,
  workflowRecordingReviewPanelKeyForThread,
  workflowReviewRunStatusCardVisible,
  type WorkflowRecordingReviewThread,
} from "./AppWorkflowRecordingReviewControls";
import type { WorkflowRecorderSurfaceModel } from "./workflowRecorderUiModel";
import type {
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingState,
} from "../../shared/types";

describe("AppWorkflowRecordingReviewControls", () => {
  it("builds a stable review panel key only after a draft is available", () => {
    expect(workflowRecordingReviewPanelKeyForThread(undefined)).toBeUndefined();
    expect(workflowRecordingReviewPanelKeyForThread(thread(recording({ status: "recording" })))).toBeUndefined();
    expect(workflowRecordingReviewPanelKeyForThread(thread(recording({ status: "stopped" })))).toBeUndefined();

    expect(workflowRecordingReviewPanelKeyForThread(thread(recording({
      status: "stopped",
      review: {
        status: "draft",
        draft: draft({ source: "pi_summary", generatedAt: "2026-06-13T00:00:00.000Z" }),
      },
    })))).toBe("thread-1:draft:pi_summary:2026-06-13T00:00:00.000Z");
  });

  it("keeps feedback active until the review is confirmed", () => {
    const panelKey = "thread-1:draft:ambient:2026-06-13T00:00:00.000Z";

    expect(workflowRecordingReviewFeedbackIsActive({
      activeThread: thread(recording({ status: "stopped", review: { status: "draft", draft: draft() } })),
      panelKey,
    })).toBe(true);
    expect(workflowRecordingReviewFeedbackIsActive({
      activeThread: thread(recording({ status: "stopped", review: { status: "confirmed", draft: draft() } })),
      panelKey,
    })).toBe(false);
  });

  it("uses the recorder empty state only for non-legacy recording chats", () => {
    const emptyState = { title: "Workflow Recorder", paragraphs: ["Record a useful workflow."] };

    expect(workflowRecorderEmptyChatStateForThread({
      activeThread: thread(recording({ status: "recording" })),
      workflowRecorderSurface: surface({ legacyCompilerEnabled: false, recordingChatEmptyState: emptyState }),
    })).toBe(emptyState);
    expect(workflowRecorderEmptyChatStateForThread({
      activeThread: thread(recording({ status: "recording" })),
      workflowRecorderSurface: surface({ legacyCompilerEnabled: true, recordingChatEmptyState: emptyState }),
    })).toBeUndefined();
  });

  it("hides the generic run status card while review feedback is running", () => {
    expect(workflowReviewRunStatusCardVisible({
      reviewRunning: false,
      running: true,
      thinkingDisplay: { showRunStatusCard: true },
    })).toBe(true);
    expect(workflowReviewRunStatusCardVisible({
      reviewRunning: true,
      running: true,
      thinkingDisplay: { showRunStatusCard: true },
    })).toBe(false);
  });
});

function thread(workflowRecording: WorkflowRecordingReviewThread["workflowRecording"]): WorkflowRecordingReviewThread {
  return {
    id: "thread-1",
    workflowRecording,
  };
}

function recording(overrides: Partial<WorkflowRecordingState>): WorkflowRecordingState {
  return {
    status: "stopped",
    startedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

function draft(overrides: Partial<WorkflowRecordingPlaybookDraft> = {}): WorkflowRecordingPlaybookDraft {
  return {
    status: "draft",
    source: "pi_summary",
    generatedAt: "2026-06-13T00:00:00.000Z",
    sourceCapturedAt: "2026-06-13T00:00:00.000Z",
    intent: "Capture a repeatable task.",
    inputs: [],
    successfulExamples: [],
    doNot: [],
    validation: [],
    outputShape: [],
    evidenceSummary: {
      messageCount: 0,
      toolResultCount: 0,
      successfulToolResultCount: 0,
      failedToolResultCount: 0,
      skippedToolResultCount: 0,
      permissionBlockedToolResultCount: 0,
      redactionCount: 0,
    },
    ...overrides,
  };
}

function surface(overrides: Pick<WorkflowRecorderSurfaceModel, "legacyCompilerEnabled" | "recordingChatEmptyState">): WorkflowRecorderSurfaceModel {
  return {
    legacyCompilerEnabled: overrides.legacyCompilerEnabled,
    recordingChatEmptyState: overrides.recordingChatEmptyState,
  } as WorkflowRecorderSurfaceModel;
}
