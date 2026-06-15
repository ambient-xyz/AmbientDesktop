import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  MessagingBindingCreateInput,
  MessagingBindingRevokeInput,
} from "../shared/messagingGateway";
import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import { messagingGatewayToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  bindingLifecyclePreviewText,
  messagingBindingListText,
  type MessagingBindingStore,
} from "./messagingBindings";

type MessagingBindingLifecycleToolInput =
  | { action: "create"; create: MessagingBindingCreateInput }
  | { action: "revoke"; revoke: MessagingBindingRevokeInput };

export interface MessagingBindingToolPermissionRequest {
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

export interface MessagingBindingToolRegistrationOptions {
  threadId: string;
  workspace: WorkspaceState;
  getThread: (threadId: string) => ThreadSummary;
  resolveFirstPartyPluginPermission: (input: MessagingBindingToolPermissionRequest) => Promise<boolean>;
  bindings: MessagingBindingStore;
}

export function registerMessagingBindingTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: MessagingBindingToolRegistrationOptions,
): void {
  const {
    threadId,
    workspace,
    getThread,
    resolveFirstPartyPluginPermission,
    bindings,
  } = options;

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_list_bindings"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = params as { providerId?: string; purpose?: "remote_ambient_surface" | "messaging_connector"; includeInactive?: boolean };
      const result = bindings.list({
        providerId: typeof input?.providerId === "string" ? input.providerId : undefined,
        purpose: input?.purpose,
        includeInactive: input?.includeInactive === true,
      });
      return {
        content: [{ type: "text", text: messagingBindingListText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_list_bindings",
          status: "complete",
          ...result,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_binding_preview"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingBindingLifecycleInput(params);
      const signalGenericBlock = signalGenericBindingBlock(input, bindings);
      if (signalGenericBlock) {
        return {
          content: [{ type: "text", text: signalGenericBlock.text }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_binding_preview",
            status: "blocked",
            ...signalGenericBlock.details,
          } as any,
        };
      }
      const preview = input.action === "revoke"
        ? bindings.previewRevoke(input.revoke)
        : bindings.previewCreate(input.create);
      return {
        content: [{ type: "text", text: bindingLifecyclePreviewText(preview) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_binding_preview",
          status: "complete",
          ...preview,
        },
      };
    },
  });

  registerDesktopTool(pi, messagingGatewayToolDescriptor("ambient_messaging_binding_apply"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params) => {
      const input = messagingBindingLifecycleInput(params);
      const signalGenericBlock = signalGenericBindingBlock(input, bindings);
      if (signalGenericBlock) {
        return {
          content: [{ type: "text", text: signalGenericBlock.text }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_binding_apply",
            status: "blocked",
            ...signalGenericBlock.details,
          } as any,
        };
      }
      const preview = input.action === "revoke"
        ? bindings.previewRevoke(input.revoke)
        : bindings.previewCreate(input.create);
      const allowed = await resolveFirstPartyPluginPermission({
        thread: getThread(threadId),
        workspace,
        toolName: "ambient_messaging_binding_apply",
        title: input.action === "revoke" ? "Revoke messaging binding?" : "Create messaging binding?",
        message: input.action === "revoke"
          ? `Revoke messaging binding ${preview.binding.id}.`
          : `Create ${preview.binding.purpose} binding for ${preview.binding.providerId}.`,
        detail: [
          `Binding: ${preview.binding.id}`,
          `Provider: ${preview.binding.providerId}`,
          `Purpose: ${preview.binding.purpose}`,
          `Conversation: ${preview.binding.conversationId}`,
          `State path: ${preview.statePath}`,
          "This does not start provider bridges, read provider messages, or send provider messages.",
          ...preview.policyNotes,
        ].join("\n"),
        risk: "plugin-tool",
        reusableScopes: ["thread", "project", "workspace"],
        grantTargetLabel: `ambient-messaging-binding:${preview.binding.providerId}:${preview.binding.purpose}`,
        grantTargetIdentity: `${preview.binding.providerId}:${preview.binding.purpose}:${preview.binding.conversationId}:${preview.binding.id}`,
        allowedReason: "User approved messaging binding lifecycle mutation.",
        deniedReason: "User denied messaging binding lifecycle mutation.",
      });
      if (!allowed) {
        return {
          content: [{ type: "text", text: "Messaging binding change was not applied because approval was denied." }],
          details: {
            runtime: "ambient-messaging-gateway",
            toolName: "ambient_messaging_binding_apply",
            status: "denied",
            ...preview,
          },
        };
      }
      const result = input.action === "revoke"
        ? bindings.revoke(input.revoke)
        : bindings.create(input.create);
      return {
        content: [{ type: "text", text: bindingLifecyclePreviewText(result) }],
        details: {
          runtime: "ambient-messaging-gateway",
          toolName: "ambient_messaging_binding_apply",
          status: "complete",
          ...result,
        },
      };
    },
  });
}

