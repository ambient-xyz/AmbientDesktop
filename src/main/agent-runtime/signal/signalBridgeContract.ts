import {
  sanitizeMessagingConversationDirectoryEntry,
  type MessagingConversationDirectoryMetadataEntry,
} from "../../messaging/messagingConversationDirectoryContract";

const PROVIDER_ID = "signal-cli";
const CONTRACT_KIND = "ambient-signal-local-bridge";
const CONTRACT_VERSION = "v0";

export interface SignalBridgeRootSummary {
  ok: boolean;
  providerId: "signal-cli";
  contractKind: typeof CONTRACT_KIND;
  contractVersion: typeof CONTRACT_VERSION;
  stateRoot?: string;
  profileCount?: number;
  capabilities: SignalBridgeCapabilities;
  diagnostics: string[];
}

export interface SignalBridgeProfileStatusSummary {
  ok: boolean;
  providerId: "signal-cli";
  profileId: string;
  ready: boolean;
  accountIdentifierPresent: boolean;
  linkedDevicePresent: boolean;
  registrationMetadataPresent: boolean;
  bridgeSessionReadable: boolean;
  diagnostics: string[];
}

export interface SignalBridgeConversationDirectorySummary {
  ok: boolean;
  providerId: "signal-cli";
  profileId: string;
  fetchedConversationCount: number;
  returnedConversationCount: number;
  conversations: MessagingConversationDirectoryMetadataEntry[];
  diagnostics: string[];
}

export interface SignalBridgeUnreadWindowMessageSummary {
  messageId: string;
  senderId?: string;
  senderLabel?: string;
  receivedAt?: string;
  outgoing: boolean;
  textCharCount: number;
}

export interface SignalBridgeUnreadWindowSummary {
  ok: boolean;
  providerId: "signal-cli";
  profileId: string;
  conversationId: string;
  fetchedMessageCount: number;
  routeableMessageCount: number;
  messages: SignalBridgeUnreadWindowMessageSummary[];
  diagnostics: string[];
}

export interface SignalBridgeUnreadWindowDispatchMessage {
  messageId: string;
  senderId?: string;
  senderLabel?: string;
  receivedAt?: string;
  outgoing: boolean;
  text: string;
  textCharCount: number;
}

export interface SignalBridgeUnreadWindowDispatchSummary {
  ok: boolean;
  providerId: "signal-cli";
  profileId: string;
  conversationId: string;
  fetchedMessageCount: number;
  routeableMessageCount: number;
  messages: SignalBridgeUnreadWindowDispatchMessage[];
  diagnostics: string[];
}

export type SignalBridgeOwnerHandoffStatus = "matched" | "no-match" | "ambiguous";

export interface SignalBridgeOwnerHandoffSummary {
  ok: boolean;
  providerId: "signal-cli";
  profileId: string;
  conversationId: string;
  setupCodeLength: number;
  setupCodePreview: string;
  handoffStatus: SignalBridgeOwnerHandoffStatus;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  matchedMessageCount: number;
  matchedSenderCount: number;
  ownerUserId?: string;
  ownerLabel?: string;
  sourceMessageId?: string;
  receivedAt?: string;
  initialSeenMessageIds: string[];
  diagnostics: string[];
}

export interface SignalBridgeCapabilities {
  profileStatus: boolean;
  metadataOnlyConversationDirectory: boolean;
  boundedUnreadWindow: boolean;
  approvedReplySend: boolean;
}

export interface SignalBridgeEndpointPaths {
  root: "/";
  profileStatus: string;
  conversationDirectory: string;
  unreadWindow: string;
  approvedReplySend: string;
}

export interface SignalBridgeRealUnreadWindowContract {
  kind: "signal-real-bounded-unread-window-v0";
  providerId: "signal-cli";
  method: "GET";
  endpointPath?: string;
  requiredScopeFields: string[];
  requiredReadinessFields: string[];
  requiredBindingFields: string[];
  bridgeCapabilitiesRequired: Array<keyof SignalBridgeCapabilities>;
  internalOnlyFields: string[];
  piVisibleFields: string[];
  forbiddenAlternatives: string[];
  guarantees: string[];
}

