import type {
  MessagingBindingDescriptor,
  MessagingBindingListResult,
  MessagingGatewayAdapterRuntimeStatus,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayProviderReadiness,
  MessagingGatewayQueuedProjection,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
  MessagingRelayDiagnosticsDeliverySummary,
  MessagingRelayDiagnosticsOwnerBindingSummary,
  MessagingRelayDiagnosticsProjectionSummary,
  MessagingRelayDiagnosticsResult,
  MessagingRelayDiagnosticsRuntimeEventSummary,
  MessagingSecondProviderReadinessChecklist,
} from "../../shared/messagingGateway";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";
const TELEGRAM_PROVIDER_LABEL = "Telegram";

export interface TelegramRelayDiagnosticsInput {
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
}

export interface TelegramRelayDiagnosticsResult extends MessagingRelayDiagnosticsResult {
  providerId: "telegram-tdlib";
  providerLabel: "Telegram";
  provider?: MessagingGatewayAdapterRuntimeStatus;
  readiness?: MessagingGatewayProviderReadiness;
  repairSteps: string[];
  selectedBindings: MessagingBindingDescriptor[];
  queuedProjections: MessagingGatewayQueuedProjection[];
  rawRelayableRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  rawRecentRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  rawRecentRelayDeliveries: MessagingGatewayOutboundDelivery[];
}

