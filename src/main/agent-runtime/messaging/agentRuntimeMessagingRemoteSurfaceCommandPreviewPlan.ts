import type {
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  RuntimeSurfaceSnapshot,
} from "../../../shared/messagingGateway";
import {
  buildMessagingRemoteSurfaceCommandPreview,
  messagingRemoteSurfaceCommandInput,
  type MessagingRemoteSurfaceCommandPreview,
} from "../../messagingRemoteSurfaceCommands";

export interface MessagingRemoteSurfaceCommandPreviewBindingsLike {
  list(input: { includeInactive: false }): MessagingBindingListResult;
}

export interface MessagingRemoteSurfaceCommandPreviewOptions {
  bindings: Pick<MessagingRemoteSurfaceCommandPreviewBindingsLike, "list">;
  gatewayRuntimeStatus: () => MessagingGatewayRuntimeStatus;
  runtimeSurfaceSnapshot: () => RuntimeSurfaceSnapshot;
}

export type MessagingRemoteSurfaceCommandPreviewResolver = (
  params: unknown
) => MessagingRemoteSurfaceCommandPreview;

export function createMessagingRemoteSurfaceCommandPreviewResolver(
  options: MessagingRemoteSurfaceCommandPreviewOptions,
): MessagingRemoteSurfaceCommandPreviewResolver {
  return (params) => messagingRemoteSurfaceCommandPreviewForParams(params, options);
}

export function messagingRemoteSurfaceCommandPreviewForParams(
  params: unknown,
  options: MessagingRemoteSurfaceCommandPreviewOptions,
): MessagingRemoteSurfaceCommandPreview {
  return buildMessagingRemoteSurfaceCommandPreview({
    toolInput: messagingRemoteSurfaceCommandInput(params),
    bindings: options.bindings.list({ includeInactive: false }),
    runtimeStatus: options.gatewayRuntimeStatus(),
    surface: options.runtimeSurfaceSnapshot(),
  });
}
