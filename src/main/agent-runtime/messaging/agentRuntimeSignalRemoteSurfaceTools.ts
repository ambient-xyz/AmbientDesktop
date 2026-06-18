import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingCreateInput,
  MessagingBindingLifecycleResult,
  MessagingBindingListResult,
  MessagingBindingRevokeInput,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../../../shared/messagingGateway";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { messagingGatewayToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import type {
  SignalRemoteSurfaceBindingInput,
  SignalRemoteSurfaceBindingPlan,
  SignalRemoteSurfaceBindingRevokeInput,
  SignalRemoteSurfaceBindingRevokePlan,
} from "../signal/signalRemoteSurfaceBinding";
import {
  buildSignalRemoteSurfaceBindingPlan,
  buildSignalRemoteSurfaceBindingRevokePlan,
  signalRemoteSurfaceBindingAppliedResult,
  signalRemoteSurfaceBindingAction,
  signalRemoteSurfaceBindingBlockedResult,
  signalRemoteSurfaceBindingCreateInput,
  signalRemoteSurfaceBindingDeniedResult,
  signalRemoteSurfaceBindingRevokeBlockedResult,
  signalRemoteSurfaceBindingRevokeDeniedResult,
  signalRemoteSurfaceBindingRevokeInputForStore,
  signalRemoteSurfaceBindingRevokeText,
  signalRemoteSurfaceBindingRevokedResult,
  signalRemoteSurfaceBindingInput,
  signalRemoteSurfaceBindingRevokeInput,
  signalRemoteSurfaceBindingText,
} from "../signal/signalRemoteSurfaceBinding";

const SIGNAL_PROVIDER_ID = "signal-cli";

export interface SignalRemoteSurfaceCreatePlanForParamsResult {
  input: SignalRemoteSurfaceBindingInput;
  plan: SignalRemoteSurfaceBindingPlan;
}

export interface SignalRemoteSurfaceRevokePlanForParamsResult {
  input: SignalRemoteSurfaceBindingRevokeInput;
  plan: SignalRemoteSurfaceBindingRevokePlan;
}

export interface SignalRemoteSurfacePlanBindingsLike {
  list(input: { includeInactive: true }): MessagingBindingListResult;
}

export interface SignalRemoteSurfacePlanGatewayRunnerLike {
  refreshProviderReadiness(providerId: string): Promise<unknown>;
  runtimeStatus(): MessagingGatewayRuntimeStatus;
}

export interface SignalRemoteSurfaceCreatePlanOptions {
  bindings: SignalRemoteSurfacePlanBindingsLike;
  gatewayRunner: SignalRemoteSurfacePlanGatewayRunnerLike;
  signalDescriptor?: () => MessagingProviderDescriptor | undefined;
  now?: () => Date;
}

export interface SignalRemoteSurfaceRevokePlanOptions {
  bindings: SignalRemoteSurfacePlanBindingsLike;
  signalDescriptor?: () => MessagingProviderDescriptor | undefined;
}

export interface SignalRemoteSurfacePlanResolversOptions extends SignalRemoteSurfaceCreatePlanOptions {
  bindings: SignalRemoteSurfacePlanBindingsLike;
}

export interface SignalRemoteSurfacePlanResolvers {
  createPlanForParams: (params: unknown) => Promise<SignalRemoteSurfaceCreatePlanForParamsResult>;
  revokePlanForParams: (params: unknown) => Promise<SignalRemoteSurfaceRevokePlanForParamsResult>;
}

export interface SignalRemoteSurfaceBindingsLike {
  create(input: MessagingBindingCreateInput): MessagingBindingLifecycleResult;
  revoke(input: MessagingBindingRevokeInput): MessagingBindingLifecycleResult;
}

export interface SignalRemoteSurfaceToolPermissionRequest {
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

export interface SignalRemoteSurfaceToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: SignalRemoteSurfaceToolPermissionRequest) => Promise<boolean>;
  bindings: SignalRemoteSurfaceBindingsLike;
  createPlanForParams: (params: unknown) => Promise<SignalRemoteSurfaceCreatePlanForParamsResult>;
  revokePlanForParams: (params: unknown) => Promise<SignalRemoteSurfaceRevokePlanForParamsResult>;
}

export function registerSignalRemoteSurfaceTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: SignalRemoteSurfaceToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    bindings,
    createPlanForParams,
    revokePlanForParams,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_remote_surface_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      if (signalRemoteSurfaceBindingAction(params) === "revoke") {
        const { plan } = await revokePlanForParams(params);
        const { status: bindingSetupStatus, ...planDetails } = plan;
        return {
          content: [{ type: "text", text: signalRemoteSurfaceBindingRevokeText(plan) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_remote_surface_preview",
            status: bindingSetupStatus,
            bindingSetupStatus,
            ...planDetails,
          } as any,
        };
      }
      const { plan } = await createPlanForParams(params);
      const { status: bindingSetupStatus, ...planDetails } = plan;
      return {
        content: [{ type: "text", text: signalRemoteSurfaceBindingText(plan) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_remote_surface_preview",
          status: bindingSetupStatus,
          bindingSetupStatus,
          ...planDetails,
        } as any,
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_signal_remote_surface_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      if (signalRemoteSurfaceBindingAction(params) === "revoke") {
        const { input, plan } = await revokePlanForParams(params);
        let result = signalRemoteSurfaceBindingRevokeBlockedResult(plan);
        if (plan.canApplyNow) {
          const allowed = await resolveFirstPartyPluginPermission({
            thread: getThread(threadId),
            workspace,
            toolName: "ambient_messaging_signal_remote_surface_apply",
            title: "Revoke Signal Remote Ambient Surface binding?",
            message: `Revoke Signal Remote Ambient Surface binding ${plan.bindingId}.`,
            detail: [
              `Binding: ${plan.bindingId}`,
              `Provider: ${plan.providerLabel} (${plan.providerId})`,
              plan.targetBinding ? `Profile: ${plan.targetBinding.authProfileId}` : undefined,
              plan.targetBinding ? `Conversation: ${plan.targetBinding.conversationId}` : undefined,
              plan.targetBinding?.ownerUserId ? `Owner user: ${plan.targetBinding.ownerUserId}` : undefined,
              plan.reason ? `Reason: ${plan.reason}` : undefined,
              "This revokes Ambient binding metadata only. It does not start Signal, stop Signal, read Signal messages, poll unread windows, or send Signal replies.",
              "Generic ambient_messaging_binding_apply remains invalid for Signal.",
              ...plan.policyNotes,
            ].filter((line): line is string => line !== undefined).join("\n"),
            risk: "plugin-tool",
            reusableScopes: ["thread", "project", "workspace"],
            grantTargetLabel: `ambient-messaging-signal-remote-surface-revoke:${plan.bindingId}`,
            grantTargetIdentity: `${plan.providerId}:${plan.bindingId}:revoke`,
            allowedReason: "User approved Signal Remote Ambient Surface binding revoke.",
            deniedReason: "User denied Signal Remote Ambient Surface binding revoke.",
          });
          if (allowed) {
            const lifecycle = bindings.revoke(signalRemoteSurfaceBindingRevokeInputForStore(input));
            result = signalRemoteSurfaceBindingRevokedResult(plan, lifecycle);
          } else {
            result = signalRemoteSurfaceBindingRevokeDeniedResult(plan);
          }
        }
        const { status: bindingSetupStatus, ...resultDetails } = result;
        return {
          content: [{ type: "text", text: signalRemoteSurfaceBindingRevokeText(result) }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_signal_remote_surface_apply",
            status: result.applyStatus,
            bindingSetupStatus,
            ...resultDetails,
          } as any,
        };
      }
      const { input, plan } = await createPlanForParams(params);
      let result = signalRemoteSurfaceBindingBlockedResult(plan);
      if (plan.canApplyNow) {
        const allowed = await resolveFirstPartyPluginPermission({
          thread: getThread(threadId),
          workspace,
          toolName: "ambient_messaging_signal_remote_surface_apply",
          title: "Create Signal Remote Ambient Surface binding?",
          message: `Create a Signal Remote Ambient Surface binding for ${plan.conversationId}.`,
          detail: [
            `Binding: ${plan.futureBinding.id}`,
            `Provider: ${plan.providerLabel} (${plan.providerId})`,
            `Profile: ${plan.profileId}`,
            `Conversation: ${plan.conversationId}`,
            `Owner user: ${plan.ownerUserId}`,
            `Owner handoff source message: ${plan.ownerHandoffSourceMessageId}`,
            `Initial seen message ids: ${plan.initialSeenMessageCount}`,
            `Ambient surface: ${plan.ambientSurface}`,
            `Max disclosure: ${plan.maxDisclosureLabel}`,
            "This persists binding metadata only. It does not start Signal, read Signal messages, poll unread windows, or send Signal replies.",
            "Generic ambient_messaging_binding_apply remains invalid for Signal.",
            ...plan.policyNotes,
          ].join("\n"),
          risk: "plugin-tool",
          reusableScopes: ["thread", "project", "workspace"],
          grantTargetLabel: `ambient-messaging-signal-remote-surface:${plan.profileId}:${plan.conversationId}`,
          grantTargetIdentity: `${plan.providerId}:${plan.profileId}:${plan.conversationId}:${plan.futureBinding.id}`,
          allowedReason: "User approved Signal Remote Ambient Surface binding metadata persistence.",
          deniedReason: "User denied Signal Remote Ambient Surface binding metadata persistence.",
        });
        if (allowed) {
          const lifecycle = bindings.create(signalRemoteSurfaceBindingCreateInput(input));
          result = signalRemoteSurfaceBindingAppliedResult(plan, lifecycle);
        } else {
          result = signalRemoteSurfaceBindingDeniedResult(plan);
        }
      }
      const { status: bindingSetupStatus, ...resultDetails } = result;
      return {
        content: [{ type: "text", text: signalRemoteSurfaceBindingText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_signal_remote_surface_apply",
          status: result.applyStatus,
          bindingSetupStatus,
          ...resultDetails,
        } as any,
      };
    },
  });
}

