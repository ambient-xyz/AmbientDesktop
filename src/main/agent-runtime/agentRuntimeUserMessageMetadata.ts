import type { QueuedMessageSnapshot } from "../../shared/messageDelivery";
import type { MessageDelivery, SendMessageInput } from "../../shared/types";

export function agentRuntimeUserMessageMetadata(
  input: Pick<
    SendMessageInput,
    "context" | "workflowThreadId" | "workflowRecordingEditContext" | "composerIntent" | "stt"
  >,
  options: {
    delivery?: Exclude<MessageDelivery, "prompt">;
    dedicatedSessionKind?: "workflow-recording-review";
    includeWorkflowRecordingEditContext?: boolean;
  } = {},
): Record<string, unknown> | undefined {
  const metadata = {
    ...(options.delivery ? { status: "queued", delivery: options.delivery, runtime: "pi" } : {}),
    ...(input.context?.length ? { context: input.context } : {}),
    ...(input.workflowThreadId ? { workflowThreadId: input.workflowThreadId, workflowMode: "plan-edit" } : {}),
    ...(options.includeWorkflowRecordingEditContext !== false && input.workflowRecordingEditContext
      ? { workflowRecordingEditContext: input.workflowRecordingEditContext }
      : {}),
    ...(input.composerIntent ? { composerIntent: input.composerIntent } : {}),
    ...(input.stt ? { stt: input.stt } : {}),
    ...(options.dedicatedSessionKind === "workflow-recording-review"
      ? { workflowRecordingReview: true, dedicatedSession: "workflow-recording-review" }
      : {}),
  };
  return Object.keys(metadata).length ? metadata : undefined;
}

export function agentRuntimeQueuedMessageMetadata(
  message: Pick<QueuedMessageSnapshot, "delivery" | "context" | "workflowThreadId" | "stt">,
  options: {
    status: QueuedMessageSnapshot["status"];
    runtime: "pi" | "local_text";
    error?: string;
  },
): Record<string, unknown> {
  return {
    status: options.status,
    delivery: message.delivery,
    runtime: options.runtime,
    ...(options.error !== undefined ? { error: options.error } : {}),
    ...(message.context?.length ? { context: message.context } : {}),
    ...(message.workflowThreadId ? { workflowThreadId: message.workflowThreadId, workflowMode: "plan-edit" } : {}),
    ...(message.stt ? { stt: message.stt } : {}),
  };
}