export interface SignalBridgeApprovedReplySendContract {
  kind: "signal-approved-reply-send-v0";
  providerId: "signal-cli";
  method: "POST";
  endpointPath?: string;
  requiredScopeFields: string[];
  requiredReadinessFields: string[];
  requiredBindingFields: string[];
  bridgeCapabilitiesRequired: Array<keyof SignalBridgeCapabilities>;
  requestFields: string[];
  piVisibleFields: string[];
  forbiddenAlternatives: string[];
  guarantees: string[];
}

const forbiddenSignalBridgeFieldNames = new Set([
  "phoneNumber",
  "serviceId",
  "aci",
  "pni",
  "profileName",
  "deviceName",
  "registrationId",
  "identityKey",
  "sessionKeys",
  "messageBodies",
  "messageBody",
  "lastMessage",
  "last_message",
  "message",
  "messages",
  "messageText",
  "lastMessageText",
  "body",
  "text",
  "snippet",
  "preview",
]);

const forbiddenSignalUnreadWindowFieldNames = new Set([
  "phoneNumber",
  "serviceId",
  "aci",
  "pni",
  "profileName",
  "deviceName",
  "registrationId",
  "identityKey",
  "sessionKeys",
  "messageBodies",
  "messageBody",
  "lastMessage",
  "last_message",
  "message",
  "messageText",
  "lastMessageText",
  "body",
  "snippet",
  "preview",
  "rawMessage",
  "attachments",
  "contacts",
  "groups",
]);

export function signalBridgeEndpointPaths(profileId: string, conversationId = ":conversationId"): SignalBridgeEndpointPaths {
  const encodedProfile = profileId === ":profileId"
    ? profileId
    : encodeURIComponent(profileId);
  const encodedConversation = conversationId === ":conversationId"
    ? conversationId
    : encodeURIComponent(conversationId);
  return {
    root: "/",
    profileStatus: `/profiles/${encodedProfile}/status`,
    conversationDirectory: `/profiles/${encodedProfile}/conversations?metadataOnly=true&limit=:limit&query=:query`,
    unreadWindow: `/profiles/${encodedProfile}/conversations/${encodedConversation}/unread?limit=:limit`,
    approvedReplySend: `/profiles/${encodedProfile}/conversations/${encodedConversation}/send`,
  };
}

export function signalBridgeRealUnreadWindowContract(input: {
  profileId?: string;
  conversationId?: string;
  limit?: number;
} = {}): SignalBridgeRealUnreadWindowContract {
  const hasExactScope = Boolean(input.profileId?.trim() && input.conversationId?.trim() && typeof input.limit === "number");
  const endpointPath = hasExactScope
    ? signalBridgeEndpointPaths(input.profileId!.trim(), input.conversationId!.trim()).unreadWindow.replace(":limit", String(input.limit))
    : signalBridgeEndpointPaths(":profileId", ":conversationId").unreadWindow;
  return {
    kind: "signal-real-bounded-unread-window-v0",
    providerId: PROVIDER_ID,
    method: "GET",
    endpointPath,
    requiredScopeFields: ["bindingId", "profileId", "conversationId", "ownerUserId", "limit"],
    requiredReadinessFields: [
      "bridgeReachable",
      "bridgeCapabilities.profileStatus",
      "bridgeCapabilities.boundedUnreadWindow",
      "configured",
      "session.bridgeSessionReadable",
    ],
    requiredBindingFields: [
      "providerId=signal-cli",
      "purpose=remote_ambient_surface",
      "status=active",
      "authProfileId",
      "conversationId",
      "ownerUserId",
      "metadata.setupShape=signal-owner-remote-ambient-surface",
    ],
    bridgeCapabilitiesRequired: ["profileStatus", "boundedUnreadWindow"],
    internalOnlyFields: ["text", "body", "messageBody", "rawMessage", "attachments", "contacts", "groups"],
    piVisibleFields: ["messageId", "accepted", "queuedProjectionId", "projectionKind", "projectionTitle", "droppedReason", "counts", "timestamps"],
    forbiddenAlternatives: [
      "Signal Desktop UI scraping",
      "signal-cli command execution",
      "shell access to Signal stores",
      "browser automation",
      "generic messaging binding tools",
      "Telegram-specific tools",
      "broad conversation history reads",
      "unbounded polling",
    ],
    guarantees: [
      "The real bridge path is a single approved bounded unread read for one exact active owner Remote Ambient Surface binding.",
      "The adapter must not list arbitrary Signal conversations or read broad history as part of unread ingestion.",
      "The bridge request must use the exact profile id and conversation id from the approved binding.",
      "Provider message bodies may be retained only inside the adapter for owner command routing and must not be returned directly to Pi.",
      "Deduplication state must be consulted and updated so repeated reads are idempotent before any periodic polling exists.",
      "Outbound Signal replies require a separate approved reply contract.",
    ],
  };
}