function signalGenericBindingBlock(
  input: MessagingBindingLifecycleToolInput,
  bindings: MessagingBindingStore,
): { text: string; details: Record<string, unknown> } | undefined {
  let signalProviderId: string | undefined;
  let purpose: string | undefined;
  let conversationId: string | undefined;
  let bindingId: string | undefined;
  if (input.action === "create" && input.create.providerId === "signal-cli") {
    signalProviderId = input.create.providerId;
    purpose = input.create.purpose;
    conversationId = input.create.conversationId;
  }
  if (input.action === "revoke") {
    const existing = bindings.list({ includeInactive: true }).bindings.find((binding) => binding.id === input.revoke.bindingId);
    if (existing?.providerId === "signal-cli") {
      signalProviderId = existing.providerId;
      purpose = existing.purpose;
      conversationId = existing.conversationId;
      bindingId = existing.id;
    }
  }
  if (signalProviderId !== "signal-cli") return undefined;
  const text = [
    "Generic Signal messaging binding lifecycle is blocked.",
    `Action: ${input.action}`,
    `Provider: ${signalProviderId}`,
    purpose ? `Purpose: ${purpose}` : undefined,
    conversationId ? `Conversation: ${conversationId}` : undefined,
    bindingId ? `Binding: ${bindingId}` : undefined,
    "",
    "Use ambient_messaging_signal_remote_surface_preview/apply for Signal Remote Ambient Surface creation after matched owner handoff metadata.",
    "Generic ambient_messaging_binding_apply remains invalid for Signal because Signal requires typed owner-handoff metadata, initial seen message ids for dedupe, and reviewed Signal-specific readiness gates.",
    "No approval was requested, no binding metadata was changed, no Signal bridge was started, no Signal messages were read, and no Signal replies were sent.",
  ].filter((line): line is string => line !== undefined).join("\n");
  return {
    text,
    details: {
      action: input.action,
      providerId: signalProviderId,
      purpose,
      conversationId,
      bindingId,
      genericBindingApplyAllowed: false,
      typedPreviewTool: "ambient_messaging_signal_remote_surface_preview",
      typedApplyTool: "ambient_messaging_signal_remote_surface_apply",
      approvalRequested: false,
      persisted: false,
    },
  };
}

function messagingBindingLifecycleInput(params: unknown): MessagingBindingLifecycleToolInput {
  const raw = params as Record<string, unknown> | undefined;
  const action = optionalString(raw?.action);
  if (action === "revoke") {
    const bindingId = optionalString(raw?.bindingId);
    if (!bindingId) throw new Error("bindingId is required when action=revoke.");
    return { action, revoke: { bindingId, reason: optionalString(raw?.reason) } };
  }
  if (action !== "create") throw new Error("action must be create or revoke.");

  const providerId = optionalString(raw?.providerId);
  const authProfileId = optionalString(raw?.authProfileId);
  const conversationId = optionalString(raw?.conversationId);
  const purpose = optionalString(raw?.purpose);
  if (!providerId) throw new Error("providerId is required when action=create.");
  if (!authProfileId) throw new Error("authProfileId is required when action=create.");
  if (!conversationId) throw new Error("conversationId is required when action=create.");
  if (purpose !== "remote_ambient_surface" && purpose !== "messaging_connector") {
    throw new Error("purpose must be remote_ambient_surface or messaging_connector when action=create.");
  }

  const ambientSurface = optionalString(raw?.ambientSurface);
  if (ambientSurface && !["chat", "projects", "workflow_agents", "settings", "notifications"].includes(ambientSurface)) {
    throw new Error("ambientSurface must be chat, projects, workflow_agents, settings, or notifications.");
  }
  const externalTrustClass = optionalString(raw?.externalTrustClass);
  if (externalTrustClass && !["owner", "delegate", "external"].includes(externalTrustClass)) {
    throw new Error("externalTrustClass must be owner, delegate, or external.");
  }

  return {
    action,
    create: {
      providerId,
      authProfileId,
      conversationId,
      purpose,
      threadId: optionalString(raw?.threadId),
      ownerUserId: optionalString(raw?.ownerUserId),
      projectId: optionalString(raw?.projectId),
      workflowId: optionalString(raw?.workflowId),
      ambientSurface: ambientSurface as MessagingBindingCreateInput["ambientSurface"],
      externalTrustClass: externalTrustClass as MessagingBindingCreateInput["externalTrustClass"],
      permissionProfileId: optionalString(raw?.permissionProfileId),
      guardProfileId: optionalString(raw?.guardProfileId),
      maxDisclosureLabel: optionalString(raw?.maxDisclosureLabel),
    },
  };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
