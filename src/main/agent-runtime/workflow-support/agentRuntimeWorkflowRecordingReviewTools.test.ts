import { describe, expect, it } from "vitest";
import type { DesktopEvent } from "../../../shared/desktopTypes";
import type {
  WorkflowRecordingPlaybookDraft,
  WorkflowRecordingReviewDraftUpdate,
  WorkflowRecordingState,
  WorkflowRecordingReviewValidationIssue,
} from "../../../shared/workflowTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { WorkflowRecordingReviewValidationError } from "../../../shared/workflowRecorder";
import {
  createWorkflowRecordingReviewTools,
  WORKFLOW_RECORDING_REVIEW_ACTIVE_TOOL_NAMES,
  WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL,
  WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
  workflowRecordingReviewUpdateDraftToolSchema,
} from "./agentRuntimeWorkflowRecordingReviewTools";

describe("agent runtime workflow recording review tools", () => {
  it("exports the workflow review active tool names in registration order", () => {
    expect(WORKFLOW_RECORDING_REVIEW_ACTIVE_TOOL_NAMES).toEqual([
      WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL,
      WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
    ]);
    expect(createTools().tools.map((tool) => tool.name)).toEqual([...WORKFLOW_RECORDING_REVIEW_ACTIVE_TOOL_NAMES]);
  });

  it("reads the current stopped workflow recording review draft", async () => {
    const { tools } = createTools({ validationIssues: [validationIssue()] });
    const result = await executeTool(readTool(tools), {});

    expect(result.content[0]?.text).toContain("Current Workflow Recording review draft:");
    expect(result.content[0]?.text).toContain('"intent": "Summarize a reusable workflow"');
    expect(result.details).toMatchObject({
      runtime: "workflow-recording-review",
      toolName: WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL,
      status: "complete",
      draft: draft(),
      validationIssues: [validationIssue()],
    });
  });

  it("rejects read requests when no stopped review draft is available", async () => {
    const { tools } = createTools({ recording: { status: "recording", startedAt: "2026-06-11T00:00:00.000Z" } });

    await expect(executeTool(readTool(tools), {})).rejects.toThrow("No stopped workflow recording review draft is available.");
  });

  it("updates the review draft through the store and emits thread updates", async () => {
    const updatedDraft = draft({ intent: "Updated reusable workflow" });
    const updates: Array<{ draft: WorkflowRecordingReviewDraftUpdate; source?: string }> = [];
    const { tools, events } = createTools({
      updateWorkflowRecordingReviewDraft: (_threadId, receivedDraft, options) => {
        updates.push({ draft: receivedDraft, source: options.source });
        return recordingState(updatedDraft);
      },
    });
    const onUpdateResults: unknown[] = [];

    const result = await executeTool(updateTool(tools), toolParams({ intent: "Updated reusable workflow" }), (update) => {
      onUpdateResults.push(update);
    });

    expect(onUpdateResults).toEqual([
      expect.objectContaining({
        content: [{ type: "text", text: "Validating reusable workflow review draft." }],
        details: {
          runtime: "workflow-recording-review",
          toolName: WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
          status: "validating",
        },
      }),
    ]);
    expect(updates).toEqual([
      {
        source: "pi_summary",
        draft: expect.objectContaining({ intent: "Updated reusable workflow" }),
      },
    ]);
    expect(events).toEqual([expect.objectContaining({ type: "thread-updated" })]);
    expect(result.content[0]?.text).toContain("Workflow review draft updated.");
    expect(result.details).toMatchObject({
      runtime: "workflow-recording-review",
      toolName: WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
      status: "complete",
      draft: updatedDraft,
    });
  });

  it("returns rejected tool output when review draft validation fails", async () => {
    const issue = validationIssue();
    const { tools, events } = createTools({
      updateWorkflowRecordingReviewDraft: () => {
        throw new WorkflowRecordingReviewValidationError([issue]);
      },
    });

    const result = await executeTool(updateTool(tools), toolParams({ intent: "/tmp/run-specific" }));

    expect(events).toEqual([expect.objectContaining({ type: "thread-updated" })]);
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("Rejected durable workflow draft") }],
      details: {
        runtime: "workflow-recording-review",
        toolName: WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
        status: "rejected",
        issues: [issue],
      },
    });
  });

  it("keeps the update schema focused on the durable draft payload", () => {
    expect(workflowRecordingReviewUpdateDraftToolSchema()).toMatchObject({
      type: "object",
      required: ["draft"],
      properties: {
        draft: {
          required: ["intent", "inputs", "successfulExamples", "doNot", "validation", "outputShape"],
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    });
  });
});