export function signalBridgeApprovedReplySendContract(input: {
  profileId?: string;
  conversationId?: string;
} = {}): SignalBridgeApprovedReplySendContract {
  const hasExactScope = Boolean(input.profileId?.trim() && input.conversationId?.trim());
  const endpointPath = hasExactScope
    ? signalBridgeEndpointPaths(input.profileId!.trim(), input.conversationId!.trim()).approvedReplySend
    : signalBridgeEndpointPaths(":profileId", ":conversationId").approvedReplySend;
  return {
    kind: "signal-approved-reply-send-v0",
    providerId: PROVIDER_ID,
    method: "POST",
    endpointPath,
    requiredScopeFields: ["bindingId", "profileId", "conversationId", "ownerUserId", "replyToMessageId", "text"],
    requiredReadinessFields: [
      "bridgeReachable",
      "bridgeCapabilities.profileStatus",
      "bridgeCapabilities.approvedReplySend",
      "configured",
      "session.bridgeSessionReadable",
    ],
    requiredBindingFields: [
      "providerId=signal-cli",
      "purpose=remote_ambient_surface",
      "status=active",
      "authProfileId",
      "conversationId",
      "ownerUserId",
      "metadata.setupShape=signal-owner-remote-ambient-surface",
    ],
    bridgeCapabilitiesRequired: ["profileStatus", "approvedReplySend"],
    requestFields: ["text", "replyToMessageId"],
    piVisibleFields: ["applyStatus", "sent", "providerMessageId", "delivery", "counts", "timestamps"],
    forbiddenAlternatives: [
      "Signal Desktop UI automation",
      "signal-cli command execution",
      "shell access to Signal stores",
      "browser automation",
      "generic messaging binding tools",
      "Telegram-specific tools",
      "Messaging Connector external send tools",
    ],
    guarantees: [
      "Signal replies are outbound-only and separate from unread ingestion and polling.",
      "Every future send must require explicit approval for one exact active owner Remote Ambient Surface binding.",
      "The bridge request must use the exact profile id and conversation id from the approved binding.",
      "A future send adapter must not list chats, read Signal history, read unread windows, or start bridges as part of sending.",
      "Messaging Connector external sends must remain firewalled from Ambient runtime state.",
    ],
  };
}

export function signalBridgeContractDescription(profileId = ":profileId"): string[] {
  const endpoints = signalBridgeEndpointPaths(profileId);
  return [
    "Signal local bridge contract",
    `Provider: ${PROVIDER_ID}`,
    `Contract: ${CONTRACT_KIND}/${CONTRACT_VERSION}`,
    `Root health: GET ${endpoints.root}`,
    `Profile status: GET ${endpoints.profileStatus}`,
    `Conversation directory: GET ${endpoints.conversationDirectory}`,
    `Bounded unread window: GET ${endpoints.unreadWindow}`,
    `Approved reply send: POST ${endpoints.approvedReplySend}`,
    "Root/profile status responses must contain only safe booleans/counts/paths and no Signal identifiers, names, keys, contacts, groups, attachments, or message text.",
    "Conversation directory responses must use the provider-neutral metadata-only routing contract.",
    "Bounded unread responses may include message text only for internal adapter routing, owner handoff, and dedupe logic; raw text must not be returned to Pi.",
    "Owner handoff uses the bounded unread endpoint with exact setup-code matching and returns only sender/dedupe metadata.",
    "Unread, owner handoff, and reply endpoints are separate reviewed contract targets; enabling one does not imply permission to use another.",
  ];
}

