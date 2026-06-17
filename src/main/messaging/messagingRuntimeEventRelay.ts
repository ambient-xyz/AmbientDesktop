import type {
  MessagingGatewayOutboundDelivery,
  MessagingGatewayRemoteSurfaceRuntimeEvent,
} from "../../shared/messagingGateway";

type RemoteSurfaceRuntimeEventRelayPatch =
  Partial<Omit<MessagingGatewayRemoteSurfaceRuntimeEvent, "id" | "kind" | "scheduledAt">>;

export function runtimeEventRelayText(event: MessagingGatewayRemoteSurfaceRuntimeEvent): string {
  if (event.kind === "active_project_switch") {
    const target = event.projectName ? ` to ${event.projectName}` : "";
    if (event.status === "completed") return `Ambient switched the active project${target}.`;
    if (event.status === "failed") return `Ambient could not switch the active project${target}: ${event.error ?? event.summary}`;
    if (event.status === "canceled") return `Ambient canceled the active project switch${target}: ${event.summary}`;
    return `Ambient is still switching the active project${target}.`;
  }
  return event.summary;
}

export function remoteSurfaceRuntimeEventRelayPatch(input: {
  applyStatus: "sent" | "blocked" | "denied" | "failed";
  providerId: string;
  delivery: MessagingGatewayOutboundDelivery;
}): RemoteSurfaceRuntimeEventRelayPatch {
  return {
    relayStatus: input.applyStatus,
    relayProviderId: input.providerId,
    relayDeliveryId: input.delivery.id,
    relayedAt: input.delivery.sentAt,
    ...(input.delivery.error ? { relayError: input.delivery.error } : {}),
    relaySuggested: input.applyStatus !== "sent",
  };
}
