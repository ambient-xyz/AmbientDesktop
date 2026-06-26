import type { ThinkingLevel } from "@mariozechner/pi-ai";
import { isRetryableAmbientProviderError, readAmbientEventStreamText } from "./projectBoardAmbientFacade";
import { errorMessage } from "./projectBoardSynthesisPlannerPrompts";

export type ProjectBoardPlannerTransportMode = "pi_session_stream" | "direct_chat_compat";

export interface AmbientProjectBoardSynthesisCallResult {
  text: string;
  finishReason?: string;
  stopReason?: string;
  usage?: unknown;
  outputTokenBudget?: number;
  outputChars: number;
  thinkingChars?: number;
  toolRound?: number;
}

export interface ProjectBoardSynthesisTransientRetryEvent {
  attempt: number;
  retryAttempt: number;
  maxAttempts: number;
  maxRetries: number;
  delayMs: number;
  error: string;
  outputChars: number;
  committedRecordCount: number;
  aggressive: boolean;
}

export const DEFAULT_PROJECT_BOARD_AMBIENT_STREAM_IDLE_TIMEOUT_MS = 120_000;

export type ProjectBoardSynthesisReasoningEffort = "xhigh" | "high" | "medium" | "low" | "minimal" | "none";

export interface ProjectBoardSynthesisReasoningConfig {
  effort?: ProjectBoardSynthesisReasoningEffort;
  max_tokens?: number;
  exclude?: boolean;
  enabled?: boolean;
}

export type ProjectBoardSynthesisReasoning = false | ProjectBoardSynthesisReasoningConfig;

export interface AmbientChatCompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    finishReason?: string;
    delta?: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: unknown[];
    };
    message?: {
      content?: string;
    };
    text?: string;
  }>;
  usage?: unknown;
}

export function projectBoardSynthesisReasoningPayload(reasoning: ProjectBoardSynthesisReasoning | undefined): Record<string, unknown> {
  if (reasoning === undefined) return {};
  if (reasoning === false) return { reasoning: { effort: "none", enabled: false, exclude: true } };
  const payload: ProjectBoardSynthesisReasoningConfig = {};
  if (reasoning.effort) payload.effort = reasoning.effort;
  if (Number.isFinite(reasoning.max_tokens)) payload.max_tokens = Math.max(0, Math.floor(Number(reasoning.max_tokens)));
  if (typeof reasoning.exclude === "boolean") payload.exclude = reasoning.exclude;
  if (typeof reasoning.enabled === "boolean") payload.enabled = reasoning.enabled;
  if (Object.keys(payload).length === 0) return {};
  return { reasoning: payload };
}

export function projectBoardPiTextReasoning(reasoning: ProjectBoardSynthesisReasoning | undefined): ThinkingLevel | false | undefined {
  if (reasoning === undefined) return undefined;
  if (reasoning === false) return false;
  if (reasoning.enabled === false || reasoning.effort === "none") return false;
  if (reasoning.effort) return reasoning.effort;
  return undefined;
}

export async function readAmbientChatCompletionResult(
  response: Response,
  onChunk?: (responseCharCount: number) => void,
  options: {
    streamIdleTimeoutMs?: number;
    contentIdleTimeoutMs?: number;
    contentActivityToken?: () => unknown;
    outputTokenBudget?: number;
    signal?: AbortSignal;
  } = {},
): Promise<AmbientProjectBoardSynthesisCallResult> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const payload = (await response.json()) as AmbientChatCompletionResponse;
    const text = payload.choices?.[0]?.message?.content ?? payload.choices?.[0]?.text ?? "";
    const metadata = ambientChatCompletionPayloadMetadata(payload);
    return {
      text,
      finishReason: metadata.finishReason,
      usage: metadata.usage,
      outputTokenBudget: options.outputTokenBudget,
      outputChars: text.length,
    };
  }

  if (!response.body) return { text: "", outputTokenBudget: options.outputTokenBudget, outputChars: 0 };
  const streamIdleTimeoutMs = normalizeAmbientStreamIdleTimeoutMs(options.streamIdleTimeoutMs);
  const contentIdleTimeoutMs = normalizeAmbientStreamIdleTimeoutMs(options.contentIdleTimeoutMs ?? options.streamIdleTimeoutMs);
  let finishReason: string | undefined;
  let usage: unknown;
  const text = await readAmbientEventStreamText(response.body, {
    idleTimeoutMs: streamIdleTimeoutMs,
    contentIdleTimeoutMs,
    signal: options.signal,
    contentActivityToken: options.contentActivityToken,
    onPayload: (payload) => {
      const metadata = ambientChatCompletionPayloadMetadata(payload);
      if (metadata.finishReason) finishReason = metadata.finishReason;
      if (metadata.usage !== undefined) usage = metadata.usage;
    },
    onText: (_text, responseCharCount) => onChunk?.(responseCharCount),
    stalledMessage: ({ idleTimeoutMs, responseCharCount }) =>
      `Ambient project-board synthesis stream stalled after ${idleTimeoutMs.toLocaleString()}ms without streaming events ` +
      `(${responseCharCount.toLocaleString()} response characters received).`,
    contentStalledMessage: ({ contentIdleTimeoutMs, responseCharCount }) =>
      `Ambient project-board synthesis stream stalled after ${contentIdleTimeoutMs.toLocaleString()}ms without model content ` +
      `or planner records (${responseCharCount.toLocaleString()} response characters received).`,
  });
  return {
    text,
    finishReason,
    usage,
    outputTokenBudget: options.outputTokenBudget,
    outputChars: text.length,
  };
}