export function validateSignalBridgeRootEnvelope(value: unknown): SignalBridgeRootSummary {
  const forbidden = findForbiddenSignalBridgeField(value);
  if (forbidden) throw new Error(`Signal bridge root response included forbidden field ${forbidden}.`);
  const raw = objectValue(value);
  if (raw.ok !== true) throw new Error("Signal bridge root response must include ok=true.");
  const providerId = optionalString(raw.providerId) || PROVIDER_ID;
  if (providerId !== PROVIDER_ID) throw new Error(`Signal bridge root providerId must be ${PROVIDER_ID}.`);
  const contract = objectValue(raw.contract);
  const contractKind = optionalString(contract.kind) || CONTRACT_KIND;
  const contractVersion = optionalString(contract.version) || CONTRACT_VERSION;
  if (contractKind !== CONTRACT_KIND) throw new Error(`Signal bridge contract kind must be ${CONTRACT_KIND}.`);
  if (contractVersion !== CONTRACT_VERSION) throw new Error(`Signal bridge contract version must be ${CONTRACT_VERSION}.`);
  const capabilities = signalBridgeCapabilities(raw.capabilities);
  return {
    ok: true,
    providerId: PROVIDER_ID,
    contractKind: CONTRACT_KIND,
    contractVersion: CONTRACT_VERSION,
    ...(optionalString(raw.stateRoot) ? { stateRoot: optionalString(raw.stateRoot)! } : {}),
    ...(typeof raw.profileCount === "number" && Number.isFinite(raw.profileCount) ? { profileCount: Math.max(0, Math.floor(raw.profileCount)) } : {}),
    capabilities,
    diagnostics: [
      "Signal bridge root contract accepted.",
      `Capabilities: profileStatus=${capabilities.profileStatus ? "yes" : "no"}, metadataOnlyConversationDirectory=${capabilities.metadataOnlyConversationDirectory ? "yes" : "no"}, boundedUnreadWindow=${capabilities.boundedUnreadWindow ? "yes" : "no"}, approvedReplySend=${capabilities.approvedReplySend ? "yes" : "no"}.`,
    ],
  };
}

export function validateSignalBridgeProfileStatusEnvelope(
  value: unknown,
  expectedProfileId: string,
): SignalBridgeProfileStatusSummary {
  const forbidden = findForbiddenSignalBridgeField(value);
  if (forbidden) throw new Error(`Signal bridge profile status response included forbidden field ${forbidden}.`);
  const raw = objectValue(value);
  if (raw.ok !== true) throw new Error("Signal bridge profile status response must include ok=true.");
  const providerId = optionalString(raw.providerId) || PROVIDER_ID;
  if (providerId !== PROVIDER_ID) throw new Error(`Signal bridge profile status providerId must be ${PROVIDER_ID}.`);
  const profileId = optionalString(raw.profileId) || expectedProfileId;
  if (profileId !== expectedProfileId) throw new Error(`Signal bridge profile status profileId mismatch: expected ${expectedProfileId}.`);
  return {
    ok: true,
    providerId: PROVIDER_ID,
    profileId,
    ready: raw.ready === true,
    accountIdentifierPresent: raw.accountIdentifierPresent === true,
    linkedDevicePresent: raw.linkedDevicePresent === true,
    registrationMetadataPresent: raw.registrationMetadataPresent === true,
    bridgeSessionReadable: raw.bridgeSessionReadable === true,
    diagnostics: [
      "Signal bridge profile status contract accepted.",
      "Profile status exposed only safe readiness booleans.",
    ],
  };
}

