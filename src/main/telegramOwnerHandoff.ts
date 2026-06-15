import type {
  MessagingGatewayProviderSessionReadiness,
  MessagingGatewayRuntimeStatus,
} from "../shared/messagingGateway";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const DEFAULT_BRIDGE_PORT = "8091";
const MAX_HANDOFF_LIMIT = 25;
const MIN_SETUP_CODE_CHARS = 6;
const MAX_SETUP_CODE_CHARS = 120;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface TelegramOwnerHandoffInput {
  profileId: string;
  conversationId: string;
  setupCode: string;
  limit: number;
}

export type TelegramOwnerHandoffStatus = "matched" | "no-match" | "ambiguous";

export interface TelegramOwnerHandoffPreview {
  providerId: "telegram-tdlib";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  approvalRequired: boolean;
  profileId: string;
  conversationId: string;
  setupCodeLength: number;
  setupCodePreview: string;
  limit: number;
  endpointPath?: string;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  matchedSession?: MessagingGatewayProviderSessionReadiness;
  blockers: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    readsProviderUnreadMessages: boolean;
    filtersExactSetupCode: boolean;
    resolvesSenderProfiles: boolean;
    returnsMatchedSenderId: boolean;
    readsProviderHistory: false;
    sendsProviderMessages: false;
    startsBridge: false;
    mutatesBindings: false;
    returnsProviderMessageContent: false;
  };
}

export interface TelegramOwnerHandoffResult extends TelegramOwnerHandoffPreview {
  applyStatus: "applied" | "blocked" | "denied" | "failed";
  approvalRecorded: boolean;
  handoffStatus: TelegramOwnerHandoffStatus;
  fetchedMessageCount: number;
  candidateMessageCount: number;
  matchedMessageCount: number;
  matchedSenderCount: number;
  ownerUserId?: string;
  ownerLabel?: string;
  sourceMessageId?: string;
  receivedAt?: string;
  error?: string;
}

interface TelegramBridgeMessage {
  id?: unknown;
  chatId?: unknown;
  senderName?: unknown;
  outgoing?: unknown;
  text?: unknown;
  date?: unknown;
}

interface TelegramPeerProfile {
  kind?: unknown;
  user?: {
    userId?: unknown;
    displayName?: unknown;
    firstName?: unknown;
    lastName?: unknown;
    username?: unknown;
  };
  chat?: {
    chatId?: unknown;
    title?: unknown;
  };
}

interface TelegramOwnerHandoffMatch {
  ownerUserId: string;
  ownerLabel?: string;
  sourceMessageId: string;
  receivedAt?: string;
}

export function telegramOwnerHandoffInput(params: unknown): TelegramOwnerHandoffInput {
  const raw = params as Record<string, unknown> | undefined;
  const profileId = optionalString(raw?.profileId);
  const conversationId = optionalString(raw?.conversationId);
  const setupCode = typeof raw?.setupCode === "string" ? raw.setupCode.trim() : "";
  const limit = typeof raw?.limit === "number" && Number.isFinite(raw.limit)
    ? Math.floor(raw.limit)
    : 10;
  if (!profileId) throw new Error("profileId is required.");
  if (!conversationId) throw new Error("conversationId is required.");
  if (!setupCode) throw new Error("setupCode is required.");
  if (/[\r\n]/.test(setupCode)) throw new Error("setupCode must be a single line.");
  if (setupCode.length < MIN_SETUP_CODE_CHARS) throw new Error(`setupCode must be at least ${MIN_SETUP_CODE_CHARS} characters.`);
  if (setupCode.length > MAX_SETUP_CODE_CHARS) throw new Error(`setupCode must be ${MAX_SETUP_CODE_CHARS} characters or fewer.`);
  return {
    profileId,
    conversationId,
    setupCode,
    limit: Math.min(MAX_HANDOFF_LIMIT, Math.max(1, limit)),
  };
}