export function createSignalRemoteSurfacePlanResolvers(
  options: SignalRemoteSurfacePlanResolversOptions,
): SignalRemoteSurfacePlanResolvers {
  return {
    createPlanForParams: (params) => signalRemoteSurfaceCreatePlanForParams(params, options),
    revokePlanForParams: (params) => signalRemoteSurfaceRevokePlanForParams(params, options),
  };
}

export async function signalRemoteSurfaceCreatePlanForParams(
  params: unknown,
  options: SignalRemoteSurfaceCreatePlanOptions,
): Promise<SignalRemoteSurfaceCreatePlanForParamsResult> {
  const input = signalRemoteSurfaceBindingInput(params);
  await options.gatewayRunner.refreshProviderReadiness(SIGNAL_PROVIDER_ID).catch(() => undefined);
  return {
    input,
    plan: buildSignalRemoteSurfaceBindingPlan({
      toolInput: input,
      bindings: options.bindings.list({ includeInactive: true }),
      runtimeStatus: options.gatewayRunner.runtimeStatus(),
      descriptor: options.signalDescriptor?.(),
      ...(options.now ? { now: options.now } : {}),
    }),
  };
}

export async function signalRemoteSurfaceRevokePlanForParams(
  params: unknown,
  options: SignalRemoteSurfaceRevokePlanOptions,
): Promise<SignalRemoteSurfaceRevokePlanForParamsResult> {
  const input = signalRemoteSurfaceBindingRevokeInput(params);
  return {
    input,
    plan: buildSignalRemoteSurfaceBindingRevokePlan({
      toolInput: input,
      bindings: options.bindings.list({ includeInactive: true }),
      descriptor: options.signalDescriptor?.(),
    }),
  };
}
