import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingListResult,
  MessagingBindingPurpose,
  MessagingProviderDescriptor,
} from "../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import type { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  buildSignalBindingReadinessPreview,
  signalBindingReadinessInput,
  signalBindingReadinessPreviewText,
} from "./signalBindingReadiness";

export interface SignalBindingReadinessBindingsLike {
  list(input?: { providerId?: string; purpose?: MessagingBindingPurpose; includeInactive?: boolean }): MessagingBindingListResult;
}

export interface SignalBindingReadinessToolRegistrationOptions {
  bindings: SignalBindingReadinessBindingsLike;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus">;
  signalDescriptor: () => MessagingProviderDescriptor | undefined;
}

export function registerSignalBindingReadinessTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalBindingReadinessToolRegistrationOptions,
): void {
  const { bindings, gatewayRunner, signalDescriptor } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_binding_readiness_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = signalBindingReadinessInput(params);
      await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
      const preview = buildSignalBindingReadinessPreview({
        toolInput: input,
        bindings: bindings.list({ includeInactive: true }),
        runtimeStatus: gatewayRunner.runtimeStatus(),
        descriptor: signalDescriptor(),
      });
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: signalBindingReadinessPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_binding_readiness_preview",
          status: previewStatus,
          bindingReadinessStatus: previewStatus,
          ...previewDetails,
        },
      };
    },
  });
}