export function buildTelegramOwnerHandoffPreview(input: {
  toolInput: TelegramOwnerHandoffInput;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}): TelegramOwnerHandoffPreview {
  const runtimeProvider = input.runtimeStatus.providers.find((provider) => provider.providerId === TELEGRAM_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const matchedSession = readiness?.sessions.find((session) => session.profileId === input.toolInput.profileId);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!runtimeProvider) {
    blockers.push("Telegram provider runtime status is unavailable.");
  } else if (runtimeProvider.state !== "running" || runtimeProvider.mode !== "real") {
    blockers.push("Telegram provider is not running in real mode; use the approved gateway lifecycle path before owner handoff.");
  }
  if (!readiness) {
    blockers.push("Telegram readiness has not been refreshed.");
  } else {
    if (!readiness.configured) blockers.push("Telegram session readiness is not configured.");
    if (!readiness.bridgeReachable) blockers.push("Telegram bridge root is not reachable.");
    if (!readiness.apiCredentialsPresent) blockers.push("Telegram API credentials are not present in the runtime environment.");
    if (!matchedSession) blockers.push(`Telegram auth profile was not found in readiness metadata: ${input.toolInput.profileId}.`);
    if (matchedSession && !matchedSession.metadataReadable) blockers.push(`Telegram auth profile metadata is not readable: ${input.toolInput.profileId}.`);
    if (matchedSession && !matchedSession.databaseEncryptionKeyPresent) blockers.push(`Telegram auth profile is missing encrypted TDLib session metadata: ${input.toolInput.profileId}.`);
  }
  if (input.toolInput.setupCode.length < 12) {
    warnings.push("Short setup codes are easier to collide with an unrelated unread message; prefer a unique Ambient-generated phrase.");
  }

  const canApplyNow = blockers.length === 0;
  return {
    providerId: TELEGRAM_PROVIDER_ID,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    approvalRequired: true,
    profileId: input.toolInput.profileId,
    conversationId: input.toolInput.conversationId,
    setupCodeLength: input.toolInput.setupCode.length,
    setupCodePreview: previewSetupCode(input.toolInput.setupCode),
    limit: input.toolInput.limit,
    endpointPath: `/sessions/${encodeURIComponent(input.toolInput.profileId)}/inbox/unread?chatId=${encodeURIComponent(input.toolInput.conversationId)}&limit=${input.toolInput.limit}`,
    ...(runtimeProvider ? { runtimeProvider } : {}),
    ...(matchedSession ? { matchedSession } : {}),
    blockers,
    warnings,
    policyNotes: [
      "Owner handoff is for fresh Telegram Remote Ambient Surface setup before a binding has an owner sender id.",
      "Ask the owner to send the exact setup code in the selected Telegram conversation before applying.",
      "Apply reads only the bounded Telegram unread endpoint for the selected conversation.",
      "Apply compares message text to the setup code internally but does not return provider message bodies.",
      "Sender-profile resolution is performed only for exact setup-code matches.",
      "This handoff does not create a binding, start a bridge, list chats, read history, write dedupe state, or send provider messages.",
    ],
    nextSteps: canApplyNow
      ? [
        "Ask the owner to send the exact setup code in the selected Telegram conversation.",
        "Ask the user to approve one bounded owner handoff read.",
        "If exactly one owner sender is found, use ownerUserId with ambient_messaging_telegram_remote_surface_preview/apply.",
      ]
      : [
        "Start/attach Telegram in real mode, refresh readiness, and select a valid auth profile before owner handoff.",
        "Do not use Telegram Desktop scraping, browser automation, provider CLIs, or arbitrary history reads to infer owner sender ids.",
      ],
    safety: {
      readsProviderUnreadMessages: canApplyNow,
      filtersExactSetupCode: canApplyNow,
      resolvesSenderProfiles: canApplyNow,
      returnsMatchedSenderId: canApplyNow,
      readsProviderHistory: false,
      sendsProviderMessages: false,
      startsBridge: false,
      mutatesBindings: false,
      returnsProviderMessageContent: false,
    },
  };
}

