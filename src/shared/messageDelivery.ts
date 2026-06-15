import type { MessageDelivery, QueueState, SttMessageMetadata, WorkspaceContextReference } from "./types";

export interface DeliveryInput {
  running: boolean;
  requested?: MessageDelivery;
  followUpModifier?: boolean;
}

export interface QueuedMessageSnapshot {
  id: string;
  content: string;
  modelContent?: string;
  context?: WorkspaceContextReference[];
  workflowThreadId?: string;
  stt?: SttMessageMetadata;
  delivery: Exclude<MessageDelivery, "prompt">;
  status: "queued" | "sent" | "error" | "aborted";
}

export function resolveMessageDelivery(input: DeliveryInput): MessageDelivery {
  if (!input.running) return "prompt";
  if (input.followUpModifier || input.requested === "follow-up") return "follow-up";
  return "steer";
}

export function emptyQueueState(threadId?: string): QueueState {
  return { threadId, steering: [], followUp: [] };
}

export function queueStateFromSnapshots(threadId: string, messages: QueuedMessageSnapshot[]): QueueState {
  return {
    threadId,
    steering: messages
      .filter((message) => message.status === "queued" && message.delivery === "steer")
      .map((message) => message.modelContent ?? message.content),
    followUp: messages
      .filter((message) => message.status === "queued" && message.delivery === "follow-up")
      .map((message) => message.modelContent ?? message.content),
  };
}

export function reconcileQueuedMessages(
  messages: QueuedMessageSnapshot[],
  queue: Pick<QueueState, "steering" | "followUp">,
): QueuedMessageSnapshot[] {
  const remainingSteering = counted(queue.steering);
  const remainingFollowUp = counted(queue.followUp);

  return messages.map((message) => {
    if (message.status !== "queued") return message;
    const remaining = message.delivery === "follow-up" ? remainingFollowUp : remainingSteering;
    const count = remaining.get(message.modelContent ?? message.content) ?? 0;
    if (count > 0) {
      remaining.set(message.content, count - 1);
      return message;
    }
    return { ...message, status: "sent" };
  });
}

function counted(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
