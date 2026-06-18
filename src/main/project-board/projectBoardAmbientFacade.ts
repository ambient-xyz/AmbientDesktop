import {
  AmbientStreamFailureError as AmbientStreamFailureErrorFromAmbient,
  aggressiveAmbientRetryPolicy as aggressiveAmbientRetryPolicyFromAmbient,
  isRetryableAmbientProviderError as isRetryableAmbientProviderErrorFromAmbient,
  retryDelayForAttempt as retryDelayForAttemptFromAmbient,
} from "../ambient/aggressiveRetries";
import type {
  AmbientRetryPolicy as AmbientRetryPolicyFromAmbient,
} from "../ambient/aggressiveRetries";
import {
  callAmbientChatCompletionTextWithRetries as callAmbientChatCompletionTextWithRetriesFromAmbient,
  isAmbientChatCompletionValidationError as isAmbientChatCompletionValidationErrorFromAmbient,
} from "../ambient/ambientChatCompletionRetry";
import {
  readAmbientEventStreamText as readAmbientEventStreamTextFromAmbient,
} from "../ambient/ambientStreamTransport";
import {
  liveAmbientDirectHelperProfile as liveAmbientDirectHelperProfileFromAmbient,
  liveAmbientProviderBaseUrl as liveAmbientProviderBaseUrlFromAmbient,
  liveAmbientProviderModel as liveAmbientProviderModelFromAmbient,
  readLiveAmbientProviderApiKey as readLiveAmbientProviderApiKeyFromAmbient,
} from "../ambient/liveAmbientProviderConfig";

export const AmbientStreamFailureError = AmbientStreamFailureErrorFromAmbient;
export const aggressiveAmbientRetryPolicy = aggressiveAmbientRetryPolicyFromAmbient;
export const callAmbientChatCompletionTextWithRetries = callAmbientChatCompletionTextWithRetriesFromAmbient;
export const isAmbientChatCompletionValidationError = isAmbientChatCompletionValidationErrorFromAmbient;
export const isRetryableAmbientProviderError = isRetryableAmbientProviderErrorFromAmbient;
export const liveAmbientDirectHelperProfile = liveAmbientDirectHelperProfileFromAmbient;
export const liveAmbientProviderBaseUrl = liveAmbientProviderBaseUrlFromAmbient;
export const liveAmbientProviderModel = liveAmbientProviderModelFromAmbient;
export const readAmbientEventStreamText = readAmbientEventStreamTextFromAmbient;
export const readLiveAmbientProviderApiKey = readLiveAmbientProviderApiKeyFromAmbient;
export const retryDelayForAttempt = retryDelayForAttemptFromAmbient;

export type AmbientRetryPolicy = AmbientRetryPolicyFromAmbient;
export type AmbientStreamFailureError = InstanceType<typeof AmbientStreamFailureErrorFromAmbient>;
