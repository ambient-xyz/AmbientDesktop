import type {
  MessagingBindingListResult,
  MessagingGatewayRuntimeStatus,
  RuntimeSurfaceSnapshot,
} from "../shared/messagingGateway";
import type {
  MessagingGatewayInboundDispatchInput,
  MessagingGatewayInboundDispatchResult,
} from "./messagingGatewayRunner";
import {
  applyTelegramBridgePoll,
  buildTelegramBridgePollPlan,
  telegramBridgePollingControlInput,
  telegramBridgePollToolInput,
  type TelegramBridgePollPlan,
  type TelegramBridgePollResult,
  type TelegramBridgePollingControlInput,
  type TelegramBridgePollingControlPreview,
  type TelegramBridgePollingControlResult,
} from "./telegramBridgePolling";

type TelegramBridgePollFetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "statusText" | "json">>;

export interface TelegramBridgePollBindingsLike {
  list(input: { includeInactive: true }): MessagingBindingListResult;
  list(input: { includeInactive: false }): MessagingBindingListResult;
}

export interface TelegramBridgePollGatewayRunnerLike {
  runtimeStatus(): MessagingGatewayRuntimeStatus;
  dispatchInbound(input: MessagingGatewayInboundDispatchInput): MessagingGatewayInboundDispatchResult;
}

export interface TelegramBridgePollPlanOptions {
  bindings: Pick<TelegramBridgePollBindingsLike, "list">;
  gatewayRunner: Pick<TelegramBridgePollGatewayRunnerLike, "runtimeStatus">;
  stateRoot: string;
}

export interface TelegramBridgePollApplyOptions {
  bindings: Pick<TelegramBridgePollBindingsLike, "list">;
  gatewayRunner: TelegramBridgePollGatewayRunnerLike;
  stateRoot: string;
  runtimeSurfaceSnapshot: () => RuntimeSurfaceSnapshot | undefined;
  env?: Record<string, string | undefined>;
  fetchFn?: TelegramBridgePollFetchLike;
  now?: () => Date;
}

export interface TelegramBridgePollResolvers {
  planForParams: (params: unknown) => TelegramBridgePollPlan;
  applyPollForParams: (params: unknown) => Promise<TelegramBridgePollResult>;
}

export interface TelegramBridgePollingRunnerLike {
  preview(input: TelegramBridgePollingControlInput, pollPlan: TelegramBridgePollPlan): TelegramBridgePollingControlPreview;
  apply(input: {
    preview: TelegramBridgePollingControlPreview;
    approvalRecorded: boolean;
    pollOnce: () => Promise<TelegramBridgePollResult>;
  }): Promise<TelegramBridgePollingControlResult>;
}

export interface TelegramBridgePollingPreviewOptions extends TelegramBridgePollPlanOptions {
  telegramBridgePollingRunner: Pick<TelegramBridgePollingRunnerLike, "preview">;
}

export interface TelegramBridgePollingPreviewForParamsResult {
  input: TelegramBridgePollingControlInput;
  preview: TelegramBridgePollingControlPreview;
}

export interface TelegramBridgePollingApplyFromPreviewOptions {
  input: TelegramBridgePollingControlInput;
  preview: TelegramBridgePollingControlPreview;
  approvalRecorded: boolean;
  telegramBridgePollingRunner: Pick<TelegramBridgePollingRunnerLike, "apply">;
  applyPollForParams: (params: unknown) => Promise<TelegramBridgePollResult>;
}

export type TelegramBridgePollingApplyInput = Omit<
  TelegramBridgePollingApplyFromPreviewOptions,
  "telegramBridgePollingRunner" | "applyPollForParams"
>;

export interface TelegramBridgePollingResolversOptions extends TelegramBridgePollPlanOptions {
  telegramBridgePollingRunner: Pick<TelegramBridgePollingRunnerLike, "preview" | "apply">;
  applyPollForParams: (params: unknown) => Promise<TelegramBridgePollResult>;
}

export interface TelegramBridgePollingResolvers {
  previewForParams: (params: unknown) => TelegramBridgePollingPreviewForParamsResult;
  applyPolling: (input: TelegramBridgePollingApplyInput) => Promise<TelegramBridgePollingControlResult>;
}

export function telegramBridgePollPlanForParams(
  params: unknown,
  options: TelegramBridgePollPlanOptions,
): TelegramBridgePollPlan {
  return buildTelegramBridgePollPlan({
    toolInput: telegramBridgePollToolInput(params),
    bindings: options.bindings.list({ includeInactive: true }),
    runtimeStatus: options.gatewayRunner.runtimeStatus(),
    stateRoot: options.stateRoot,
  });
}

export function createTelegramBridgePollResolvers(
  options: TelegramBridgePollApplyOptions,
): TelegramBridgePollResolvers {
  return {
    planForParams: (params) => telegramBridgePollPlanForParams(params, options),
    applyPollForParams: async (params) => await applyTelegramBridgePollForParams(params, options),
  };
}

export function telegramBridgePollingPreviewForParams(
  params: unknown,
  options: TelegramBridgePollingPreviewOptions,
): TelegramBridgePollingPreviewForParamsResult {
  const input = telegramBridgePollingControlInput(params);
  const pollPlan = telegramBridgePollPlanForParams(input, options);
  return {
    input,
    preview: options.telegramBridgePollingRunner.preview(input, pollPlan),
  };
}

export async function applyTelegramBridgePollingFromPreview(
  options: TelegramBridgePollingApplyFromPreviewOptions,
): Promise<TelegramBridgePollingControlResult> {
  return await options.telegramBridgePollingRunner.apply({
    preview: options.preview,
    approvalRecorded: options.approvalRecorded,
    pollOnce: () => options.applyPollForParams(options.input),
  });
}

export function createTelegramBridgePollingResolvers(
  options: TelegramBridgePollingResolversOptions,
): TelegramBridgePollingResolvers {
  return {
    previewForParams: (params) => telegramBridgePollingPreviewForParams(params, options),
    applyPolling: async (input) => await applyTelegramBridgePollingFromPreview({
      ...input,
      telegramBridgePollingRunner: options.telegramBridgePollingRunner,
      applyPollForParams: options.applyPollForParams,
    }),
  };
}

export async function applyTelegramBridgePollForParams(
  params: unknown,
  options: TelegramBridgePollApplyOptions,
): Promise<TelegramBridgePollResult> {
  const plan = telegramBridgePollPlanForParams(params, options);
  const surface = options.runtimeSurfaceSnapshot();
  const currentBindings = options.bindings.list({ includeInactive: false });
  return await applyTelegramBridgePoll({
    plan,
    bindings: currentBindings,
    stateRoot: options.stateRoot,
    ...(surface ? { surface } : {}),
    ...(options.env ? { env: options.env } : {}),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    ...(options.now ? { now: options.now } : {}),
    dispatch: (event) => options.gatewayRunner.dispatchInbound({
      source: "telegram-bridge",
      event,
      bindings: currentBindings,
      ...(surface ? { surface } : {}),
    }),
  });
}
