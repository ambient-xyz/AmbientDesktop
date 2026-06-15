import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayQueuedProjection,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../shared/messagingGateway";
import { runtimeEventRelayText } from "./messagingRuntimeEventRelay";
import {
  signalBridgeApprovedReplySendContract,
  signalBridgeEndpointPaths,
  type SignalBridgeApprovedReplySendContract,
} from "./signalBridgeContract";

const SIGNAL_PROVIDER_ID = "signal-cli";
const MAX_REPLY_CHARS = 4000;
const DEFAULT_BRIDGE_PORT = "8092";

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface SignalBridgeReplyInput {
  providerId: "signal-cli";
  queuedProjectionId?: string;
  bindingId?: string;
  profileId?: string;
  conversationId?: string;
  replyToMessageId?: string;
  text?: string;
  runtimeEventId?: string;
}

export interface SignalBridgeReplyBindingSummary {
  bindingId: string;
  profileId: string;
  conversationId: string;
  ownerUserId?: string;
  ambientSurface?: string;
  maxDisclosureLabel?: string;
  status: string;
}

export interface SignalBridgeReplyStatus {
  providerId: "signal-cli";
  status: "ready" | "blocked";
  reviewedReplySendImplemented: true;
  outboundReplyEnabled: boolean;
  bridgeApprovedReplyCapability: boolean;
  bridgeReachable: boolean;
  configured: boolean;
  activeOwnerBindingCount: number;
  replyCandidateBindingCount: number;
  contract: SignalBridgeApprovedReplySendContract;
  selectedBindings: SignalBridgeReplyBindingSummary[];
  blockers: string[];
  repairSteps: string[];
  warnings: string[];
  boundaries: string[];
}

export interface SignalBridgeReplyPreview extends SignalBridgeReplyStatus {
  canApplyNow: boolean;
  previewOnly: true;
  approvalRequired: true;
  futureApprovalRequired: boolean;
  applyToolName: "ambient_messaging_signal_bridge_reply_apply";
  queuedProjectionId?: string;
  queuedProjection?: MessagingGatewayQueuedProjection;
  binding?: MessagingBindingDescriptor;
  runtimeEvent?: MessagingGatewayRemoteSurfaceRuntimeEvent;
  bindingId?: string;
  profileId?: string;
  conversationId?: string;
  ownerUserId?: string;
  replyToMessageId?: string;
  endpointPath?: string;
  text: string;
  textLength: number;
  textPreview: string;
  runtimeProvider?: MessagingGatewayRuntimeStatus["providers"][number];
  safety: {
    requestsApproval: boolean;
    sendsProviderMessages: boolean;
    readsProviderMessages: false;
    readsProviderHistory: false;
    startsBridge: false;
    mutatesBindings: false;
    usesReviewedBridgeSendContract: boolean;
    exposesRuntimeStateToMessagingConnector: false;
  };
  nextSteps: string[];
}

export interface SignalBridgeReplyResult extends SignalBridgeReplyPreview {
  applyStatus: "sent" | "blocked" | "denied" | "failed";
  approvalRequested: boolean;
  approvalRecorded: boolean;
  sent: boolean;
  delivery: MessagingGatewayOutboundDelivery;
  providerMessageId?: string;
  sentAt?: string;
  failureHint?: string;
  error?: string;
}

export function signalBridgeReplyInput(params: unknown): SignalBridgeReplyInput {
  const raw = params as Record<string, unknown> | undefined;
  const providerId = optionalString(raw?.providerId) ?? SIGNAL_PROVIDER_ID;
  if (providerId !== SIGNAL_PROVIDER_ID) throw new Error(`providerId must be ${SIGNAL_PROVIDER_ID} when supplied.`);
  const text = typeof raw?.text === "string" ? raw.text.trim() : "";
  const runtimeEventId = optionalString(raw?.runtimeEventId);
  if (text.length > MAX_REPLY_CHARS) throw new Error(`text must be ${MAX_REPLY_CHARS} characters or fewer.`);
  return {
    providerId: SIGNAL_PROVIDER_ID,
    ...(optionalString(raw?.queuedProjectionId) ? { queuedProjectionId: optionalString(raw?.queuedProjectionId)! } : {}),
    ...(optionalString(raw?.bindingId) ? { bindingId: optionalString(raw?.bindingId)! } : {}),
    ...(optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId)
      ? { profileId: (optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId))! }
      : {}),
    ...(optionalString(raw?.conversationId) ? { conversationId: optionalString(raw?.conversationId)! } : {}),
    ...(optionalString(raw?.replyToMessageId) ?? optionalString(raw?.sourceMessageId)
      ? { replyToMessageId: (optionalString(raw?.replyToMessageId) ?? optionalString(raw?.sourceMessageId))! }
      : {}),
    ...(text ? { text } : {}),
    ...(runtimeEventId ? { runtimeEventId } : {}),
  };
}

