import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { SttProviderCandidate, SttProviderSetupResult, VoiceProviderCandidate } from "../../shared/localRuntimeTypes";
import { sttProviderCacheChanges, sttSetupResultModel } from "./sttUiModel";
import { voiceProviderCacheChanges } from "./voiceUiModel";
import type {
  SttProviderCacheActivity,
  SttProviderCacheStatus,
  SttProviderSetupUiState,
  VoiceCatalogRefreshState,
  VoiceProviderCacheActivity,
  VoiceProviderCacheStatus,
} from "./RightPanel";
import type { useAppProviderRuntimeState } from "./AppProviderRuntimeState";

export const SPEECH_PROVIDER_CACHE_ACTIVITY_LIMIT = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function speechProviderLoadTriggerRequiresFollowUp(trigger: string): boolean {
  const normalized = trigger.toLowerCase();
  return normalized.includes("provider inventory") ||
    normalized.includes("provider state") ||
    normalized.includes("plugin catalog") ||
    normalized.includes("voice catalog") ||
    normalized.includes("voice regeneration");
}

export function speechProviderCacheActivityId(input: { at: string; trigger: string; currentLength: number }): string {
  return `${input.at}:${input.trigger}:${input.currentLength}`;
}

export function speechProviderAvailabilityCounts(providers: Array<{ available: boolean }>): {
  providerCount: number;
  availableCount: number;
  unavailableCount: number;
} {
  return {
    providerCount: providers.length,
    availableCount: providers.filter((provider) => provider.available).length,
    unavailableCount: providers.filter((provider) => !provider.available).length,
  };
}

export function speechProviderCacheActivityList<T extends { at: string; trigger: string; id?: string }>(
  current: T[],
  activity: Omit<T, "id">,
): T[] {
  return [
    { ...activity, id: speechProviderCacheActivityId({ at: activity.at, trigger: activity.trigger, currentLength: current.length }) } as T,
    ...current,
  ].slice(0, SPEECH_PROVIDER_CACHE_ACTIVITY_LIMIT);
}

export function sttSetupRunningMessage(action: "install" | "repair" | "validate"): string {
  return action === "install" ? "Installing Qwen3-ASR..." : action === "repair" ? "Repairing Qwen3-ASR..." : "Validating Qwen3-ASR...";
}

export function desktopStateWithSttSetupResult(input: {
  action: "install" | "repair" | "validate";
  current: DesktopState;
  enable?: boolean;
  result: SttProviderSetupResult;
}): DesktopState {
  const { action, current, enable, result } = input;
  return {
    ...current,
    settings: {
      ...current.settings,
      stt: {
        ...current.settings.stt,
        ...(result.selectedProvider ? { providerCapabilityId: result.selectedProvider.capabilityId } : {}),
        enabled: result.selectedProvider
          ? Boolean(enable ?? action !== "install") && result.selectedProvider.available && result.status === "ready"
          : current.settings.stt.enabled,
      },
    },
  };
}

