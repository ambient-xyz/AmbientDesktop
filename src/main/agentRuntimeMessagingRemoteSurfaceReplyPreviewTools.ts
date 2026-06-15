import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  signalBridgeReplyPreviewText,
  type SignalBridgeReplyPreview,
} from "./signalBridgeReply";
import {
  telegramBridgeReplyPreviewText,
  type TelegramBridgeReplyPreview,
} from "./telegramBridgeOutbound";

export interface MessagingRemoteSurfaceReplyInput {
  runtimeEventId: string;
}

export interface MessagingRemoteSurfaceReplyRelaySummary {
  relayActionStatus?: string;
  diagnosticsCommand?: string;
  repairHint?: string;
}

export interface MessagingRemoteSurfaceReplyTarget {
  input: MessagingRemoteSurfaceReplyInput;
  providerId?: string;
  providerLabel?: string;
  relaySummary?: MessagingRemoteSurfaceReplyRelaySummary;
  runtimeEvent?: unknown;
  blockers: string[];
  [key: string]: unknown;
}

export interface MessagingRemoteSurfaceReplyPreviewToolRegistrationOptions {
  inputForParams: (params: unknown) => MessagingRemoteSurfaceReplyInput;
  targetForInput: (input: MessagingRemoteSurfaceReplyInput) => MessagingRemoteSurfaceReplyTarget;
  telegramPreviewForParams: (params: unknown) => TelegramBridgeReplyPreview;
  signalPreviewForParams: (params: unknown) => Promise<{ preview: SignalBridgeReplyPreview }>;
}

export function registerMessagingRemoteSurfaceReplyPreviewTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingRemoteSurfaceReplyPreviewToolRegistrationOptions,
): void {
  const {
    inputForParams,
    targetForInput,
    telegramPreviewForParams,
    signalPreviewForParams,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_remote_surface_reply_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params): Promise<any> => {
      const input = inputForParams(params);
      const target = targetForInput(input);
      if (target.blockers.length) {
        return {
          content: [{ type: "text", text: remoteSurfaceReplyBlockedText("Remote Ambient Surface reply preview", target) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_remote_surface_reply_preview",
            status: "blocked",
            replyStatus: "blocked",
            ...target,
          },
        };
      }
      if (target.providerId === "telegram-tdlib") {
        const preview = telegramPreviewForParams(input);
        const { status: replyStatus, ...previewDetails } = preview;
        return {
          content: [{
            type: "text",
            text: remoteSurfaceReplyDelegatedText({
              title: "Remote Ambient Surface reply preview",
              target,
              delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
              delegatedText: telegramBridgeReplyPreviewText(preview),
            }),
          }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_remote_surface_reply_preview",
            delegatedToolName: "ambient_messaging_telegram_bridge_reply_preview",
            delegatedProviderId: target.providerId,
            status: replyStatus,
            replyStatus,
            ...previewDetails,
          },
        };
      }
      const { preview } = await signalPreviewForParams(input);
      const { status: replyStatus, ...previewDetails } = preview;
      return {
        content: [{
          type: "text",
          text: remoteSurfaceReplyDelegatedText({
            title: "Remote Ambient Surface reply preview",
            target,
            delegatedToolName: "ambient_messaging_signal_bridge_reply_preview",
            delegatedText: signalBridgeReplyPreviewText(preview),
          }),
        }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_remote_surface_reply_preview",
          delegatedToolName: "ambient_messaging_signal_bridge_reply_preview",
          delegatedProviderId: target.providerId,
          status: replyStatus,
          replyStatus,
          ...previewDetails,
        },
      };
    },
  });
}

export function remoteSurfaceReplyBlockedText(
  title: string,
  target: MessagingRemoteSurfaceReplyTarget,
): string {
  const supportedProvider = target.providerId === "telegram-tdlib" || target.providerId === "signal-cli";
  const repairSteps = !target.runtimeEvent
    ? ["Call ambient_messaging_gateway_status and use an exact current runtimeEventId from Remote Ambient Surface runtime events."]
    : target.providerId && !supportedProvider
      ? [
        `Provider ${target.providerId} has no reviewed Remote Ambient Surface reply adapter in Ambient Desktop yet.`,
        "Install or build a typed messaging relay adapter before attempting to send this runtime event externally.",
        "If this was meant for Telegram or Signal, wait for a new runtime event from a correctly bound Telegram/Signal Remote Ambient Surface.",
      ]
      : target.relaySummary?.diagnosticsCommand
        ? [`Call ${target.relaySummary.diagnosticsCommand} before retrying the provider-neutral reply alias.`]
        : ["Call ambient_messaging_gateway_status again and inspect the relay summary repair hint before retrying the provider-neutral reply alias."];
  return [
    title,
    `Status: blocked`,
    `Runtime event: ${target.input.runtimeEventId}`,
    target.providerId ? `Resolved provider: ${target.providerLabel ?? target.providerId} (${target.providerId})` : undefined,
    target.relaySummary?.relayActionStatus ? `Relay action status: ${target.relaySummary.relayActionStatus}` : undefined,
    target.relaySummary?.diagnosticsCommand ? `Relay diagnostics command: ${target.relaySummary.diagnosticsCommand}` : undefined,
    target.relaySummary?.repairHint ? `Relay repair hint: ${target.relaySummary.repairHint}` : undefined,
    "",
    "Blockers:",
    ...(target.blockers.length ? target.blockers.map((blocker) => `- ${blocker}`) : ["- None"]),
    "",
    "Repair steps:",
    ...repairSteps.map((step) => `- ${step}`),
    "- Do not use shell, browser, provider desktop apps, provider CLIs, generic messaging tools, or Messaging Connector sends as a workaround.",
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function remoteSurfaceReplyDelegatedText(input: {
  title: string;
  target: MessagingRemoteSurfaceReplyTarget;
  delegatedToolName: string;
  delegatedText: string;
}): string {
  return [
    input.title,
    `Runtime event: ${input.target.input.runtimeEventId}`,
    `Resolved provider: ${input.target.providerLabel ?? input.target.providerId} (${input.target.providerId})`,
    `Delegated tool: ${input.delegatedToolName}`,
    input.target.relaySummary?.relayActionStatus ? `Relay action status: ${input.target.relaySummary.relayActionStatus}` : undefined,
    "",
    "Delegated provider result:",
    input.delegatedText,
  ].filter((line): line is string => line !== undefined).join("\n");
}
