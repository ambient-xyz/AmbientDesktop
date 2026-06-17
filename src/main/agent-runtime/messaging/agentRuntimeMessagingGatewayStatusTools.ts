import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../../../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { MessagingBindingStore } from "../../messaging/messagingBindings";
import { messagingGatewayRuntimeStatusText } from "../../messaging/messagingGatewayRunner";
import {
  type SignalRealPollingRuntimeStatus,
  signalRealPollingStatusText,
} from "../signal/signalRealPolling";
import {
  buildSignalBridgeReplyStatus,
  type SignalBridgeReplyStatus,
  signalBridgeReplyStatusText,
} from "../signal/signalBridgeReply";
import {
  type TelegramBridgePollingRuntimeStatus,
  telegramBridgePollingStatusText,
} from "../../telegram/telegramBridgePolling";

export interface MessagingGatewayStatusToolRegistrationOptions {
  bindings: Pick<MessagingBindingStore, "list">;
  refreshProviderReadiness: () => Promise<unknown>;
  runtimeStatus: () => MessagingGatewayRuntimeStatus;
  telegramBridgePollingStatus: () => TelegramBridgePollingRuntimeStatus;
  signalRealPollingStatus: (input: {
    bindings: MessagingBindingListResult;
    runtimeStatus: MessagingGatewayRuntimeStatus;
  }) => SignalRealPollingRuntimeStatus;
  signalProviderDescriptor: () => MessagingProviderDescriptor | undefined;
}

export interface MessagingGatewayStatusGatewayRunnerLike {
  refreshProviderReadiness(): Promise<unknown>;
}

export interface MessagingGatewayStatusPollingRunnerLike {
  status(): TelegramBridgePollingRuntimeStatus;
}

export interface MessagingGatewayStatusSignalPollingRunnerLike {
  status(input: {
    bindings: MessagingBindingListResult;
    runtimeStatus: MessagingGatewayRuntimeStatus;
  }): SignalRealPollingRuntimeStatus;
}

export interface MessagingGatewayStatusResolverOptions {
  bindings: Pick<MessagingBindingStore, "list">;
  gatewayRunner: MessagingGatewayStatusGatewayRunnerLike;
  runtimeStatus: () => MessagingGatewayRuntimeStatus;
  telegramBridgePollingRunner: MessagingGatewayStatusPollingRunnerLike;
  signalRealPollingRunner: MessagingGatewayStatusSignalPollingRunnerLike;
  signalProviderDescriptor: () => MessagingProviderDescriptor | undefined;
}

export function createMessagingGatewayStatusResolvers(
  options: MessagingGatewayStatusResolverOptions,
): MessagingGatewayStatusToolRegistrationOptions {
  return {
    bindings: options.bindings,
    refreshProviderReadiness: () => options.gatewayRunner.refreshProviderReadiness(),
    runtimeStatus: options.runtimeStatus,
    telegramBridgePollingStatus: () => options.telegramBridgePollingRunner.status(),
    signalRealPollingStatus: (input) => options.signalRealPollingRunner.status(input),
    signalProviderDescriptor: options.signalProviderDescriptor,
  };
}

export function registerMessagingGatewayStatusTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingGatewayStatusToolRegistrationOptions,
): void {
  const {
    bindings,
    refreshProviderReadiness,
    runtimeStatus,
    telegramBridgePollingStatus,
    signalRealPollingStatus,
    signalProviderDescriptor,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_gateway_status"), {
    executionMode: "sequential",
    execute: async (): Promise<any> => {
      await refreshProviderReadiness();
      const result = runtimeStatus();
      const pollingStatus = telegramBridgePollingStatus();
      const signalPollingStatus = signalRealPollingStatus({
        bindings: bindings.list({ includeInactive: false }),
        runtimeStatus: result,
      });
      const signalBridgeReplyStatus = buildSignalBridgeReplyStatus({
        bindings: bindings.list({ includeInactive: false }),
        runtimeStatus: result,
        descriptor: signalProviderDescriptor(),
      });
      return gatewayStatusToolResult({
        result,
        pollingStatus,
        signalPollingStatus,
        signalBridgeReplyStatus,
      });
    },
  });
}

export function gatewayStatusToolResult(input: {
  result: MessagingGatewayRuntimeStatus;
  pollingStatus: TelegramBridgePollingRuntimeStatus;
  signalPollingStatus: SignalRealPollingRuntimeStatus;
  signalBridgeReplyStatus: SignalBridgeReplyStatus;
}): any {
  return {
    content: [{
      type: "text",
      text: [
        messagingGatewayRuntimeStatusText(input.result),
        "",
        telegramBridgePollingStatusText(input.pollingStatus),
        "",
        signalRealPollingStatusText(input.signalPollingStatus),
        "",
        signalBridgeReplyStatusText(input.signalBridgeReplyStatus),
      ].join("\n"),
    }],
    details: {
      runtime: "ambient-messaging-gateway",
      ...input.result,
      telegramBridgePolling: input.pollingStatus,
      signalRealPolling: input.signalPollingStatus,
      signalBridgeReply: input.signalBridgeReplyStatus,
      gatewayState: input.result.status,
      toolName: "ambient_messaging_gateway_status",
      status: "complete",
    },
  };
}