export async function applyTelegramOwnerHandoff(input: {
  preview: TelegramOwnerHandoffPreview;
  setupCode: string;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  now?: () => Date;
}): Promise<TelegramOwnerHandoffResult> {
  if (!input.preview.canApplyNow) return telegramOwnerHandoffBlockedResult(input.preview, input.approvalRecorded);
  if (!input.approvalRecorded) return telegramOwnerHandoffDeniedResult(input.preview);
  const env = input.env ?? process.env;
  const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
  const now = input.now ?? (() => new Date());
  const baseUrl = normalizeBaseUrl(env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL?.trim() || `http://127.0.0.1:${env.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
  try {
    const body = await fetchBridgeJson<{ messages?: TelegramBridgeMessage[] }>(`${baseUrl}${input.preview.endpointPath}`, { env, fetchFn });
    const messages = Array.isArray(body.messages) ? body.messages : [];
    let candidateMessageCount = 0;
    const matches: TelegramOwnerHandoffMatch[] = [];
    for (const message of messages) {
      const messageId = stringValue(message.id);
      const text = stringValue(message.text);
      if (!messageId || message.outgoing === true || !text) continue;
      candidateMessageCount += 1;
      if (text.trim() !== input.setupCode.trim()) continue;
      const sender = await fetchMessageSender({
        baseUrl,
        preview: input.preview,
        messageId,
        env,
        fetchFn,
      });
      if (!sender.id) continue;
      matches.push({
        ownerUserId: sender.id,
        ownerLabel: sender.label || stringValue(message.senderName),
        sourceMessageId: messageId,
        receivedAt: stringValue(message.date) || now().toISOString(),
      });
    }
    const uniqueSenders = uniqueMatchesBySender(matches);
    const matched = uniqueSenders.length === 1;
    const ambiguous = uniqueSenders.length > 1;
    const selected = matched ? uniqueSenders[0] : undefined;
    return {
      ...input.preview,
      applyStatus: "applied",
      approvalRecorded: true,
      handoffStatus: matched ? "matched" : ambiguous ? "ambiguous" : "no-match",
      fetchedMessageCount: messages.length,
      candidateMessageCount,
      matchedMessageCount: matches.length,
      matchedSenderCount: uniqueSenders.length,
      ...(selected ? {
        ownerUserId: selected.ownerUserId,
        ...(selected.ownerLabel ? { ownerLabel: selected.ownerLabel } : {}),
        sourceMessageId: selected.sourceMessageId,
        ...(selected.receivedAt ? { receivedAt: selected.receivedAt } : {}),
      } : {}),
      warnings: [
        ...input.preview.warnings,
        ambiguous ? "Multiple distinct senders sent the setup code; repeat handoff with a new unique code." : undefined,
      ].filter((warning): warning is string => Boolean(warning)),
    };
  } catch (error) {
    return {
      ...input.preview,
      applyStatus: "failed",
      approvalRecorded: true,
      handoffStatus: "no-match",
      fetchedMessageCount: 0,
      candidateMessageCount: 0,
      matchedMessageCount: 0,
      matchedSenderCount: 0,
      error: errorMessage(error),
    };
  }
}

export function telegramOwnerHandoffBlockedResult(
  preview: TelegramOwnerHandoffPreview,
  approvalRecorded = false,
): TelegramOwnerHandoffResult {
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRecorded,
    handoffStatus: "no-match",
    fetchedMessageCount: 0,
    candidateMessageCount: 0,
    matchedMessageCount: 0,
    matchedSenderCount: 0,
  };
}

export function telegramOwnerHandoffDeniedResult(preview: TelegramOwnerHandoffPreview): TelegramOwnerHandoffResult {
  return {
    ...telegramOwnerHandoffBlockedResult(preview, false),
    applyStatus: "denied",
  };
}

export function telegramOwnerHandoffPreviewText(preview: TelegramOwnerHandoffPreview): string {
  return telegramOwnerHandoffTextBase(preview, "Telegram owner handoff preview");
}

export function telegramOwnerHandoffResultText(result: TelegramOwnerHandoffResult): string {
  const lines = [
    telegramOwnerHandoffTextBase(result, "Telegram owner handoff apply"),
    "",
    "Handoff result:",
    `- Apply status: ${result.applyStatus}`,
    `- Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `- Handoff status: ${result.handoffStatus}`,
    `- Fetched messages: ${result.fetchedMessageCount}`,
    `- Candidate messages inspected: ${result.candidateMessageCount}`,
    `- Exact setup-code matches: ${result.matchedMessageCount}`,
    `- Distinct matched senders: ${result.matchedSenderCount}`,
    result.ownerUserId ? `- Owner user: ${result.ownerUserId}` : undefined,
    result.ownerLabel ? `- Owner label: ${result.ownerLabel}` : undefined,
    result.sourceMessageId ? `- Source message: ${result.sourceMessageId}` : undefined,
    result.error ? `- Error: ${result.error}` : undefined,
  ].filter((line): line is string => Boolean(line));
  if (result.ownerUserId) {
    lines.push(
      "",
      "Next binding step:",
      `- Use ownerUserId ${result.ownerUserId} with ambient_messaging_telegram_remote_surface_preview/apply for profile ${result.profileId} and conversation ${result.conversationId}.`,
    );
  }
  return lines.join("\n");
}

