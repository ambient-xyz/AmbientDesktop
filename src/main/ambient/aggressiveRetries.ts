export const AGGRESSIVE_RETRY_BACKOFF_MS = [
  1_000,
  2_000,
  3_000,
  4_000,
  5_000,
  5_000,
  5_000,
  5_000,
  5_000,
  5_000,
] as const;

export const DEFAULT_AMBIENT_RETRY_ATTEMPTS = 4;
export const DEFAULT_AMBIENT_RETRY_BASE_DELAY_MS = 2_000;
export const DEFAULT_PROVIDER_MAX_RETRY_DELAY_MS = 60_000;

export type AmbientStreamFailureKind =
  | "pre_stream_timeout"
  | "stream_idle_timeout"
  | "stream_closed_before_done"
  | "provider_error_event"
  | "network_abort"
  | "user_abort";

export interface AmbientRetryPolicy {
  enabled: boolean;
  maxRetries: number;
  backoffMs: readonly number[];
  providerMaxRetryDelayMs: number;
}

export interface AmbientRetrySettingsInput {
  aggressiveRetries?: boolean;
  modelRuntime?: {
    aggressiveRetries?: boolean;
  };
}

export class AmbientStreamFailureError extends Error {
  readonly kind: AmbientStreamFailureKind;
  readonly responseCharCount?: number;
  readonly semanticOutputSeen: boolean;
  readonly toolCallSeen: boolean;

  constructor(
    kind: AmbientStreamFailureKind,
    message: string,
    input: { responseCharCount?: number; semanticOutputSeen?: boolean; toolCallSeen?: boolean; cause?: unknown } = {},
  ) {
    super(message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = "AmbientStreamFailureError";
    this.kind = kind;
    this.responseCharCount = input.responseCharCount;
    this.semanticOutputSeen = input.semanticOutputSeen ?? (typeof input.responseCharCount === "number" && input.responseCharCount > 0);
    this.toolCallSeen = input.toolCallSeen ?? false;
  }
}

export function ambientRetryPolicyFromSettings(settings: AmbientRetrySettingsInput | undefined): AmbientRetryPolicy {
  return settings?.modelRuntime?.aggressiveRetries || settings?.aggressiveRetries
    ? aggressiveAmbientRetryPolicy()
    : ambientRetryPolicyFromLegacyOptions();
}

export function aggressiveAmbientRetryPolicy(input: Partial<AmbientRetryPolicy> = {}): AmbientRetryPolicy {
  return normalizeAmbientRetryPolicy({
    enabled: true,
    maxRetries: AGGRESSIVE_RETRY_BACKOFF_MS.length,
    backoffMs: AGGRESSIVE_RETRY_BACKOFF_MS,
    providerMaxRetryDelayMs: 5_000,
    ...input,
  });
}

export function ambientRetryPolicyFromLegacyOptions(input: {
  maxAttempts?: number;
  baseDelayMs?: number;
  providerMaxRetryDelayMs?: number;
} = {}): AmbientRetryPolicy {
  const maxAttempts = normalizePositiveInt(input.maxAttempts ?? DEFAULT_AMBIENT_RETRY_ATTEMPTS, DEFAULT_AMBIENT_RETRY_ATTEMPTS);
  const maxRetries = Math.max(0, maxAttempts - 1);
  const baseDelayMs = normalizeNonNegativeInt(input.baseDelayMs ?? DEFAULT_AMBIENT_RETRY_BASE_DELAY_MS, DEFAULT_AMBIENT_RETRY_BASE_DELAY_MS);
  return normalizeAmbientRetryPolicy({
    enabled: maxRetries > 0,
    maxRetries,
    backoffMs: Array.from({ length: maxRetries }, (_value, index) =>
      baseDelayMs <= 0 ? 0 : Math.min(15_000, baseDelayMs * 2 ** index),
    ),
    providerMaxRetryDelayMs: input.providerMaxRetryDelayMs ?? DEFAULT_PROVIDER_MAX_RETRY_DELAY_MS,
  });
}

export function normalizeAmbientRetryPolicy(input: Partial<AmbientRetryPolicy> = {}): AmbientRetryPolicy {
  const maxRetries = Math.max(0, normalizePositiveInt(input.maxRetries ?? 0, 0));
  const backoffMs = Array.isArray(input.backoffMs)
    ? input.backoffMs.map((value) => normalizeNonNegativeInt(value, 0))
    : [];
  return {
    enabled: input.enabled !== false && maxRetries > 0,
    maxRetries,
    backoffMs,
    providerMaxRetryDelayMs: normalizeNonNegativeInt(input.providerMaxRetryDelayMs ?? DEFAULT_PROVIDER_MAX_RETRY_DELAY_MS, DEFAULT_PROVIDER_MAX_RETRY_DELAY_MS),
  };
}

export function retryDelayForAttempt(policy: AmbientRetryPolicy, retryAttempt: number): number {
  if (!policy.enabled || policy.maxRetries <= 0) return 0;
  const index = Math.max(0, Math.floor(retryAttempt) - 1);
  if (policy.backoffMs.length === 0) return 0;
  return policy.backoffMs[Math.min(index, policy.backoffMs.length - 1)] ?? 0;
}

export function isRetryableAmbientProviderError(error: unknown): boolean {
  if (error instanceof AmbientStreamFailureError) {
    return isReplaySafeInterruptedStream(error);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(?:aborted|canceled|cancelled|api key|unauthori[sz]ed|forbidden|invalid request|schema|validation|permission)\b/i.test(message)) {
    return false;
  }
  return (
    /\b(?:408|409|425|429|500|502|503|504)\b|rate limit|temporar|try again|timeout|timed out|upstream|econnreset|socket hang up|terminated/i.test(message) ||
    /did not start streaming|stream stalled|stream ended before completion|closed before completion|returned an empty response|did not return valid JSON|returned invalid JSON|Unterminated string in JSON/i.test(message)
  );
}

export function isReplaySafeInterruptedStream(error: AmbientStreamFailureError): boolean {
  if (error.kind === "user_abort") return false;
  return !error.semanticOutputSeen && !error.toolCallSeen && (error.responseCharCount ?? 0) <= 0;
}

function normalizePositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizeNonNegativeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}
