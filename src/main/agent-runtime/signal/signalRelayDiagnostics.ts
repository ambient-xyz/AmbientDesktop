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
} from "../../../shared/messagingGateway";

const SIGNAL_PROVIDER_ID = "signal-cli";
const SIGNAL_PROVIDER_LABEL = "Signal";

export interface SignalRelayDiagnosticsInput {
  profileId?: string;
  conversationId?: string;
  bindingId?: string;
}

export interface SignalRelayDiagnosticsResult extends MessagingRelayDiagnosticsResult {
  providerId: "signal-cli";
  providerLabel: "Signal";
  provider?: MessagingGatewayAdapterRuntimeStatus;
  readiness?: MessagingGatewayProviderReadiness;
  repairSteps: string[];
  selectedBindings: MessagingBindingDescriptor[];
  queuedProjections: MessagingGatewayQueuedProjection[];
  rawRelayableRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  rawRecentRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  rawRecentRelayDeliveries: MessagingGatewayOutboundDelivery[];
}

export function signalRelayDiagnosticsInput(params: unknown): SignalRelayDiagnosticsInput {
  const raw = params as Record<string, unknown> | undefined;
  const profileId = optionalString(raw?.profileId) ?? optionalString(raw?.authProfileId);
  const conversationId = optionalString(raw?.conversationId);
  const bindingId = optionalString(raw?.bindingId);
  return {
    ...(profileId ? { profileId } : {}),
    ...(conversationId ? { conversationId } : {}),
    ...(bindingId ? { bindingId } : {}),
  };
}

export function buildSignalRelayDiagnostics(input: {
  toolInput: SignalRelayDiagnosticsInput;
  bindings: MessagingBindingListResult;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}): SignalRelayDiagnosticsResult {
  const provider = input.runtimeStatus.providers.find((candidate) => candidate.providerId === SIGNAL_PROVIDER_ID);
  const readiness = provider?.readiness;
  const selectedBindings = input.bindings.bindings
    .filter((binding) => binding.providerId === SIGNAL_PROVIDER_ID)
    .filter((binding) => binding.status === "active")
    .filter((binding) => binding.purpose === "remote_ambient_surface")
    .filter((binding) => input.toolInput.bindingId ? binding.id === input.toolInput.bindingId : true)
    .filter((binding) => input.toolInput.profileId ? binding.authProfileId === input.toolInput.profileId : true)
    .filter((binding) => input.toolInput.conversationId ? binding.conversationId === input.toolInput.conversationId : true);
  const selectedBindingIds = new Set(selectedBindings.map((binding) => binding.id));
  const queuedProjections = input.runtimeStatus.queuedProjections
    .filter((projection) => projection.providerId === SIGNAL_PROVIDER_ID)
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
    .filter((delivery) => delivery.providerId === SIGNAL_PROVIDER_ID)
    .filter((delivery) => delivery.bindingId ? selectedBindingIds.has(delivery.bindingId) : selectedProjectionIds.has(delivery.sourceProjectionId ?? ""));

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!provider) {
    blockers.push("Signal provider runtime is not registered in the messaging gateway.");
  }
  if (!readiness) {
    blockers.push("Signal readiness has not been refreshed.");
  } else {
    if (!readiness.configured) blockers.push("Signal bridge-readable profile metadata is not configured.");
    if (!readiness.bridgeReachable) blockers.push("Signal bridge root is not reachable.");
    if (!readiness.bridgeCapabilities?.approvedReplySend) blockers.push("Signal bridge root did not advertise approvedReplySend.");
    if (readiness.status !== "available") warnings.push(`Signal readiness is ${readiness.status}: ${readiness.message}`);
  }
  if (!selectedBindings.length) {
    blockers.push("No active Signal Remote Ambient Surface owner binding matches the requested profile/conversation.");
  }
  if (selectedBindings.some((binding) => binding.metadata?.setupShape !== "signal-owner-remote-ambient-surface")) {
    blockers.push("One or more selected Signal owner bindings were not created by the reviewed Signal owner Remote Ambient Surface setup path.");
  }
  if (selectedBindings.length > 1 && !input.toolInput.bindingId) {
    warnings.push("Multiple Signal owner bindings match; provide bindingId, profileId, or conversationId for a narrower relay target.");
  }
  if (!queuedProjections.length && !relayableRuntimeEvents.length) {
    warnings.push("No queued Remote Ambient Surface projections currently exist for the selected Signal owner conversation.");
  }
  if (!relayableRuntimeEvents.length) {
    warnings.push("No relayable completed/failed/canceled runtime events are currently waiting for this Signal owner conversation.");
  }
  const staleRoutingEvents = relayableRuntimeEvents.filter((event) =>
    event.queuedProjectionId &&
    !event.sourceEventId &&
    !queuedProjections.some((projection) => projection.id === event.queuedProjectionId)
  );
  if (staleRoutingEvents.length) {
    warnings.push("One or more relayable Signal runtime events do not carry source routing metadata and their queued projection is no longer retained.");
  }
  const alreadyRelayedEvents = recentRuntimeEvents.filter((event) => event.relayStatus === "sent");

  const bridgeModeLabel = bridgeModeFor(provider, readiness);
  const canSendOwnerRelayNow = blockers.length === 0;
  const repairSteps = repairStepsFor({
    canSendOwnerRelayNow,
    readiness,
    selectedBindings,
    relayableRuntimeEvents,
    staleRoutingEvents,
    alreadyRelayedEvents,
  });
  return {
    providerId: SIGNAL_PROVIDER_ID,
    providerLabel: SIGNAL_PROVIDER_LABEL,
    status: canSendOwnerRelayNow ? "ready" : "blocked",
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
    providerSpecificAssumptions: signalProviderAssumptions(),
    ...(provider ? { provider } : {}),
    ...(readiness ? { readiness } : {}),
    selectedBindings,
    queuedProjections,
    rawRelayableRuntimeEvents: relayableRuntimeEvents,
    rawRecentRuntimeEvents: recentRuntimeEvents,
    rawRecentRelayDeliveries: recentRelayDeliveries,
    blockers,
    warnings,
    repairSteps,
    nextSteps: nextStepsFor({ canSendOwnerRelayNow, readiness, selectedBindings, relayableRuntimeEvents }),
    safety: {
      readsProviderMessages: false,
      sendsProviderMessages: false,
      startsBridge: false,
      readsProviderHistory: false,
      mutatesBindings: false,
    },
  };
}

