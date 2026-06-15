import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import type { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  applySignalSessionSetup,
  previewSignalSessionSetup,
  signalSessionSetupInput,
  signalSessionSetupPreviewText,
  signalSessionSetupResultText,
  type SignalSessionSetupOptions,
} from "./signalSessionSetup";

export interface SignalSessionToolPermissionRequest {
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

export interface SignalSessionToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: SignalSessionToolPermissionRequest) => Promise<boolean>;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness">;
  setupOptions?: Omit<SignalSessionSetupOptions, "workspacePath">;
}

export function registerSignalSessionTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalSessionToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    gatewayRunner,
    setupOptions,
  } = options;

  const signalSetupOptions = (): SignalSessionSetupOptions => ({
    ...(setupOptions ?? {}),
    workspacePath: workspace.path,
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_session_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = signalSessionSetupInput(params);
      const preview = await previewSignalSessionSetup(input, signalSetupOptions());
      return {
        content: [{ type: "text", text: signalSessionSetupPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_session_preview",
          status: "complete",
          signalSessionSetup: preview,
          ...preview,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_session_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = signalSessionSetupInput(params);
      const preview = await previewSignalSessionSetup(input, signalSetupOptions());
      const refreshSignalReadiness = async () => {
        await gatewayRunner.refreshProviderReadiness("signal-cli").catch(() => undefined);
      };
      if (!preview.canApplyNow) {
        const result = await applySignalSessionSetup(input, signalSetupOptions());
        await refreshSignalReadiness();
        return {
          content: [{ type: "text", text: signalSessionSetupResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_session_apply",
            status: result.applyStatus,
            signalSessionSetup: result,
            ...result,
          },
        };
      }
      const permissionDetail = [
        `Provider: ${preview.providerId}`,
        `Profile: ${preview.profileId}`,
        `signal-cli config dir present: ${preview.signalCliConfigDirPresent ? "yes" : "no"}`,
        `Metadata path: ${preview.metadataPath}`,
        `Would write metadata: ${preview.wouldWriteMetadata ? "yes" : "no"}`,
        `Would run signal-cli: ${preview.wouldRunProviderCli ? "yes" : "no"}`,
        `Would inspect Signal Desktop: ${preview.wouldInspectSignalDesktop ? "yes" : "no"}`,
        `Would start bridge: ${preview.wouldStartBridge ? "yes" : "no"}`,
        `Would read Signal messages: ${preview.wouldReadProviderMessages ? "yes" : "no"}`,
        `Would read Signal history: ${preview.wouldReadProviderHistory ? "yes" : "no"}`,
        `Would send Signal messages: ${preview.wouldSendProviderMessages ? "yes" : "no"}`,
        "Signal identifiers, phone numbers, identity keys, registration ids, session keys, contacts, and message text must not be included in this metadata.",
        ...preview.policyNotes,
      ].join("\n");
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_signal_session_apply",
        title: "Apply Signal session metadata setup?",
        message: `Write Signal setup metadata for profile ${preview.profileId}.`,
        detail: permissionDetail,
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: `signal-session:${preview.profileId}`,
        grantTargetIdentity: `${preview.providerId}:${preview.profileId}:${preview.signalCliConfigDirPresent ? "config-present" : "config-missing"}`,
        allowedReason: "User approved Signal setup metadata recording.",
        deniedReason: "User denied Signal setup metadata recording.",
      });
      if (!allowed) {
        return {
          content: [{ type: "text", text: "Signal session setup metadata was not written because approval was denied." }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_session_apply",
            status: "denied",
            signalSessionSetup: preview,
            ...preview,
          },
        };
      }
      const result = await applySignalSessionSetup(input, signalSetupOptions());
      await refreshSignalReadiness();
      return {
        content: [{ type: "text", text: signalSessionSetupResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_session_apply",
          status: result.applyStatus,
          signalSessionSetup: result,
          ...result,
        },
      };
    },
  });
}
