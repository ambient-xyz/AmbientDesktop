import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { MessagingProviderDescriptor } from "../../../shared/messagingGateway";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type { MessagingGatewayRunner } from "../agentRuntimeMessagingFacade";
import {
  applySignalConversationDirectory,
  buildSignalConversationDirectoryPreview,
  signalConversationDirectoryApprovalDetail,
  signalConversationDirectoryBlockedResult,
  signalConversationDirectoryDeniedResult,
  signalConversationDirectoryInput,
  signalConversationDirectoryPreviewText,
  signalConversationDirectoryResultText,
  signalConversationDirectorySetupCard,
} from "./signalConversationDirectory";

export interface SignalConversationDirectoryProviderRegistryLike {
  get(providerId: string): { descriptor: MessagingProviderDescriptor } | undefined;
}

export interface SignalConversationDirectoryToolPermissionRequest {
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

export interface SignalConversationDirectoryToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: SignalConversationDirectoryToolPermissionRequest) => Promise<boolean>;
  registry: SignalConversationDirectoryProviderRegistryLike;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness" | "runtimeStatus">;
}

export function registerSignalConversationDirectoryTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalConversationDirectoryToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    registry,
    gatewayRunner,
  } = options;

  const signalConversationDirectoryPreviewForParams = async (params: unknown) => {
    const input = signalConversationDirectoryInput(params);
    await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
    return {
      input,
      preview: buildSignalConversationDirectoryPreview({
        toolInput: input,
        runtimeStatus: gatewayRunner.runtimeStatus(),
        descriptor: registry.get("signal-cli")?.descriptor,
      }),
    };
  };

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_conversation_directory_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { preview } = await signalConversationDirectoryPreviewForParams(params);
      const { status: previewStatus, ...previewDetails } = preview;
      return {
        content: [{ type: "text", text: signalConversationDirectoryPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_conversation_directory_preview",
          status: previewStatus,
          directoryStatus: previewStatus,
          messagingConversationDirectorySetup: signalConversationDirectorySetupCard(preview),
          ...previewDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_conversation_directory_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { preview } = await signalConversationDirectoryPreviewForParams(params);
      if (!preview.canApplyNow) {
        const result = signalConversationDirectoryBlockedResult(preview);
        const { status: directoryStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalConversationDirectoryResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_conversation_directory_apply",
            status: result.applyStatus,
            directoryStatus,
            messagingConversationDirectorySetup: signalConversationDirectorySetupCard(result),
            ...resultDetails,
          },
        };
      }
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_signal_conversation_directory_apply",
        title: "Read Signal conversation directory metadata?",
        message: `Read up to ${preview.limit} Signal conversation metadata row(s) from the reviewed local bridge for profile ${preview.profileId ?? "unknown"}.`,
        detail: signalConversationDirectoryApprovalDetail(preview),
        risk: "plugin-tool",
        reusableScopes: ["thread"],
        grantTargetLabel: `signal-directory:${preview.profileId ?? "unknown"}`,
        grantTargetIdentity: `${preview.providerId}:${preview.profileId ?? "unknown"}:${preview.limit}:${preview.query ?? ""}`,
        allowedReason: "User approved bounded Signal conversation directory metadata read.",
        deniedReason: "User denied Signal conversation directory metadata read.",
      });
      if (!allowed) {
        const result = signalConversationDirectoryDeniedResult(preview);
        const { status: directoryStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalConversationDirectoryResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_conversation_directory_apply",
            status: result.applyStatus,
            directoryStatus,
            messagingConversationDirectorySetup: signalConversationDirectorySetupCard(result),
            ...resultDetails,
          },
        };
      }
      const result = await applySignalConversationDirectory({
        preview,
        approvalRecorded: true,
      });
      const { status: directoryStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: signalConversationDirectoryResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_conversation_directory_apply",
          status: result.applyStatus,
          directoryStatus,
          messagingConversationDirectorySetup: signalConversationDirectorySetupCard(result),
          ...resultDetails,
        },
      };
    },
  });
}
