import type {
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
} from "../../../shared/messagingGateway";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  applyTelegramBridgeReply,
  buildTelegramBridgeReplyPreview,
  telegramBridgeReplyApprovalDetail,
  telegramBridgeReplyInput,
  type TelegramBridgeReplyPreview,
  type TelegramBridgeReplyResult,
} from "../agentRuntimeTelegramFacade";

type TelegramBridgeReplyFetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface TelegramBridgeReplyBindingsLike {
  list(input: { includeInactive: false }): MessagingBindingListResult;
}

export interface TelegramBridgeReplyPreviewOptions {
  bindings: Pick<TelegramBridgeReplyBindingsLike, "list">;
  gatewayRuntimeStatus: () => MessagingGatewayRuntimeStatus;
}

export interface TelegramBridgeReplyApplyOptions extends TelegramBridgeReplyPreviewOptions {
  requestApproval: (preview: TelegramBridgeReplyPreview) => Promise<boolean>;
  onResult?: (result: TelegramBridgeReplyResult) => void;
  env?: Record<string, string | undefined>;
  fetchFn?: TelegramBridgeReplyFetchLike;
  now?: () => Date;
}

export interface TelegramBridgeReplyResolvers {
  previewForParams: (params: unknown) => TelegramBridgeReplyPreview;
  applyForParams: (params: unknown) => Promise<TelegramBridgeReplyResult>;
}

export interface TelegramBridgeReplyApprovalRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk: PermissionRisk;
  reusableScopes: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity: string;
  allowedReason: string;
  deniedReason: string;
}

export function telegramBridgeReplyPreviewForParams(
  params: unknown,
  options: TelegramBridgeReplyPreviewOptions,
): TelegramBridgeReplyPreview {
  return buildTelegramBridgeReplyPreview({
    toolInput: telegramBridgeReplyInput(params),
    bindings: options.bindings.list({ includeInactive: false }),
    runtimeStatus: options.gatewayRuntimeStatus(),
  });
}

export function createTelegramBridgeReplyResolvers(
  options: TelegramBridgeReplyApplyOptions,
): TelegramBridgeReplyResolvers {
  return {
    previewForParams: (params) => telegramBridgeReplyPreviewForParams(params, options),
    applyForParams: (params) => applyTelegramBridgeReplyForParams(params, options),
  };
}

export function telegramBridgeReplyApprovalRequest(input: {
  preview: TelegramBridgeReplyPreview;
  thread: ThreadSummary;
  workspace: WorkspaceState;
}): TelegramBridgeReplyApprovalRequest {
  const { preview } = input;
  return {
    thread: input.thread,
    workspace: input.workspace,
    toolName: "ambient_messaging_telegram_bridge_reply_apply",
    title: "Send Telegram Remote Ambient Surface reply?",
    message: `Send one Telegram reply to conversation ${preview.queuedProjection?.conversationId ?? preview.binding?.conversationId ?? "unknown"}.`,
    detail: telegramBridgeReplyApprovalDetail(preview),
    risk: "plugin-tool",
    reusableScopes: ["thread"],
    grantTargetLabel: `telegram-bridge-reply:${preview.queuedProjectionId}`,
    grantTargetIdentity: `${preview.providerId}:${preview.queuedProjectionId}:${preview.textLength}:${preview.textPreview}`,
    allowedReason: "User approved Telegram Remote Ambient Surface reply.",
    deniedReason: "User denied Telegram Remote Ambient Surface reply.",
  };
}

export async function applyTelegramBridgeReplyForParams(
  params: unknown,
  options: TelegramBridgeReplyApplyOptions,
): Promise<TelegramBridgeReplyResult> {
  const preview = telegramBridgeReplyPreviewForParams(params, options);
  const approvalRecorded = preview.canApplyNow
    ? await options.requestApproval(preview)
    : false;
  const result = await applyTelegramBridgeReply({
    preview,
    approvalRecorded,
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  options.onResult?.(result);
  return result;
}
