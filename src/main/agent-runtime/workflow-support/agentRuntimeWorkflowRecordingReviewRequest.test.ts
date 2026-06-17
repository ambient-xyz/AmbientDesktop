import { describe, expect, it } from "vitest";

import type {
  ThreadSummary,
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingState,
} from "../../../shared/types";
import { workflowRecordingReviewSendInputForThread } from "./agentRuntimeWorkflowRecordingReviewRequest";

describe("workflowRecordingReviewSendInputForThread", () => {
  it("builds a dedicated review send input from trimmed feedback", () => {
    const result = workflowRecordingReviewSendInputForThread(thread(), {
      feedback: "  Make this reusable.  ",
    });

    expect(result).toMatchObject({
      threadId: "thread-1",
      content: "Make this reusable.",
      visibleUserContent: "Make this reusable.",
      permissionMode: "workspace",
      collaborationMode: "agent",
      model: "ambient-preview",
      thinkingLevel: "medium",
      delivery: "prompt",
      preserveActiveThread: true,
      dedicatedSessionKind: "workflow-recording-review",
    });
    expect(result.modelContentOverride).toContain("Review this stopped Workflow Recording");
    expect(result.modelContentOverride).toContain("Make this reusable.");
    expect(result.modelContentOverride).toContain("Inspect selected workspace files");
  });

  it("uses the default visible request when feedback is blank", () => {
    const result = workflowRecordingReviewSendInputForThread(thread(), {
      feedback: "  ",
    });

    expect(result.content).toBe("Review the stopped workflow recording with Ambient.");
    expect(result.visibleUserContent).toBe("Review the stopped workflow recording with Ambient.");
    expect(result.modelContentOverride).toContain("Reusable-field rules:");
  });

  it("requires a stopped workflow recording review draft", () => {
    expect(() => workflowRecordingReviewSendInputForThread(thread({
      workflowRecording: { status: "recording", startedAt: "2026-06-12T00:00:00.000Z" },
    }))).toThrow("Stop the workflow recording before asking Ambient to review the draft playbook.");
    expect(() => workflowRecordingReviewSendInputForThread(thread({
      workflowRecording: { ...recording(), review: undefined },
    }))).toThrow("Stop the workflow recording before asking Ambient to review the draft playbook.");
  });
});

function thread(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Workflow review",
    workspacePath: "/workspace",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient-preview",
    thinkingLevel: "medium",
    workflowRecording: recording(),
    ...overrides,
  };
}

function recording(): WorkflowRecordingState {
  return {
    status: "stopped",
    goal: "Create a reusable review workflow.",
    startedAt: "2026-06-12T00:00:00.000Z",
    stoppedAt: "2026-06-12T00:01:00.000Z",
    review: {
      status: "draft",
      draft: draft(),
    },
  };
}

function draft(): WorkflowRecordingPlaybookDraft {
  return {
    status: "draft",
    source: "deterministic_capture",
    generatedAt: "2026-06-12T00:01:00.000Z",
    sourceCapturedAt: "2026-06-12T00:00:30.000Z",
    intent: "Inspect selected workspace files and produce a reusable summary.",
    inputs: ["Target workspace files"],
    successfulExamples: [{
      toolName: "file_read",
      inputPreview: "Read selected file paths",
      resultPreview: "Returned file contents",
    }],
    doNot: [{
      toolName: "shell",
      status: "skipped",
      reason: "Do not inspect unrelated files.",
    }],
    validation: ["Confirm the summary avoids local-only filenames."],
    outputShape: ["Reusable workflow summary"],
    evidenceSummary: {
      messageCount: 2,
      toolResultCount: 1,
      successfulToolResultCount: 1,
      failedToolResultCount: 0,
      skippedToolResultCount: 0,
      permissionBlockedToolResultCount: 0,
      redactionCount: 0,
    },
  };
}