export function validateSignalBridgeConversationDirectoryEnvelope(
  value: unknown,
  expectedProfileId: string,
): SignalBridgeConversationDirectorySummary {
  const forbidden = findForbiddenSignalBridgeField(value);
  if (forbidden) throw new Error(`Signal bridge conversation directory response included forbidden field ${forbidden}.`);
  const raw = objectValue(value);
  if (raw.ok !== true) throw new Error("Signal bridge conversation directory response must include ok=true.");
  const providerId = optionalString(raw.providerId) || PROVIDER_ID;
  if (providerId !== PROVIDER_ID) throw new Error(`Signal bridge conversation directory providerId must be ${PROVIDER_ID}.`);
  const profileId = optionalString(raw.profileId) || expectedProfileId;
  if (profileId !== expectedProfileId) throw new Error(`Signal bridge conversation directory profileId mismatch: expected ${expectedProfileId}.`);
  if (!Array.isArray(raw.conversations)) {
    throw new Error("Signal bridge conversation directory response must include conversations array.");
  }
  const conversations = raw.conversations
    .map((conversation) => sanitizeMessagingConversationDirectoryEntry({
      raw: objectValue(conversation),
      contractLabel: "Signal bridge",
    }))
    .filter((conversation): conversation is MessagingConversationDirectoryMetadataEntry => Boolean(conversation));
  return {
    ok: true,
    providerId: PROVIDER_ID,
    profileId,
    fetchedConversationCount: raw.conversations.length,
    returnedConversationCount: conversations.length,
    conversations,
    diagnostics: [
      "Signal bridge conversation directory contract accepted.",
      "Conversation directory exposed only metadata-only routing rows.",
    ],
  };
}

export function validateSignalBridgeUnreadWindowEnvelope(
  value: unknown,
  expectedProfileId: string,
  expectedConversationId: string,
): SignalBridgeUnreadWindowSummary {
  const forbidden = findForbiddenSignalUnreadWindowField(value);
  if (forbidden) throw new Error(`Signal bridge unread window response included forbidden field ${forbidden}.`);
  const raw = objectValue(value);
  if (raw.ok !== true) throw new Error("Signal bridge unread window response must include ok=true.");
  const providerId = optionalString(raw.providerId) || PROVIDER_ID;
  if (providerId !== PROVIDER_ID) throw new Error(`Signal bridge unread window providerId must be ${PROVIDER_ID}.`);
  const profileId = optionalString(raw.profileId) || expectedProfileId;
  if (profileId !== expectedProfileId) throw new Error(`Signal bridge unread window profileId mismatch: expected ${expectedProfileId}.`);
  const conversationId = optionalString(raw.conversationId) || expectedConversationId;
  if (conversationId !== expectedConversationId) throw new Error(`Signal bridge unread window conversationId mismatch: expected ${expectedConversationId}.`);
  if (!Array.isArray(raw.messages)) {
    throw new Error("Signal bridge unread window response must include messages array.");
  }
  const messages = raw.messages
    .map(unreadMessageSummary)
    .filter((message): message is SignalBridgeUnreadWindowMessageSummary => Boolean(message));
  return {
    ok: true,
    providerId: PROVIDER_ID,
    profileId,
    conversationId,
    fetchedMessageCount: raw.messages.length,
    routeableMessageCount: messages.filter((message) => !message.outgoing && message.senderId && message.textCharCount > 0).length,
    messages,
    diagnostics: [
      "Signal bridge unread window contract accepted for internal routing.",
      "Unread message bodies were reduced to character counts and must not be returned directly to Pi.",
    ],
  };
}