export function ambientChatCompletionPayloadMetadata(payload: unknown): { finishReason?: string; usage?: unknown } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const record = payload as { choices?: unknown; usage?: unknown };
  const choices = Array.isArray(record.choices) ? record.choices : [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object" || Array.isArray(choice)) continue;
    const choiceRecord = choice as { finish_reason?: unknown; finishReason?: unknown; stop_reason?: unknown; stopReason?: unknown };
    const finishReason =
      stringValue(choiceRecord.finish_reason) ??
      stringValue(choiceRecord.finishReason) ??
      stringValue(choiceRecord.stop_reason) ??
      stringValue(choiceRecord.stopReason);
    if (finishReason) return { finishReason, ...(record.usage === undefined ? {} : { usage: record.usage }) };
  }
  return record.usage === undefined ? {} : { usage: record.usage };
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function projectBoardSynthesisTransientAttemptCount(): number {
  const configured = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_ATTEMPTS || 3);
  if (!Number.isFinite(configured)) return 3;
  return Math.max(1, Math.min(5, Math.floor(configured)));
}

export function projectBoardSynthesisTransientRetryDelayMs(attempt: number): number {
  const baseDelayMs = Number(process.env.AMBIENT_PROJECT_BOARD_SYNTHESIS_TRANSIENT_RETRY_DELAY_MS || 5_000);
  const normalizedBaseDelayMs = Number.isFinite(baseDelayMs) ? Math.max(0, Math.floor(baseDelayMs)) : 5_000;
  return normalizedBaseDelayMs * attempt;
}

export function shouldRetryProjectBoardSynthesisTransient(
  error: unknown,
  input: {
    attempt: number;
    maxAttempts: number;
    outputChars: number;
    committedRecordCount?: number;
    aggressive?: boolean;
    signal?: AbortSignal;
  },
): boolean {
  if (input.signal?.aborted) return false;
  if (input.attempt >= input.maxAttempts) return false;
  if (input.outputChars > 0) return false;
  if ((input.committedRecordCount ?? 0) > 0) return false;
  return input.aggressive ? isRetryableAmbientProviderError(error) : isTransientProjectBoardSynthesisError(error);
}

export function isTransientProjectBoardSynthesisError(error: unknown): boolean {
  const message = errorMessage(error);
  return /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up/i.test(
    message,
  );
}

export function delayProjectBoardSynthesisRetry(ms: number, signal?: AbortSignal): Promise<void> {
  const delayMs = Math.max(0, Math.floor(ms));
  if (delayMs === 0) {
    if (signal?.aborted)
      return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Project-board synthesis retry canceled."));
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason instanceof Error ? signal.reason : new Error("Project-board synthesis retry canceled."));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    if (signal?.aborted) onAbort();
    else signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function fetchAmbientProjectBoardSynthesisResponse(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  streamIdleTimeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutError = new Error(
    `Ambient project-board synthesis request stalled before streaming began after ${streamIdleTimeoutMs.toLocaleString()}ms.`,
  );
  const abortWithSignal = () => {
    const reason = signal?.reason;
    controller.abort(reason instanceof Error ? reason : new Error("Ambient project-board synthesis request canceled."));
  };
  let rejectTimeout: ((reason?: unknown) => void) | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timeout = setTimeout(() => {
    controller.abort(timeoutError);
    rejectTimeout?.(timeoutError);
  }, streamIdleTimeoutMs);
  try {
    if (signal?.aborted) abortWithSignal();
    else signal?.addEventListener("abort", abortWithSignal, { once: true });
    const request = fetchImpl(url, { ...init, signal: controller.signal });
    return await Promise.race([request, timeoutPromise]);
  } catch (error) {
    if (error === timeoutError || controller.signal.reason === timeoutError) throw timeoutError;
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    signal?.removeEventListener("abort", abortWithSignal);
  }
}

export function normalizeAmbientStreamIdleTimeoutMs(value: number | undefined): number {
  return Math.max(1, Math.floor(value ?? DEFAULT_PROJECT_BOARD_AMBIENT_STREAM_IDLE_TIMEOUT_MS));
}

export function normalizeProjectBoardSynthesisMaxToolRounds(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 3;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

export function projectBoardWorkspacePollIntervalMs(streamIdleTimeoutMs: number | undefined): number {
  const idleTimeoutMs = normalizeAmbientStreamIdleTimeoutMs(streamIdleTimeoutMs);
  return Math.max(25, Math.min(5_000, Math.floor(idleTimeoutMs / 3)));
}
