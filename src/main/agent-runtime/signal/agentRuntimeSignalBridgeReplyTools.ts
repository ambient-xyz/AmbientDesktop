import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingGatewayRuntimeStatus } from "../../../shared/messagingGateway";
import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import type { SignalBridgeReplyInput, SignalBridgeReplyPreview, SignalBridgeReplyResult } from "./signalBridgeReply";
import {
  signalBridgeReplyPreviewText,
  signalBridgeReplyResultText,
} from "./signalBridgeReply";

export interface SignalBridgeReplyPreviewForParamsResult {
  input: SignalBridgeReplyInput;
  preview: SignalBridgeReplyPreview;
}

export interface SignalBridgeReplyToolRegistrationOptions {
  previewForParams: (params: unknown) => Promise<SignalBridgeReplyPreviewForParamsResult>;
  applyForParams: (params: unknown) => Promise<SignalBridgeReplyResult>;
  gatewayRuntimeStatus: () => MessagingGatewayRuntimeStatus;
}

export function registerSignalBridgeReplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalBridgeReplyToolRegistrationOptions,
): void {
  const { previewForParams, applyForParams, gatewayRuntimeStatus } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { preview } = await previewForParams(params);
      const { status: replyStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: signalBridgeReplyPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_bridge_reply_preview",
          status: replyStatus,
          replyStatus,
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_bridge_reply_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const result = await applyForParams(params);
      const { status: replyStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: signalBridgeReplyResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_bridge_reply_apply",
          status: result.applyStatus,
          replyStatus,
          ...resultDetails,
          gatewayRuntimeStatus: gatewayRuntimeStatus(),
        },
      };
    },
  });
}