export function createAppSpeechProviderActions({
  setState,
  setSttProviderCacheActivity,
  setSttProviderCacheStatus,
  setSttProviderSetup,
  setSttProviders,
  setSttProvidersError,
  setSttProvidersLoading,
  setVoiceCatalogRefresh,
  setVoiceProviderCacheActivity,
  setVoiceProviderCacheStatus,
  setVoiceProviders,
  setVoiceProvidersError,
  setVoiceProvidersLoading,
  state,
  sttProviderRefreshTimerRef,
  sttProviderLoadPromiseRef,
  sttProviderQueuedRefreshTriggerRef,
  sttProviderRequestIdRef,
  sttProvidersRef,
  voiceProviderRefreshTimerRef,
  voiceProviderLoadPromiseRef,
  voiceProviderQueuedRefreshTriggerRef,
  voiceProviderRequestIdRef,
  voiceProvidersRef,
}: {
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  setSttProviderCacheActivity: Dispatch<SetStateAction<SttProviderCacheActivity[]>>;
  setSttProviderCacheStatus: Dispatch<SetStateAction<SttProviderCacheStatus>>;
  setSttProviderSetup: Dispatch<SetStateAction<SttProviderSetupUiState>>;
  setSttProviders: Dispatch<SetStateAction<SttProviderCandidate[]>>;
  setSttProvidersError: Dispatch<SetStateAction<string | undefined>>;
  setSttProvidersLoading: Dispatch<SetStateAction<boolean>>;
  setVoiceCatalogRefresh: Dispatch<SetStateAction<VoiceCatalogRefreshState | undefined>>;
  setVoiceProviderCacheActivity: Dispatch<SetStateAction<VoiceProviderCacheActivity[]>>;
  setVoiceProviderCacheStatus: Dispatch<SetStateAction<VoiceProviderCacheStatus>>;
  setVoiceProviders: Dispatch<SetStateAction<VoiceProviderCandidate[]>>;
  setVoiceProvidersError: Dispatch<SetStateAction<string | undefined>>;
  setVoiceProvidersLoading: Dispatch<SetStateAction<boolean>>;
  state: DesktopState | undefined;
  sttProviderRefreshTimerRef: MutableRefObject<number | undefined>;
  sttProviderLoadPromiseRef: MutableRefObject<Promise<void> | undefined>;
  sttProviderQueuedRefreshTriggerRef: MutableRefObject<string | undefined>;
  sttProviderRequestIdRef: MutableRefObject<number>;
  sttProvidersRef: MutableRefObject<SttProviderCandidate[]>;
  voiceProviderRefreshTimerRef: MutableRefObject<number | undefined>;
  voiceProviderLoadPromiseRef: MutableRefObject<Promise<void> | undefined>;
  voiceProviderQueuedRefreshTriggerRef: MutableRefObject<string | undefined>;
  voiceProviderRequestIdRef: MutableRefObject<number>;
  voiceProvidersRef: MutableRefObject<VoiceProviderCandidate[]>;
}): {
  loadSttProviders: (trigger?: string) => Promise<void>;
  loadVoiceProviders: (trigger?: string) => Promise<void>;
  refreshVoiceCatalog: (providerCapabilityId: string) => Promise<void>;
  scheduleSttProviderRefresh: (delayMs?: number, trigger?: string) => void;
  scheduleVoiceProviderRefresh: (delayMs?: number, trigger?: string) => void;
  setupSttProvider: (
    action: "install" | "repair" | "validate",
    options?: { validationAudioPath?: string; enable?: boolean },
  ) => Promise<SttProviderSetupResult | undefined>;
} {
  function appendVoiceProviderCacheActivity(activity: Omit<VoiceProviderCacheActivity, "id">) {
    setVoiceProviderCacheActivity((current) => speechProviderCacheActivityList(current, activity));
  }

  function loadVoiceProviders(trigger = "manual"): Promise<void> {
    if (voiceProviderLoadPromiseRef.current) {
      if (speechProviderLoadTriggerRequiresFollowUp(trigger)) {
        voiceProviderQueuedRefreshTriggerRef.current = trigger;
      }
      setVoiceProviderCacheStatus((current) => ({
        ...current,
        lastRequestedAt: new Date().toISOString(),
        lastTrigger: trigger,
      }));
      return voiceProviderLoadPromiseRef.current;
    }
    const requestId = voiceProviderRequestIdRef.current + 1;
    voiceProviderRequestIdRef.current = requestId;
    setVoiceProvidersLoading(true);
    setVoiceProvidersError(undefined);
    setVoiceProviderCacheStatus((current) => ({
      ...current,
      lastRequestedAt: new Date().toISOString(),
      lastTrigger: trigger,
      error: undefined,
    }));
    const loadPromise = (async () => {
      const providers = await window.ambientDesktop.listVoiceProviders();
      if (requestId === voiceProviderRequestIdRef.current) {
        const previousProviders = voiceProvidersRef.current;
        voiceProvidersRef.current = providers;
        setVoiceProviders(providers);
        appendVoiceProviderCacheActivity({
          at: new Date().toISOString(),
          trigger,
          status: "success",
          ...speechProviderAvailabilityCounts(providers),
          changes: voiceProviderCacheChanges(previousProviders, providers),
        });
        setVoiceProviderCacheStatus((current) => ({
          ...current,
          lastCompletedAt: new Date().toISOString(),
          providerCount: providers.length,
          error: undefined,
        }));
      }
    })().catch((err) => {
      const message = errorMessage(err);
      if (requestId === voiceProviderRequestIdRef.current) {
        const counts = speechProviderAvailabilityCounts(voiceProvidersRef.current);
        setVoiceProvidersError(message);
        appendVoiceProviderCacheActivity({
          at: new Date().toISOString(),
          trigger,
          status: "error",
          ...counts,
          changes: [],
          error: message,
        });
        setVoiceProviderCacheStatus((current) => ({
          ...current,
          lastCompletedAt: new Date().toISOString(),
          error: message,
        }));
      }
    }).finally(() => {
      let queuedTrigger: string | undefined;
      if (voiceProviderLoadPromiseRef.current === loadPromise) {
        voiceProviderLoadPromiseRef.current = undefined;
        queuedTrigger = voiceProviderQueuedRefreshTriggerRef.current;
        voiceProviderQueuedRefreshTriggerRef.current = undefined;
      }
      if (requestId === voiceProviderRequestIdRef.current) setVoiceProvidersLoading(false);
      if (queuedTrigger) void loadVoiceProviders(queuedTrigger);
    });
    voiceProviderLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }

  function appendSttProviderCacheActivity(activity: Omit<SttProviderCacheActivity, "id">) {
    setSttProviderCacheActivity((current) => speechProviderCacheActivityList(current, activity));
  }

  function loadSttProviders(trigger = "manual"): Promise<void> {
    if (sttProviderLoadPromiseRef.current) {
      if (speechProviderLoadTriggerRequiresFollowUp(trigger)) {
        sttProviderQueuedRefreshTriggerRef.current = trigger;
      }
      setSttProviderCacheStatus((current) => ({
        ...current,
        lastRequestedAt: new Date().toISOString(),
        lastTrigger: trigger,
      }));
      return sttProviderLoadPromiseRef.current;
    }
    const requestId = sttProviderRequestIdRef.current + 1;
    sttProviderRequestIdRef.current = requestId;
    setSttProvidersLoading(true);
    setSttProvidersError(undefined);
    setSttProviderCacheStatus((current) => ({
      ...current,
      lastRequestedAt: new Date().toISOString(),
      lastTrigger: trigger,
      error: undefined,
    }));
    const loadPromise = (async () => {
      const providers = await window.ambientDesktop.listSttProviders();
      if (requestId === sttProviderRequestIdRef.current) {
        const previousProviders = sttProvidersRef.current;
        sttProvidersRef.current = providers;
        setSttProviders(providers);
        appendSttProviderCacheActivity({
          at: new Date().toISOString(),
          trigger,
          status: "success",
          ...speechProviderAvailabilityCounts(providers),
          changes: sttProviderCacheChanges(previousProviders, providers),
        });
        setSttProviderCacheStatus((current) => ({
          ...current,
          lastCompletedAt: new Date().toISOString(),
          providerCount: providers.length,
          error: undefined,
        }));
      }
    })().catch((err) => {
      const message = errorMessage(err);
      if (requestId === sttProviderRequestIdRef.current) {
        const counts = speechProviderAvailabilityCounts(sttProvidersRef.current);
        setSttProvidersError(message);
        appendSttProviderCacheActivity({
          at: new Date().toISOString(),
          trigger,
          status: "error",
          ...counts,
          changes: [],
          error: message,
        });
        setSttProviderCacheStatus((current) => ({
          ...current,
          lastCompletedAt: new Date().toISOString(),
          error: message,
        }));
      }
    }).finally(() => {
      let queuedTrigger: string | undefined;
      if (sttProviderLoadPromiseRef.current === loadPromise) {
        sttProviderLoadPromiseRef.current = undefined;
        queuedTrigger = sttProviderQueuedRefreshTriggerRef.current;
        sttProviderQueuedRefreshTriggerRef.current = undefined;
      }
      if (requestId === sttProviderRequestIdRef.current) setSttProvidersLoading(false);
      if (queuedTrigger) void loadSttProviders(queuedTrigger);
    });
    sttProviderLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }

  function scheduleSttProviderRefresh(delayMs = 300, trigger = "scheduled") {
    if (sttProviderRefreshTimerRef.current) window.clearTimeout(sttProviderRefreshTimerRef.current);
    sttProviderRefreshTimerRef.current = window.setTimeout(() => {
      sttProviderRefreshTimerRef.current = undefined;
      void loadSttProviders(trigger);
    }, delayMs);
  }

  async function setupSttProvider(
    action: "install" | "repair" | "validate",
    options: { validationAudioPath?: string; enable?: boolean } = {},
  ): Promise<SttProviderSetupResult | undefined> {
    if (!state) return undefined;
    setSttProviderSetup({ status: "running", action, message: sttSetupRunningMessage(action) });
    try {
      const result = await window.ambientDesktop.setupSttProvider({
        provider: "qwen3-asr",
        action,
        installRuntime: action !== "validate",
        ...(options.validationAudioPath ? { validationAudioPath: options.validationAudioPath } : {}),
        selectProvider: true,
        enable: options.enable ?? action !== "install",
        spokenLanguage: state.settings.stt.spokenLanguage,
      });
      const model = sttSetupResultModel(result);
      sttProvidersRef.current = result.providers;
      setSttProviders(result.providers);
      setSttProviderCacheStatus((current) => ({
        ...current,
        lastCompletedAt: new Date().toISOString(),
        lastTrigger: `setup ${action}`,
        providerCount: result.providers.length,
        error: undefined,
      }));
      setSttProviderSetup({ status: "success", action, message: model.statusLabel, result });
      setState((current) =>
        current
          ? desktopStateWithSttSetupResult({
              action,
              current,
              enable: options.enable,
              result,
            })
          : current,
      );
      return result;
    } catch (err) {
      const message = errorMessage(err);
      setSttProviderSetup({ status: "error", action, message });
      setSttProvidersError(message);
      return undefined;
    }
  }

  async function refreshVoiceCatalog(providerCapabilityId: string) {
    const provider = voiceProvidersRef.current.find((candidate) => candidate.capabilityId === providerCapabilityId);
    setVoiceCatalogRefresh({
      providerCapabilityId,
      status: "running",
      message: provider ? `Refreshing ${provider.label} voices...` : "Refreshing voices...",
    });
    try {
      const result = await window.ambientDesktop.refreshVoiceProviderVoices({ providerCapabilityId });
      setVoiceCatalogRefresh({
        providerCapabilityId,
        status: "success",
        message: `${result.providerLabel}: ${result.voiceCount.toLocaleString()} voices refreshed.`,
      });
      setVoiceProviderCacheStatus((current) => ({
        ...current,
        lastCatalogRefresh: {
          providerLabel: result.providerLabel,
          voiceCount: result.voiceCount,
          refreshedAt: result.refreshedAt,
          durationMs: result.durationMs,
        },
      }));
      await loadVoiceProviders(`voice catalog refresh: ${result.providerLabel}`);
    } catch (error) {
      const message = errorMessage(error);
      setVoiceCatalogRefresh({ providerCapabilityId, status: "error", message });
    }
  }

  function scheduleVoiceProviderRefresh(delayMs = 300, trigger = "scheduled") {
    if (voiceProviderRefreshTimerRef.current) window.clearTimeout(voiceProviderRefreshTimerRef.current);
    voiceProviderRefreshTimerRef.current = window.setTimeout(() => {
      voiceProviderRefreshTimerRef.current = undefined;
      void loadVoiceProviders(trigger);
    }, delayMs);
  }

  return {
    loadSttProviders,
    loadVoiceProviders,
    refreshVoiceCatalog,
    scheduleSttProviderRefresh,
    scheduleVoiceProviderRefresh,
    setupSttProvider,
  };
}