export function telegramRelayDiagnosticsInput(params: unknown): TelegramRelayDiagnosticsInput {
  const raw = params as Record<string, unknown> | undefined;
  const profileId = optionalString(raw?.profileId);
  const conversationId = optionalString(raw?.conversationId);
  const bindingId = optionalString(raw?.bindingId);
  return {
    ...(profileId ? { profileId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(bindingId ? { bindingId } : {}),
  };
}

export function buildTelegramRelayDiagnostics(input: {
  toolInput: TelegramRelayDiagnosticsInput;
  bindings: MessagingBindingListResult;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}): TelegramRelayDiagnosticsResult {
  const provider = input.runtimeStatus.providers.find((candidate) => candidate.providerId === TELEGRAM_PROVIDER_ID);
  const readiness = provider?.readiness;
  const selectedBindings = input.bindings.bindings
    .filter((binding) => binding.providerId === TELEGRAM_PROVIDER_ID)
    .filter((binding) => binding.status === "active")
    .filter((binding) => binding.purpose === "remote_ambient_surface")
    .filter((binding) => input.toolInput.bindingId ? binding.id === input.toolInput.bindingId : true)
    .filter((binding) => input.toolInput.profileId ? binding.authProfileId === input.toolInput.profileId : true)
    .filter((binding) => input.toolInput.conversationId ? binding.conversationId === input.toolInput.conversationId : true);
  const selectedBindingIds = new Set(selectedBindings.map((binding) => binding.id));
  const queuedProjections = input.runtimeStatus.queuedProjections
    .filter((projection) => projection.providerId === TELEGRAM_PROVIDER_ID)
    .filter((projection) => projection.purpose === "remote_ambient_surface")
    .filter((projection) => selectedBindingIds.has(projection.bindingId ?? ""));
  const selectedProjectionIds = new Set(queuedProjections.map((projection) => projection.id));
  const recentRuntimeEvents = (input.runtimeStatus.remoteSurfaceRuntimeEvents ?? [])
    .filter((event) => event.bindingId ? selectedBindingIds.has(event.bindingId) : selectedProjectionIds.has(event.queuedProjectionId ?? ""));
  const relayableRuntimeEvents = recentRuntimeEvents
    .filter((event) => event.status !== "pending")
    .filter((event) => event.relayStatus !== "sent")
    .filter((event) => Boolean(event.queuedProjectionId));
  const recentRelayDeliveries = input.runtimeStatus.recentOutboundDeliveries
    .filter((delivery) => delivery.providerId === TELEGRAM_PROVIDER_ID)
    .filter((delivery) => delivery.bindingId ? selectedBindingIds.has(delivery.bindingId) : selectedProjectionIds.has(delivery.sourceProjectionId ?? ""));

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!provider) {
    blockers.push("Telegram provider runtime is not registered in the messaging gateway.");
  } else if (provider.mode === "synthetic") {
    blockers.push("Telegram is in synthetic dogfood mode; no real Telegram messages can be sent.");
  } else if (provider.state !== "running" || provider.mode !== "real") {
    blockers.push("Telegram provider is not running in real bridge mode.");
  }
  if (!readiness) {
    blockers.push("Telegram readiness has not been refreshed.");
  } else {
    if (!readiness.configured) blockers.push("Telegram session metadata is not configured for this workspace/profile.");
    if (!readiness.apiCredentialsPresent) blockers.push("Telegram API credentials are not available to the runtime.");
    if (!readiness.bridgeReachable) blockers.push("Telegram bridge root is not reachable.");
    if (readiness.status !== "available") warnings.push(`Telegram readiness is ${readiness.status}: ${readiness.message}`);
  }
  if (!selectedBindings.length) {
    blockers.push("No active Telegram Remote Ambient Surface owner binding matches the requested profile/conversation.");
  }
  if (selectedBindings.length > 1 && !input.toolInput.bindingId) {
    warnings.push("Multiple owner bindings match; provide bindingId, profileId, or conversationId for a narrower relay smoke.");
  }
  if (!queuedProjections.length) {
    warnings.push("No queued Remote Ambient Surface projections currently exist for the selected owner conversation.");
  }
  if (!relayableRuntimeEvents.length) {
    warnings.push("No relayable completed/failed/canceled runtime events are currently waiting for this owner conversation.");
  }
  const staleRoutingEvents = relayableRuntimeEvents.filter((event) =>
    event.queuedProjectionId &&
    !event.sourceEventId &&
    !queuedProjections.some((projection) => projection.id === event.queuedProjectionId)
  );
  if (staleRoutingEvents.length) {
    warnings.push("One or more relayable Telegram runtime events do not carry source routing metadata and their queued projection is no longer retained.");
  }
  const alreadyRelayedEvents = recentRuntimeEvents.filter((event) => event.relayStatus === "sent");

  const bridgeModeLabel = bridgeModeFor(provider, readiness);
  const canSendOwnerRelayNow = blockers.length === 0;
  const status = provider?.mode === "synthetic" ? "synthetic-only" : canSendOwnerRelayNow ? "ready" : "blocked";
  const repairSteps = repairStepsFor({
    canSendOwnerRelayNow,
    provider,
    readiness,
    selectedBindings,
    relayableRuntimeEvents,
    staleRoutingEvents,
    alreadyRelayedEvents,
  });

  return {
    providerId: TELEGRAM_PROVIDER_ID,
    providerLabel: TELEGRAM_PROVIDER_LABEL,
    status,
    bridgeModeLabel,
    canSendOwnerRelayNow,
    runtimeState: provider?.state ?? "unknown",
    runtimeMode: provider?.mode ?? "unknown",
    readinessStatus: readiness?.status ?? "unknown",
    bridgeReachable: readiness?.bridgeReachable ?? false,
    sessionMetadataConfigured: readiness?.configured ?? false,
    apiCredentialsPresent: readiness?.apiCredentialsPresent ?? false,
    selectedOwnerBindings: selectedBindings.map(ownerBindingSummary),
    queuedOwnerProjections: queuedProjections.map(projectionSummary),
    relayableRuntimeEvents: relayableRuntimeEvents.map(runtimeEventSummary),
    recentRuntimeEvents: recentRuntimeEvents.map(runtimeEventSummary),
    recentRelayDeliveries: recentRelayDeliveries.map(deliverySummary),
    providerSpecificAssumptions: telegramProviderAssumptions(),
    ...(provider ? { provider } : {}),
    ...(readiness ? { readiness } : {}),
    selectedBindings,
    queuedProjections,
    rawRelayableRuntimeEvents: relayableRuntimeEvents,
    rawRecentRuntimeEvents: recentRuntimeEvents,
    rawRecentRelayDeliveries: recentRelayDeliveries,
    blockers,
    repairSteps,
    warnings,
    nextSteps: nextStepsFor({ canSendOwnerRelayNow, provider, readiness, selectedBindings, relayableRuntimeEvents }),
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      startsBridge: false,
      readsProviderHistory: false,
      mutatesBindings: false,
    },
  };
}

