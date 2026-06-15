import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  SecureInputPromptResolution,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import type { MessagingGatewayRunner } from "./messagingGatewayRunner";
import {
  applyTelegramSessionBootstrap,
  previewTelegramSessionBootstrap,
  telegramSessionBootstrapPreviewText,
  telegramSessionBootstrapResultText,
  telegramSessionBootstrapSetupCard,
  type TelegramSessionBootstrapInput,
  type TelegramSessionBootstrapOptions,
} from "./telegramSessionBootstrap";
import type { TelegramBridgeSupervisor } from "./telegramBridgeSupervisor";

export interface TelegramSessionToolPermissionRequest {
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

export interface TelegramSessionSecureInputRequest {
  threadId?: string;
  workspacePath?: string;
  requestId?: string;
  title: string;
  message: string;
  detail: string;
  inputLabel: string;
  inputKind: "telegram_login_code" | "telegram_password" | "generic_secret";
  inputMode: "text" | "password";
  providerId?: string;
  profileId?: string;
}

export interface TelegramSessionToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: TelegramSessionToolPermissionRequest) => Promise<boolean>;
  gatewayRunner: Pick<MessagingGatewayRunner, "refreshProviderReadiness">;
  telegramBridgeSupervisor: TelegramSessionBootstrapOptions["supervisor"] & Pick<TelegramBridgeSupervisor, "status" | "startForSetup">;
  secureInputs?: {
    request: (input: TelegramSessionSecureInputRequest) => Promise<SecureInputPromptResolution>;
  };
  bootstrapOptions?: Omit<TelegramSessionBootstrapOptions, "workspacePath" | "supervisor">;
}