export function telegramOwnerHandoffApprovalDetail(preview: TelegramOwnerHandoffPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    `Profile: ${preview.profileId}`,
    `Conversation: ${preview.conversationId}`,
    `Limit: ${preview.limit}`,
    `Setup code length: ${preview.setupCodeLength}`,
    `Setup code preview: ${preview.setupCodePreview}`,
    `Endpoint: ${preview.endpointPath ?? "unavailable"}`,
    `Would read unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `Would filter exact setup code: ${preview.safety.filtersExactSetupCode ? "yes" : "no"}`,
    `Would resolve sender profiles: ${preview.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `Would return matched sender id: ${preview.safety.returnsMatchedSenderId ? "yes" : "no"}`,
    `Would return provider message content: ${preview.safety.returnsProviderMessageContent ? "yes" : "no"}`,
    `Would start bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `Would send provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    ...preview.policyNotes,
  ].join("\n");
}

function telegramOwnerHandoffTextBase(
  preview: TelegramOwnerHandoffPreview,
  title: string,
): string {
  return [
    title,
    `Provider: ${preview.providerId}`,
    `Status: ${preview.status}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    `Profile: ${preview.profileId}`,
    `Conversation: ${preview.conversationId}`,
    `Setup code length: ${preview.setupCodeLength}`,
    `Setup code preview: ${preview.setupCodePreview}`,
    `Limit: ${preview.limit}`,
    preview.endpointPath ? `Endpoint: ${preview.endpointPath}` : undefined,
    preview.runtimeProvider ? `Runtime state: ${preview.runtimeProvider.state}/${preview.runtimeProvider.mode}` : "Runtime state: unavailable",
    "",
    "Safety:",
    `- Reads unread messages: ${preview.safety.readsProviderUnreadMessages ? "yes" : "no"}`,
    `- Filters exact setup code: ${preview.safety.filtersExactSetupCode ? "yes" : "no"}`,
    `- Resolves sender profiles: ${preview.safety.resolvesSenderProfiles ? "yes" : "no"}`,
    `- Returns matched sender id: ${preview.safety.returnsMatchedSenderId ? "yes" : "no"}`,
    `- Returns provider message content: ${preview.safety.returnsProviderMessageContent ? "yes" : "no"}`,
    `- Reads provider history: ${preview.safety.readsProviderHistory ? "yes" : "no"}`,
    `- Starts bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `- Sends provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Mutates bindings: ${preview.safety.mutatesBindings ? "yes" : "no"}`,
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
  ].filter((line): line is string => Boolean(line)).join("\n");
}

async function fetchMessageSender(input: {
  baseUrl: string;
  preview: TelegramOwnerHandoffPreview;
  messageId: string;
  env: Record<string, string | undefined>;
  fetchFn: FetchLike;
}): Promise<{ id: string; label?: string }> {
  const body = await fetchBridgeJson<{ sender?: TelegramPeerProfile }>(
    `${input.baseUrl}/sessions/${encodeURIComponent(input.preview.profileId)}/chats/${encodeURIComponent(input.preview.conversationId)}/messages/${encodeURIComponent(input.messageId)}/sender-profile`,
    {
      env: input.env,
      fetchFn: input.fetchFn,
    },
  );
  const sender = body.sender;
  if (sender?.kind === "user") {
    const id = stringValue(sender.user?.userId);
    const label = stringValue(sender.user?.displayName)
      || [stringValue(sender.user?.firstName), stringValue(sender.user?.lastName)].filter(Boolean).join(" ").trim()
      || stringValue(sender.user?.username);
    return { id, ...(label ? { label } : {}) };
  }
  if (sender?.kind === "chat") {
    const id = stringValue(sender.chat?.chatId);
    const label = stringValue(sender.chat?.title);
    return { id, ...(label ? { label } : {}) };
  }
  return { id: "" };
}

async function fetchBridgeJson<T>(
  url: string | undefined,
  input: {
    env: Record<string, string | undefined>;
    fetchFn: FetchLike;
  },
): Promise<T> {
  if (!url) throw new Error("Telegram owner handoff endpoint is unavailable.");
  const headers: Record<string, string> = {};
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim()) headers["x-telegram-api-id"] = input.env.AMBIENT_AGENT_TELEGRAM_API_ID.trim();
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) headers["x-telegram-api-hash"] = input.env.AMBIENT_AGENT_TELEGRAM_API_HASH.trim();
  const response = await input.fetchFn(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`Telegram bridge owner handoff request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  return await response.json() as T;
}

function uniqueMatchesBySender(matches: TelegramOwnerHandoffMatch[]): TelegramOwnerHandoffMatch[] {
  const bySender = new Map<string, TelegramOwnerHandoffMatch>();
  for (const match of matches) {
    if (!bySender.has(match.ownerUserId)) bySender.set(match.ownerUserId, match);
  }
  return [...bySender.values()];
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

function previewSetupCode(value: string): string {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
