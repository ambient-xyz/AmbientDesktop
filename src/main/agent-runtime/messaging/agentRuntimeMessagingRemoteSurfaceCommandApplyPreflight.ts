import {
  messagingRemoteSurfaceCommandApprovalDetail,
  messagingRemoteSurfaceCommandBlockedResult,
  messagingRemoteSurfaceCommandDeniedResult,
  type MessagingRemoteSurfaceCommandPreview,
} from "../agentRuntimeMessagingFacade";
import { messagingRemoteSurfaceCommandApplyToolResponse } from "./agentRuntimeMessagingRemoteSurfaceCommandApplyResult";

export interface MessagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace> {
  thread: TThread;
  workspace: TWorkspace;
  toolName: "ambient_messaging_remote_surface_command_apply";
  title: string;
  message: string;
  detail: string;
  risk: "plugin-tool";
  reusableScopes: ["thread"];
  grantTargetLabel: string;
  grantTargetIdentity: string;
  allowedReason: string;
  deniedReason: string;
}

export type MessagingRemoteSurfaceCommandApplyPreflightResult =
  | {
      status: "blocked" | "denied";
      approvalRecorded: false;
      response: ReturnType<typeof messagingRemoteSurfaceCommandApplyToolResponse>;
    }
  | {
      status: "ready";
      approvalRecorded: boolean;
    };

export interface MessagingRemoteSurfaceCommandApplyPreflightOptions<TThread, TWorkspace> {
  preview: MessagingRemoteSurfaceCommandPreview;
  getThread: () => TThread;
  workspace: TWorkspace;
  resolveFirstPartyPluginPermission: (
    request: MessagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace>,
  ) => Promise<boolean> | boolean;
}

export async function messagingRemoteSurfaceCommandApplyPreflight<TThread, TWorkspace>(
  input: MessagingRemoteSurfaceCommandApplyPreflightOptions<TThread, TWorkspace>,
): Promise<MessagingRemoteSurfaceCommandApplyPreflightResult> {
  const { preview } = input;
  if (!preview.canApplyNow) {
    const result = messagingRemoteSurfaceCommandBlockedResult(preview);
    return {
      status: "blocked",
      approvalRecorded: false,
      response: messagingRemoteSurfaceCommandApplyToolResponse(result),
    };
  }
  if (!preview.approvalRequired) {
    return {
      status: "ready",
      approvalRecorded: false,
    };
  }
  const allowed = await input.resolveFirstPartyPluginPermission(
    messagingRemoteSurfaceCommandApplyPermissionRequest({
      thread: input.getThread(),
      workspace: input.workspace,
      preview,
    }),
  );
  if (!allowed) {
    const result = messagingRemoteSurfaceCommandDeniedResult(preview);
    return {
      status: "denied",
      approvalRecorded: false,
      response: messagingRemoteSurfaceCommandApplyToolResponse(result),
    };
  }
  return {
    status: "ready",
    approvalRecorded: true,
  };
}

export function messagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace>(input: {
  thread: TThread;
  workspace: TWorkspace;
  preview: MessagingRemoteSurfaceCommandPreview;
}): MessagingRemoteSurfaceCommandApplyPermissionRequest<TThread, TWorkspace> {
  const { thread, workspace, preview } = input;
  return {
    thread,
    workspace,
    toolName: "ambient_messaging_remote_surface_command_apply",
    title: "Apply Remote Ambient Surface command?",
    message: `Apply ${preview.commandKind} from queued projection ${preview.queuedProjectionId}.`,
    detail: messagingRemoteSurfaceCommandApprovalDetail(preview),
    risk: "plugin-tool",
    reusableScopes: ["thread"],
    grantTargetLabel: `remote-surface-command:${preview.queuedProjectionId}`,
    grantTargetIdentity: `${preview.queuedProjectionId}:${preview.commandKind}:${preview.textPreview}`,
    allowedReason: "User approved Remote Ambient Surface command apply.",
    deniedReason: "User denied Remote Ambient Surface command apply.",
  };
}
