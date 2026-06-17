import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingGatewayLifecycleApplyResult,
  MessagingGatewayLifecyclePreview,
} from "../../../shared/messagingGateway";
import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../../../shared/types";
import { messagingGatewayToolDescriptor } from "../../desktopToolRegistry";
import { registerDesktopTool } from "../../desktopToolRegistration";
import {
  messagingGatewayLifecycleApplyResultText,
  messagingGatewayLifecyclePreviewText,
} from "../../messaging/messagingGatewayRunner";
import {
  messagingGatewayLifecyclePreviewInput,
  type MessagingGatewayLifecyclePreviewInput,
} from "./agentRuntimeMessagingGatewayLifecyclePreviewTools";

export interface MessagingGatewayLifecycleApplyToolPermissionRequest {
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

export interface MessagingGatewayLifecycleApplyInput extends MessagingGatewayLifecyclePreviewInput {
  approvalRecorded: boolean;
}

export interface MessagingGatewayLifecycleApplyToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: MessagingGatewayLifecycleApplyToolPermissionRequest) => Promise<boolean>;
  refreshProviderReadiness: (providerId: string) => Promise<unknown>;
  previewLifecycle: (input: MessagingGatewayLifecyclePreviewInput) => MessagingGatewayLifecyclePreview;
  applyLifecycle: (input: MessagingGatewayLifecycleApplyInput) => Promise<MessagingGatewayLifecycleApplyResult>;
}

export function registerMessagingGatewayLifecycleApplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingGatewayLifecycleApplyToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    refreshProviderReadiness,
    previewLifecycle,
    applyLifecycle,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_gateway_lifecycle_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingGatewayLifecyclePreviewInput(params);
      await refreshProviderReadiness(input.providerId);
      const preview = previewLifecycle(input);
      if (preview.mode === "real" && !preview.canApplyNow) {
        const text = [
          "Messaging gateway lifecycle change was not applied because readiness or process-supervision blockers remain.",
          "",
          messagingGatewayLifecyclePreviewText(preview),
        ].join("\n");
        return {
          content: [{ type: "text", text }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_gateway_lifecycle_apply",
            status: "blocked",
            blockedReason: "Readiness or process-supervision blockers remain.",
            ...preview,
          },
        };
      }
      if (preview.approvalRequired) {
        const allowed = await resolveFirstPartyPluginPermission({
          thread: getThread(threadId),
          workspace,
          toolName: "ambient_messaging_gateway_lifecycle_apply",
          title: `${preview.action === "start" ? "Start" : "Stop"} ${preview.label} messaging gateway?`,
          message: `${preview.action === "start" ? "Start" : "Stop"} ${preview.label} gateway lifecycle in ${preview.mode} mode.`,
          detail: [
            `Provider: ${preview.label} (${preview.providerId})`,
            `Mode: ${preview.mode}`,
            `Readiness: ${preview.readiness?.status ?? "unknown"}`,
            `Bridge reachable: ${preview.readiness?.bridgeReachable ? "yes" : "no"}`,
            `Would attach existing bridge: ${preview.wouldAttachExistingBridge ? "yes" : "no"}`,
            `Would launch bridge process: ${preview.wouldLaunchBridgeProcess ? "yes" : "no"}`,
            `Would stop bridge process: ${preview.wouldStopBridgeProcess ? "yes" : "no"}`,
            `Would detach runner only: ${preview.wouldDetachRunnerOnly ? "yes" : "no"}`,
            `Would read provider messages: ${preview.wouldReadProviderMessages ? "yes" : "no"}`,
            `Would send provider messages: ${preview.wouldSendProviderMessages ? "yes" : "no"}`,
            "Current slice does not ingest provider messages or send provider messages.",
            ...preview.policyNotes,
          ].join("\n"),
          risk: "plugin-tool",
          reusableScopes: ["thread", "project", "workspace"],
          grantTargetLabel: `ambient-messaging-gateway:${preview.providerId}:${preview.action}:${preview.mode}`,
          grantTargetIdentity: `${preview.providerId}:${preview.action}:${preview.mode}:${preview.readiness?.checkedAt ?? "no-readiness"}`,
          allowedReason: "User approved messaging gateway lifecycle apply.",
          deniedReason: "User denied messaging gateway lifecycle apply.",
        });
        if (!allowed) {
          const text = [
            "Messaging gateway lifecycle change was not applied because approval was denied.",
            "",
            messagingGatewayLifecyclePreviewText(preview),
          ].join("\n");
          return {
            content: [{ type: "text", text }],
            details: {
              runtime: "ambient-messaging-gateway",
              toolName: "ambient_messaging_gateway_lifecycle_apply",
              status: "denied",
              ...preview,
            },
          };
        }
      }
      const result = await applyLifecycle({
        ...input,
        approvalRecorded: preview.approvalRequired,
      });
      return {
        content: [{ type: "text", text: messagingGatewayLifecycleApplyResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_gateway_lifecycle_apply",
          status: result.applyStatus,
          ...result,
        },
      };
    },
  });
}
