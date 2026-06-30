import type {
  MessagingBindingListResult,
  MessagingGatewayAdapterMode,
  MessagingGatewayAdapterState,
  MessagingGatewayBridgeSupervisorStatus,
  MessagingGatewayProviderReadiness,
  MessagingGatewayQueuedProjection,
  MessagingGatewayRuntimeStatus,
  MessagingInboundEvent,
  MessagingProviderDescriptor,
  MessagingSyntheticRouteResult,
  RuntimeSurfaceSnapshot,
} from "../../shared/messagingGateway";

export interface MessagingGatewayProviderRegistryLike {
  get(providerId: string): { descriptor: MessagingProviderDescriptor } | undefined;
  descriptors(): MessagingProviderDescriptor[];
}

export interface MessagingGatewayBridgeSupervisor {
  status(): MessagingGatewayBridgeSupervisorStatus;
  start(input: { readiness?: MessagingGatewayProviderReadiness }): Promise<MessagingGatewayBridgeSupervisorStatus>;
  stop(): Promise<MessagingGatewayBridgeSupervisorStatus>;
}

export interface MessagingGatewaySyntheticDispatchInput {
  event: MessagingInboundEvent;
  bindings: MessagingBindingListResult;
  surface?: RuntimeSurfaceSnapshot;
}

export interface MessagingGatewaySyntheticDispatchResult extends MessagingSyntheticRouteResult {
  queuedProjection: MessagingGatewayQueuedProjection;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}

export interface MessagingGatewayInboundDispatchInput {
  event: MessagingInboundEvent;
  bindings: MessagingBindingListResult;
  surface?: RuntimeSurfaceSnapshot;
  source: "telegram-bridge" | "signal-bridge";
  requireRunning?: boolean;
  redactEventTextInResult?: boolean;
}

export interface MessagingGatewayInboundDispatchResult {
  accepted: boolean;
  droppedReason?: string;
  event: MessagingInboundEvent;
  binding?: MessagingSyntheticRouteResult["binding"];
  projection?: MessagingSyntheticRouteResult["projection"];
  promptContext?: MessagingSyntheticRouteResult["promptContext"];
  queuedProjection?: MessagingGatewayQueuedProjection;
  runtimeStatus: MessagingGatewayRuntimeStatus;
}

export interface AdapterRuntimeRecord {
  state: MessagingGatewayAdapterState;
  mode: MessagingGatewayAdapterMode;
  syntheticEventCount: number;
  realEventCount: number;
  queuedProjectionCount: number;
  readiness?: MessagingGatewayProviderReadiness;
  lastActivityAt?: string;
  lastError?: string;
}