export function registerTelegramSessionTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramSessionToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    gatewayRunner,
    telegramBridgeSupervisor,
    secureInputs,
    bootstrapOptions,
  } = options;

  const sessionBootstrapOptions = (): TelegramSessionBootstrapOptions => ({
    ...(bootstrapOptions ?? {}),
    workspacePath: workspace.path,
    supervisor: telegramBridgeSupervisor,
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_session_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = telegramSessionBootstrapInput(params);
      const preview = previewTelegramSessionBootstrap(input, sessionBootstrapOptions());
      return {
        content: [{ type: "text", text: telegramSessionBootstrapPreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_session_preview",
          status: "complete",
          telegramSessionSetup: telegramSessionBootstrapSetupCard(preview),
          ...preview,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_session_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = telegramSessionBootstrapInput(params);
      const refreshTelegramReadiness = async () => {
        await gatewayRunner.refreshProviderReadiness(input.providerId?.trim() || "telegram-tdlib").catch(() => undefined);
      };
      const preview = previewTelegramSessionBootstrap(input, sessionBootstrapOptions());
      const secureMissing = telegramSessionSecureInputRequirement(preview.missingInputs);
      const nonSecureMissing = preview.missingInputs.filter((item) => item !== "secure code input" && item !== "secure password input");
      if (nonSecureMissing.length || (secureMissing && !secureInputs?.request)) {
        const result = await applyTelegramSessionBootstrap(input, sessionBootstrapOptions());
        await refreshTelegramReadiness();
        return {
          content: [{ type: "text", text: telegramSessionBootstrapResultText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_session_apply",
            status: result.applyStatus,
            telegramSessionSetup: telegramSessionBootstrapSetupCard(result),
            ...result,
          },
        };
      }
      const permissionDetail = [
        `Provider: ${preview.providerId}`,
        `Profile: ${preview.profileId}`,
        `Action: ${preview.action}`,
        `API credentials present: ${preview.apiCredentialsPresent ? "yes" : "no"}`,
        `Phone number present: ${preview.phoneNumberPresent ? "yes" : "no"}`,
        `Code present: ${preview.codePresent ? "yes" : "no"}`,
        `Password present: ${preview.passwordPresent ? "yes" : "no"}`,
        secureMissing ? `Secure input required: ${secureMissing}` : undefined,
        `Would launch bridge for setup: ${preview.wouldLaunchBridgeForSetup ? "yes" : "no"}`,
        `Would call endpoint: ${preview.wouldCallEndpoint}`,
        `Would read provider messages: ${preview.wouldReadProviderMessages ? "yes" : "no"}`,
        `Would send provider messages: ${preview.wouldSendProviderMessages ? "yes" : "no"}`,
        "Phone numbers, Telegram API credentials, login codes, passwords, and database encryption keys are redacted from Pi-visible output.",
        ...preview.policyNotes,
      ].filter((line): line is string => Boolean(line)).join("\n");
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_telegram_session_apply",
        title: `Apply Telegram ${preview.action} setup?`,
        message: `Apply Telegram session setup for profile ${preview.profileId}.`,
        detail: permissionDetail,
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: `telegram-session:${preview.action}:${preview.profileId}`,
        grantTargetIdentity: `${preview.providerId}:${preview.action}:${preview.profileId}:${preview.apiCredentialsPresent ? "creds" : "no-creds"}`,
        allowedReason: "User approved Telegram session setup.",
        deniedReason: "User denied Telegram session setup.",
      });
      if (!allowed) {
        return {
          content: [{ type: "text", text: "Telegram session setup was not applied because approval was denied." }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_session_apply",
            status: "denied",
            telegramSessionSetup: telegramSessionBootstrapSetupCard(preview),
            ...preview,
          },
        };
      }
      let applyInput = input;
      if (secureMissing) {
        const secureInput = await secureInputs!.request({
          threadId,
          workspacePath: workspace.path,
          requestId: `telegram-session:${preview.action}:${preview.profileId}`,
          title: secureMissing === "code" ? "Enter Telegram login code" : "Enter Telegram two-factor password",
          message: secureMissing === "code"
            ? "Telegram sent a login code. Enter it in Ambient; the value is used once and is never shown to Pi."
            : "Telegram requested your two-factor password. Enter it in Ambient; the value is used once and is never shown to Pi.",
          detail: [
            `Provider: ${preview.providerId}`,
            `Profile: ${preview.profileId}`,
            `Action: ${preview.action}`,
            "This secure input is routed directly to the Telegram setup endpoint.",
            "It is not written to chat, logs, descriptors, artifacts, or Pi-visible tool output.",
          ].join("\n"),
          inputLabel: secureMissing === "code" ? "Telegram login code" : "Telegram two-factor password",
          inputKind: secureMissing === "code" ? "telegram_login_code" : "telegram_password",
          inputMode: secureMissing === "code" ? "text" : "password",
          providerId: preview.providerId,
          profileId: preview.profileId,
        });
        if (!secureInput.allowed || !secureInput.value) {
          const result = await applyTelegramSessionBootstrap(input, sessionBootstrapOptions());
          await refreshTelegramReadiness();
          return {
            content: [{
              type: "text",
              text: [
                "Telegram session setup was not applied because secure input was canceled or unavailable.",
                "",
                telegramSessionBootstrapResultText(result),
              ].join("\n"),
            }],
            details: {
              runtime: "ambient-messaging-gateway",
              toolName: "ambient_messaging_telegram_session_apply",
              status: "blocked",
              secureInput: { requested: true, received: false },
              telegramSessionSetup: telegramSessionBootstrapSetupCard(result),
              ...result,
            },
          };
        }
        applyInput = secureMissing === "code"
          ? { ...input, code: secureInput.value }
          : { ...input, password: secureInput.value };
      }
      const result = await applyTelegramSessionBootstrap(applyInput, sessionBootstrapOptions());
      await refreshTelegramReadiness();
      return {
        content: [{ type: "text", text: telegramSessionBootstrapResultText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_session_apply",
          status: result.applyStatus,
          telegramSessionSetup: telegramSessionBootstrapSetupCard(result),
          ...result,
        },
      };
    },
  });
}

function telegramSessionBootstrapInput(params: unknown): TelegramSessionBootstrapInput {
  const raw = params as Record<string, unknown> | undefined;
  const action = optionalString(raw?.action);
  const profileId = optionalString(raw?.profileId);
  if (!action || !["start_auth", "status", "submit_code", "submit_password"].includes(action)) {
    throw new Error("action must be start_auth, status, submit_code, or submit_password.");
  }
  if (!profileId) throw new Error("profileId is required.");
  return {
    action: action as TelegramSessionBootstrapInput["action"],
    providerId: optionalString(raw?.providerId),
    profileId,
    phoneNumber: optionalString(raw?.phoneNumber),
  };
}

function telegramSessionSecureInputRequirement(missingInputs: string[]): "code" | "password" | undefined {
  if (missingInputs.includes("secure code input")) return "code";
  if (missingInputs.includes("secure password input")) return "password";
  return undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
