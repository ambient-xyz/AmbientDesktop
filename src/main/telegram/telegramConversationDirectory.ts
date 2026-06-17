import type {
  MessagingConversationDirectorySetupCard,
  MessagingGatewayRuntimeStatus,
  MessagingGatewayProviderSessionReadiness,
} from "../../shared/messagingGateway";
import {
  messagingConversationDirectoryContractNotes,
  sanitizeMessagingConversationDirectoryEntry,
  type MessagingConversationDirectoryMetadataEntry,
} from "../messaging/messagingConversationDirectoryContract";
import {
  messagingConversationDirectoryAdapterExecutionEnvelope,
  messagingConversationDirectoryAdapterExecutionText,
  messagingConversationDirectorySetupCard,
  telegramConversationDirectoryAdapterPlan,
  type MessagingConversationDirectoryAdapterExecutionEnvelope,
} from "../messaging/messagingConversationDirectoryAdapters";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const DEFAULT_BRIDGE_PORT = "8091";
const MAX_DIRECTORY_LIMIT = 25;
const MAX_QUERY_CHARS = 80;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface TelegramConversationDirectoryInput {
  profileId?: string;
  query?: string;
  unreadOnly: boolean;
  folderId?: number;
  limit: number;
}

export type TelegramConversationDirectoryConversation = MessagingConversationDirectoryMetadataEntry;

export interface TelegramConversationDirectoryPreview {
  providerId: "telegram-tdlib";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  approvalRequired: boolean;
  profileId?: string;
  query?: string;
  unreadOnly: boolean;
  folderId?: number;
  limit: number;
  endpointPath?: string;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  knownAuthProfiles: Array<{
    profileId: string;
    metadataReadable: boolean;
    tdlibStateDirPresent: boolean;
    databaseEncryptionKeyPresent: boolean;
  }>;
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    startsBridge: false;
    readsProviderHistory: false;
    readsProviderMessages: false;
    sendsProviderMessages: false;
    mutatesBindings: false;
    returnsProviderMessageContent: false;
    readsProviderConversationMetadata: boolean;
  };
  adapterExecution: MessagingConversationDirectoryAdapterExecutionEnvelope;
}

export type TelegramConversationDirectoryFailureMode =
  | "none"
  | "not-running-real-mode"
  | "bridge-unreachable"
  | "missing-auth-profile"
  | "missing-api-credentials"
  | "bridge-contract-violation"
  | "bridge-request-failed"
  | "permission-denied"
  | "unknown";

export interface TelegramConversationDirectoryResult extends TelegramConversationDirectoryPreview {
  applyStatus: "applied" | "blocked" | "denied" | "failed";
  approvalRecorded: boolean;
  fetchedConversationCount: number;
  returnedConversationCount: number;
  conversations: TelegramConversationDirectoryConversation[];
  failureMode: TelegramConversationDirectoryFailureMode;
  failureHint?: string;
  error?: string;
}

type TelegramBridgeChat = Record<string, unknown>;

export function telegramConversationDirectoryInput(params: unknown): TelegramConversationDirectoryInput {
  const raw = params as Record<string, unknown> | undefined;
  const limit = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : 10;
  const folderId = typeof raw?.folderId === "number" && Number.isFinite(raw.folderId)
    ? Math.floor(raw.folderId)
    : undefined;
  const query = optionalString(raw?.query);
  if (query && query.length > MAX_QUERY_CHARS) {
    throw new Error(`query must be ${MAX_QUERY_CHARS} characters or fewer.`);
  }
  return {
    profileId: optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId),
    query,
    unreadOnly: raw?.unreadOnly === true,
    ...(folderId && folderId > 0 ? { folderId } : {}),
    limit: Math.min(MAX_DIRECTORY_LIMIT, Math.max(1, limit)),
  };
}