export function validateSignalBridgeUnreadWindowDispatchEnvelope(
  value: unknown,
  expectedProfileId: string,
  expectedConversationId: string,
): SignalBridgeUnreadWindowDispatchSummary {
  const forbidden = findForbiddenSignalUnreadWindowField(value);
  if (forbidden) throw new Error(`Signal bridge unread window response included forbidden field ${forbidden}.`);
  const raw = objectValue(value);
  if (raw.ok !== true) throw new Error("Signal bridge unread window response must include ok=true.");
  const providerId = optionalString(raw.providerId) || PROVIDER_ID;
  if (providerId !== PROVIDER_ID) throw new Error(`Signal bridge unread window providerId must be ${PROVIDER_ID}.`);
  const profileId = optionalString(raw.profileId) || expectedProfileId;
  if (profileId !== expectedProfileId) throw new Error(`Signal bridge unread window profileId mismatch: expected ${expectedProfileId}.`);
  const conversationId = optionalString(raw.conversationId) || expectedConversationId;
  if (conversationId !== expectedConversationId) throw new Error(`Signal bridge unread window conversationId mismatch: expected ${expectedConversationId}.`);
  if (!Array.isArray(raw.messages)) {
    throw new Error("Signal bridge unread window response must include messages array.");
  }
  const messages = raw.messages
    .map(unreadDispatchMessageSummary)
    .filter((message): message is SignalBridgeUnreadWindowDispatchMessage => Boolean(message));
  return {
    ok: true,
    providerId: PROVIDER_ID,
    profileId,
    conversationId,
    fetchedMessageCount: raw.messages.length,
    routeableMessageCount: messages.filter((message) => !message.outgoing && message.senderId && message.text.trim()).length,
    messages,
    diagnostics: [
      "Signal bridge unread window contract accepted for internal dispatch routing.",
      "Unread message bodies were retained only inside the adapter and must not be returned directly to Pi.",
    ],
  };
}

export function validateSignalBridgeOwnerHandoffEnvelope(
  value: unknown,
  expectedProfileId: string,
  expectedConversationId: string,
  setupCode: string,
): SignalBridgeOwnerHandoffSummary {
  const normalizedSetupCode = setupCode.trim();
  if (!normalizedSetupCode) throw new Error("Signal bridge owner handoff setupCode is required.");
  const forbidden = findForbiddenSignalUnreadWindowField(value);
  if (forbidden) throw new Error(`Signal bridge owner handoff response included forbidden field ${forbidden}.`);
  const raw = objectValue(value);
  if (raw.ok !== true) throw new Error("Signal bridge owner handoff response must include ok=true.");
  const providerId = optionalString(raw.providerId) || PROVIDER_ID;
  if (providerId !== PROVIDER_ID) throw new Error(`Signal bridge owner handoff providerId must be ${PROVIDER_ID}.`);
  const profileId = optionalString(raw.profileId) || expectedProfileId;
  if (profileId !== expectedProfileId) throw new Error(`Signal bridge owner handoff profileId mismatch: expected ${expectedProfileId}.`);
  const conversationId = optionalString(raw.conversationId) || expectedConversationId;
  if (conversationId !== expectedConversationId) throw new Error(`Signal bridge owner handoff conversationId mismatch: expected ${expectedConversationId}.`);
  if (!Array.isArray(raw.messages)) {
    throw new Error("Signal bridge owner handoff response must include messages array.");
  }

  const messages = raw.messages.map(ownerHandoffMessageSummary).filter((message): message is OwnerHandoffMessageSummary => Boolean(message));
  const candidateMessages = messages.filter((message) => !message.outgoing && message.text.length > 0);
  const exactMatches = candidateMessages.filter((message) => message.text.trim() === normalizedSetupCode);
  const uniqueSenders = uniqueOwnerHandoffSenders(exactMatches);
  const selected = uniqueSenders.length === 1 ? uniqueSenders[0] : undefined;
  return {
    ok: true,
    providerId: PROVIDER_ID,
    profileId,
    conversationId,
    setupCodeLength: normalizedSetupCode.length,
    setupCodePreview: `${normalizedSetupCode.length} chars`,
    handoffStatus: selected ? "matched" : uniqueSenders.length > 1 ? "ambiguous" : "no-match",
    fetchedMessageCount: raw.messages.length,
    candidateMessageCount: candidateMessages.length,
    matchedMessageCount: exactMatches.length,
    matchedSenderCount: uniqueSenders.length,
    ...(selected ? {
      ownerUserId: selected.senderId,
      ...(selected.senderLabel ? { ownerLabel: selected.senderLabel } : {}),
      sourceMessageId: selected.messageId,
      ...(selected.receivedAt ? { receivedAt: selected.receivedAt } : {}),
    } : {}),
    initialSeenMessageIds: messages.map((message) => message.messageId),
    diagnostics: [
      "Signal bridge owner handoff contract accepted for internal exact setup-code matching.",
      "Setup-code message bodies were compared internally and were not returned directly to Pi.",
      "Initial seen message ids are safe dedupe metadata for a future binding apply path.",
    ],
  };
}

