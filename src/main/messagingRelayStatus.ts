import type {
  MessagingBindingDescriptor,
  MessagingGatewayOutboundDelivery,
  MessagingGatewayQueuedProjection,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
  MessagingGatewayRuntimeStatus,
  RuntimeSurfaceRelaySummary,
} from "../shared/messagingGateway";

interface RelayProviderTooling {
  providerId: string;
  label: string;
  previewToolName: string;
  applyToolName: string;
  diagnosticsToolName: string;
}

const REMOTE_SURFACE_REPLY_PREVIEW_TOOL_NAME = "ambient_messaging_remote_surface_reply_preview";
const REMOTE_SURFACE_REPLY_APPLY_TOOL_NAME = "ambient_messaging_remote_surface_reply_apply";

const RELAY_PROVIDER_TOOLING: Record<string, RelayProviderTooling> = {
  "telegram-tdlib": {
    providerId: "telegram-tdlib",
    label: "Telegram",
    previewToolName: REMOTE_SURFACE_REPLY_PREVIEW_TOOL_NAME,
    applyToolName: REMOTE_SURFACE_REPLY_APPLY_TOOL_NAME,
    diagnosticsToolName: "ambient_messaging_telegram_relay_diagnostics",
  },
  "signal-cli": {
    providerId: "signal-cli",
    label: "Signal",
    previewToolName: REMOTE_SURFACE_REPLY_PREVIEW_TOOL_NAME,
    applyToolName: REMOTE_SURFACE_REPLY_APPLY_TOOL_NAME,
    diagnosticsToolName: "ambient_messaging_signal_relay_diagnostics",
  },
};

export function messagingGatewayStatusWithRemoteSurfaceRuntimeEvents(
  status: MessagingGatewayRuntimeStatus,
  options: {
    events: readonly MessagingGatewayRemoteSurfaceRuntimeEvent[];
    bindings?: MessagingBindingDescriptor[];
  },
): MessagingGatewayRuntimeStatus {
  const events = options.events.map((event) => ({ ...event }));
  const statusWithEvents: MessagingGatewayRuntimeStatus = {
    ...status,
    pendingRemoteSurfaceRuntimeEventCount: events.filter((event) => event.status === "pending").length,
    recentRemoteSurfaceRuntimeEventCount: events.length,
    ...(events.length ? { remoteSurfaceRuntimeEvents: events } : {}),
  };
  const relaySummaries = buildRemoteSurfaceRelaySummaries(statusWithEvents, { bindings: options.bindings });
  return {
    ...statusWithEvents,
    relayableRemoteSurfaceRuntimeEventCount: relaySummaries.filter((summary) => summary.relayActionStatus === "preview-ready").length,
    alreadyRelayedRemoteSurfaceRuntimeEventCount: relaySummaries.filter((summary) => summary.duplicateBlocked).length,
    ...(relaySummaries.length ? { remoteSurfaceRelaySummaries: relaySummaries } : {}),
  };
}

export function buildRemoteSurfaceRelaySummaries(
  status: MessagingGatewayRuntimeStatus,
  options: { bindings?: MessagingBindingDescriptor[] } = {},
): RuntimeSurfaceRelaySummary[] {
  const events = status.remoteSurfaceRuntimeEvents ?? [];
  if (!events.length) return [];
  return events.map((event) => relaySummaryForEvent({
    event,
    queuedProjection: event.queuedProjectionId
      ? status.queuedProjections.find((projection) => projection.id === event.queuedProjectionId)
      : undefined,
    binding: event.bindingId
      ? options.bindings?.find((binding) => binding.id === event.bindingId)
      : undefined,
    delivery: event.relayDeliveryId
      ? status.recentOutboundDeliveries.find((delivery) => delivery.id === event.relayDeliveryId)
      : status.recentOutboundDeliveries.find((delivery) => delivery.runtimeEventId === event.id),
  }));
}

export function relaySummaryTextLines(summary: RuntimeSurfaceRelaySummary): string[] {
  return [
    `  Relay action: ${summary.nextAction}`,
    `  Relay action status: ${summary.relayActionStatus}`,
    `  Duplicate blocked: ${summary.duplicateBlocked ? "yes" : "no"}`,
    summary.targetProviderId ? `  Relay target provider: ${summary.targetProviderLabel ?? summary.targetProviderId} (${summary.targetProviderId})` : undefined,
    summary.previewToolName ? `  Provider-neutral relay preview tool: ${summary.previewToolName}` : undefined,
    summary.applyToolName ? `  Provider-neutral relay apply tool: ${summary.applyToolName}` : undefined,
    summary.diagnosticsToolName ? `  Provider repair diagnostics tool: ${summary.diagnosticsToolName}` : undefined,
    summary.previewCommand ? `  Provider-neutral relay preview command: ${summary.previewCommand}` : undefined,
    summary.applyCommand ? `  Provider-neutral relay apply command: ${summary.applyCommand}` : undefined,
    summary.diagnosticsCommand ? `  Provider repair diagnostics command: ${summary.diagnosticsCommand}` : undefined,
    summary.repairHint ? `  Relay repair hint: ${summary.repairHint}` : undefined,
  ].filter((line): line is string => Boolean(line));
}

