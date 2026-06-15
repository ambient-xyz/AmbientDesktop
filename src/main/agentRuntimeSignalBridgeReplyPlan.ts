import type {
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  MessagingProviderDescriptor,
} from "../shared/messagingGateway";
import type {
  PermissionGrantScopeKind,
  PermissionRisk,
  ThreadSummary,
  WorkspaceState,
} from "../shared/types";
import {
  applySignalBridgeReply,
  buildSignalBridgeReplyPreview,
  signalBridgeReplyApprovalDetail,
  signalBridgeReplyInput,
  type SignalBridgeReplyInput,
  type SignalBridgeReplyPreview,
  type SignalBridgeReplyResult,
} from "./signalBridgeReply";

const SIGNAL_PROVIDER_ID = "signal-cli";

type SignalBridgeReplyFetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface SignalBridgeReplyPreviewForParamsResult {
  input: SignalBridgeReplyInput;
  preview: SignalBridgeReplyPreview;
}

export interface SignalBridgeReplyBindingsLike {
  list(input: { includeInactive: false }): MessagingBindingListResult;
}

export interface SignalBridgeReplyPreviewOptions {
  bindings: Pick<SignalBridgeReplyBindingsLike, "list">;
  refreshProviderReadiness: (providerId: string) => Promise<unknown>;
  gatewayRuntimeStatus: () => MessagingGatewayRuntimeStatus;
  signalDescriptor?: () => MessagingProviderDescriptor | undefined;
}

export interface SignalBridgeReplyApplyOptions extends SignalBridgeReplyPreviewOptions {
  requestApproval: (preview: SignalBridgeReplyPreview) => Promise<boolean>;
  onResult?: (result: SignalBridgeReplyResult) => void;
  env?: Record<string, string | undefined>;
  fetchFn?: SignalBridgeReplyFetchLike;
  now?: () => Date;
}

export interface SignalBridgeReplyResolvers {
  previewForParams: (params: unknown) => Promise<SignalBridgeReplyPreviewForParamsResult>;
  applyForParams: (params: unknown) => Promise<SignalBridgeReplyResult>;
}

export interface SignalBridgeReplyApprovalRequest {
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

export async function signalBridgeReplyPreviewForParams(
  params: unknown,
  options: SignalBridgeReplyPreviewOptions,
): Promise<SignalBridgeReplyPreviewForParamsResult> {
  const input = signalBridgeReplyInput(params);
  await options.refreshProviderReadiness(SIGNAL_PROVIDER_ID).catch(() => undefined);
  return {
    input,
    preview: buildSignalBridgeReplyPreview({
      toolInput: input,
      bindings: options.bindings.list({ includeInactive: false }),
      runtimeStatus: options.gatewayRuntimeStatus(),
      descriptor: options.signalDescriptor?.(),
    }),
  };
}

export function createSignalBridgeReplyResolvers(
  options: SignalBridgeReplyApplyOptions,
): SignalBridgeReplyResolvers {
  return {
    previewForParams: (params) => signalBridgeReplyPreviewForParams(params, options),
    applyForParams: (params) => applySignalBridgeReplyForParams(params, options),
  };
}

export function signalBridgeReplyApprovalRequest(input: {
  preview: SignalBridgeReplyPreview;
  thread: ThreadSummary;
  workspace: WorkspaceState;
}): SignalBridgeReplyApprovalRequest {
  const { preview } = input;
  return {
    thread: input.thread,
    workspace: input.workspace,
    toolName: "ambient_messaging_signal_bridge_reply_apply",
    title: "Send Signal reply?",
    message: `Send one Signal reply through the reviewed bridge for binding ${preview.bindingId ?? "unknown"}.`,
    detail: signalBridgeReplyApprovalDetail(preview),
    risk: "plugin-tool",
    reusableScopes: ["thread"],
    grantTargetLabel: `signal-bridge-reply:${preview.bindingId ?? "unknown"}`,
    grantTargetIdentity: [
      preview.providerId,
      preview.bindingId ?? "unknown",
      preview.profileId ?? "unknown",
      preview.conversationId ?? "unknown",
      preview.replyToMessageId ?? "unknown",
      String(preview.textLength),
      preview.textPreview,
    ].join(":"),
    allowedReason: "User approved Signal bridge reply send.",
    deniedReason: "User denied Signal bridge reply send.",
  };
}

export async function applySignalBridgeReplyForParams(
  params: unknown,
  options: SignalBridgeReplyApplyOptions,
): Promise<SignalBridgeReplyResult> {
  const { preview } = await signalBridgeReplyPreviewForParams(params, options);
  const approvalRecorded = preview.canApplyNow
    ? await options.requestApproval(preview)
    : false;
  const result = await applySignalBridgeReply({
    preview,
    approvalRecorded,
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  options.onResult?.(result);
  return result;
}
