import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingGatewayRuntimeStatus } from "../../../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  type MessagingRemoteSurfaceReplyInput,
  type MessagingRemoteSurfaceReplyTarget,
  remoteSurfaceReplyBlockedText,
  remoteSurfaceReplyDelegatedText,
} from "./agentRuntimeMessagingRemoteSurfaceReplyPreviewTools";
import {
  signalBridgeReplyResultText,
  type SignalBridgeReplyResult,
} from "../signal/signalBridgeReply";
import {
  telegramBridgeReplyResultText,
  type TelegramBridgeReplyResult,
} from "../../telegram/telegramBridgeOutbound";

export interface MessagingRemoteSurfaceReplyApplyToolRegistrationOptions {
  inputForParams: (params: unknown) => MessagingRemoteSurfaceReplyInput;
  targetForInput: (input: MessagingRemoteSurfaceReplyInput) => MessagingRemoteSurfaceReplyTarget;
  telegramApplyForParams: (params: unknown) => Promise<TelegramBridgeReplyResult>;
  signalApplyForParams: (params: unknown) => Promise<SignalBridgeReplyResult>;
  gatewayRuntimeStatus: () => MessagingGatewayRuntimeStatus;
}

export function registerMessagingRemoteSurfaceReplyApplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingRemoteSurfaceReplyApplyToolRegistrationOptions,
): void {
  const {
    inputForParams,
    targetForInput,
    telegramApplyForParams,
    signalApplyForParams,
    gatewayRuntimeStatus,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_reply_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params): Promise<any> => {
      const input = inputForParams(params);
      const target = targetForInput(input);
      if (target.blockers.length) {
        return {
          content: [{ type: "text", text: remoteSurfaceReplyBlockedText("Remote Ambient Surface reply apply", target) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_remote_surface_reply_apply",
            status: "blocked",
            replyStatus: "blocked",
            ...target,
          },
        };
      }
      if (target.providerId === "telegram-tdlib") {
        const result = await telegramApplyForParams(input);
        const { status: replyStatus, ...resultDetails } = result;
        return {
          content: [{
            type: "text",
            text: remoteSurfaceReplyDelegatedText({
              title: "Remote Ambient Surface reply apply",
              target,
              delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
              delegatedText: telegramBridgeReplyResultText(result),
            }),
          }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_remote_surface_reply_apply",
            delegatedToolName: "ambient_messaging_telegram_bridge_reply_apply",
            delegatedProviderId: target.providerId,
            status: result.applyStatus,
            replyStatus,
            ...resultDetails,
            gatewayRuntimeStatus: gatewayRuntimeStatus(),
          },
        };
      }
      const result = await signalApplyForParams(input);
      const { status: replyStatus, ...resultDetails } = result;
      return {
        content: [{
          type: "text",
          text: remoteSurfaceReplyDelegatedText({
            title: "Remote Ambient Surface reply apply",
            target,
            delegatedToolName: "ambient_messaging_signal_bridge_reply_apply",
            delegatedText: signalBridgeReplyResultText(result),
          }),
        }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_reply_apply",
          delegatedToolName: "ambient_messaging_signal_bridge_reply_apply",
          delegatedProviderId: target.providerId,
          status: result.applyStatus,
          replyStatus,
          ...resultDetails,
          gatewayRuntimeStatus: gatewayRuntimeStatus(),
        },
      };
    },
  });
}