export function telegramRelayDiagnosticsText(result: TelegramRelayDiagnosticsResult): string {
  return [
    "Remote Ambient Surface relay diagnostics",
    `Provider: ${result.providerLabel} (${result.providerId})`,
    `Status: ${result.status}`,
    `Bridge mode: ${result.bridgeModeLabel}`,
    `Can send owner relay now: ${result.canSendOwnerRelayNow ? "yes" : "no"}`,
    `Runtime state: ${result.runtimeState}`,
    `Runtime mode: ${result.runtimeMode}`,
    `Readiness: ${result.readinessStatus}`,
    `Bridge reachable: ${result.bridgeReachable ? "yes" : "no"}`,
    `Session metadata configured: ${result.sessionMetadataConfigured ? "yes" : "no"}`,
    `API credentials present: ${result.apiCredentialsPresent ? "yes" : "no"}`,
    `Selected owner bindings: ${result.selectedOwnerBindings.length}`,
    ...result.selectedOwnerBindings.slice(0, 5).map((binding) => `- Binding ${binding.bindingId}: profile=${binding.authProfileId}, conversation=${binding.conversationId}, surface=${binding.ambientSurface ?? "unset"}`),
    `Queued owner projections: ${result.queuedOwnerProjections.length}`,
    ...result.queuedOwnerProjections.slice(-5).map((projection) => `- Projection ${projection.queuedProjectionId}: binding=${projection.bindingId ?? "none"}, queuedAt=${projection.queuedAt}`),
    `Relayable runtime events: ${result.relayableRuntimeEvents.length}`,
    ...result.relayableRuntimeEvents.slice(-5).map((event) => `- Event ${event.runtimeEventId}: status=${event.status}, project=${event.projectName ?? "n/a"}, relayStatus=${event.relayStatus ?? "not-relayed"}`),
    `Recent relay deliveries: ${result.recentRelayDeliveries.length}`,
    ...result.recentRelayDeliveries.slice(-5).map((delivery) => `- Delivery ${delivery.deliveryId}: status=${delivery.status}, runtimeEvent=${delivery.runtimeEventId ?? "none"}, sentAt=${delivery.sentAt}`),
    "",
    "Provider-specific assumptions:",
    ...result.providerSpecificAssumptions.map((assumption) => `- ${assumption}`),
    "",
    "Blockers:",
    ...(result.blockers.length ? result.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Repair steps:",
    ...(result.repairSteps.length ? result.repairSteps.map((step) => `- ${step}`) : ["- None"]),
    "",
    "Warnings:",
    ...(result.warnings.length ? result.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    "",
    "Safety:",
    "- Reads provider messages: no",
    "- Sends provider messages: no",
    "- Starts bridge: no",
    "- Reads provider history: no",
    "- Mutates bindings: no",
    "",
    "Next steps:",
    ...result.nextSteps.map((step) => `- ${step}`),
  ].filter((line): line is string => Boolean(line)).join("\n");
}

export function secondProviderRelayReadinessChecklist(providerCandidate: string): MessagingSecondProviderReadinessChecklist {
  const normalized = providerCandidate.trim().toLowerCase();
  const provider = normalized === "signal" || normalized === "matrix" ? normalized : providerCandidate.trim() || "second-provider";
  const signalQuestions = [
    "Can the provider run headlessly without the GUI app, or does it require a paired desktop/mobile session?",
    "Does the provider expose a stable local bridge or daemon API for reading only bound owner conversations?",
    "Can replies target a provider message id without listing arbitrary conversation history?",
    "Where are local auth/session secrets stored, and can readiness be checked without starting message ingestion?",
  ];
  const matrixQuestions = [
    "Which homeserver/auth flow will be supported first, and can credentials be stored through Ambient-managed secrets?",
    "Can room membership and event sync be scoped to owner-approved rooms only?",
    "How should Matrix event ids map to Remote Ambient Surface queued projections and reply-to metadata?",
    "What rate limits and markdown/html formatting constraints should the adapter expose?",
  ];
  return {
    providerCandidate: provider,
    purpose: "remote_ambient_surface",
    headlessSafeTarget: true,
    items: [
      {
        id: "provider-registry",
        label: "Provider registry descriptor",
        required: true,
        status: "planned",
        notes: ["Declare source, auth kind, event mode, headless deployment constraints, privacy notes, and Remote Ambient Surface support before tools are exposed."],
      },
      {
        id: "readiness-probe",
        label: "Safe readiness probe",
        required: true,
        status: "planned",
        notes: ["Probe local/session/API health without reading provider messages, listing chats, starting ingestion, or sending messages."],
      },
      {
        id: "owner-binding",
        label: "Owner-scoped binding shape",
        required: true,
        status: "planned",
        notes: ["Persist provider auth profile, owner conversation id, owner/delegate sender policy, Ambient surface, and max disclosure label."],
      },
      {
        id: "inbound-normalization",
        label: "Inbound event normalization",
        required: true,
        status: "planned",
        notes: ["Convert provider events into MessagingInboundEvent while preserving provider message ids for reply threading."],
      },
      {
        id: "reply-adapter",
        label: "Approval-gated reply adapter",
        required: true,
        status: "planned",
        notes: ["Reuse the runtime-event relay preview/apply semantics: preview first, exact text approval, one provider send, status/delivery recording, duplicate blocking."],
      },
      {
        id: "relay-diagnostics",
        label: "Provider-neutral relay diagnostics",
        required: true,
        status: "ready",
        notes: ["Use MessagingRelayDiagnosticsResult fields so Pi sees the same readiness, owner binding, projection, runtime event, delivery, blocker, repair step, warning, and safety shape across providers."],
      },
    ],
    providerSpecificQuestions: provider === "matrix" ? matrixQuestions : signalQuestions,
  };
}

function bridgeModeFor(
  provider: MessagingGatewayAdapterRuntimeStatus | undefined,
  readiness: MessagingGatewayProviderReadiness | undefined,
): string {
  if (!provider) return "not registered";
  if (provider.mode === "synthetic") return "synthetic dogfood only";
  if (provider.state === "running" && provider.mode === "real" && readiness?.bridgeReachable) return "real Telegram bridge running";
  if (provider.state === "running" && provider.mode === "real") return "real Telegram runner started, bridge not reachable";
  if (readiness?.bridgeReachable) return "bridge reachable but Ambient gateway not attached";
  return "not running";
}

function nextStepsFor(input: {
  canSendOwnerRelayNow: boolean;
  provider?: MessagingGatewayAdapterRuntimeStatus;
  readiness?: MessagingGatewayProviderReadiness;
  selectedBindings: MessagingBindingDescriptor[];
  relayableRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
}): string[] {
  if (input.canSendOwnerRelayNow) {
    if (input.relayableRuntimeEvents.length) {
      return [
        "Preview a runtime-event reply with ambient_messaging_telegram_bridge_reply_preview using runtimeEventId.",
        "After explicit approval, send with ambient_messaging_telegram_bridge_reply_apply using the same runtimeEventId.",
        "Call ambient_messaging_gateway_status after apply to verify relay status and duplicate blocking.",
      ];
    }
    return [
      "Real Telegram relay plumbing is ready for this owner conversation.",
      "Wait for a completed/failed Remote Ambient Surface runtime event, then preview by runtimeEventId.",
    ];
  }
  if (input.provider?.mode === "synthetic") {
    return [
      "Synthetic dogfood routing is active; use ambient_messaging_gateway_lifecycle_preview/apply with mode=real when ready to attach the real Telegram bridge.",
    ];
  }
  if (!input.readiness?.configured) return ["Complete Telegram session setup before real relay smoke testing."];
  if (!input.readiness?.apiCredentialsPresent) return ["Bind Telegram API credentials through Ambient-managed env/secret flow."];
  if (!input.readiness?.bridgeReachable) return ["Preview and approve real Telegram gateway startup, or start the local bridge manually and refresh status."];
  if (!input.selectedBindings.length) return ["Create an owner-scoped Telegram Remote Ambient Surface binding for the target conversation."];
  return ["Resolve the listed blockers, then rerun diagnostics before sending any provider reply."];
}

function repairStepsFor(input: {
  canSendOwnerRelayNow: boolean;
  provider?: MessagingGatewayAdapterRuntimeStatus;
  readiness?: MessagingGatewayProviderReadiness;
  selectedBindings: MessagingBindingDescriptor[];
  relayableRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  staleRoutingEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  alreadyRelayedEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
}): string[] {
  const steps: string[] = [];
  if (input.provider?.mode === "synthetic") {
    steps.push("Synthetic dogfood routing cannot send real Telegram messages; preview and approve ambient_messaging_gateway_lifecycle_apply with providerId=telegram-tdlib and mode=real before relay smoke testing.");
  }
  if (!input.readiness?.configured) {
    steps.push("Complete Telegram session setup with ambient_messaging_telegram_session_preview/apply, then rerun ambient_messaging_gateway_status.");
  }
  if (!input.readiness?.apiCredentialsPresent) {
    steps.push("Bind Telegram API credentials through Ambient-managed secret/env flow, then rerun ambient_messaging_gateway_status.");
  }
  if (!input.readiness?.bridgeReachable) {
    steps.push("Start or repair the local Telegram bridge through the reviewed gateway lifecycle until ambient_messaging_gateway_status reports Bridge reachable: yes.");
  }
  if (!input.selectedBindings.length) {
    steps.push("Create an active owner-scoped Telegram Remote Ambient Surface binding through the typed Telegram directory, owner handoff, and ambient_messaging_telegram_remote_surface_preview/apply flow.");
    steps.push("If a binding should already exist, call ambient_messaging_list_bindings with providerId telegram-tdlib and includeInactive=true to check whether it was revoked or scoped to another profile/conversation.");
  }
  if (input.staleRoutingEvents.length) {
    steps.push("For stale runtime events without source routing metadata, wait for a new owner command/runtime event or preview a manual reply only when a current queued Telegram projection provides exact reply routing; do not recover it from Telegram history, Telegram Desktop, shell, browser, or bridge history.");
  }
  if (!input.relayableRuntimeEvents.length && input.alreadyRelayedEvents.length) {
    steps.push("Do not resend an already-relayed runtime event; inspect Recent relay deliveries in ambient_messaging_gateway_status and wait for a new runtime event if the owner needs another update.");
  }
  if (!steps.length && input.canSendOwnerRelayNow) {
    steps.push("No repair needed; preview the selected runtime event with ambient_messaging_telegram_bridge_reply_preview using runtimeEventId.");
  }
  if (!steps.length) {
    steps.push("Resolve the listed blockers, rerun ambient_messaging_telegram_relay_diagnostics, and only then preview a Telegram reply.");
  }
  return steps;
}

function ownerBindingSummary(binding: MessagingBindingDescriptor): MessagingRelayDiagnosticsOwnerBindingSummary {
  return {
    bindingId: binding.id,
    providerId: binding.providerId,
    authProfileId: binding.authProfileId,
    conversationId: binding.conversationId,
    ...(binding.ambientSurface ? { ambientSurface: binding.ambientSurface } : {}),
    ...(binding.maxDisclosureLabel ? { maxDisclosureLabel: binding.maxDisclosureLabel } : {}),
  };
}

function projectionSummary(projection: MessagingGatewayQueuedProjection): MessagingRelayDiagnosticsProjectionSummary {
  return {
    queuedProjectionId: projection.id,
    providerId: projection.providerId,
    ...(projection.bindingId ? { bindingId: projection.bindingId } : {}),
    conversationId: projection.conversationId,
    queuedAt: projection.queuedAt,
  };
}

function runtimeEventSummary(event: MessagingGatewayRemoteSurfaceRuntimeEvent): MessagingRelayDiagnosticsRuntimeEventSummary {
  return {
    runtimeEventId: event.id,
    kind: event.kind,
    status: event.status,
    title: event.title,
    ...(event.projectName ? { projectName: event.projectName } : {}),
    ...(event.queuedProjectionId ? { queuedProjectionId: event.queuedProjectionId } : {}),
    ...(event.bindingId ? { bindingId: event.bindingId } : {}),
    ...(event.relayStatus ? { relayStatus: event.relayStatus } : {}),
    relaySuggested: event.relaySuggested,
  };
}

function deliverySummary(delivery: MessagingGatewayOutboundDelivery): MessagingRelayDiagnosticsDeliverySummary {
  return {
    deliveryId: delivery.id,
    providerId: delivery.providerId,
    ...(delivery.bindingId ? { bindingId: delivery.bindingId } : {}),
    ...(delivery.sourceProjectionId ? { sourceProjectionId: delivery.sourceProjectionId } : {}),
    ...(delivery.runtimeEventId ? { runtimeEventId: delivery.runtimeEventId } : {}),
    status: delivery.status,
    sentAt: delivery.sentAt,
  };
}

function telegramProviderAssumptions(): string[] {
  return [
    "authProfileId maps to a local Telegram TDLib session profile.",
    "conversationId maps to a Telegram chat id understood by the local bridge.",
    "reply-to metadata is derived from the original Telegram provider message id embedded in the queued projection source event id.",
    "readiness depends on redacted local session metadata, Telegram API credentials, and the local bridge root health endpoint.",
    "TDLib state and bridge session files stay local; diagnostics never return Telegram API credential values or phone numbers.",
  ];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
