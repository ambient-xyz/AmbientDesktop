import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  telegramBridgePollApprovalDetail,
  telegramBridgePollBlockedResult,
  telegramBridgePollDeniedResult,
  telegramBridgePollResultText,
  type TelegramBridgePollPlan,
  type TelegramBridgePollResult,
} from "./telegramBridgePolling";

export interface TelegramBridgePollApplyToolPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface TelegramBridgePollApplyToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: TelegramBridgePollApplyToolPermissionRequest) => Promise<boolean>;
  planForParams: (params: unknown) => TelegramBridgePollPlan;
  applyPollForParams: (params: unknown) => Promise<TelegramBridgePollResult>;
}

export function registerTelegramBridgePollApplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramBridgePollApplyToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    planForParams,
    applyPollForParams,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_bridge_poll_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const plan = planForParams(params);
      if (!plan.canApplyNow) {
        const result = telegramBridgePollBlockedResult(plan);
        const { status: pollStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramBridgePollResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_bridge_poll_apply",
            status: "blocked",
            pollStatus,
            ...resultDetails,
          },
        };
      }
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_telegram_bridge_poll_apply",
        title: "Poll Telegram Remote Ambient Surface messages?",
        message: `Poll ${plan.selectedBindings.length} Telegram owner binding(s) for unread Remote Ambient Surface messages.`,
        detail: telegramBridgePollApprovalDetail(plan),
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: `telegram-bridge-poll:${plan.selectedBindings.length}:bindings`,
        grantTargetIdentity: `${plan.providerId}:${plan.selectedBindings.map((binding) => binding.bindingId).join(",")}:${plan.limit}`,
        allowedReason: "User approved bounded Telegram bridge polling.",
        deniedReason: "User denied Telegram bridge polling.",
      });
      if (!allowed) {
        const result = telegramBridgePollDeniedResult(plan);
        const { status: pollStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramBridgePollResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_bridge_poll_apply",
            status: "denied",
            pollStatus,
            ...resultDetails,
          },
        };
      }
      const result = await applyPollForParams(params);
      const { status: pollStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: telegramBridgePollResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_bridge_poll_apply",
          status: result.applyStatus,
          pollStatus,
          ...resultDetails,
        },
      };
    },
  });
}
