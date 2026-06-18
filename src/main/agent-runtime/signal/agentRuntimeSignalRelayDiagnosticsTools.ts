import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingGatewayRuntimeStatus } from "../../../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingBindingStore } from "../agentRuntimeMessagingFacade";
import {
  buildSignalRelayDiagnostics,
  signalRelayDiagnosticsInput,
  signalRelayDiagnosticsText,
} from "./signalRelayDiagnostics";

export interface SignalRelayDiagnosticsToolRegistrationOptions {
  bindings: Pick<MessagingBindingStore, "list">;
  refreshProviderReadiness: (providerId: "signal-cli") => Promise<unknown>;
  runtimeStatus: () => MessagingGatewayRuntimeStatus;
}

export function registerSignalRelayDiagnosticsTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalRelayDiagnosticsToolRegistrationOptions,
): void {
  const { bindings, refreshProviderReadiness, runtimeStatus } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_relay_diagnostics"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params): Promise<any> => {
      const input = signalRelayDiagnosticsInput(params);
      await refreshProviderReadiness("signal-cli").catch(() => undefined);
      const result = buildSignalRelayDiagnostics({
        toolInput: input,
        bindings: bindings.list({ includeInactive: false }),
        runtimeStatus: runtimeStatus(),
      });
      return {
        content: [{ type: "text", text: signalRelayDiagnosticsText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_relay_diagnostics",
          ...result,
        },
      };
    },
  });
}
