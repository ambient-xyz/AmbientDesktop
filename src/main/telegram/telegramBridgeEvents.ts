import type { MessagingInboundEvent } from "../../shared/messagingGateway";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";

export interface TelegramBridgeEventRouteInput {
  profileId: string;
  conversationId: string;
  messageId: string;
  senderId: string;
  senderLabel?: string;
  text: string;
  receivedAt?: string;
}

export function telegramBridgeEventRouteInput(params: unknown, now: () => Date = () => new Date()): TelegramBridgeEventRouteInput {
  const raw = params as Record<string, unknown> | undefined;
  const profileId = optionalString(raw?.profileId);
  const conversationId = optionalString(raw?.conversationId);
  const messageId = optionalString(raw?.messageId);
  const senderId = optionalString(raw?.senderId);
  const text = typeof raw?.text === "string" ? raw.text : undefined;
  const receivedAt = optionalString(raw?.receivedAt);
  if (!profileId) throw new Error("profileId is required.");
  if (!conversationId) throw new Error("conversationId is required.");
  if (!messageId) throw new Error("messageId is required.");
  if (!senderId) throw new Error("senderId is required.");
  if (text === undefined) throw new Error("text is required.");
  if (receivedAt && Number.isNaN(new Date(receivedAt).getTime())) {
    throw new Error("receivedAt must be an ISO timestamp when supplied.");
  }
  return {
    profileId,
    conversationId,
    messageId,
    senderId,
    senderLabel: optionalString(raw?.senderLabel),
    text,
    receivedAt: receivedAt ?? now().toISOString(),
  };
}

export function messagingInboundEventFromTelegramBridge(input: TelegramBridgeEventRouteInput): MessagingInboundEvent {
  return {
    id: `telegram-${input.profileId}-${input.conversationId}-${input.messageId}`,
    providerId: TELEGRAM_PROVIDER_ID,
    authProfileId: input.profileId,
    conversationId: input.conversationId,
    sender: {
      id: input.senderId,
      ...(input.senderLabel ? { label: input.senderLabel } : {}),
    },
    text: input.text,
    receivedAt: input.receivedAt ?? new Date().toISOString(),
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
