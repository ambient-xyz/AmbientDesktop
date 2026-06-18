import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowRecordingState } from "../../shared/workflowTypes";
import {
  WorkflowRecordingChatBanner,
  WorkflowRecordingReviewPanel,
} from "./AppWorkflowRecording";

describe("AppWorkflowRecording", () => {
  it("renders the active Ambient review banner from run activity", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRecordingChatBanner
        recording={stoppedRecording()}
        reviewRunning
        running
        abortArmed
        activeThreadId="thread-1"
        activeRunActivityLines={[
          { id: "activity-1", kind: "state", text: "Workflow recording stopped; dedicated review sent to Ambient.", timestamp: 1 },
          { id: "activity-2", kind: "tool", text: "Tool execution is in progress.", timestamp: 2 },
        ]}
        runStatus="tool"
        retryStats={{ attempt: 2, maxAttempts: 5, completed: 1, active: true, recovered: false, lastMessage: "Network pause" }}
        chatExportBusy={false}
        onRetryReview={vi.fn()}
        onAbortRun={vi.fn()}
        onStopRecording={vi.fn()}
        onExportActiveChat={vi.fn()}
      />,
    );

    expect(markup).toContain("workflow-recorder-review-activity");
    expect(markup).toContain("Reviewing with Ambient");
    expect(markup).toContain("Status using tools");
    expect(markup).toContain("Aggressive retries 2/5 running");
    expect(markup).toContain("Tool execution is in progress.");
  });

  it("renders the draft review panel and editable playbook form", () => {
    const markup = renderToStaticMarkup(
      <WorkflowRecordingReviewPanel
        recording={stoppedRecording()}
        open
        running={false}
        onClose={vi.fn()}
        onRetryReview={vi.fn()}
        onApplyLatestSummary={vi.fn()}
        onSaveReviewEdit={vi.fn()}
        onDraftValidationError={vi.fn()}
        onFocusFeedback={vi.fn()}
        onConfirmReview={vi.fn()}
      />,
    );

    expect(markup).toContain("workflow-recorder-review-panel");
    expect(markup).toContain("Workflow Review");
    expect(markup).toContain("Draft workflow playbook");
    expect(markup).toContain("Edit workflow recording review");
    expect(markup).toContain("Find and summarize launch evidence.");
    expect(markup).toContain("Apply latest Ambient summary");
    expect(markup).toContain("Confirm playbook");
  });
});

function stoppedRecording(): WorkflowRecordingState {
  return {
    status: "stopped",
    goal: "Create a launch-evidence workflow.",
    startedAt: "2026-06-12T00:00:00.000Z",
    stoppedAt: "2026-06-12T00:01:00.000Z",
    review: {
      status: "draft",
      draft: {
        status: "draft",
        source: "deterministic_capture",
        generatedAt: "2026-06-12T00:01:00.000Z",
        sourceCapturedAt: "2026-06-12T00:00:30.000Z",
        intent: "Find and summarize launch evidence.",
        inputs: ["Target project"],
        successfulExamples: [{
          toolName: "file_read",
          inputPreview: "Read selected evidence files",
          resultPreview: "Returned relevant launch evidence",
        }],
        doNot: [{
          toolName: "shell",
          status: "skipped",
          reason: "Do not inspect unrelated files.",
        }],
        validation: ["Confirm the summary cites only captured evidence."],
        outputShape: ["Launch evidence summary"],
        evidenceSummary: {
          messageCount: 3,
          toolResultCount: 1,
          successfulToolResultCount: 1,
          failedToolResultCount: 0,
          skippedToolResultCount: 0,
          permissionBlockedToolResultCount: 0,
          redactionCount: 0,
        },
      },
    },
  };
}
