export interface MessagingConversationDirectoryMetadataEntry {
  conversationId: string;
  title: string;
  type?: string;
  unreadCount?: number;
  folderIds: number[];
  updatedAt?: string;
}

export interface MessagingConversationDirectoryMetadataContract {
  kind: "metadata-only-routing";
  allowedFields: string[];
  forbiddenPayloadFields: string[];
  failClosedOnPayloadFields: true;
}

const ALLOWED_FIELDS = [
  "conversationId",
  "id",
  "title",
  "name",
  "displayName",
  "type",
  "unreadCount",
  "folderIds",
  "updatedAt",
];

const FORBIDDEN_PAYLOAD_FIELDS = [
  "lastMessage",
  "last_message",
  "message",
  "messages",
  "messageText",
  "lastMessageText",
  "text",
  "body",
  "snippet",
  "preview",
];

export function messagingConversationDirectoryMetadataContract(): MessagingConversationDirectoryMetadataContract {
  return {
    kind: "metadata-only-routing",
    allowedFields: [...ALLOWED_FIELDS],
    forbiddenPayloadFields: [...FORBIDDEN_PAYLOAD_FIELDS],
    failClosedOnPayloadFields: true,
  };
}

export function messagingConversationDirectoryContractNotes(): string[] {
  const contract = messagingConversationDirectoryMetadataContract();
  return [
    `Metadata-only directory contract: ${contract.kind}.`,
    `Allowed result fields: ${contract.allowedFields.join(", ")}.`,
    `Forbidden provider-message payload fields fail closed: ${contract.forbiddenPayloadFields.join(", ")}.`,
  ];
}

export function sanitizeMessagingConversationDirectoryEntry(input: {
  raw: Record<string, unknown>;
  contractLabel: string;
}): MessagingConversationDirectoryMetadataEntry | undefined {
  for (const key of FORBIDDEN_PAYLOAD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input.raw, key)) {
      throw new Error(`${input.contractLabel} metadata-only directory contract violation: response included ${key}.`);
    }
  }
  const conversationId = stringValue(input.raw.conversationId) ?? stringValue(input.raw.id);
  const title = stringValue(input.raw.title) ?? stringValue(input.raw.name) ?? stringValue(input.raw.displayName);
  if (!conversationId || !title) return undefined;
  const folderIds = Array.isArray(input.raw.folderIds)
    ? input.raw.folderIds
      .map((id) => typeof id === "number" && Number.isFinite(id) ? Math.floor(id) : undefined)
      .filter((id): id is number => typeof id === "number")
    : [];
  const unreadCount = typeof input.raw.unreadCount === "number" && Number.isFinite(input.raw.unreadCount)
    ? Math.max(0, Math.floor(input.raw.unreadCount))
    : undefined;
  return {
    conversationId,
    title,
    ...(stringValue(input.raw.type) ? { type: stringValue(input.raw.type) } : {}),
    ...(typeof unreadCount === "number" ? { unreadCount } : {}),
    folderIds,
    ...(stringValue(input.raw.updatedAt) ? { updatedAt: stringValue(input.raw.updatedAt) } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
