import type { MessagingGatewayRuntimeStatus } from "../../shared/messagingGateway";
import type { MessagingBindingStore } from "../messaging/messagingBindings";
import type { SignalRelayDiagnosticsToolRegistrationOptions } from "./signal/agentRuntimeSignalRelayDiagnosticsTools";
import type { TelegramRelayDiagnosticsToolRegistrationOptions } from "./telegram/agentRuntimeTelegramRelayDiagnosticsTools";

type RelayDiagnosticsProviderId = "telegram-tdlib" | "signal-cli";

export interface RelayDiagnosticsGatewayRunnerLike {
  refreshProviderReadiness(providerId: RelayDiagnosticsProviderId): Promise<unknown>;
}

export interface MessagingRelayDiagnosticsResolverOptions {
  bindings: Pick<MessagingBindingStore, "list">;
  gatewayRunner: RelayDiagnosticsGatewayRunnerLike;
  runtimeStatus: () => MessagingGatewayRuntimeStatus;
}

export interface MessagingRelayDiagnosticsResolvers {
  telegram: TelegramRelayDiagnosticsToolRegistrationOptions;
  signal: SignalRelayDiagnosticsToolRegistrationOptions;
}

export function createMessagingRelayDiagnosticsResolvers(
  options: MessagingRelayDiagnosticsResolverOptions,
): MessagingRelayDiagnosticsResolvers {
  return {
    telegram: {
      bindings: options.bindings,
      refreshProviderReadiness: (providerId) => options.gatewayRunner.refreshProviderReadiness(providerId),
      runtimeStatus: options.runtimeStatus,
    },
    signal: {
      bindings: options.bindings,
      refreshProviderReadiness: (providerId) => options.gatewayRunner.refreshProviderReadiness(providerId),
      runtimeStatus: options.runtimeStatus,
    },
  };
}