type AppSpeechProviderRuntimeStateInput = Pick<
  ReturnType<typeof useAppProviderRuntimeState>,
  | "setSttProviderCacheActivity"
  | "setSttProviderCacheStatus"
  | "setSttProviderSetup"
  | "setSttProviders"
  | "setSttProvidersError"
  | "setSttProvidersLoading"
  | "setVoiceCatalogRefresh"
  | "setVoiceProviderCacheActivity"
  | "setVoiceProviderCacheStatus"
  | "setVoiceProviders"
  | "setVoiceProvidersError"
  | "setVoiceProvidersLoading"
  | "sttProviderRefreshTimerRef"
  | "sttProviderLoadPromiseRef"
  | "sttProviderQueuedRefreshTriggerRef"
  | "sttProviderRequestIdRef"
  | "sttProvidersRef"
  | "voiceProviderRefreshTimerRef"
  | "voiceProviderLoadPromiseRef"
  | "voiceProviderQueuedRefreshTriggerRef"
  | "voiceProviderRequestIdRef"
  | "voiceProvidersRef"
>;

export function createAppSpeechProviderActionsForRuntimeState({
  providerRuntimeState,
  setState,
  state,
}: {
  providerRuntimeState: AppSpeechProviderRuntimeStateInput;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState | undefined;
}): ReturnType<typeof createAppSpeechProviderActions> {
  return createAppSpeechProviderActions({
    setState,
    setSttProviderCacheActivity: providerRuntimeState.setSttProviderCacheActivity,
    setSttProviderCacheStatus: providerRuntimeState.setSttProviderCacheStatus,
    setSttProviderSetup: providerRuntimeState.setSttProviderSetup,
    setSttProviders: providerRuntimeState.setSttProviders,
    setSttProvidersError: providerRuntimeState.setSttProvidersError,
    setSttProvidersLoading: providerRuntimeState.setSttProvidersLoading,
    setVoiceCatalogRefresh: providerRuntimeState.setVoiceCatalogRefresh,
    setVoiceProviderCacheActivity: providerRuntimeState.setVoiceProviderCacheActivity,
    setVoiceProviderCacheStatus: providerRuntimeState.setVoiceProviderCacheStatus,
    setVoiceProviders: providerRuntimeState.setVoiceProviders,
    setVoiceProvidersError: providerRuntimeState.setVoiceProvidersError,
    setVoiceProvidersLoading: providerRuntimeState.setVoiceProvidersLoading,
    state,
    sttProviderRefreshTimerRef: providerRuntimeState.sttProviderRefreshTimerRef,
    sttProviderLoadPromiseRef: providerRuntimeState.sttProviderLoadPromiseRef,
    sttProviderQueuedRefreshTriggerRef: providerRuntimeState.sttProviderQueuedRefreshTriggerRef,
    sttProviderRequestIdRef: providerRuntimeState.sttProviderRequestIdRef,
    sttProvidersRef: providerRuntimeState.sttProvidersRef,
    voiceProviderRefreshTimerRef: providerRuntimeState.voiceProviderRefreshTimerRef,
    voiceProviderLoadPromiseRef: providerRuntimeState.voiceProviderLoadPromiseRef,
    voiceProviderQueuedRefreshTriggerRef: providerRuntimeState.voiceProviderQueuedRefreshTriggerRef,
    voiceProviderRequestIdRef: providerRuntimeState.voiceProviderRequestIdRef,
    voiceProvidersRef: providerRuntimeState.voiceProvidersRef,
  });
}
