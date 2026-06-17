import type { ChatMessage, DesktopEvent } from "../../shared/types";
import {
  piAssistantMessageMetadata,
  piThinkingMessageMetadata,
} from "../agent-runtime/agentRuntimeAssistantMessageMetadata";
import { runtimeMessageContentOrFallback } from "../agent-runtime/agentRuntimeMessageContent";

type AssistantStatus = "done" | "error" | "aborted";
type ThinkingStatus = "done" | "error" | "aborted";

export interface RuntimeAssistantMessageControllerInput {
  threadId: string;
  initialAssistantMessage: ChatMessage;
  markRunActivity: () => boolean;
  resetAssistantStreamState: () => void;
  resetThinkingStreamState: () => void;
  listMessages: () => readonly Pick<ChatMessage, "id" | "content">[];
  addAssistantMessage: (input: { threadId: string; content: string; metadata: Record<string, unknown> }) => ChatMessage;
  appendToMessage: (messageId: string, delta: string) => ChatMessage;
  replaceMessage: (messageId: string, content: string, metadata?: Record<string, unknown>) => ChatMessage;
  emitRunEvent: (event: DesktopEvent) => void;
}

export interface RuntimeAssistantMessageController {
  currentAssistantMessageId(): string;
  assistantStartCount(): number;
  currentMessageContent(messageId: string | undefined, fallbackContent: string): string;
  currentAssistantContent(fallbackContent: string): string;
  startAssistantMessage(): void;
  ensureAssistantMessage(): string;
  appendAssistantDelta(delta: string): ChatMessage;
  replaceCurrentAssistant(content: string, metadata?: Record<string, unknown>): ChatMessage;
  finishCurrentAssistantMessage(status: AssistantStatus, fallbackContent: string): void;
  ensureThinkingMessage(): string;
  appendThinkingDelta(delta: string): ChatMessage;
  replaceCurrentThinking(content: string, metadata?: Record<string, unknown>): ChatMessage;
  finishCurrentThinkingMessage(status: ThinkingStatus, fallbackContent: string): void;
}

export function createRuntimeAssistantMessageController(
  input: RuntimeAssistantMessageControllerInput,
): RuntimeAssistantMessageController {
  let currentAssistantMessageId = input.initialAssistantMessage.id;
  let assistantStartCount = 0;
  let currentThinkingMessageId: string | undefined;
  let thinkingFinished = false;

  const emitMessageCreated = (message: ChatMessage) => {
    input.emitRunEvent({ type: "message-created", message });
  };
  const emitMessageUpdated = (message: ChatMessage) => {
    input.emitRunEvent({ type: "message-updated", message });
  };
  const emitMessageDelta = (messageId: string, delta: string) => {
    input.emitRunEvent({ type: "message-delta", messageId, delta, threadId: input.threadId });
  };

  const currentMessageContent = (messageId: string | undefined, fallbackContent: string) =>
    runtimeMessageContentOrFallback(input.listMessages(), messageId, fallbackContent);

  const startAssistantMessage = () => {
    if (!input.markRunActivity()) return;
    if (assistantStartCount === 0 && currentAssistantMessageId === input.initialAssistantMessage.id) {
      assistantStartCount += 1;
      input.resetAssistantStreamState();
      return;
    }
    const next = input.addAssistantMessage({
      threadId: input.threadId,
      content: "",
      metadata: piAssistantMessageMetadata("streaming"),
    });
    assistantStartCount += 1;
    currentAssistantMessageId = next.id;
    input.resetAssistantStreamState();
    emitMessageCreated(next);
  };

  const ensureAssistantMessage = () => {
    if (!currentAssistantMessageId) startAssistantMessage();
    return currentAssistantMessageId;
  };

  const appendAssistantDelta = (delta: string) => {
    const messageId = ensureAssistantMessage();
    const message = input.appendToMessage(messageId, delta);
    emitMessageDelta(messageId, delta);
    return message;
  };

  const replaceCurrentAssistant = (content: string, metadata?: Record<string, unknown>) =>
    input.replaceMessage(currentAssistantMessageId, content, metadata);

  const finishCurrentAssistantMessage = (status: AssistantStatus, fallbackContent: string) => {
    if (!input.markRunActivity()) return;
    const updated = replaceCurrentAssistant(
      currentMessageContent(currentAssistantMessageId, fallbackContent),
      piAssistantMessageMetadata(status),
    );
    emitMessageUpdated(updated);
  };

  const startThinkingMessage = () => {
    if (!input.markRunActivity()) return;
    const thinkingMessage = input.addAssistantMessage({
      threadId: input.threadId,
      content: "",
      metadata: piThinkingMessageMetadata("thinking"),
    });
    currentThinkingMessageId = thinkingMessage.id;
    thinkingFinished = false;
    input.resetThinkingStreamState();
    emitMessageCreated(thinkingMessage);
  };

  const ensureThinkingMessage = (): string => {
    if (!currentThinkingMessageId || thinkingFinished) startThinkingMessage();
    if (!currentThinkingMessageId) throw new Error("Unable to create thinking message.");
    return currentThinkingMessageId;
  };

  const appendThinkingDelta = (delta: string) => {
    const messageId = ensureThinkingMessage();
    const message = input.appendToMessage(messageId, delta);
    emitMessageDelta(messageId, delta);
    return message;
  };

  const replaceCurrentThinking = (content: string, metadata?: Record<string, unknown>) => {
    const messageId = ensureThinkingMessage();
    return input.replaceMessage(messageId, content, metadata);
  };

  const finishCurrentThinkingMessage = (status: ThinkingStatus, fallbackContent: string) => {
    if (!currentThinkingMessageId || thinkingFinished) return;
    if (!input.markRunActivity()) return;
    const updated = input.replaceMessage(
      currentThinkingMessageId,
      currentMessageContent(currentThinkingMessageId, fallbackContent),
      piThinkingMessageMetadata(status),
    );
    thinkingFinished = true;
    emitMessageUpdated(updated);
  };

  return {
    currentAssistantMessageId: () => currentAssistantMessageId,
    assistantStartCount: () => assistantStartCount,
    currentMessageContent,
    currentAssistantContent: (fallbackContent) => currentMessageContent(currentAssistantMessageId, fallbackContent),
    startAssistantMessage,
    ensureAssistantMessage,
    appendAssistantDelta,
    replaceCurrentAssistant,
    finishCurrentAssistantMessage,
    ensureThinkingMessage,
    appendThinkingDelta,
    replaceCurrentThinking,
    finishCurrentThinkingMessage,
  };
}