export function signalRelayDiagnosticsText(result: SignalRelayDiagnosticsResult): string {
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

function bridgeModeFor(
  provider: MessagingGatewayAdapterRuntimeStatus | undefined,
  readiness: MessagingGatewayProviderReadiness | undefined,
): string {
  if (!provider) return "not registered";
  if (readiness?.bridgeReachable && readiness.bridgeCapabilities?.approvedReplySend) return "real Signal bridge ready for approved replies";
  if (readiness?.bridgeReachable) return "Signal bridge reachable, approved replies unavailable";
  if (readiness?.configured) return "Signal profile configured, bridge not reachable";
  return "not ready";
}

function nextStepsFor(input: {
  canSendOwnerRelayNow: boolean;
  readiness?: MessagingGatewayProviderReadiness;
  selectedBindings: MessagingBindingDescriptor[];
  relayableRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
}): string[] {
  if (input.canSendOwnerRelayNow) {
    if (input.relayableRuntimeEvents.length) {
      return [
        "Preview a runtime-event reply with ambient_messaging_signal_bridge_reply_preview using runtimeEventId.",
        "After explicit approval, send with ambient_messaging_signal_bridge_reply_apply using the same runtimeEventId.",
        "Call ambient_messaging_gateway_status after apply to verify relay status and duplicate blocking.",
      ];
    }
    return [
      "Signal relay plumbing is ready for this owner conversation.",
      "Wait for a completed/failed Remote Ambient Surface runtime event, then preview by runtimeEventId.",
    ];
  }
  if (!input.readiness?.configured) return ["Complete Signal session setup before relay smoke testing."];
  if (!input.readiness?.bridgeReachable) return ["Start or repair the reviewed local Signal bridge, then refresh status."];
  if (!input.readiness?.bridgeCapabilities?.approvedReplySend) return ["Use a Signal bridge version that advertises approvedReplySend before sending replies."];
  if (!input.selectedBindings.length) return ["Create an owner-scoped Signal Remote Ambient Surface binding for the target conversation."];
  return ["Resolve the listed blockers, then rerun diagnostics before sending any provider reply."];
}

function repairStepsFor(input: {
  canSendOwnerRelayNow: boolean;
  readiness?: MessagingGatewayProviderReadiness;
  selectedBindings: MessagingBindingDescriptor[];
  relayableRuntimeEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  staleRoutingEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
  alreadyRelayedEvents: MessagingGatewayRemoteSurfaceRuntimeEvent[];
}): string[] {
  const steps: string[] = [];
  if (!input.readiness?.configured) {
    steps.push("Complete Signal session setup with ambient_messaging_signal_session_preview/apply, then rerun ambient_messaging_gateway_status.");
  }
  if (!input.readiness?.bridgeReachable) {
    steps.push("Start or repair the reviewed local Signal bridge until ambient_messaging_gateway_status reports Bridge reachable: yes.");
  }
  if (!input.readiness?.bridgeCapabilities?.approvedReplySend) {
    steps.push("Upgrade or restart the reviewed Signal bridge so the root contract advertises approvedReplySend=yes; do not send through Signal Desktop, signal-cli, shell, browser, Telegram, or generic messaging tools.");
  }
  if (!input.selectedBindings.length) {
    steps.push("Create an active owner-scoped Signal Remote Ambient Surface binding through the typed Signal directory, owner handoff, and ambient_messaging_signal_remote_surface_preview/apply flow.");
    steps.push("If a binding should already exist, call ambient_messaging_list_bindings with providerId signal-cli and includeInactive=true to check whether it was revoked or scoped to another profile/conversation.");
  }
  if (input.staleRoutingEvents.length) {
    steps.push("For stale runtime events without source routing metadata, wait for a new owner command/runtime event or preview a manual reply only when an exact replyToMessageId is available from a current queued projection; do not recover it from Signal history or UI scraping.");
  }
  if (!input.relayableRuntimeEvents.length && input.alreadyRelayedEvents.length) {
    steps.push("Do not resend an already-relayed runtime event; inspect Recent relay deliveries in ambient_messaging_gateway_status and wait for a new runtime event if the owner needs another update.");
  }
  if (!steps.length && input.canSendOwnerRelayNow) {
    steps.push("No repair needed; preview the selected runtime event with ambient_messaging_signal_bridge_reply_preview using runtimeEventId.");
  }
  if (!steps.length) {
    steps.push("Resolve the listed blockers, rerun ambient_messaging_signal_relay_diagnostics, and only then preview a Signal reply.");
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

function signalProviderAssumptions(): string[] {
  return [
    "authProfileId maps to a reviewed local Signal bridge profile, not Signal Desktop UI state.",
    "conversationId maps to a Signal conversation id understood by the local bridge.",
    "reply-to metadata is derived from the original Signal provider message id embedded in the queued projection source event id.",
    "readiness depends on redacted local session metadata and the bridge root advertising approvedReplySend.",
    "Signal chat-to-self relay sends only through the reviewed bridge send endpoint; Messaging Connector external sends remain separate.",
  ];
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
