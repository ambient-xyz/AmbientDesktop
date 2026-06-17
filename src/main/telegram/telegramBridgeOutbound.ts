import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
  MessagingGatewayQueuedProjection,
} from "../../shared/messagingGateway";
import { runtimeEventRelayText } from "../messaging/messagingRuntimeEventRelay";

export { runtimeEventRelayText } from "../messaging/messagingRuntimeEventRelay";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const DEFAULT_BRIDGE_PORT = "8091";
const MAX_REPLY_CHARS = 4000;

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface TelegramBridgeReplyInput {
  queuedProjectionId?: string;
  text?: string;
  runtimeEventId?: string;
}

export interface TelegramBridgeReplyPreview {
  providerId: "telegram-tdlib";
  status: "ready" | "blocked";
  canApplyNow: boolean;
  approvalRequired: boolean;
  queuedProjectionId: string;
  text: string;
  textLength: number;
  textPreview: string;
  endpointPath?: string;
  replyToMessageId?: string;
  queuedProjection?: MessagingGatewayQueuedProjection;
  binding?: MessagingBindingDescriptor;
  runtimeEvent?: MessagingGatewayRemoteSurfaceRuntimeEvent;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  blockers: string[];
  repairSteps: string[];
  warnings: string[];
  policyNotes: string[];
  nextSteps: string[];
  safety: {
    readsProviderMessages: false;
    sendsProviderMessages: boolean;
    startsBridge: false;
    readsProviderHistory: false;
    exposesRuntimeStateToExternalConnector: false;
  };
}

export interface TelegramBridgeReplyResult extends TelegramBridgeReplyPreview {
  applyStatus: "sent" | "blocked" | "denied" | "failed";
  approvalRecorded: boolean;
  delivery: MessagingGatewayOutboundDelivery;
  providerMessageId?: string;
}

interface TelegramBridgeSendResponse {
  id?: unknown;
  messageId?: unknown;
  date?: unknown;
  message?: {
    id?: unknown;
    date?: unknown;
  };
}

export function telegramBridgeReplyInput(params: unknown): TelegramBridgeReplyInput {
  const raw = params as Record<string, unknown> | undefined;
  const queuedProjectionId = optionalString(raw?.queuedProjectionId);
  const runtimeEventId = optionalString(raw?.runtimeEventId);
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  if (!runtimeEventId && !queuedProjectionId) throw new Error("queuedProjectionId is required unless runtimeEventId is supplied.");
  if (!runtimeEventId && !text) throw new Error("text is required unless runtimeEventId is supplied.");
  if (text.length > MAX_REPLY_CHARS) throw new Error(`text must be ${MAX_REPLY_CHARS} characters or fewer.`);
  return {
    ...(queuedProjectionId ? { queuedProjectionId } : {}),
    ...(text ? { text } : {}),
    ...(runtimeEventId ? { runtimeEventId } : {}),
  };
}

