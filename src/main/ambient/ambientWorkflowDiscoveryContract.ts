export {
  AGGRESSIVE_RETRY_BACKOFF_MS,
  aggressiveAmbientRetryPolicy,
  ambientRetryPolicyFromLegacyOptions,
  isRetryableAmbientProviderError,
} from "./aggressiveRetries";

export type { AmbientRetryPolicy } from "./aggressiveRetries";