function signalBridgeCapabilities(value: unknown): SignalBridgeCapabilities {
  const raw = objectValue(value);
  return {
    profileStatus: raw.profileStatus === true,
    metadataOnlyConversationDirectory: raw.metadataOnlyConversationDirectory === true,
    boundedUnreadWindow: raw.boundedUnreadWindow === true,
    approvedReplySend: raw.approvedReplySend === true,
  };
}

function findForbiddenSignalBridgeField(value: unknown, path: string[] = []): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenSignalBridgeField(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return undefined;
  }
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenSignalBridgeFieldNames.has(key)) return [...path, key].join(".");
    const nested = findForbiddenSignalBridgeField(nestedValue, [...path, key]);
    if (nested) return nested;
  }
  return undefined;
}

function findForbiddenSignalUnreadWindowField(value: unknown, path: string[] = []): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenSignalUnreadWindowField(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return undefined;
  }
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenSignalUnreadWindowFieldNames.has(key)) return [...path, key].join(".");
    const nested = findForbiddenSignalUnreadWindowField(nestedValue, [...path, key]);
    if (nested) return nested;
  }
  return undefined;
}

function unreadMessageSummary(value: unknown): SignalBridgeUnreadWindowMessageSummary | undefined {
  const raw = objectValue(value);
  const messageId = optionalString(raw.messageId) || optionalString(raw.id);
  if (!messageId) return undefined;
  const text = typeof raw.text === "string" ? raw.text : "";
  return {
    messageId,
    ...(optionalString(raw.senderId) ? { senderId: optionalString(raw.senderId)! } : {}),
    ...(optionalString(raw.senderLabel) ? { senderLabel: optionalString(raw.senderLabel)! } : {}),
    ...(optionalString(raw.receivedAt) ? { receivedAt: optionalString(raw.receivedAt)! } : {}),
    outgoing: raw.outgoing === true,
    textCharCount: text.length,
  };
}

function unreadDispatchMessageSummary(value: unknown): SignalBridgeUnreadWindowDispatchMessage | undefined {
  const raw = objectValue(value);
  const messageId = optionalString(raw.messageId) || optionalString(raw.id);
  if (!messageId) return undefined;
  const text = typeof raw.text === "string" ? raw.text : "";
  return {
    messageId,
    ...(optionalString(raw.senderId) ? { senderId: optionalString(raw.senderId)! } : {}),
    ...(optionalString(raw.senderLabel) ? { senderLabel: optionalString(raw.senderLabel)! } : {}),
    ...(optionalString(raw.receivedAt) ? { receivedAt: optionalString(raw.receivedAt)! } : {}),
    outgoing: raw.outgoing === true,
    text,
    textCharCount: text.length,
  };
}

interface OwnerHandoffMessageSummary {
  messageId: string;
  senderId?: string;
  senderLabel?: string;
  receivedAt?: string;
  outgoing: boolean;
  text: string;
}

function ownerHandoffMessageSummary(value: unknown): OwnerHandoffMessageSummary | undefined {
  const raw = objectValue(value);
  const messageId = optionalString(raw.messageId) || optionalString(raw.id);
  if (!messageId) return undefined;
  return {
    messageId,
    ...(optionalString(raw.senderId) ? { senderId: optionalString(raw.senderId)! } : {}),
    ...(optionalString(raw.senderLabel) ? { senderLabel: optionalString(raw.senderLabel)! } : {}),
    ...(optionalString(raw.receivedAt) ? { receivedAt: optionalString(raw.receivedAt)! } : {}),
    outgoing: raw.outgoing === true,
    text: typeof raw.text === "string" ? raw.text : "",
  };
}

function uniqueOwnerHandoffSenders(messages: OwnerHandoffMessageSummary[]): OwnerHandoffMessageSummary[] {
  const seen = new Set<string>();
  const unique: OwnerHandoffMessageSummary[] = [];
  for (const message of messages) {
    if (!message.senderId || seen.has(message.senderId)) continue;
    seen.add(message.senderId);
    unique.push(message);
  }
  return unique;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