function relaySummaryForEvent(input: {
  event: MessagingGatewayRemoteSurfaceRuntimeEvent;
  queuedProjection?: MessagingGatewayQueuedProjection;
  binding?: MessagingBindingDescriptor;
  delivery?: MessagingGatewayOutboundDelivery;
}): RuntimeSurfaceRelaySummary {
  const providerId = input.event.relayProviderId ?? input.delivery?.providerId ?? input.queuedProjection?.providerId ?? input.binding?.providerId;
  const authProfileId = input.queuedProjection?.authProfileId ?? input.binding?.authProfileId;
  const conversationId = input.queuedProjection?.conversationId ?? input.binding?.conversationId;
  const tooling = providerId ? RELAY_PROVIDER_TOOLING[providerId] : undefined;
  const previewToolName = tooling?.previewToolName ?? (input.event.relaySuggested ? REMOTE_SURFACE_REPLY_PREVIEW_TOOL_NAME : undefined);
  const applyToolName = tooling?.applyToolName;
  const base = {
    runtimeEventId: input.event.id,
    title: input.event.title,
    eventStatus: input.event.status,
    relaySuggested: input.event.relaySuggested,
    summary: input.event.summary,
    ...(input.event.projectName ? { projectName: input.event.projectName } : {}),
    ...(input.event.queuedProjectionId ? { queuedProjectionId: input.event.queuedProjectionId } : {}),
    ...(input.event.bindingId ? { bindingId: input.event.bindingId } : {}),
    ...(providerId ? { targetProviderId: providerId } : {}),
    ...(tooling ? { targetProviderLabel: tooling.label } : {}),
    ...(input.event.relayStatus ? { relayStatus: input.event.relayStatus } : {}),
    ...(input.event.relayProviderId ? { relayProviderId: input.event.relayProviderId } : {}),
    ...(input.event.relayDeliveryId ? { relayDeliveryId: input.event.relayDeliveryId } : {}),
    ...(previewToolName ? { previewToolName } : {}),
    ...(applyToolName ? { applyToolName } : {}),
    ...(tooling ? { diagnosticsToolName: tooling.diagnosticsToolName } : {}),
    ...(previewToolName ? { previewCommand: `${previewToolName} runtimeEventId=${input.event.id}` } : {}),
    ...(applyToolName ? { applyCommand: `${applyToolName} runtimeEventId=${input.event.id}` } : {}),
    ...(tooling ? { diagnosticsCommand: `${tooling.diagnosticsToolName}${authProfileId ? ` profileId=${authProfileId}` : ""}${conversationId ? ` conversationId=${conversationId}` : ""}` } : {}),
  };

  if (input.event.relayStatus === "sent") {
    return {
      ...base,
      relayActionStatus: "already-relayed",
      duplicateBlocked: true,
      nextAction: "Already relayed; do not resend this runtime event. Inspect Recent outbound deliveries for the provider delivery record.",
    };
  }
  if (input.event.status === "pending") {
    return {
      ...base,
      relayActionStatus: "waiting",
      duplicateBlocked: false,
      nextAction: "Wait for this runtime event to complete or fail, then rerun ambient_messaging_gateway_status before previewing a relay.",
      repairHint: "Runtime-event relay previews intentionally block pending events.",
    };
  }
  if (!input.event.relaySuggested && !input.event.relayStatus) {
    return {
      ...base,
      relayActionStatus: "not-suggested",
      duplicateBlocked: false,
      nextAction: "No provider relay is currently suggested for this runtime event.",
    };
  }
  if (!tooling) {
    return {
      ...base,
      relayActionStatus: "repair-needed",
      duplicateBlocked: false,
      nextAction: previewToolName
        ? `Call the provider-neutral ${previewToolName} alias with runtimeEventId ${input.event.id} to inspect relay blockers; do not apply until a reviewed provider adapter exists.`
        : "Relay target provider is unknown; wait for a new runtime event with current routing metadata.",
      repairHint: providerId
        ? `Provider ${providerId} has no reviewed Remote Ambient Surface reply adapter. Do not send through provider UIs, shell, browser, generic messaging tools, or Messaging Connector.`
        : "Gateway status cannot name a provider route until the runtime event maps to a supported provider.",
    };
  }
  if (!input.event.queuedProjectionId && !input.event.replyToMessageId && !input.event.sourceEventId) {
    return {
      ...base,
      relayActionStatus: "repair-needed",
      duplicateBlocked: false,
      nextAction: `Run provider repair diagnostics ${tooling.diagnosticsToolName} before previewing; this runtime event has no queued projection or source routing metadata in gateway status.`,
      repairHint: "Do not recover reply routing from provider history, desktop UI, shell, browser, or generic messaging tools.",
    };
  }
  if (input.event.relayStatus) {
    return {
      ...base,
      relayActionStatus: "repair-needed",
      duplicateBlocked: false,
      nextAction: `Previous relay attempt ended as ${input.event.relayStatus}; run provider repair diagnostics ${tooling.diagnosticsToolName}, repair the blocker, then preview again with runtimeEventId ${input.event.id}.`,
      repairHint: input.event.relayError ?? "Do not retry through an unreviewed provider send path.",
    };
  }
  return {
    ...base,
    relayActionStatus: "preview-ready",
    duplicateBlocked: false,
    nextAction: `Preview relay through provider-neutral alias ${tooling.previewToolName} with runtimeEventId ${input.event.id}. Apply through provider-neutral alias ${tooling.applyToolName} only after preview and explicit approval; use provider-specific diagnostics only for repair.`,
  };
}
