import type { AgentToolResult, ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { DesktopEvent } from "../../../shared/desktopTypes";
import type { WorkflowRecordingState } from "../../../shared/workflowTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { WorkflowRecordingReviewValidationError } from "../../../shared/workflowRecorder";
import { workflowRecordingReviewDraftUpdateFromToolParams } from "../agentRuntimeWorkflowRecordingFacade";

export const WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL = "workflow_recording_review_read_draft";
export const WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL = "workflow_recording_review_update_draft";
export const WORKFLOW_RECORDING_REVIEW_ACTIVE_TOOL_NAMES = [
  WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL,
  WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
] as const;

export interface WorkflowRecordingReviewToolsOptions {
  threadId: string;
  getThread: (threadId: string) => ThreadSummary;
  updateWorkflowRecordingReviewDraft: (
    threadId: string,
    draft: ReturnType<typeof workflowRecordingReviewDraftUpdateFromToolParams>,
    options: { source?: "pi_summary" },
  ) => WorkflowRecordingState;
  emit: (event: DesktopEvent) => void;
}

export function createWorkflowRecordingReviewTools(options: WorkflowRecordingReviewToolsOptions): ToolDefinition<any, any, any>[] {
  const runtime = "workflow-recording-review";
  const textResult = (text: string, details: Record<string, unknown> = {}): AgentToolResult<Record<string, unknown>> => ({
    content: [{ type: "text", text }],
    details: { runtime, ...details },
  });
  const readDraft: ToolDefinition<any, any, any> = {
    name: WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL,
    label: "Read workflow review draft",
    description: "Read the current stopped Workflow Recording review draft. This tool does not inspect files or continue the recorded workflow.",
    promptSnippet: `${WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL}: Read the current durable workflow review draft before proposing edits.`,
    promptGuidelines: [
      "Use this only inside Workflow Recording review.",
      "Use the returned draft as the current source of truth for the side-panel review.",
    ],
    parameters: { type: "object", properties: {}, additionalProperties: false } as any,
    executionMode: "sequential",
    execute: async () => {
      const recording = options.getThread(options.threadId).workflowRecording;
      const draft = recording?.review?.draft;
      if (!recording || recording.status === "recording" || !draft) throw new Error("No stopped workflow recording review draft is available.");
      const text = [
        "Current Workflow Recording review draft:",
        "```json",
        JSON.stringify(draft, null, 2),
        "```",
      ].join("\n");
      return textResult(text, {
        toolName: WORKFLOW_RECORDING_REVIEW_READ_DRAFT_TOOL,
        status: "complete",
        draft,
        validationIssues: recording.review?.validationIssues ?? [],
      });
    },
  };
  const updateDraft: ToolDefinition<any, any, any> = {
    name: WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
    label: "Update workflow review draft",
    description:
      "Update the durable Workflow Recording review draft shown in the side panel. Rejects run-specific filenames and local paths in reusable fields with concrete repair feedback.",
    promptSnippet: `${WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL}: Update the durable review draft after making it reusable.`,
    promptGuidelines: [
      "Call this instead of writing Markdown when reviewing a stopped Workflow Recording.",
      "If this tool rejects a draft, fix the listed fields and call it again.",
      "Keep durable fields reusable: avoid recorded-run filenames, local absolute paths, timestamps, byte counts, and one-off results.",
    ],
    parameters: workflowRecordingReviewUpdateDraftToolSchema() as any,
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate) => {
      onUpdate?.({
        content: [{ type: "text", text: "Validating reusable workflow review draft." }],
        details: { runtime, toolName: WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL, status: "validating" },
      });
      const draft = workflowRecordingReviewDraftUpdateFromToolParams(params);
      try {
        const recording = options.updateWorkflowRecordingReviewDraft(options.threadId, draft, { source: "pi_summary" });
        options.emit({ type: "thread-updated", thread: options.getThread(options.threadId) });
        return textResult(
          [
            "Workflow review draft updated.",
            "The side panel now contains the reusable playbook draft. Ask the user exactly: Is this workflow summary correct? Reply with corrections or say Confirm.",
          ].join("\n"),
          {
            toolName: WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
            status: "complete",
            draft: recording.review?.draft,
          },
        );
      } catch (error) {
        if (error instanceof WorkflowRecordingReviewValidationError) {
          options.emit({ type: "thread-updated", thread: options.getThread(options.threadId) });
          return {
            content: [{ type: "text", text: error.message }],
            isError: true,
            details: {
              runtime,
              toolName: WORKFLOW_RECORDING_REVIEW_UPDATE_DRAFT_TOOL,
              status: "rejected",
              issues: error.issues,
            },
          };
        }
        throw error;
      }
    },
  };
  return [readDraft, updateDraft];
}

export function workflowRecordingReviewUpdateDraftToolSchema(): Record<string, unknown> {
  const textList = { type: "array", items: { type: "string" }, maxItems: 12 };
  const toolExample = {
    type: "object",
    properties: {
      toolName: { type: "string", description: "Tool name from the recorded successful example." },
      inputPreview: { type: "string", description: "Reusable input shape. Do not name exact files discovered in the run." },
      resultPreview: { type: "string", description: "Reusable result shape. Do not name exact files discovered in the run." },
      artifactPath: { type: "string", description: "Only use generic placeholders, not local absolute paths." },
    },
    required: ["toolName"],
    additionalProperties: false,
  };
  const avoidPattern = {
    type: "object",
    properties: {
      toolName: { type: "string" },
      status: { type: "string", enum: ["failed", "skipped", "permission_blocked"] },
      reason: { type: "string" },
    },
    required: ["status", "reason"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      draft: {
        type: "object",
        properties: {
          intent: { type: "string", description: "Reusable workflow intent, not a summary of one run's concrete findings." },
          inputs: textList,
          successfulExamples: { type: "array", items: toolExample, maxItems: 12 },
          doNot: { type: "array", items: avoidPattern, maxItems: 12 },
          validation: textList,
          outputShape: textList,
        },
        required: ["intent", "inputs", "successfulExamples", "doNot", "validation", "outputShape"],
        additionalProperties: false,
      },
    },
    required: ["draft"],
    additionalProperties: false,
  };
}