export function buildTelegramBridgeReplyPreview(input: {
  toolInput: TelegramBridgeReplyInput;
  bindings: MessagingBindingListResult;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}): TelegramBridgeReplyPreview {
  const runtimeEvent = input.toolInput.runtimeEventId
    ? input.runtimeStatus.remoteSurfaceRuntimeEvents?.find((event) => event.id === input.toolInput.runtimeEventId)
    : undefined;
  const queuedProjectionId = input.toolInput.queuedProjectionId ?? runtimeEvent?.queuedProjectionId ?? "";
  const runtimeEventText = runtimeEvent ? runtimeEventRelayText(runtimeEvent) : "";
  const suppliedText = input.toolInput.text ?? "";
  const text = runtimeEvent ? runtimeEventText : suppliedText;
  const queuedProjection = input.runtimeStatus.queuedProjections.find((projection) => projection.id === queuedProjectionId);
  const binding = queuedProjection?.bindingId
    ? input.bindings.bindings.find((candidate) => candidate.id === queuedProjection.bindingId)
    : runtimeEvent?.bindingId
      ? input.bindings.bindings.find((candidate) => candidate.id === runtimeEvent.bindingId)
    : undefined;
  const runtimeProvider = input.runtimeStatus.providers.find((provider) => provider.providerId === TELEGRAM_PROVIDER_ID);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (input.toolInput.runtimeEventId && !runtimeEvent) {
    blockers.push("Remote Ambient Surface runtime event was not found in the messaging gateway runtime status.");
  }
  if (runtimeEvent) {
    if (runtimeEvent.status === "pending") {
      blockers.push("Remote Ambient Surface runtime event is still pending; call ambient_messaging_gateway_status after it completes.");
    }
    if (!runtimeEvent.queuedProjectionId) {
      blockers.push("Remote Ambient Surface runtime event does not include a queued projection id for reply routing.");
    }
    if (runtimeEvent.relayStatus === "sent") {
      blockers.push("Remote Ambient Surface runtime event has already been relayed.");
    }
    if (runtimeEvent.relayStatus && runtimeEvent.relayStatus !== "sent") {
      warnings.push(`Previous relay attempt status: ${runtimeEvent.relayStatus}.`);
    }
    if (suppliedText && suppliedText !== runtimeEventText) {
      blockers.push("Runtime event relay text is generated by Ambient; omit text when using runtimeEventId.");
    }
  }
  if (!text.trim()) {
    blockers.push("Reply text is unavailable.");
  }
  const hasRuntimeEventBindingRoute = Boolean(runtimeEvent && binding && runtimeEvent.sourceEventId);
  if (!queuedProjection && !hasRuntimeEventBindingRoute) {
    blockers.push("Queued projection was not found in the messaging gateway runtime.");
  }
  if (queuedProjection && queuedProjection.providerId !== TELEGRAM_PROVIDER_ID) {
    blockers.push("Queued projection is not a Telegram bridge projection.");
  }
  if (queuedProjection && queuedProjection.purpose !== "remote_ambient_surface") {
    blockers.push("Outbound replies are currently enabled only for Remote Ambient Surface projections.");
  }
  if (!binding) {
    blockers.push("Queued projection does not map to an active messaging binding.");
  } else {
    if (binding.status !== "active") blockers.push("Messaging binding is not active.");
    if (binding.purpose !== "remote_ambient_surface") blockers.push("Messaging binding is not a Remote Ambient Surface binding.");
    if (!binding.ownerUserId?.trim()) blockers.push("Remote Ambient Surface binding does not have an owner sender id.");
    if (queuedProjection?.authProfileId && binding.authProfileId !== queuedProjection.authProfileId) {
      blockers.push("Queued projection profile does not match the active binding profile.");
    }
  }
  if (!runtimeProvider || runtimeProvider.state !== "running" || runtimeProvider.mode !== "real") {
    blockers.push("Telegram provider is not running in real mode.");
  }
  if (runtimeProvider?.readiness && !runtimeProvider.readiness.bridgeReachable) {
    blockers.push("Telegram bridge root is not reachable according to the current readiness state.");
  }
  if (queuedProjection && !queuedProjection.authProfileId && !binding?.authProfileId) {
    blockers.push("No Telegram auth profile is available for the queued projection.");
  }
  if (text.length > 1000) {
    warnings.push("Reply text is long for a messaging surface; consider sending a shorter summary.");
  }

  const profileId = queuedProjection?.authProfileId || binding?.authProfileId;
  const conversationId = queuedProjection?.conversationId || binding?.conversationId;
  const endpointPath = profileId && conversationId
    ? `/sessions/${encodeURIComponent(profileId)}/messages/send`
    : undefined;
  const replyToMessageId = profileId && conversationId
    ? telegramBridgeSourceMessageId({
      queuedProjection,
      sourceEventId: runtimeEvent?.sourceEventId,
      conversationId,
      profileId,
    })
    : undefined;
  const repairSteps = telegramBridgeReplyRepairSteps({
    blockers,
    runtimeEvent,
    hasQueuedProjection: Boolean(queuedProjection),
    hasQueuedProjectionId: Boolean(queuedProjectionId),
    hasSourceEventId: Boolean(runtimeEvent?.sourceEventId),
    hasReplyToMessageId: Boolean(replyToMessageId),
  });
  const canApplyNow = blockers.length === 0;
  return {
    providerId: TELEGRAM_PROVIDER_ID,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    approvalRequired: true,
    queuedProjectionId,
    text,
    textLength: text.length,
    textPreview: previewText(text),
    ...(endpointPath ? { endpointPath } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ...(queuedProjection ? { queuedProjection } : {}),
    ...(binding ? { binding } : {}),
    ...(runtimeEvent ? { runtimeEvent } : {}),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    blockers,
    repairSteps,
    warnings,
    policyNotes: [
      "Outbound Telegram replies require explicit approval every time.",
      runtimeEvent
        ? "Runtime-event replies use Ambient-generated event text so Pi does not hand-copy status details."
        : undefined,
      "The current slice supports only Remote Ambient Surface replies to the owner/delegate conversation that produced a queued projection.",
      "Messaging Connector external sends remain separate and firewalled from Ambient runtime state.",
      "The send path posts one text message to the Telegram bridge and does not list chats, read provider history, read provider messages, or start bridges.",
    ].filter((note): note is string => Boolean(note)),
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve this exact Telegram reply text.",
        "After apply, inspect gateway status for the outbound delivery record.",
      ]
      : [
        "Follow the Repair steps below, then rerun ambient_messaging_telegram_relay_diagnostics before sending.",
        "Do not retry with shell, browser, Telegram Desktop UI, provider history scraping, Signal tools, generic messaging tools, or Messaging Connector sends.",
      ],
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: canApplyNow,
      startsBridge: false,
      readsProviderHistory: false,
      exposesRuntimeStateToExternalConnector: false,
    },
  };
}

