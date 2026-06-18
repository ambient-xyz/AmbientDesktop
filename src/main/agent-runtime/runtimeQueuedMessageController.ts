import type { ImageContent } from "@mariozechner/pi-ai";
import {
  emptyQueueState,
  queueStateFromSnapshots,
  reconcileQueuedMessages,
  type QueuedMessageSnapshot,
} from "../../shared/messageDelivery";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type { ChatMessage } from "../../shared/threadTypes";
import { agentRuntimeQueuedMessageMetadata } from "../agent-runtime/agentRuntimeUserMessageMetadata";

export type RuntimeQueuedMessageSnapshot = QueuedMessageSnapshot & {
  imageInputs?: ImageContent[];
};

export interface RuntimeQueuedMessageSession {
  steer: (content: string, imageInputs?: ImageContent[]) => Promise<unknown>;
  followUp: (content: string, imageInputs?: ImageContent[]) => Promise<unknown>;
}

export interface RuntimeQueuedMessageControllerInput {
  threadId: string;
  workspacePath: string;
  isRunStoreActive: () => boolean;
  markRunActivity: () => boolean;
  getSession: () => RuntimeQueuedMessageSession | undefined;
  isQueueReady: () => boolean;
  incrementRunEventSeq: () => void;
  replaceMessage: (
    messageId: string,
    content: string,
    metadata: Record<string, unknown>,
  ) => ChatMessage;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimeQueuedMessageController {
  messages: () => RuntimeQueuedMessageSnapshot[];
  hasQueuedOrSentInput: () => boolean;
  enqueue: (message: RuntimeQueuedMessageSnapshot) => Promise<void>;
  flushPending: () => Promise<void>;
  markQueuedMessagesAborted: () => void;
  reconcileQueueUpdate: (steering: string[], followUp: string[]) => void;
}

export function createRuntimeQueuedMessageController(
  input: RuntimeQueuedMessageControllerInput,
): RuntimeQueuedMessageController {
  let queuedUserMessages: RuntimeQueuedMessageSnapshot[] = [];
  const pendingQueueDeliveries: RuntimeQueuedMessageSnapshot[] = [];

  const emitLocalQueue = () => {
    input.incrementRunEventSeq();
    if (!input.markRunActivity()) return;
    input.emitRunEvent({
      type: "queue-updated",
      queue: queueStateFromSnapshots(input.threadId, queuedUserMessages),
    });
  };

  const updateQueuedMessage = (message: RuntimeQueuedMessageSnapshot) => {
    input.incrementRunEventSeq();
    if (!input.markRunActivity()) return;
    const updated = input.replaceMessage(
      message.id,
      message.content,
      agentRuntimeQueuedMessageMetadata(message, { status: message.status, runtime: "pi" }),
    );
    input.emitRunEvent({ type: "message-updated", message: updated });
  };

  const setQueuedMessageStatus = (id: string, status: QueuedMessageSnapshot["status"]) => {
    queuedUserMessages = queuedUserMessages.map((message) => {
      if (message.id !== id || message.status === status) return message;
      const next = { ...message, status };
      updateQueuedMessage(next);
      return next;
    });
    emitLocalQueue();
  };

  const deliverQueuedMessage = async (message: RuntimeQueuedMessageSnapshot) => {
    const session = input.getSession();
    if (!session) return;
    try {
      if (message.delivery === "follow-up") {
        await session.followUp(message.modelContent ?? message.content, message.imageInputs);
      } else {
        await session.steer(message.modelContent ?? message.content, message.imageInputs);
      }
    } catch (error) {
      if (!input.isRunStoreActive()) return;
      setQueuedMessageStatus(message.id, "error");
      const errorMessage = error instanceof Error ? error.message : String(error);
      input.emitRunEvent({
        type: "error",
        message: errorMessage,
        threadId: input.threadId,
        workspacePath: input.workspacePath,
      });
    }
  };

  return {
    messages: () => queuedUserMessages,
    hasQueuedOrSentInput: () =>
      queuedUserMessages.some((message) => message.status === "queued" || message.status === "sent"),
    enqueue: async (message) => {
      if (!input.isRunStoreActive()) return;
      queuedUserMessages = [...queuedUserMessages, message];
      emitLocalQueue();
      if (input.getSession() && input.isQueueReady()) {
        await deliverQueuedMessage(message);
      } else {
        pendingQueueDeliveries.push(message);
      }
    },
    flushPending: async () => {
      while (pendingQueueDeliveries.length > 0) {
        const message = pendingQueueDeliveries.shift();
        if (message) await deliverQueuedMessage(message);
      }
    },
    markQueuedMessagesAborted: () => {
      for (const message of queuedUserMessages) {
        if (message.status === "queued") setQueuedMessageStatus(message.id, "aborted");
      }
      input.emitRunEvent({ type: "queue-updated", queue: emptyQueueState(input.threadId) });
    },
    reconcileQueueUpdate: (steering, followUp) => {
      if (!input.isRunStoreActive()) return;
      const nextMessages = reconcileQueuedMessages(queuedUserMessages, { steering, followUp });
      for (const message of nextMessages) {
        const previous = queuedUserMessages.find((item) => item.id === message.id);
        if (previous?.status !== message.status) updateQueuedMessage(message);
      }
      queuedUserMessages = nextMessages;
      input.emitRunEvent({ type: "queue-updated", queue: { threadId: input.threadId, steering, followUp } });
    },
  };
}