export function buildTelegramConversationDirectoryPreview(input: {
  toolInput: TelegramConversationDirectoryInput;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}): TelegramConversationDirectoryPreview {
  const runtimeProvider = input.runtimeStatus.providers.find((provider) => provider.providerId === TELEGRAM_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const knownAuthProfiles = (readiness?.sessions ?? []).filter((session) =>
    input.toolInput.profileId ? session.profileId === input.toolInput.profileId : true
  );
  const selectedProfileId = input.toolInput.profileId ?? singleProfileId(knownAuthProfiles);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!runtimeProvider) {
    blockers.push("Telegram provider runtime status is unavailable.");
  } else if (runtimeProvider.state !== "running" || runtimeProvider.mode !== "real") {
    blockers.push("Telegram provider is not running in real mode; use the approved gateway lifecycle path before reading the provider directory.");
  }
  if (!readiness) {
    blockers.push("Telegram readiness has not been refreshed.");
  } else {
    if (!readiness.configured) blockers.push("Telegram session readiness is not configured.");
    if (!readiness.bridgeReachable) blockers.push("Telegram bridge root is not reachable.");
    if (!readiness.apiCredentialsPresent) blockers.push("Telegram API credentials are not present in the runtime environment.");
    if (!readiness.sessions.some((session) => session.metadataReadable && session.databaseEncryptionKeyPresent)) {
      blockers.push("No readable Telegram auth profile with encrypted TDLib session metadata is available.");
    }
  }
  if (!selectedProfileId) {
    blockers.push(knownAuthProfiles.length > 1
      ? "Multiple Telegram auth profiles are available; provide profileId before applying directory read."
      : "No Telegram auth profile is available for directory read.");
  }
  if (input.toolInput.profileId && !knownAuthProfiles.some((session) => session.profileId === input.toolInput.profileId)) {
    blockers.push(`Telegram auth profile was not found in readiness metadata: ${input.toolInput.profileId}.`);
  }
  if (input.toolInput.unreadOnly) {
    warnings.push("Unread-only directory filters by unread count metadata, not unread message bodies.");
  }

  const endpointPath = selectedProfileId ? endpointPathFor({ ...input.toolInput, profileId: selectedProfileId }) : undefined;
  const canApplyNow = blockers.length === 0;
  const failureMode = canApplyNow ? "none" : blockedFailureModeFromBlockers(blockers);
  return {
    providerId: TELEGRAM_PROVIDER_ID,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    approvalRequired: true,
    ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
    ...(input.toolInput.query ? { query: input.toolInput.query } : {}),
    unreadOnly: input.toolInput.unreadOnly,
    ...(input.toolInput.folderId ? { folderId: input.toolInput.folderId } : {}),
    limit: input.toolInput.limit,
    ...(endpointPath ? { endpointPath } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    knownAuthProfiles: knownAuthProfiles.map(profileSummary),
    blockers,
    warnings,
    policyNotes: [
      "Telegram conversation directory is routing metadata for binding setup, not permission to expose Ambient runtime state.",
      "Apply is approval-gated and uses only the reviewed local Telegram bridge metadata-only chat-list endpoint.",
      "Ambient returns only conversation id, title, type, unread count, folder ids, and updated time.",
      "Ambient requests metadataOnly=true and strips any bridge payload fields such as lastMessage before returning results.",
      "Message history, unread-message polling, sender resolution, and outbound replies remain separate approved tools.",
      ...messagingConversationDirectoryContractNotes(),
    ],
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve one bounded Telegram conversation-directory read.",
        "After apply, use the selected conversation id with Remote Ambient Surface or Messaging Connector binding preview.",
      ]
      : [
        "Fix Telegram real-mode, bridge readiness, API credential, or profile selection blockers before applying a directory read.",
        "Do not use shell, browser, Telegram Desktop UI, or provider CLIs to discover chats as a workaround.",
      ],
    safety: {
      startsBridge: false,
      readsProviderHistory: false,
      readsProviderMessages: false,
      sendsProviderMessages: false,
      mutatesBindings: false,
      returnsProviderMessageContent: false,
      readsProviderConversationMetadata: canApplyNow,
    },
    adapterExecution: messagingConversationDirectoryAdapterExecutionEnvelope({
      plan: telegramConversationDirectoryAdapterPlan({ runtimeProvider }),
      executionStatus: "preview",
      approvalRecorded: false,
      failureMode: failureMode === "none" ? undefined : failureMode,
      failureHint: failureMode === "none" ? undefined : failureHintFor(failureMode),
    }),
  };
}