type ReviewTool = ReturnType<typeof createWorkflowRecordingReviewTools>[number];

interface ToolsInput {
  recording?: WorkflowRecordingState;
  validationIssues?: WorkflowRecordingReviewValidationIssue[];
  updateWorkflowRecordingReviewDraft?: (
    threadId: string,
    draft: WorkflowRecordingReviewDraftUpdate,
    options: { source?: "pi_summary" },
  ) => WorkflowRecordingState;
}

function createTools(input: ToolsInput = {}): { tools: ReviewTool[]; events: DesktopEvent[] } {
  const events: DesktopEvent[] = [];
  const recording = input.recording ?? recordingState(draft(), input.validationIssues);
  const thread = threadSummary(recording);
  const tools = createWorkflowRecordingReviewTools({
    threadId: thread.id,
    getThread: (threadId) => {
      expect(threadId).toBe(thread.id);
      return thread;
    },
    updateWorkflowRecordingReviewDraft: input.updateWorkflowRecordingReviewDraft ?? (() => recordingState(draft({ intent: "Updated reusable workflow" }))),
    emit: (event) => events.push(event),
  });
  return { tools, events };
}

async function executeTool(tool: ReviewTool, params: unknown, onUpdate?: (update: unknown) => void): Promise<any> {
  return (tool.execute as any)("tool-call-1", params, new AbortController().signal, onUpdate);
}

function readTool(tools: ReviewTool[]): ReviewTool {
  const tool = tools.find((candidate) => candidate.name === WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL);
  if (!tool) throw new Error("Read draft tool missing.");
  return tool;
}

function updateTool(tools: ReviewTool[]): ReviewTool {
  const tool = tools.find((candidate) => candidate.name === WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL);
  if (!tool) throw new Error("Update draft tool missing.");
  return tool;
}

function threadSummary(workflowRecording: WorkflowRecordingState): ThreadSummary {
  return {
    id: "thread-1",
    title: "Workflow Recording",
    workspacePath: "/workspace",
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "ambient",
    thinkingLevel: "medium",
    workflowRecording,
  };
}

function recordingState(
  reviewDraft: WorkflowRecordingPlaybookDraft,
  validationIssues: WorkflowRecordingReviewValidationIssue[] = [],
): WorkflowRecordingState {
  return {
    status: "stopped",
    startedAt: "2026-06-11T00:00:00.000Z",
    stoppedAt: "2026-06-11T00:01:00.000Z",
    review: {
      status: "draft",
      draft: reviewDraft,
      validationIssues,
    },
  };
}

function draft(overrides: Partial<WorkflowRecordingPlaybookDraft> = {}): WorkflowRecordingPlaybookDraft {
  return {
    status: "draft",
    source: "deterministic_capture",
    generatedAt: "2026-06-11T00:01:00.000Z",
    sourceCapturedAt: "2026-06-11T00:01:00.000Z",
    intent: "Summarize a reusable workflow",
    inputs: ["A project brief"],
    successfulExamples: [{ toolName: "browser_open", inputPreview: "Open the target application" }],
    doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid broken links" }],
    validation: ["Confirm the result is reusable"],
    outputShape: ["Reusable playbook summary"],
    evidenceSummary: {
      messageCount: 3,
      toolResultCount: 1,
      successfulToolResultCount: 1,
      failedToolResultCount: 0,
      skippedToolResultCount: 0,
      permissionBlockedToolResultCount: 0,
      redactionCount: 0,
    },
    ...overrides,
  };
}

function toolParams(overrides: Partial<WorkflowRecordingReviewDraftUpdate> = {}): unknown {
  return {
    draft: {
      intent: "Updated reusable workflow",
      inputs: ["Updated input"],
      successfulExamples: [{ toolName: "browser_open", inputPreview: "Open the target application" }],
      doNot: [{ toolName: "browser_open", status: "failed", reason: "Avoid broken links" }],
      validation: ["Check output"],
      outputShape: ["Updated output"],
      ...overrides,
    },
  };
}

function validationIssue(): WorkflowRecordingReviewValidationIssue {
  return {
    field: "intent",
    term: "/tmp/run-specific",
    reason: "local_path",
    message: "Local path found in reusable workflow intent.",
    suggestion: "Replace it with a reusable placeholder.",
  };
}
