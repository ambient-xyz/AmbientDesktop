import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingCreateInput,
  MessagingBindingLifecyclePreview,
  MessagingBindingLifecycleResult,
  MessagingBindingRevokeInput,
  MessagingGatewayAdapterRuntimeStatus,
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
  buildTelegramRemoteSurfaceBindingPlan,
  telegramRemoteSurfaceBindingAppliedResult,
  telegramRemoteSurfaceBindingApprovalDetail,
  telegramRemoteSurfaceBindingBlockedResult,
  telegramRemoteSurfaceBindingCreateInput,
  telegramRemoteSurfaceBindingDeniedResult,
  telegramRemoteSurfaceBindingInput,
  telegramRemoteSurfaceBindingRevokeInput,
  telegramRemoteSurfaceBindingText,
  type TelegramRemoteSurfaceBindingPlan,
  type TelegramRemoteSurfaceBindingToolInput,
} from "../../telegramRemoteSurfaceBinding";

const TELEGRAM_PROVIDER_ID = "telegram-tdlib";

export interface TelegramRemoteSurfacePlanForParamsResult {
  input: TelegramRemoteSurfaceBindingToolInput;
  plan: TelegramRemoteSurfaceBindingPlan;
}

export interface TelegramRemoteSurfacePlanBindingsLike {
  previewCreate(input: MessagingBindingCreateInput): MessagingBindingLifecyclePreview;
  previewRevoke(input: MessagingBindingRevokeInput): MessagingBindingLifecyclePreview;
}

export interface TelegramRemoteSurfacePlanGatewayRunnerLike {
  refreshProviderReadiness(providerId: string): Promise<unknown>;
  runtimeStatus(): { providers: MessagingGatewayAdapterRuntimeStatus[] };
}

export interface TelegramRemoteSurfacePlanOptions {
  bindings: TelegramRemoteSurfacePlanBindingsLike;
  gatewayRunner: TelegramRemoteSurfacePlanGatewayRunnerLike;
}

export interface TelegramRemoteSurfacePlanResolvers {
  planForInput: (input: TelegramRemoteSurfaceBindingToolInput) => Promise<TelegramRemoteSurfaceBindingPlan>;
  planForParams: (params: unknown) => Promise<TelegramRemoteSurfacePlanForParamsResult>;
}

export interface TelegramRemoteSurfaceBindingsLike {
  create(input: MessagingBindingCreateInput): MessagingBindingLifecycleResult;
  revoke(input: MessagingBindingRevokeInput): MessagingBindingLifecycleResult;
}

export interface TelegramRemoteSurfaceToolPermissionRequest {
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

export interface TelegramRemoteSurfaceToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: TelegramRemoteSurfaceToolPermissionRequest) => Promise<boolean>;
  bindings: TelegramRemoteSurfaceBindingsLike;
  planForParams: (params: unknown) => Promise<TelegramRemoteSurfacePlanForParamsResult>;
}

export function registerTelegramRemoteSurfaceTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: TelegramRemoteSurfaceToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    bindings,
    planForParams,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_remote_surface_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { plan } = await planForParams(params);
      const { status: bindingSetupStatus, ...planDetails } = plan;
      return {
        content: [{ type: "text", text: telegramRemoteSurfaceBindingText(plan) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_remote_surface_preview",
          status: bindingSetupStatus,
          bindingSetupStatus,
          ...planDetails,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_telegram_remote_surface_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const { input, plan } = await planForParams(params);
      if (!plan.canApplyNow) {
        const result = telegramRemoteSurfaceBindingBlockedResult(plan);
        const { status: bindingSetupStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramRemoteSurfaceBindingText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_remote_surface_apply",
            status: "blocked",
            bindingSetupStatus,
            ...resultDetails,
          },
        };
      }
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_telegram_remote_surface_apply",
        title: input.action === "revoke" ? "Revoke Telegram Remote Ambient Surface binding?" : "Create Telegram Remote Ambient Surface binding?",
        message: input.action === "revoke"
          ? `Revoke Telegram Remote Ambient Surface binding ${plan.lifecycle.binding.id}.`
          : `Bind Telegram conversation ${plan.lifecycle.binding.conversationId} to Ambient ${plan.lifecycle.binding.ambientSurface}.`,
        detail: telegramRemoteSurfaceBindingApprovalDetail(plan),
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: `telegram-remote-surface:${input.action}:${plan.lifecycle.binding.id}`,
        grantTargetIdentity: `${plan.lifecycle.binding.providerId}:${plan.lifecycle.binding.purpose}:${input.action}:${plan.lifecycle.binding.conversationId}:${plan.lifecycle.binding.id}`,
        allowedReason: "User approved Telegram Remote Ambient Surface binding mutation.",
        deniedReason: "User denied Telegram Remote Ambient Surface binding mutation.",
      });
      if (!allowed) {
        const result = telegramRemoteSurfaceBindingDeniedResult(plan);
        const { status: bindingSetupStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: telegramRemoteSurfaceBindingText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_telegram_remote_surface_apply",
            status: "denied",
            bindingSetupStatus,
            ...resultDetails,
          },
        };
      }
      const lifecycle = input.action === "revoke"
        ? bindings.revoke(telegramRemoteSurfaceBindingRevokeInput(input))
        : bindings.create(telegramRemoteSurfaceBindingCreateInput(input));
      const result = telegramRemoteSurfaceBindingAppliedResult(plan, lifecycle);
      const { status: bindingSetupStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: telegramRemoteSurfaceBindingText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_telegram_remote_surface_apply",
          status: result.applyStatus,
          bindingSetupStatus,
          ...resultDetails,
        },
      };
    },
  });
}

export function createTelegramRemoteSurfacePlanResolvers(
  options: TelegramRemoteSurfacePlanOptions,
): TelegramRemoteSurfacePlanResolvers {
  return {
    planForInput: (input) => telegramRemoteSurfacePlanForInput(input, options),
    planForParams: (params) => telegramRemoteSurfacePlanForParams(params, options),
  };
}

export async function telegramRemoteSurfacePlanForInput(
  input: TelegramRemoteSurfaceBindingToolInput,
  options: TelegramRemoteSurfacePlanOptions,
): Promise<TelegramRemoteSurfaceBindingPlan> {
  await options.gatewayRunner.refreshProviderReadiness(TELEGRAM_PROVIDER_ID).catch(() => undefined);
  const runtimeProvider = options.gatewayRunner.runtimeStatus().providers.find((provider) => provider.providerId === TELEGRAM_PROVIDER_ID);
  const readiness = runtimeProvider?.readiness;
  const lifecycle = input.action === "revoke"
    ? options.bindings.previewRevoke(telegramRemoteSurfaceBindingRevokeInput(input))
    : options.bindings.previewCreate(telegramRemoteSurfaceBindingCreateInput(input));
  return buildTelegramRemoteSurfaceBindingPlan({
    toolInput: input,
    lifecycle,
    readiness,
    runtimeProvider,
  });
}

export async function telegramRemoteSurfacePlanForParams(
  params: unknown,
  options: TelegramRemoteSurfacePlanOptions,
): Promise<TelegramRemoteSurfacePlanForParamsResult> {
  const input = telegramRemoteSurfacePlanInput(params);
  const plan = await telegramRemoteSurfacePlanForInput(input, options);
  return { input, plan };
}

export function telegramRemoteSurfacePlanInput(params: unknown): TelegramRemoteSurfaceBindingToolInput {
  return telegramRemoteSurfaceBindingInput(params);
}
