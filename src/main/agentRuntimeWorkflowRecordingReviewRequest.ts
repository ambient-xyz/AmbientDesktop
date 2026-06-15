import type { MessageDelivery, SendMessageInput, ThreadSummary } from "../shared/types";
import { workflowRecordingReviewPromptFromState } from "../shared/workflowRecorder";

export type AgentRuntimeWorkflowRecordingReviewSendInput =
  Pick<
    SendMessageInput,
    | "threadId"
    | "content"
    | "permissionMode"
    | "collaborationMode"
    | "model"
    | "thinkingLevel"
    | "preserveActiveThread"
  > & {
    visibleUserContent: string;
    modelContentOverride: string;
    delivery: Extract<MessageDelivery, "prompt">;
    dedicatedSessionKind: "workflow-recording-review";
  };

export function workflowRecordingReviewSendInputForThread(
  thread: Pick<
    ThreadSummary,
    "id" | "workflowRecording" | "permissionMode" | "collaborationMode" | "model" | "thinkingLevel"
  >,
  input: { feedback?: string } = {},
): AgentRuntimeWorkflowRecordingReviewSendInput {
  const prompt = workflowRecordingReviewPromptFromState(thread.workflowRecording, { feedback: input.feedback });
  if (!prompt) {
    throw new Error("Stop the workflow recording before asking Ambient to review the draft playbook.");
  }
  const feedback = typeof input.feedback === "string" ? input.feedback.trim() : "";
  const visibleContent = feedback || "Review the stopped workflow recording with Ambient.";
  return {
    threadId: thread.id,
    content: visibleContent,
    visibleUserContent: visibleContent,
    modelContentOverride: prompt,
    permissionMode: thread.permissionMode,
    collaborationMode: thread.collaborationMode,
    model: thread.model,
    thinkingLevel: thread.thinkingLevel,
    delivery: "prompt",
    preserveActiveThread: true,
    dedicatedSessionKind: "workflow-recording-review",
  };
}
