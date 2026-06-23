import type { DesktopEvent } from "../../shared/desktopTypes";
import { promptCachePendingTelemetry } from "../../shared/promptCacheTelemetry";
import type { ChatMessage, PromptCacheTelemetry } from "../../shared/threadTypes";
import {
  piAssistantMessageMetadata,
  piThinkingMessageMetadata,
} from "../agent-runtime/agentRuntimeAssistantMessageMetadata";
import { runtimeMessageContentOrFallback } from "../agent-runtime/agentRuntimeMessageContent";

type AssistantStatus = "done" | "error" | "aborted";
type ThinkingStatus = "done" | "error" | "aborted";
type ListedMessage = Pick<ChatMessage, "id" | "content" | "metadata">;

export interface RuntimeAssistantMessageControllerInput {
  threadId: string;
  initialAssistantMessage: ChatMessage;
  markRunActivity: () => boolean;
  resetAssistantStreamState: () => void;
  resetThinkingStreamState: () => void;
  listMessages: () => readonly ListedMessage[];
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
  suppressAssistantMessagesExceptCurrent(status: AssistantStatus): ChatMessage[];
  currentPromptCacheTelemetry(): PromptCacheTelemetry;
  applyPromptCacheTelemetry(telemetry: PromptCacheTelemetry): ChatMessage[];
  completePromptCacheTelemetryIfPending(telemetry: PromptCacheTelemetry): ChatMessage[];
  ensureThinkingMessage(): string;
  appendThinkingDelta(delta: string): ChatMessage;
  replaceCurrentThinking(content: string, metadata?: Record<string, unknown>): ChatMessage;
  finishCurrentThinkingMessage(status: ThinkingStatus, fallbackContent: string): void;
  suppressCurrentThinkingMessage(status: ThinkingStatus): ChatMessage | undefined;
}