export async function applyTelegramConversationDirectory(input: {
  preview: TelegramConversationDirectoryPreview;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
}): Promise<TelegramConversationDirectoryResult> {
  if (!input.preview.canApplyNow) return telegramConversationDirectoryBlockedResult(input.preview, input.approvalRecorded);
  if (!input.approvalRecorded) return telegramConversationDirectoryDeniedResult(input.preview);
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  try {
    if (!input.preview.endpointPath) throw new Error("Telegram conversation directory endpoint is unavailable.");
    const baseUrl = normalizeBaseUrl(env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL?.trim() || `http://127.0.0.1:${env.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
    const body = await fetchBridgeJson<{ chats?: TelegramBridgeChat[] }>(`${baseUrl}${input.preview.endpointPath}`, { env, fetchFn });
    const rawChats = Array.isArray(body.chats) ? body.chats : [];
    const strippedPayloadCount = rawChats.filter(hasForbiddenPayloadField).length;
    const conversations = rawChats
      .map((chat) => sanitizeChat(projectChatMetadata(chat)))
      .filter((chat): chat is TelegramConversationDirectoryConversation => Boolean(chat));
    return {
      ...input.preview,
      warnings: strippedPayloadCount > 0
        ? [
          ...input.preview.warnings,
          `Telegram bridge returned provider message payload fields for ${strippedPayloadCount} conversation(s); Ambient stripped them before returning directory metadata.`,
        ]
        : input.preview.warnings,
      applyStatus: "applied",
      approvalRecorded: true,
      fetchedConversationCount: rawChats.length,
      returnedConversationCount: conversations.length,
      conversations,
      failureMode: "none",
      adapterExecution: telegramAdapterExecution(input.preview, {
        executionStatus: "applied",
        approvalRecorded: true,
        fetchedConversationCount: rawChats.length,
        returnedConversationCount: conversations.length,
      }),
    };
  } catch (error) {
    const errorText = errorMessage(error);
    const failureMode = failedFailureMode(errorText);
    return {
      ...input.preview,
      applyStatus: "failed",
      approvalRecorded: true,
      fetchedConversationCount: 0,
      returnedConversationCount: 0,
      conversations: [],
      failureMode,
      failureHint: failureHintFor(failureMode),
      error: errorText,
      adapterExecution: telegramAdapterExecution(input.preview, {
        executionStatus: "failed",
        approvalRecorded: true,
        failureMode,
        failureHint: failureHintFor(failureMode),
        error: errorText,
      }),
    };
  }
}

export function telegramConversationDirectoryBlockedResult(
  preview: TelegramConversationDirectoryPreview,
  approvalRecorded = false,
): TelegramConversationDirectoryResult {
  const failureMode = blockedFailureMode(preview);
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRecorded,
    fetchedConversationCount: 0,
    returnedConversationCount: 0,
    conversations: [],
    failureMode,
    failureHint: failureHintFor(failureMode),
    adapterExecution: telegramAdapterExecution(preview, {
      executionStatus: "blocked",
      approvalRecorded,
      failureMode,
      failureHint: failureHintFor(failureMode),
    }),
    safety: {
      ...preview.safety,
      readsProviderConversationMetadata: false,
    },
  };
}

export function telegramConversationDirectoryDeniedResult(
  preview: TelegramConversationDirectoryPreview,
): TelegramConversationDirectoryResult {
  return {
    ...preview,
    applyStatus: "denied",
    approvalRecorded: false,
    fetchedConversationCount: 0,
    returnedConversationCount: 0,
    conversations: [],
    failureMode: "permission-denied",
    failureHint: failureHintFor("permission-denied"),
    adapterExecution: telegramAdapterExecution(preview, {
      executionStatus: "denied",
      approvalRecorded: false,
      failureMode: "permission-denied",
      failureHint: failureHintFor("permission-denied"),
    }),
    safety: {
      ...preview.safety,
      readsProviderConversationMetadata: false,
    },
  };
}

export function telegramConversationDirectoryPreviewText(preview: TelegramConversationDirectoryPreview): string {
  const lines = [
    `Telegram conversation directory preview: ${preview.status}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    preview.profileId ? `Profile: ${preview.profileId}` : "Profile: unavailable",
    preview.query ? `Query: ${preview.query}` : "Query: none",
    `Unread only: ${preview.unreadOnly ? "yes" : "no"}`,
    typeof preview.folderId === "number" ? `Folder id: ${preview.folderId}` : "Folder id: none",
    `Limit: ${preview.limit}`,
    preview.endpointPath ? `Endpoint path: ${preview.endpointPath}` : "Endpoint path: unavailable",
    "",
    "Safety:",
    "- Starts bridge: no",
    "- Reads provider history: no",
    "- Reads provider messages: no",
    "- Sends provider messages: no",
    "- Mutates bindings: no",
    `- Reads provider conversation metadata on apply: ${preview.safety.readsProviderConversationMetadata ? "yes" : "no"}`,
    `- Returns provider message content: ${preview.safety.returnsProviderMessageContent ? "yes" : "no"}`,
    "",
    `Known auth profiles: ${preview.knownAuthProfiles.length}`,
    ...preview.knownAuthProfiles.map((profile) => `- ${profile.profileId}: metadata=${profile.metadataReadable ? "readable" : "unreadable"}, stateDir=${profile.tdlibStateDirPresent ? "present" : "missing"}, key=${profile.databaseEncryptionKeyPresent ? "present" : "missing"}`),
    "",
    "Blockers:",
    ...(preview.blockers.length ? preview.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Warnings:",
    ...(preview.warnings.length ? preview.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Policy notes:",
    ...preview.policyNotes.map((note) => `- ${note}`),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
    "",
    messagingConversationDirectoryAdapterExecutionText(preview.adapterExecution),
  ];
  return lines.join("\n");
}

export function telegramConversationDirectoryResultText(result: TelegramConversationDirectoryResult): string {
  const lines = [
    `Telegram conversation directory result: ${result.applyStatus}`,
    `Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `Fetched conversations: ${result.fetchedConversationCount}`,
    `Returned conversations: ${result.returnedConversationCount}`,
    `Failure mode: ${result.failureMode}`,
    ...(result.failureHint ? [`Failure hint: ${result.failureHint}`] : []),
    ...(result.error ? [`Error: ${result.error}`] : []),
    "",
    "Conversations:",
  ];
  if (!result.conversations.length) {
    lines.push("- None");
  } else {
    for (const conversation of result.conversations) {
      lines.push(`- ${conversation.conversationId}: ${conversation.title}${conversation.type ? ` (${conversation.type})` : ""}${typeof conversation.unreadCount === "number" ? `, unread=${conversation.unreadCount}` : ""}${conversation.updatedAt ? `, updated=${conversation.updatedAt}` : ""}`);
    }
  }
  lines.push("", telegramConversationDirectoryPreviewText(result));
  return lines.join("\n");
}

export function telegramConversationDirectoryApprovalDetail(preview: TelegramConversationDirectoryPreview): string {
  return [
    "Ambient will read a bounded Telegram chat directory from the local bridge.",
    `Profile: ${preview.profileId ?? "unavailable"}`,
    `Limit: ${preview.limit}`,
    preview.query ? `Query: ${preview.query}` : undefined,
    preview.unreadOnly ? "Unread-only metadata filter: yes" : undefined,
    typeof preview.folderId === "number" ? `Folder id: ${preview.folderId}` : undefined,
    "Returned fields are sanitized to conversation id, title, type, unread count, folder ids, and updated time.",
    "Message history is not read, provider messages are not returned, bindings are not changed, and no provider messages are sent.",
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function telegramConversationDirectorySetupCard(
  value: TelegramConversationDirectoryPreview | TelegramConversationDirectoryResult,
): MessagingConversationDirectorySetupCard {
  return messagingConversationDirectorySetupCard({
    providerLabel: "Telegram",
    directoryStatus: value.status,
    canApplyNow: value.canApplyNow,
    adapterExecution: value.adapterExecution,
    blockers: value.blockers,
    warnings: value.warnings,
    nextSteps: value.nextSteps,
    conversations: "conversations" in value ? value.conversations : [],
  });
}

function endpointPathFor(input: TelegramConversationDirectoryInput & { profileId: string }): string {
  const url = new URL(`http://ambient.local/sessions/${encodeURIComponent(input.profileId)}/chats`);
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("metadataOnly", "true");
  if (input.query) url.searchParams.set("query", input.query);
  if (input.unreadOnly) url.searchParams.set("unreadOnly", "true");
  if (input.folderId) url.searchParams.set("folderId", String(input.folderId));
  return `${url.pathname}${url.search}`;
}

function singleProfileId(sessions: MessagingGatewayProviderSessionReadiness[]): string | undefined {
  const usable = sessions.filter((session) => session.metadataReadable && session.databaseEncryptionKeyPresent);
  return usable.length === 1 ? usable[0].profileId : undefined;
}

function profileSummary(session: MessagingGatewayProviderSessionReadiness): TelegramConversationDirectoryPreview["knownAuthProfiles"][number] {
  return {
    profileId: session.profileId,
    metadataReadable: session.metadataReadable,
    tdlibStateDirPresent: session.tdlibStateDirPresent,
    databaseEncryptionKeyPresent: session.databaseEncryptionKeyPresent,
  };
}

function sanitizeChat(chat: TelegramBridgeChat): TelegramConversationDirectoryConversation | undefined {
  return sanitizeMessagingConversationDirectoryEntry({
    raw: chat,
    contractLabel: "Telegram bridge",
  });
}

function projectChatMetadata(chat: TelegramBridgeChat): TelegramBridgeChat {
  const metadata: TelegramBridgeChat = {};
  for (const key of ["conversationId", "id", "title", "name", "displayName", "type", "unreadCount", "folderIds", "updatedAt"]) {
    if (Object.prototype.hasOwnProperty.call(chat, key)) {
      metadata[key] = chat[key];
    }
  }
  return metadata;
}

function hasForbiddenPayloadField(chat: TelegramBridgeChat): boolean {
  return ["lastMessage", "last_message", "message", "messages", "messageText", "lastMessageText", "text", "body", "snippet", "preview"]
    .some((key) => Object.prototype.hasOwnProperty.call(chat, key));
}

async function fetchBridgeJson<T>(
  url: string,
  input: {
    env: Record<string, string | undefined>;
    fetchFn: FetchLike;
  },
): Promise<T> {
  const headers: Record<string, string> = {};
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim()) headers["x-telegram-api-id"] = input.env.AMBIENT_AGENT_TELEGRAM_API_ID.trim();
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) headers["x-telegram-api-hash"] = input.env.AMBIENT_AGENT_TELEGRAM_API_HASH.trim();
  const response = await input.fetchFn(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`Telegram bridge request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  return await response.json() as T;
}

function blockedFailureMode(preview: TelegramConversationDirectoryPreview): TelegramConversationDirectoryFailureMode {
  return blockedFailureModeFromBlockers(preview.blockers);
}

function blockedFailureModeFromBlockers(blockerLines: string[]): TelegramConversationDirectoryFailureMode {
  const blockers = blockerLines.join("\n").toLowerCase();
  if (blockers.includes("not running in real mode")) return "not-running-real-mode";
  if (blockers.includes("bridge root is not reachable")) return "bridge-unreachable";
  if (blockers.includes("api credentials")) return "missing-api-credentials";
  if (blockers.includes("auth profile")) return "missing-auth-profile";
  return "unknown";
}

function telegramAdapterExecution(
  preview: TelegramConversationDirectoryPreview,
  input: {
    executionStatus: "applied" | "blocked" | "denied" | "failed";
    approvalRecorded: boolean;
    fetchedConversationCount?: number;
    returnedConversationCount?: number;
    failureMode?: TelegramConversationDirectoryFailureMode;
    failureHint?: string;
    error?: string;
  },
): MessagingConversationDirectoryAdapterExecutionEnvelope {
  return messagingConversationDirectoryAdapterExecutionEnvelope({
    plan: telegramConversationDirectoryAdapterPlan({ runtimeProvider: preview.runtimeProvider }),
    executionStatus: input.executionStatus,
    approvalRecorded: input.approvalRecorded,
    fetchedConversationCount: input.fetchedConversationCount,
    returnedConversationCount: input.returnedConversationCount,
    failureMode: input.failureMode,
    failureHint: input.failureHint,
    error: input.error,
  });
}

function failedFailureMode(errorText: string): TelegramConversationDirectoryFailureMode {
  const normalized = errorText.toLowerCase();
  if (normalized.includes("metadata-only directory contract violation") || normalized.includes("lastmessage")) {
    return "bridge-contract-violation";
  }
  if (normalized.includes("fetch failed") || normalized.includes("econnrefused") || normalized.includes("timed out")) {
    return "bridge-unreachable";
  }
  if (normalized.includes("telegram bridge request failed") || normalized.includes("http ")) {
    return "bridge-request-failed";
  }
  return "unknown";
}

function failureHintFor(mode: TelegramConversationDirectoryFailureMode): string | undefined {
  switch (mode) {
    case "not-running-real-mode":
      return "Start or attach the Telegram provider through ambient_messaging_gateway_lifecycle_preview/apply before reading the directory.";
    case "bridge-unreachable":
      return "Verify the reviewed local Telegram bridge root is reachable and that Ambient is using the same bridge URL/port as the running bridge.";
    case "missing-auth-profile":
      return "Run Telegram session setup or pass an exact profileId from readiness metadata before applying the directory read.";
    case "missing-api-credentials":
      return "Bind AMBIENT_AGENT_TELEGRAM_API_ID and AMBIENT_AGENT_TELEGRAM_API_HASH through Ambient-managed secret/env flow.";
    case "bridge-contract-violation":
      return "Update the Telegram bridge to honor metadataOnly=true and return only routing metadata, then retry the directory apply.";
    case "bridge-request-failed":
      return "Inspect the bridge status and profile id; the directory endpoint was reached but rejected or failed the request.";
    case "permission-denied":
      return "Ask for explicit user approval before retrying the bounded Telegram directory read.";
    case "none":
    case "unknown":
      return undefined;
  }
}

function normalizeBaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