export function buildSignalBridgeReplyStatus(input: {
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  descriptor?: MessagingProviderDescriptor;
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
}): SignalBridgeReplyStatus {
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const selectedBindings = activeOwnerSignalBindings(input.bindings.bindings)
    .filter((binding) => input.bindingId ? binding.id === input.bindingId : true)
    .filter((binding) => input.profileId ? binding.authProfileId === input.profileId : true)
    .filter((binding) => input.conversationId ? binding.conversationId === input.conversationId : true)
    .map(signalReplyBindingSummary);
  const activeOwnerBindingCount = activeOwnerSignalBindings(input.bindings.bindings).length;
  const outboundReplyEnabled = input.descriptor?.implementation.outboundReplyEnabled === true;
  const bridgeApprovedReplyCapability = readiness?.bridgeCapabilities?.approvedReplySend === true;
  const bridgeReachable = readiness?.bridgeReachable === true;
  const configured = readiness?.configured === true;
  const blockers = [
    ...(outboundReplyEnabled ? [] : ["Signal provider descriptor reports outboundReplyEnabled=false."]),
    ...(bridgeApprovedReplyCapability ? [] : ["Signal bridge root did not advertise approvedReplySend."]),
    ...(bridgeReachable ? [] : ["Signal bridge root is not reachable according to readiness."]),
    ...(configured ? [] : ["No reviewed bridge-readable Signal profile is configured."]),
    ...(activeOwnerBindingCount ? [] : ["No active Signal Remote Ambient Surface owner binding exists for replies."]),
  ];
  const repairSteps = signalReplyRepairSteps({
    blockers,
    bridgeApprovedReplyCapability,
    bridgeReachable,
    configured,
    activeOwnerBindingCount,
  });
  return {
    providerId: SIGNAL_PROVIDER_ID,
    status: blockers.length ? "blocked" : "ready",
    reviewedReplySendImplemented: true,
    outboundReplyEnabled,
    bridgeApprovedReplyCapability,
    bridgeReachable,
    configured,
    activeOwnerBindingCount,
    replyCandidateBindingCount: selectedBindings.length,
    contract: signalBridgeApprovedReplySendContract({
      profileId: input.profileId,
      conversationId: input.conversationId,
    }),
    selectedBindings,
    blockers,
    repairSteps,
    warnings: [
      "Signal chat-to-self ingestion is separate from outbound Signal replies.",
      "Do not use Signal Desktop UI, signal-cli, shell, browser automation, provider stores, Telegram tools, generic messaging tools, or Messaging Connector sends as a reply workaround.",
    ],
    boundaries: signalReplyBoundaries(),
  };
}