export async function applyTelegramBridgeReply(input: {
  preview: TelegramBridgeReplyPreview;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  now?: () => Date;
}): Promise<TelegramBridgeReplyResult> {
  const now = input.now ?? (() => new Date());
  if (!input.preview.canApplyNow) return telegramBridgeReplyBlockedResult(input.preview, now);
  if (!input.approvalRecorded) return telegramBridgeReplyDeniedResult(input.preview, now);
  try {
    const env = input.env ?? process.env;
    const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
    const baseUrl = normalizeBaseUrl(env.AMBIENT_AGENT_TELEGRAM_BRIDGE_URL?.trim() || `http://127.0.0.1:${env.AMBIENT_AGENT_TELEGRAM_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
    const endpointPath = input.preview.endpointPath;
    if (!endpointPath) throw new Error("Telegram reply endpoint is unavailable.");
    const body: Record<string, string> = { text: input.preview.text };
    const chatId = input.preview.queuedProjection?.conversationId || input.preview.binding?.conversationId;
    if (!chatId) throw new Error("Telegram reply conversation is unavailable.");
    body.chatId = chatId;
    if (input.preview.replyToMessageId) body.replyToMessageId = input.preview.replyToMessageId;
    const response = await fetchBridgeJson<TelegramBridgeSendResponse>(`${baseUrl}${endpointPath}`, {
      env,
      fetchFn,
      body,
    });
    const providerMessageId = stringValue(response.messageId)
      || stringValue(response.id)
      || stringValue(response.message?.id);
    const delivery = deliveryFromPreview(input.preview, {
      status: "sent",
      sentAt: stringValue(response.date) || stringValue(response.message?.date) || now().toISOString(),
      providerMessageId,
    });
    return {
      ...input.preview,
      applyStatus: "sent",
      approvalRecorded: true,
      delivery,
      ...(providerMessageId ? { providerMessageId } : {}),
    };
  } catch (error) {
    const delivery = deliveryFromPreview(input.preview, {
      status: "failed",
      sentAt: now().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...input.preview,
      applyStatus: "failed",
      approvalRecorded: true,
      delivery,
    };
  }
}

export function telegramBridgeReplyPreviewText(preview: TelegramBridgeReplyPreview): string {
  return telegramBridgeReplyTextBase(preview, "Telegram bridge reply preview");
}

export function telegramBridgeReplyResultText(result: TelegramBridgeReplyResult): string {
  return [
    telegramBridgeReplyTextBase(result, "Telegram bridge reply apply"),
    "",
    "Apply result:",
    `- Apply status: ${result.applyStatus}`,
    `- Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `- Delivery: ${result.delivery.id}`,
    `- Delivery status: ${result.delivery.status}`,
    result.providerMessageId ? `- Provider message: ${result.providerMessageId}` : undefined,
    result.delivery.error ? `- Error: ${result.delivery.error}` : undefined,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function telegramBridgeReplyApprovalDetail(preview: TelegramBridgeReplyPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    `Queued projection: ${preview.queuedProjectionId}`,
    preview.runtimeEvent ? `Runtime event: ${preview.runtimeEvent.id}` : undefined,
    preview.runtimeEvent ? `Runtime event status: ${preview.runtimeEvent.status}` : undefined,
    preview.queuedProjection?.authProfileId ? `Profile: ${preview.queuedProjection.authProfileId}` : undefined,
    preview.queuedProjection ? `Conversation: ${preview.queuedProjection.conversationId}` : undefined,
    preview.binding ? `Binding: ${preview.binding.id}` : undefined,
    preview.replyToMessageId ? `Reply to provider message: ${preview.replyToMessageId}` : undefined,
    `Text length: ${preview.textLength}`,
    `Exact text: ${preview.text}`,
    `Text preview: ${preview.textPreview}`,
    `Would send provider message: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `Would read provider messages: ${preview.safety.readsProviderMessages ? "yes" : "no"}`,
    `Would read provider history: ${preview.safety.readsProviderHistory ? "yes" : "no"}`,
    `Would start bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    ...preview.policyNotes,
  ].filter((line): line is string => Boolean(line)).join("\n");
}

function telegramBridgeReplyBlockedResult(preview: TelegramBridgeReplyPreview, now: () => Date): TelegramBridgeReplyResult {
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRecorded: false,
    delivery: deliveryFromPreview(preview, {
      status: "blocked",
      sentAt: now().toISOString(),
      error: preview.blockers.join("; ") || "Reply preview is blocked.",
    }),
  };
}

function telegramBridgeReplyDeniedResult(preview: TelegramBridgeReplyPreview, now: () => Date): TelegramBridgeReplyResult {
  return {
    ...preview,
    applyStatus: "denied",
    approvalRecorded: false,
    delivery: deliveryFromPreview(preview, {
      status: "denied",
      sentAt: now().toISOString(),
      error: "User denied Telegram reply send.",
    }),
  };
}

function telegramBridgeReplyTextBase(preview: TelegramBridgeReplyPreview, title: string): string {
  return [
    title,
    `Provider: ${preview.providerId}`,
    `Status: ${preview.status}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required: ${preview.approvalRequired ? "yes" : "no"}`,
    `Queued projection: ${preview.queuedProjectionId}`,
    preview.runtimeEvent ? `Runtime event: ${preview.runtimeEvent.id}` : undefined,
    preview.runtimeEvent ? `Runtime event status: ${preview.runtimeEvent.status}` : undefined,
    preview.queuedProjection?.authProfileId ? `Profile: ${preview.queuedProjection.authProfileId}` : undefined,
    preview.queuedProjection ? `Conversation: ${preview.queuedProjection.conversationId}` : undefined,
    preview.binding ? `Binding: ${preview.binding.id}` : undefined,
    preview.endpointPath ? `Endpoint: ${preview.endpointPath}` : undefined,
    preview.replyToMessageId ? `Reply to message: ${preview.replyToMessageId}` : undefined,
    `Text length: ${preview.textLength}`,
    `Text preview: ${preview.textPreview}`,
    "",
    "Safety:",
    `- Sends provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Reads provider messages: ${preview.safety.readsProviderMessages ? "yes" : "no"}`,
    `- Reads provider history: ${preview.safety.readsProviderHistory ? "yes" : "no"}`,
    `- Starts bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `- Exposes runtime state to Messaging Connector: ${preview.safety.exposesRuntimeStateToExternalConnector ? "yes" : "no"}`,
    "",
    "Blockers:",
    ...(preview.blockers.length ? preview.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Repair steps:",
    ...(preview.repairSteps.length ? preview.repairSteps.map((step) => `- ${step}`) : ["- None"]),
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

function telegramBridgeReplyRepairSteps(input: {
  blockers: string[];
  runtimeEvent?: MessagingGatewayRemoteSurfaceRuntimeEvent;
  hasQueuedProjection: boolean;
  hasQueuedProjectionId: boolean;
  hasSourceEventId: boolean;
  hasReplyToMessageId: boolean;
}): string[] {
  if (!input.blockers.length) return [];
  const steps: string[] = [];
  const hasBlocker = (needle: string) => input.blockers.some((blocker) => blocker.includes(needle));
  if (hasBlocker("runtime event was not found")) {
    steps.push("Call ambient_messaging_gateway_status again and use an exact current runtimeEventId from Recent Remote Ambient Surface runtime events.");
  }
  if (hasBlocker("runtime event is still pending")) {
    steps.push("Wait for the runtime event to complete or fail, then rerun ambient_messaging_gateway_status and preview the same runtimeEventId again.");
  }
  if (hasBlocker("runtime event has already been relayed")) {
    steps.push("Do not resend this runtime event; inspect Recent outbound deliveries in ambient_messaging_gateway_status and wait for a new runtime event if another owner update is needed.");
  }
  if (hasBlocker("Runtime event relay text is generated by Ambient")) {
    steps.push("Omit text when using runtimeEventId. Ambient will generate the exact relay text from the runtime event.");
  }
  if (hasBlocker("Queued projection was not found") || hasBlocker("queued projection id") || hasBlocker("Reply text is unavailable")) {
    if (input.runtimeEvent && input.hasQueuedProjectionId && !input.hasQueuedProjection && !input.hasSourceEventId && !input.hasReplyToMessageId) {
      steps.push("This runtime event does not retain source routing and its queued projection is gone; wait for a new owner command/runtime event or preview a manual reply only when a current queued projection provides exact Telegram reply routing.");
    } else {
      steps.push("Use a current queued Telegram Remote Ambient Surface projection or a runtime event that still carries queued projection routing; do not recover route metadata from Telegram history, Telegram Desktop, shell, browser, or bridge history.");
    }
  }
  if (hasBlocker("not a Telegram bridge projection") || hasBlocker("Remote Ambient Surface projections") || hasBlocker("Messaging binding is not")) {
    steps.push("Use only an active owner-scoped Telegram Remote Ambient Surface projection; Messaging Connector conversations remain firewalled from Ambient runtime relay state.");
  }
  if (hasBlocker("does not map to an active messaging binding") || hasBlocker("owner sender id") || hasBlocker("profile does not match")) {
    steps.push("Repair or recreate the owner-scoped Telegram Remote Ambient Surface binding with ambient_messaging_telegram_remote_surface_preview/apply, then rerun diagnostics.");
  }
  if (hasBlocker("provider is not running in real mode") || hasBlocker("bridge root is not reachable")) {
    steps.push("Start or repair the reviewed real Telegram gateway lifecycle until ambient_messaging_gateway_status reports mode=real, state=running, and Bridge reachable: yes.");
  }
  if (hasBlocker("No Telegram auth profile")) {
    steps.push("Use a queued projection or binding with an exact Telegram auth profile id; if missing, recreate the owner binding from the reviewed Telegram setup flow.");
  }
  if (!steps.length) {
    steps.push("Resolve the listed blockers, rerun ambient_messaging_telegram_relay_diagnostics, and only then preview/apply the Telegram reply.");
  }
  return steps;
}

function deliveryFromPreview(
  preview: TelegramBridgeReplyPreview,
  input: {
    status: MessagingGatewayOutboundDelivery["status"];
    sentAt: string;
    providerMessageId?: string;
    error?: string;
  },
): MessagingGatewayOutboundDelivery {
  const queuedProjection = preview.queuedProjection;
  const authProfileId = queuedProjection?.authProfileId ?? preview.binding?.authProfileId;
  const purpose = queuedProjection?.purpose ?? preview.binding?.purpose;
  return {
    id: `outbound-${preview.providerId}-${input.sentAt.replace(/[^0-9A-Za-z]/g, "")}`,
    providerId: preview.providerId,
    ...(authProfileId ? { authProfileId } : {}),
    conversationId: queuedProjection?.conversationId ?? preview.binding?.conversationId ?? "",
    ...(queuedProjection?.threadId ? { threadId: queuedProjection.threadId } : {}),
    sourceProjectionId: preview.queuedProjectionId,
    ...(preview.binding?.id ? { bindingId: preview.binding.id } : {}),
    ...(purpose ? { purpose } : {}),
    ...(preview.replyToMessageId ? { replyToMessageId: preview.replyToMessageId } : {}),
    ...(preview.runtimeEvent?.id ? { runtimeEventId: preview.runtimeEvent.id } : {}),
    ...(input.providerMessageId ? { providerMessageId: input.providerMessageId } : {}),
    status: input.status,
    textPreview: preview.textPreview,
    textLength: preview.textLength,
    sentAt: input.sentAt,
    ...(input.error ? { error: input.error } : {}),
  };
}

async function fetchBridgeJson<T>(
  url: string,
  input: {
    env: Record<string, string | undefined>;
    fetchFn: FetchLike;
    body: Record<string, string>;
  },
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_ID?.trim()) headers["x-telegram-api-id"] = input.env.AMBIENT_AGENT_TELEGRAM_API_ID.trim();
  if (input.env.AMBIENT_AGENT_TELEGRAM_API_HASH?.trim()) headers["x-telegram-api-hash"] = input.env.AMBIENT_AGENT_TELEGRAM_API_HASH.trim();
  const response = await input.fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify(input.body),
  });
  if (!response.ok) {
    throw new Error(`Telegram bridge send failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  return await response.json() as T;
}

function telegramBridgeSourceMessageId(input: {
  queuedProjection?: MessagingGatewayQueuedProjection;
  sourceEventId?: string;
  conversationId: string;
  profileId: string;
}): string | undefined {
  const prefix = `telegram-${input.profileId}-${input.conversationId}-`;
  const sourceEventId = input.queuedProjection?.sourceEventId ?? input.sourceEventId;
  if (!sourceEventId) return undefined;
  return sourceEventId.startsWith(prefix)
    ? sourceEventId.slice(prefix.length)
    : undefined;
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

function previewText(text: string): string {
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