export function createRuntimeAssistantMessageController(
  input: RuntimeAssistantMessageControllerInput,
): RuntimeAssistantMessageController {
  let currentAssistantMessageId = input.initialAssistantMessage.id;
  const assistantMessageIds: string[] = [input.initialAssistantMessage.id];
  let assistantStartCount = 0;
  let currentThinkingMessageId: string | undefined;
  const thinkingMessageIds: string[] = [];
  let currentRequestThinkingMessageIds: string[] = [];
  let thinkingFinished = false;
  let currentPromptCacheTelemetry = promptCachePendingTelemetry();

  const emitMessageCreated = (message: ChatMessage) => {
    input.emitRunEvent({ type: "message-created", message });
  };
  const emitMessageUpdated = (message: ChatMessage) => {
    input.emitRunEvent({ type: "message-updated", message });
  };
  const emitMessageDelta = (messageId: string, delta: string) => {
    input.emitRunEvent({ type: "message-delta", messageId, delta, threadId: input.threadId });
  };

  const listedMessages = () => input.listMessages();

  const currentMessage = (messageId: string | undefined): ListedMessage | undefined =>
    messageId ? listedMessages().find((message) => message.id === messageId) : undefined;

  const currentMessageContent = (messageId: string | undefined, fallbackContent: string) =>
    runtimeMessageContentOrFallback(listedMessages(), messageId, fallbackContent);

  const metadataWithPromptCache = (metadata?: Record<string, unknown>) => ({
    ...(metadata ?? {}),
    promptCache: currentPromptCacheTelemetry,
  });

  const promptCacheFromMetadata = (metadata?: Record<string, unknown>): PromptCacheTelemetry | undefined => {
    const promptCache = metadata?.promptCache;
    return promptCache && typeof promptCache === "object" && !Array.isArray(promptCache)
      ? promptCache as PromptCacheTelemetry
      : undefined;
  };

  const assistantMetadata = (status: "streaming" | AssistantStatus) =>
    piAssistantMessageMetadata(status, currentPromptCacheTelemetry);

  const thinkingMetadata = (status: "thinking" | ThinkingStatus) =>
    piThinkingMessageMetadata(status, currentPromptCacheTelemetry);

  const resetPromptCacheForRequest = (options: { resetThinkingMessages: boolean }) => {
    currentPromptCacheTelemetry = promptCachePendingTelemetry();
    if (options.resetThinkingMessages) currentRequestThinkingMessageIds = [];
  };

  const updateMessagePromptCache = (messageId: string | undefined): ChatMessage | undefined => {
    const existing = currentMessage(messageId);
    if (!existing) return undefined;
    const updated = input.replaceMessage(
      existing.id,
      existing.content,
      metadataWithPromptCache(existing.metadata),
    );
    emitMessageUpdated(updated);
    return updated;
  };

  const startAssistantMessage = () => {
    if (!input.markRunActivity()) return;
    resetPromptCacheForRequest({ resetThinkingMessages: assistantStartCount > 0 });
    if (assistantStartCount === 0 && currentAssistantMessageId === input.initialAssistantMessage.id) {
      assistantStartCount += 1;
      input.resetAssistantStreamState();
      const updated = input.replaceMessage(
        currentAssistantMessageId,
        currentMessageContent(currentAssistantMessageId, ""),
        assistantMetadata("streaming"),
      );
      emitMessageUpdated(updated);
      return;
    }
    const next = input.addAssistantMessage({
      threadId: input.threadId,
      content: "",
      metadata: assistantMetadata("streaming"),
    });
    assistantStartCount += 1;
    currentAssistantMessageId = next.id;
    assistantMessageIds.push(next.id);
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
    input.replaceMessage(
      currentAssistantMessageId,
      content,
      metadataWithPromptCache(metadata ?? currentMessage(currentAssistantMessageId)?.metadata),
    );

  const finishCurrentAssistantMessage = (status: AssistantStatus, fallbackContent: string) => {
    if (!input.markRunActivity()) return;
    const updated = replaceCurrentAssistant(
      currentMessageContent(currentAssistantMessageId, fallbackContent),
      assistantMetadata(status),
    );
    emitMessageUpdated(updated);
  };

  const suppressAssistantMessagesExceptCurrent = (status: AssistantStatus) => {
    if (!input.markRunActivity()) return [];
    const updatedMessages: ChatMessage[] = [];
    for (const messageId of assistantMessageIds) {
      if (messageId === currentAssistantMessageId) continue;
      const existingPromptCache = promptCacheFromMetadata(currentMessage(messageId)?.metadata);
      const updated = input.replaceMessage(
        messageId,
        "",
        piAssistantMessageMetadata(status, existingPromptCache ?? currentPromptCacheTelemetry),
      );
      updatedMessages.push(updated);
      emitMessageUpdated(updated);
    }
    return updatedMessages;
  };

  const applyPromptCacheTelemetry = (telemetry: PromptCacheTelemetry) => {
    if (!input.markRunActivity()) return [];
    currentPromptCacheTelemetry = telemetry;
    const updatedMessages: ChatMessage[] = [];
    const assistant = updateMessagePromptCache(currentAssistantMessageId);
    if (assistant) updatedMessages.push(assistant);
    for (const messageId of currentRequestThinkingMessageIds) {
      const updated = updateMessagePromptCache(messageId);
      if (updated) updatedMessages.push(updated);
    }
    return updatedMessages;
  };

  const completePromptCacheTelemetryIfPending = (telemetry: PromptCacheTelemetry) =>
    currentPromptCacheTelemetry.status === "pending"
      ? applyPromptCacheTelemetry(telemetry)
      : [];

  const startThinkingMessage = () => {
    if (!input.markRunActivity()) return;
    const thinkingMessage = input.addAssistantMessage({
      threadId: input.threadId,
      content: "",
      metadata: thinkingMetadata("thinking"),
    });
    currentThinkingMessageId = thinkingMessage.id;
    thinkingMessageIds.push(thinkingMessage.id);
    currentRequestThinkingMessageIds.push(thinkingMessage.id);
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
    return input.replaceMessage(
      messageId,
      content,
      metadataWithPromptCache(metadata ?? currentMessage(messageId)?.metadata),
    );
  };

  const finishCurrentThinkingMessage = (status: ThinkingStatus, fallbackContent: string) => {
    if (!currentThinkingMessageId || thinkingFinished) return;
    if (!input.markRunActivity()) return;
    const updated = input.replaceMessage(
      currentThinkingMessageId,
      currentMessageContent(currentThinkingMessageId, fallbackContent),
      thinkingMetadata(status),
    );
    thinkingFinished = true;
    emitMessageUpdated(updated);
  };

  const suppressCurrentThinkingMessage = (status: ThinkingStatus) => {
    if (thinkingMessageIds.length === 0) return undefined;
    if (!input.markRunActivity()) return undefined;
    let updated: ChatMessage | undefined;
    for (const messageId of thinkingMessageIds) {
      const existingPromptCache = promptCacheFromMetadata(currentMessage(messageId)?.metadata);
      updated = input.replaceMessage(
        messageId,
        "",
        piThinkingMessageMetadata(status, existingPromptCache ?? currentPromptCacheTelemetry),
      );
      emitMessageUpdated(updated);
    }
    thinkingFinished = true;
    return updated;
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
    suppressAssistantMessagesExceptCurrent,
    currentPromptCacheTelemetry: () => currentPromptCacheTelemetry,
    applyPromptCacheTelemetry,
    completePromptCacheTelemetryIfPending,
    ensureThinkingMessage,
    appendThinkingDelta,
    replaceCurrentThinking,
    finishCurrentThinkingMessage,
    suppressCurrentThinkingMessage,
  };
}