export function buildSignalBridgeReplyPreview(input: {
  toolInput: SignalBridgeReplyInput;
  bindings: MessagingBindingListResult;
  runtimeStatus?: MessagingGatewayRuntimeStatus;
  descriptor?: MessagingProviderDescriptor;
}): SignalBridgeReplyPreview {
  const runtimeEvent = input.toolInput.runtimeEventId
    ? input.runtimeStatus?.remoteSurfaceRuntimeEvents?.find((event) => event.id === input.toolInput.runtimeEventId)
    : undefined;
  const queuedProjectionId = input.toolInput.queuedProjectionId ?? runtimeEvent?.queuedProjectionId;
  const runtimeEventText = runtimeEvent ? runtimeEventRelayText(runtimeEvent) : "";
  const suppliedText = input.toolInput.text ?? "";
  const text = runtimeEvent ? runtimeEventText : suppliedText;
  const queuedProjection = queuedProjectionId
    ? input.runtimeStatus?.queuedProjections.find((projection) => projection.id === queuedProjectionId)
    : undefined;
  const bindingFromProjection = queuedProjection?.bindingId
    ? input.bindings.bindings.find((candidate) => candidate.id === queuedProjection.bindingId)
    : undefined;
  const explicitBinding = input.toolInput.bindingId
    ? input.bindings.bindings.find((candidate) => candidate.id === input.toolInput.bindingId)
    : undefined;
  const preliminaryProfileId = input.toolInput.profileId ?? queuedProjection?.authProfileId ?? explicitBinding?.authProfileId ?? bindingFromProjection?.authProfileId;
  const preliminaryConversationId = input.toolInput.conversationId ?? queuedProjection?.conversationId ?? explicitBinding?.conversationId ?? bindingFromProjection?.conversationId;
  const matchingBindings = activeOwnerSignalBindings(input.bindings.bindings)
    .filter((candidate) => input.toolInput.bindingId ? candidate.id === input.toolInput.bindingId : true)
    .filter((candidate) => preliminaryProfileId ? candidate.authProfileId === preliminaryProfileId : true)
    .filter((candidate) => preliminaryConversationId ? candidate.conversationId === preliminaryConversationId : true);
  const binding = explicitBinding ?? bindingFromProjection ?? (matchingBindings.length === 1 ? matchingBindings[0] : undefined);
  const profileId = input.toolInput.profileId ?? queuedProjection?.authProfileId ?? binding?.authProfileId;
  const conversationId = input.toolInput.conversationId ?? queuedProjection?.conversationId ?? binding?.conversationId;
  const bindingId = input.toolInput.bindingId ?? binding?.id ?? queuedProjection?.bindingId;
  const replyToMessageId = input.toolInput.replyToMessageId ?? runtimeEvent?.replyToMessageId ?? signalSourceMessageId({
    queuedProjection,
    sourceEventId: runtimeEvent?.sourceEventId,
    profileId,
    conversationId,
  });
  const status = buildSignalBridgeReplyStatus({
    bindings: input.bindings,
    runtimeStatus: input.runtimeStatus,
    descriptor: input.descriptor,
    profileId,
    conversationId,
    bindingId,
  });
  const runtimeProvider = input.runtimeStatus?.providers.find((provider) => provider.providerId === SIGNAL_PROVIDER_ID);
  const scopeBlockers: string[] = [];
  const scopeWarnings: string[] = [];
  if (input.toolInput.runtimeEventId && !runtimeEvent) {
    scopeBlockers.push("Remote Ambient Surface runtime event was not found in the messaging gateway runtime status.");
  }
  if (runtimeEvent) {
    if (runtimeEvent.status === "pending") {
      scopeBlockers.push("Remote Ambient Surface runtime event is still pending; call ambient_messaging_gateway_status after it completes.");
    }
    if (!runtimeEvent.queuedProjectionId) {
      scopeBlockers.push("Remote Ambient Surface runtime event does not include a queued projection id for reply routing.");
    }
    if (runtimeEvent.relayStatus === "sent") {
      scopeBlockers.push("Remote Ambient Surface runtime event has already been relayed.");
    }
    if (runtimeEvent.relayStatus && runtimeEvent.relayStatus !== "sent") {
      scopeWarnings.push(`Previous relay attempt status: ${runtimeEvent.relayStatus}.`);
    }
    if (suppliedText && suppliedText !== runtimeEventText) {
      scopeBlockers.push("Runtime event relay text is generated by Ambient; omit text when using runtimeEventId.");
    }
  }
  if (input.toolInput.queuedProjectionId && !queuedProjection) {
    scopeBlockers.push("Queued projection was not found in the messaging gateway runtime.");
  }
  if (queuedProjection && queuedProjection.providerId !== SIGNAL_PROVIDER_ID) {
    scopeBlockers.push("Queued projection is not a Signal projection.");
  }
  if (queuedProjection && queuedProjection.purpose !== "remote_ambient_surface") {
    scopeBlockers.push("Signal replies are currently scoped only to Remote Ambient Surface projections.");
  }
  if (input.toolInput.bindingId && !explicitBinding) {
    scopeBlockers.push("Signal reply preview requires an existing exact active Signal Remote Ambient Surface bindingId.");
  }
  if (!input.toolInput.bindingId && !queuedProjectionId && matchingBindings.length > 1) {
    scopeBlockers.push("Signal reply scope matched multiple active owner bindings; provide one exact bindingId.");
  }
  if (!binding) {
    scopeBlockers.push("Signal reply preview requires an exact active Signal Remote Ambient Surface binding.");
  } else {
    if (binding.providerId !== SIGNAL_PROVIDER_ID) scopeBlockers.push("Selected binding is not a Signal binding.");
    if (binding.status !== "active") scopeBlockers.push("Selected Signal binding is not active.");
    if (binding.purpose !== "remote_ambient_surface") scopeBlockers.push("Selected Signal binding is not a Remote Ambient Surface binding.");
    if (!binding.ownerUserId?.trim()) scopeBlockers.push("Selected Signal binding does not have an owner sender id.");
    if (binding.metadata?.setupShape !== "signal-owner-remote-ambient-surface") scopeBlockers.push("Selected Signal binding was not created by the reviewed Signal owner Remote Ambient Surface setup path.");
    if (profileId && binding.authProfileId !== profileId) scopeBlockers.push("Selected Signal binding profile does not match the reply scope.");
    if (conversationId && binding.conversationId !== conversationId) scopeBlockers.push("Selected Signal binding conversation does not match the reply scope.");
  }
  if (!profileId) scopeBlockers.push("Signal reply preview requires an exact profileId.");
  if (!conversationId) scopeBlockers.push("Signal reply preview requires an exact conversationId.");
  if (!replyToMessageId) scopeBlockers.push("Signal reply preview requires an exact replyToMessageId or a queued Signal projection with a parseable source message id.");
  if (!text.trim()) scopeBlockers.push("Signal reply preview requires reply text or a relayable runtimeEventId.");
  const endpointPath = profileId && conversationId
    ? signalBridgeEndpointPaths(profileId, conversationId).approvedReplySend
    : undefined;
  const blockers = [...status.blockers, ...scopeBlockers];
  const canApplyNow = blockers.length === 0;
  const repairSteps = signalReplyRepairSteps({
    blockers,
    bridgeApprovedReplyCapability: status.bridgeApprovedReplyCapability,
    bridgeReachable: status.bridgeReachable,
    configured: status.configured,
    activeOwnerBindingCount: status.activeOwnerBindingCount,
    runtimeEvent,
    hasQueuedProjection: Boolean(queuedProjection),
    hasQueuedProjectionId: Boolean(queuedProjectionId),
    hasSourceEventId: Boolean(runtimeEvent?.sourceEventId),
    hasReplyToMessageId: Boolean(replyToMessageId),
    multipleCandidateBindings: matchingBindings.length > 1,
  });
  const warnings = [
    ...status.warnings,
    ...scopeWarnings,
    ...(input.toolInput.text && input.toolInput.text.length > 1000
      ? ["Reply text is long for a messaging surface; consider sending a shorter summary."]
      : []),
  ];
  return {
    ...status,
    status: canApplyNow ? "ready" : "blocked",
    canApplyNow,
    previewOnly: true,
    approvalRequired: true,
    futureApprovalRequired: !canApplyNow,
    applyToolName: "ambient_messaging_signal_bridge_reply_apply",
    ...(queuedProjectionId ? { queuedProjectionId } : {}),
    ...(queuedProjection ? { queuedProjection } : {}),
    ...(runtimeEvent ? { runtimeEvent } : {}),
    ...(binding ? { binding } : {}),
    ...(bindingId ? { bindingId } : {}),
    ...(profileId ? { profileId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(binding?.ownerUserId ? { ownerUserId: binding.ownerUserId } : {}),
    ...(replyToMessageId ? { replyToMessageId } : {}),
    ...(endpointPath ? { endpointPath } : {}),
    text,
    textLength: text.length,
    textPreview: previewText(text),
    ...(runtimeProvider ? { runtimeProvider } : {}),
    blockers,
    repairSteps,
    warnings,
    safety: {
      requestsApproval: canApplyNow,
      sendsProviderMessages: canApplyNow,
      readsProviderMessages: false,
      readsProviderHistory: false,
      startsBridge: false,
      mutatesBindings: false,
      usesReviewedBridgeSendContract: canApplyNow,
      exposesRuntimeStateToMessagingConnector: false,
    },
    nextSteps: canApplyNow
      ? [
        "Ask the user to approve this exact Signal reply text.",
        "Apply will call only the reviewed Signal bridge send endpoint for this exact binding and return sanitized delivery metadata.",
        ...(runtimeEvent ? ["After apply, call ambient_messaging_gateway_status to verify the runtime event relay status and duplicate blocking."] : []),
        "After apply, inspect gateway status for the outbound delivery record.",
      ]
      : [
        "Follow the Repair steps below, then rerun ambient_messaging_signal_relay_diagnostics before sending.",
        "Do not retry with shell, browser, Signal Desktop UI, signal-cli, Telegram tools, generic messaging tools, or Messaging Connector sends.",
      ],
  };
}

export async function applySignalBridgeReply(input: {
  preview: SignalBridgeReplyPreview;
  approvalRecorded: boolean;
  env?: Record<string, string | undefined>;
  fetchFn?: FetchLike;
  now?: () => Date;
}): Promise<SignalBridgeReplyResult> {
  const now = input.now ?? (() => new Date());
  if (!input.preview.canApplyNow) return signalBridgeReplyBlockedResult(input.preview, now);
  if (!input.approvalRecorded) return signalBridgeReplyDeniedResult(input.preview, now);
  try {
    const env = input.env ?? process.env;
    const fetchFn = input.fetchFn ?? globalThis.fetch.bind(globalThis);
    if (!input.preview.endpointPath) throw new Error("Signal reply endpoint is unavailable.");
    if (!input.preview.replyToMessageId) throw new Error("Signal reply-to message id is unavailable.");
    const baseUrl = normalizeBaseUrl(env.AMBIENT_SIGNAL_BRIDGE_URL?.trim()
      || env.AMBIENT_AGENT_SIGNAL_BRIDGE_URL?.trim()
      || `http://127.0.0.1:${env.AMBIENT_SIGNAL_BRIDGE_PORT?.trim() || env.AMBIENT_AGENT_SIGNAL_BRIDGE_PORT?.trim() || DEFAULT_BRIDGE_PORT}`);
    const response = await fetchBridgeJson(`${baseUrl}${input.preview.endpointPath}`, fetchFn, {
      text: input.preview.text,
      replyToMessageId: input.preview.replyToMessageId,
    });
    const summary = validateSignalBridgeReplySendResponse(response);
    const sentAt = summary.sentAt || now().toISOString();
    const delivery = deliveryFromPreview(input.preview, {
      status: "sent",
      sentAt,
      providerMessageId: summary.providerMessageId,
    });
    return {
      ...input.preview,
      applyStatus: "sent",
      approvalRequested: true,
      approvalRecorded: true,
      sent: true,
      delivery,
      ...(summary.providerMessageId ? { providerMessageId: summary.providerMessageId } : {}),
      sentAt,
    };
  } catch (error) {
    const errorText = errorMessage(error);
    const delivery = deliveryFromPreview(input.preview, {
      status: "failed",
      sentAt: now().toISOString(),
      error: errorText,
    });
    return {
      ...input.preview,
      applyStatus: "failed",
      approvalRequested: true,
      approvalRecorded: true,
      sent: false,
      delivery,
      error: errorText,
      failureHint: "Signal reply send failed closed after approval. No fallback provider send path was attempted.",
    };
  }
}

export function signalBridgeReplyStatusText(status: SignalBridgeReplyStatus): string {
  const lines = [
    "Signal outbound reply contract status",
    `Provider: ${status.providerId}`,
    `Status: ${status.status}`,
    `Reviewed reply send implemented: ${status.reviewedReplySendImplemented ? "yes" : "no"}`,
    `Outbound reply enabled: ${status.outboundReplyEnabled ? "yes" : "no"}`,
    `Bridge approvedReplySend capability: ${status.bridgeApprovedReplyCapability ? "yes" : "no"}`,
    `Bridge reachable: ${status.bridgeReachable ? "yes" : "no"}`,
    `Configured: ${status.configured ? "yes" : "no"}`,
    `Active owner bindings: ${status.activeOwnerBindingCount}`,
    `Reply candidate bindings: ${status.replyCandidateBindingCount}`,
    `Contract: ${status.contract.kind}`,
    status.contract.endpointPath ? `Endpoint: ${status.contract.endpointPath}` : undefined,
    "",
    "Blockers:",
    ...(status.blockers.length ? status.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Repair steps:",
    ...(status.repairSteps.length ? status.repairSteps.map((step) => `- ${step}`) : ["- None"]),
    "",
    "Boundaries:",
    ...status.boundaries.map((boundary) => `- ${boundary}`),
    "",
    "Warnings:",
    ...status.warnings.map((warning) => `- ${warning}`),
  ].filter((line): line is string => line !== undefined);
  appendReplyBindings(lines, status.selectedBindings);
  return lines.join("\n");
}

export function signalBridgeReplyPreviewText(preview: SignalBridgeReplyPreview): string {
  return [
    "Signal bridge reply preview",
    `Provider: ${preview.providerId}`,
    `Status: ${preview.status}`,
    `Can apply now: ${preview.canApplyNow ? "yes" : "no"}`,
    `Approval required before apply: ${preview.approvalRequired ? "yes" : "no"}`,
    `Future approval required: ${preview.futureApprovalRequired ? "yes" : "no"}`,
    `Apply tool: ${preview.applyToolName}`,
    preview.queuedProjectionId ? `Queued projection: ${preview.queuedProjectionId}` : undefined,
    preview.runtimeEvent ? `Runtime event: ${preview.runtimeEvent.id}` : undefined,
    preview.runtimeEvent ? `Runtime event status: ${preview.runtimeEvent.status}` : undefined,
    preview.bindingId ? `Binding: ${preview.bindingId}` : undefined,
    preview.profileId ? `Profile: ${preview.profileId}` : undefined,
    preview.conversationId ? `Conversation: ${preview.conversationId}` : undefined,
    preview.ownerUserId ? `Recipient owner sender: ${preview.ownerUserId}` : undefined,
    preview.replyToMessageId ? `Reply to message: ${preview.replyToMessageId}` : undefined,
    preview.endpointPath ? `Endpoint: ${preview.endpointPath}` : undefined,
    `Text length: ${preview.textLength}`,
    `Text preview: ${preview.textPreview}`,
    "",
    "Safety:",
    `- Requests approval: ${preview.safety.requestsApproval ? "yes" : "no"}`,
    `- Sends provider messages: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `- Reads provider messages: ${preview.safety.readsProviderMessages ? "yes" : "no"}`,
    `- Reads provider history: ${preview.safety.readsProviderHistory ? "yes" : "no"}`,
    `- Starts bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    `- Uses reviewed bridge send contract: ${preview.safety.usesReviewedBridgeSendContract ? "yes" : "no"}`,
    "",
    signalBridgeReplyStatusText(preview),
    "",
    "Next steps:",
    ...preview.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function signalBridgeReplyApprovalDetail(preview: SignalBridgeReplyPreview): string {
  return [
    `Provider: ${preview.providerId}`,
    preview.queuedProjectionId ? `Queued projection: ${preview.queuedProjectionId}` : undefined,
    preview.runtimeEvent ? `Runtime event: ${preview.runtimeEvent.id}` : undefined,
    preview.runtimeEvent ? `Runtime event status: ${preview.runtimeEvent.status}` : undefined,
    preview.bindingId ? `Binding: ${preview.bindingId}` : undefined,
    preview.profileId ? `Profile: ${preview.profileId}` : undefined,
    preview.conversationId ? `Conversation: ${preview.conversationId}` : undefined,
    preview.ownerUserId ? `Recipient owner sender: ${preview.ownerUserId}` : undefined,
    preview.replyToMessageId ? `Reply to provider message: ${preview.replyToMessageId}` : undefined,
    preview.endpointPath ? `Endpoint: ${preview.endpointPath}` : undefined,
    `Text length: ${preview.textLength}`,
    `Exact text: ${preview.text}`,
    `Text preview: ${preview.textPreview}`,
    `Would request approval: ${preview.safety.requestsApproval ? "yes" : "no"}`,
    `Would send provider message: ${preview.safety.sendsProviderMessages ? "yes" : "no"}`,
    `Would use reviewed bridge send contract: ${preview.safety.usesReviewedBridgeSendContract ? "yes" : "no"}`,
    `Would read provider messages: ${preview.safety.readsProviderMessages ? "yes" : "no"}`,
    `Would read provider history: ${preview.safety.readsProviderHistory ? "yes" : "no"}`,
    `Would start bridge: ${preview.safety.startsBridge ? "yes" : "no"}`,
    "Messaging Connector external sends remain separate and must not receive Ambient runtime state from this Remote Ambient Surface reply.",
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function signalBridgeReplyResultText(result: SignalBridgeReplyResult): string {
  return [
    signalBridgeReplyPreviewText(result),
    "",
    "Apply result:",
    `- Apply status: ${result.applyStatus}`,
    `- Approval requested: ${result.approvalRequested ? "yes" : "no"}`,
    `- Approval recorded: ${result.approvalRecorded ? "yes" : "no"}`,
    `- Sent: ${result.sent ? "yes" : "no"}`,
    `- Delivery: ${result.delivery.id}`,
    `- Delivery status: ${result.delivery.status}`,
    result.providerMessageId ? `- Provider message: ${result.providerMessageId}` : undefined,
    result.sentAt ? `- Sent at: ${result.sentAt}` : undefined,
    result.failureHint ? `- Failure hint: ${result.failureHint}` : undefined,
    result.error ? `- Error: ${result.error}` : undefined,
  ].filter((line): line is string => line !== undefined).join("\n");
}

function activeOwnerSignalBindings(bindings: MessagingBindingDescriptor[]): MessagingBindingDescriptor[] {
  return bindings.filter((binding) =>
    binding.status === "active" &&
    binding.providerId === SIGNAL_PROVIDER_ID &&
    binding.purpose === "remote_ambient_surface" &&
    Boolean(binding.ownerUserId?.trim())
  );
}

function signalReplyBindingSummary(binding: MessagingBindingDescriptor): SignalBridgeReplyBindingSummary {
  return {
    bindingId: binding.id,
    profileId: binding.authProfileId,
    conversationId: binding.conversationId,
    ...(binding.ownerUserId ? { ownerUserId: binding.ownerUserId } : {}),
    ...(binding.ambientSurface ? { ambientSurface: binding.ambientSurface } : {}),
    ...(binding.maxDisclosureLabel ? { maxDisclosureLabel: binding.maxDisclosureLabel } : {}),
    status: binding.status,
  };
}

function appendReplyBindings(lines: string[], bindings: SignalBridgeReplyBindingSummary[]): void {
  lines.push("", "Selected bindings:");
  if (!bindings.length) {
    lines.push("- None");
    return;
  }
  for (const binding of bindings) {
    lines.push(`- ${binding.bindingId}`);
    lines.push(`  Profile: ${binding.profileId}`);
    lines.push(`  Conversation: ${binding.conversationId}`);
    if (binding.ownerUserId) lines.push(`  Owner: ${binding.ownerUserId}`);
    if (binding.ambientSurface) lines.push(`  Surface: ${binding.ambientSurface}`);
    if (binding.maxDisclosureLabel) lines.push(`  Max disclosure: ${binding.maxDisclosureLabel}`);
  }
}

function signalReplyRepairSteps(input: {
  blockers: string[];
  bridgeApprovedReplyCapability: boolean;
  bridgeReachable: boolean;
  configured: boolean;
  activeOwnerBindingCount: number;
  runtimeEvent?: MessagingGatewayRemoteSurfaceRuntimeEvent;
  hasQueuedProjection?: boolean;
  hasQueuedProjectionId?: boolean;
  hasSourceEventId?: boolean;
  hasReplyToMessageId?: boolean;
  multipleCandidateBindings?: boolean;
}): string[] {
  if (!input.blockers.length) return [];
  const steps: string[] = [];
  const hasBlocker = (needle: string) => input.blockers.some((blocker) => blocker.includes(needle));
  if (!input.configured || hasBlocker("No reviewed bridge-readable Signal profile is configured")) {
    steps.push("Complete Signal session setup with ambient_messaging_signal_session_preview/apply, then rerun ambient_messaging_gateway_status.");
  }
  if (!input.bridgeReachable || hasBlocker("Signal bridge root is not reachable")) {
    steps.push("Start or repair the reviewed local Signal bridge until ambient_messaging_gateway_status reports Bridge reachable: yes.");
  }
  if (!input.bridgeApprovedReplyCapability || hasBlocker("approvedReplySend")) {
    steps.push("Upgrade or restart the reviewed Signal bridge so the root contract advertises approvedReplySend=yes; do not send through Signal Desktop, signal-cli, shell, browser, Telegram, or generic messaging tools.");
  }
  if (!input.activeOwnerBindingCount || hasBlocker("active Signal Remote Ambient Surface owner binding")) {
    steps.push("Create an active owner-scoped Signal Remote Ambient Surface binding through the typed Signal directory, owner handoff, and ambient_messaging_signal_remote_surface_preview/apply flow.");
    steps.push("If a binding should already exist, call ambient_messaging_list_bindings with providerId signal-cli and includeInactive=true to check whether it was revoked or scoped to another profile/conversation.");
  }
  if (input.multipleCandidateBindings || hasBlocker("matched multiple active owner bindings")) {
    steps.push("Pass one exact bindingId from ambient_messaging_signal_relay_diagnostics or ambient_messaging_list_bindings before previewing a Signal reply.");
  }
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
  if (hasBlocker("Queued projection was not found") || hasBlocker("replyToMessageId")) {
    if (input.runtimeEvent && input.hasQueuedProjectionId && !input.hasQueuedProjection && !input.hasSourceEventId && !input.hasReplyToMessageId) {
      steps.push("This runtime event does not retain source routing and its queued projection is gone; wait for a new owner command/runtime event or preview a manual reply only when a current queued projection provides the exact replyToMessageId.");
    } else {
      steps.push("Use a current queued Signal projection or a runtime event that carries source routing metadata so Ambient can derive the exact replyToMessageId; do not recover it from Signal history, Signal Desktop, signal-cli, shell, or browser scraping.");
    }
  }
  if (!steps.length) {
    steps.push("Resolve the listed blockers, rerun ambient_messaging_signal_relay_diagnostics, and only then preview/apply the Signal reply.");
  }
  return [...new Set(steps)];
}

function signalReplyBoundaries(): string[] {
  return [
    "Signal outbound replies are separate from Signal inbound polling and unread ingestion.",
    "Reply sends require explicit approval for one exact active owner Remote Ambient Surface binding.",
    "The apply path may contact only the reviewed bridge send endpoint and must not run signal-cli, inspect Signal Desktop, use shell/browser automation, or send through Telegram/generic tools.",
    "Messaging Connector external sends remain separate and must not receive Ambient runtime state from Remote Ambient Surface.",
  ];
}

function signalSourceMessageId(input: {
  queuedProjection?: MessagingGatewayQueuedProjection;
  sourceEventId?: string;
  profileId?: string;
  conversationId?: string;
}): string | undefined {
  const { queuedProjection, sourceEventId, profileId, conversationId } = input;
  if (!profileId || !conversationId) return undefined;
  const prefix = `signal-${profileId}-${conversationId}-`;
  const eventId = queuedProjection?.sourceEventId ?? sourceEventId;
  if (!eventId) return undefined;
  return eventId.startsWith(prefix)
    ? eventId.slice(prefix.length)
    : undefined;
}

function previewText(text: string): string {
  if (!text) return "";
  return text.length <= 160 ? text : `${text.slice(0, 157)}...`;
}

function signalBridgeReplyBlockedResult(preview: SignalBridgeReplyPreview, now: () => Date): SignalBridgeReplyResult {
  return {
    ...preview,
    applyStatus: "blocked",
    approvalRequested: false,
    approvalRecorded: false,
    sent: false,
    delivery: deliveryFromPreview(preview, {
      status: "blocked",
      sentAt: now().toISOString(),
      error: preview.blockers.join("; ") || "Signal reply preview is blocked.",
    }),
    failureHint: preview.blockers.join("; ") || "Signal reply preview is blocked.",
  };
}

function signalBridgeReplyDeniedResult(preview: SignalBridgeReplyPreview, now: () => Date): SignalBridgeReplyResult {
  return {
    ...preview,
    applyStatus: "denied",
    approvalRequested: true,
    approvalRecorded: false,
    sent: false,
    delivery: deliveryFromPreview(preview, {
      status: "denied",
      sentAt: now().toISOString(),
      error: "User denied Signal reply send.",
    }),
    failureHint: "The user denied the Signal reply send. No Signal message was sent.",
  };
}

function deliveryFromPreview(
  preview: SignalBridgeReplyPreview,
  input: {
    status: MessagingGatewayOutboundDelivery["status"];
    sentAt: string;
    providerMessageId?: string;
    error?: string;
  },
): MessagingGatewayOutboundDelivery {
  return {
    id: `outbound-${preview.providerId}-${input.sentAt.replace(/[^0-9A-Za-z]/g, "")}`,
    providerId: preview.providerId,
    ...(preview.profileId ? { authProfileId: preview.profileId } : {}),
    conversationId: preview.conversationId ?? preview.binding?.conversationId ?? "",
    ...(preview.queuedProjection?.threadId ? { threadId: preview.queuedProjection.threadId } : {}),
    ...(preview.queuedProjectionId ? { sourceProjectionId: preview.queuedProjectionId } : {}),
    ...(preview.bindingId ? { bindingId: preview.bindingId } : {}),
    purpose: "remote_ambient_surface",
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

async function fetchBridgeJson(
  url: string,
  fetchFn: FetchLike,
  body: Record<string, string>,
): Promise<unknown> {
  const response = await fetchFn(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Signal bridge send failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
  }
  return await response.json();
}

function validateSignalBridgeReplySendResponse(value: unknown): {
  providerMessageId?: string;
  sentAt?: string;
} {
  const forbidden = findForbiddenReplyResponseField(value);
  if (forbidden) throw new Error(`Signal bridge send response included forbidden field ${forbidden}.`);
  const raw = objectValue(value);
  if (raw.ok === false) throw new Error("Signal bridge send response returned ok=false.");
  const providerMessageId = stringValue(raw.providerMessageId) || stringValue(raw.messageId) || stringValue(raw.id);
  const sentAt = stringValue(raw.sentAt) || stringValue(raw.timestamp) || stringValue(raw.date);
  return {
    ...(providerMessageId ? { providerMessageId } : {}),
    ...(sentAt ? { sentAt } : {}),
  };
}

function findForbiddenReplyResponseField(value: unknown, path = ""): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenReplyResponseField(value[index], path ? `${path}.${index}` : String(index));
      if (found) return found;
    }
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (forbiddenReplyResponseFieldNames.has(key)) return nextPath;
    const found = findForbiddenReplyResponseField(raw[key], nextPath);
    if (found) return found;
  }
  return undefined;
}

const forbiddenReplyResponseFieldNames = new Set([
  "text",
  "body",
  "messageBody",
  "rawMessage",
  "messages",
  "message",
  "attachments",
  "contacts",
  "groups",
]);

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Signal bridge send response must be an object.");
  }
  return value as Record<string, unknown>;
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

function stringValue(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number"
    ? String(value)
    : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
