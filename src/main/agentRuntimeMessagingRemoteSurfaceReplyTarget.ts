import type {
  MessagingBindingDescriptor,
  MessagingGatewayRuntimeStatus,
} from "../shared/messagingGateway";
import type {
  MessagingRemoteSurfaceReplyInput,
  MessagingRemoteSurfaceReplyTarget,
} from "./agentRuntimeMessagingRemoteSurfaceReplyPreviewTools";

export interface MessagingRemoteSurfaceReplyTargetResolverOptions {
  gatewayRuntimeStatus: () => MessagingGatewayRuntimeStatus;
  listBindings: () => readonly MessagingBindingDescriptor[];
}

export type MessagingRemoteSurfaceReplyTargetResolver = (
  input: MessagingRemoteSurfaceReplyInput
) => MessagingRemoteSurfaceReplyTarget;

export function messagingRemoteSurfaceReplyInputFromParams(params: unknown): MessagingRemoteSurfaceReplyInput {
  const raw = params as Record<string, unknown> | undefined;
  const runtimeEventId = typeof raw?.runtimeEventId === "string" ? raw.runtimeEventId.trim() : "";
  if (!runtimeEventId) throw new Error("runtimeEventId is required.");
  return { runtimeEventId };
}

export function createMessagingRemoteSurfaceReplyTargetResolver(
  options: MessagingRemoteSurfaceReplyTargetResolverOptions,
): MessagingRemoteSurfaceReplyTargetResolver {
  return (input) => messagingRemoteSurfaceReplyTargetForInput(input, {
    gatewayRuntimeStatus: options.gatewayRuntimeStatus(),
    bindings: options.listBindings(),
  });
}

export function messagingRemoteSurfaceReplyTargetForInput(
  input: MessagingRemoteSurfaceReplyInput,
  options: {
    gatewayRuntimeStatus: MessagingGatewayRuntimeStatus;
    bindings: readonly MessagingBindingDescriptor[];
  },
): MessagingRemoteSurfaceReplyTarget {
  const { gatewayRuntimeStatus, bindings } = options;
  const runtimeEvent = gatewayRuntimeStatus.remoteSurfaceRuntimeEvents?.find((event) => event.id === input.runtimeEventId);
  const relaySummary = gatewayRuntimeStatus.remoteSurfaceRelaySummaries?.find((summary) => summary.runtimeEventId === input.runtimeEventId);
  const queuedProjection = runtimeEvent?.queuedProjectionId
    ? gatewayRuntimeStatus.queuedProjections.find((projection) => projection.id === runtimeEvent.queuedProjectionId)
    : undefined;
  const delivery = runtimeEvent?.relayDeliveryId
    ? gatewayRuntimeStatus.recentOutboundDeliveries.find((candidate) => candidate.id === runtimeEvent.relayDeliveryId)
    : gatewayRuntimeStatus.recentOutboundDeliveries.find((candidate) => candidate.runtimeEventId === input.runtimeEventId);
  const binding = runtimeEvent?.bindingId
    ? bindings.find((candidate) => candidate.id === runtimeEvent.bindingId)
    : undefined;
  const providerId = runtimeEvent?.relayProviderId
    ?? delivery?.providerId
    ?? queuedProjection?.providerId
    ?? relaySummary?.targetProviderId
    ?? binding?.providerId;
  const providerLabel = providerId === "telegram-tdlib"
    ? "Telegram"
    : providerId === "signal-cli"
      ? "Signal"
      : providerId;
  const blockers = [
    ...(runtimeEvent ? [] : ["Remote Ambient Surface runtime event was not found in gateway status."]),
    ...(providerId ? [] : ["Remote Ambient Surface runtime event does not resolve to a supported messaging provider route."]),
    ...(providerId && providerId !== "telegram-tdlib" && providerId !== "signal-cli"
      ? [`Remote Ambient Surface reply alias does not support provider ${providerId}.`]
      : []),
  ];
  return {
    input,
    gatewayRuntimeStatus,
    runtimeEvent,
    relaySummary,
    queuedProjection,
    delivery,
    binding,
    providerId,
    providerLabel,
    blockers,
  };
}
