import type { ModelRuntimeSettings, RuntimeActivity } from "../../shared/types";
import {
  AGGRESSIVE_RETRY_BACKOFF_MS,
  ambientRetryPolicyFromSettings,
} from "../aggressiveRetries";

const POST_TOOL_IDLE_CONTINUATION_ATTEMPTS = 1;
type RuntimeSettingsActivity = Extract<RuntimeActivity, { kind: "runtime-settings" }>;

export interface PiRetryOverrides {
  enabled: true;
  maxRetries: number;
  baseDelayMs: number;
  provider: {
    maxRetries: number;
    maxRetryDelayMs: number;
  };
}

export function piRetryOverridesFromModelRuntimeSettings(settings: ModelRuntimeSettings): PiRetryOverrides | undefined {
  if (!settings.aggressiveRetries) return undefined;
  const policy = ambientRetryPolicyFromSettings({ modelRuntime: settings });
  if (!policy.enabled) return undefined;
  return {
    enabled: true,
    maxRetries: policy.maxRetries,
    baseDelayMs: AGGRESSIVE_RETRY_BACKOFF_MS[0],
    provider: {
      maxRetries: policy.maxRetries,
      maxRetryDelayMs: policy.providerMaxRetryDelayMs,
    },
  };
}

export function assistantFinalizationRetryMaxRetriesFromSettings(settings: ModelRuntimeSettings): number {
  if (!settings.aggressiveRetries) return POST_TOOL_IDLE_CONTINUATION_ATTEMPTS;
  const policy = ambientRetryPolicyFromSettings({ modelRuntime: settings });
  return policy.enabled ? Math.max(POST_TOOL_IDLE_CONTINUATION_ATTEMPTS, policy.maxRetries) : POST_TOOL_IDLE_CONTINUATION_ATTEMPTS;
}

export function runtimeSettingsActivityMessage(
  aggressiveRetries: boolean,
  status: "applied" | "deferred",
): string {
  const mode = aggressiveRetries ? "enabled" : "disabled";
  if (status === "deferred") {
    return `Aggressive retries ${mode}; Ambient will recreate this Pi session after the active run finishes.`;
  }
  return `Aggressive retries ${mode}; Ambient reset this idle Pi session so the next turn uses the new retry settings.`;
}

export function runtimeSettingsActivity(
  threadId: string,
  aggressiveRetries: boolean,
  status: RuntimeSettingsActivity["status"],
): RuntimeSettingsActivity {
  return {
    threadId,
    kind: "runtime-settings",
    status,
    aggressiveRetries,
    disposedSession: status === "applied",
    deferredSession: status === "deferred",
    message: runtimeSettingsActivityMessage(aggressiveRetries, status),
  };
}
