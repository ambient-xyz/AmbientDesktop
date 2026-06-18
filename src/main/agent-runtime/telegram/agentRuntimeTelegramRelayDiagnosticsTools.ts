import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingGatewayRuntimeStatus } from "../../../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingBindingStore } from "../agentRuntimeMessagingFacade";
import {
  buildTelegramRelayDiagnostics,
  telegramRelayDiagnosticsInput,
  telegramRelayDiagnosticsText,
} from "../agentRuntimeTelegramFacade";

export interface TelegramRelayDiagnosticsToolRegistrationOptions {
  bindings: Pick<MessagingBindingStore, "list">;
  refreshProviderReadiness: (providerId: "telegram-tdlib") => Promise<unknown>;
  runtimeStatus: () => MessagingGatewayRuntimeStatus;
}

export function registerTelegramRelayDiagnosticsTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramRelayDiagnosticsToolRegistrationOptions,
): void {
  const { bindings, refreshProviderReadiness, runtimeStatus } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_relay_diagnostics"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params): Promise<any> => {
      const input = telegramRelayDiagnosticsInput(params);
      await refreshProviderReadiness("telegram-tdlib");
      const result = buildTelegramRelayDiagnostics({
        toolInput: input,
        bindings: bindings.list({ includeInactive: false }),
        runtimeStatus: runtimeStatus(),
      });
      return {
        content: [{ type: "text", text: telegramRelayDiagnosticsText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_relay_diagnostics",
          ...result,
        },
      };
    },
  });
}
