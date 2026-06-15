import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  SttProviderCandidate,
  SttProviderSetupResult,
  VoiceProviderCandidate,
} from "../../shared/types";
import type {
  SttProviderCacheActivity,
  SttProviderCacheStatus,
  SttProviderSetupUiState,
  VoiceCatalogRefreshState,
  VoiceProviderCacheActivity,
  VoiceProviderCacheStatus,
} from "./RightPanel";
import {
  createAppSpeechProviderActions,
  desktopStateWithSttSetupResult,
  speechProviderAvailabilityCounts,
  speechProviderCacheActivityId,
  speechProviderCacheActivityList,
  sttSetupRunningMessage,
} from "./AppSpeechProviderActions";

describe("App speech provider actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps speech provider cache activity IDs, limits, and counts stable", () => {
    expect(speechProviderCacheActivityId({ at: "2026-06-13T00:00:00.000Z", trigger: "manual", currentLength: 2 }))
      .toBe("2026-06-13T00:00:00.000Z:manual:2");
    expect(speechProviderAvailabilityCounts([
      { available: true },
      { available: false },
      { available: true },
    ])).toEqual({
      providerCount: 3,
      availableCount: 2,
      unavailableCount: 1,
    });

    const current = Array.from({ length: 5 }, (_, index) => ({
      id: `old-${index}`,
      at: `old-${index}`,
      trigger: "old",
    }));
    const next = speechProviderCacheActivityList(current, {
      at: "new",
      trigger: "manual",
    });

    expect(next).toHaveLength(5);
    expect(next[0]).toEqual({ id: "new:manual:5", at: "new", trigger: "manual" });
    expect(next.at(-1)?.id).toBe("old-3");
  });

  it("updates desktop STT settings from setup results", () => {
    const state = desktopState();
    const result = sttSetupResult({
      selectedProvider: sttProvider({ capabilityId: "stt:qwen3", available: true }),
      status: "ready",
    });

    expect(sttSetupRunningMessage("install")).toBe("Installing Qwen3-ASR...");
    expect(sttSetupRunningMessage("repair")).toBe("Repairing Qwen3-ASR...");
    expect(sttSetupRunningMessage("validate")).toBe("Validating Qwen3-ASR...");
    expect(desktopStateWithSttSetupResult({
      action: "validate",
      current: state,
      enable: true,
      result,
    }).settings.stt).toMatchObject({
      providerCapabilityId: "stt:qwen3",
      enabled: true,
    });
  });

  it("loads voice providers with cache activity and status updates", async () => {
    const providers = [
      voiceProvider({ capabilityId: "voice:one", available: true }),
      voiceProvider({ capabilityId: "voice:two", available: false }),
    ];
    vi.stubGlobal("window", {
      ambientDesktop: {
        listVoiceProviders: vi.fn(async () => providers),
      },
    });
    const controller = createController();

    await controller.actions.loadVoiceProviders("manual");

    expect(controller.voiceProviders.value).toEqual(providers);
    expect(controller.refs.voiceProviders.current).toEqual(providers);
    expect(controller.voiceLoading.value).toBe(false);
    expect(controller.voiceCacheStatus.value).toMatchObject({
      lastTrigger: "manual",
      providerCount: 2,
      error: undefined,
    });
    expect(controller.voiceCacheActivity.value[0]).toMatchObject({
      trigger: "manual",
      status: "success",
      providerCount: 2,
      availableCount: 1,
      unavailableCount: 1,
    });
  });

  it("sets up Qwen3-ASR and mirrors selected provider settings", async () => {
    const selectedProvider = sttProvider({ capabilityId: "stt:qwen3", available: true });
    const result = sttSetupResult({
      providers: [selectedProvider],
      selectedProvider,
      status: "ready",
    });
    const setupSttProvider = vi.fn(async () => result);
    vi.stubGlobal("window", {
      ambientDesktop: {
        setupSttProvider,
      },
    });
    const controller = createController({ state: desktopState() });

    await controller.actions.setupSttProvider("validate", { validationAudioPath: "/tmp/sample.wav", enable: true });

    expect(setupSttProvider).toHaveBeenCalledWith({
      provider: "qwen3-asr",
      action: "validate",
      installRuntime: false,
      validationAudioPath: "/tmp/sample.wav",
      selectProvider: true,
      enable: true,
      spokenLanguage: "en",
    });
    expect(controller.sttSetup.value).toMatchObject({
      status: "success",
      action: "validate",
      message: "Qwen3-ASR validated",
    });
    expect(controller.sttProviders.value).toEqual([selectedProvider]);
    expect(controller.refs.sttProviders.current).toEqual([selectedProvider]);
    expect(controller.state.value?.settings.stt).toMatchObject({
      providerCapabilityId: "stt:qwen3",
      enabled: true,
    });
  });

  it("refreshes voice catalogs with the existing status and cache shape", async () => {
    const result = {
      providerLabel: "Voice Provider",
      voiceCount: 12,
      refreshedAt: "2026-06-13T01:02:03.000Z",
      durationMs: 456,
    };
    const listVoiceProviders = vi.fn(async () => [voiceProvider({ capabilityId: "voice:one" })]);
    vi.stubGlobal("window", {
      ambientDesktop: {
        refreshVoiceProviderVoices: vi.fn(async () => result),
        listVoiceProviders,
      },
    });
    const controller = createController({
      voiceProvidersRef: mutableRef([voiceProvider({ capabilityId: "voice:one", label: "Voice Provider" })]),
    });

    await controller.actions.refreshVoiceCatalog("voice:one");

    expect(controller.voiceCatalogRefresh.value).toEqual({
      providerCapabilityId: "voice:one",
      status: "success",
      message: "Voice Provider: 12 voices refreshed.",
    });
    expect(controller.voiceCacheStatus.value.lastCatalogRefresh).toEqual(result);
    expect(listVoiceProviders).toHaveBeenCalled();
  });
});

function createController({
  state = desktopState(),
  voiceProvidersRef = mutableRef<VoiceProviderCandidate[]>([]),
  sttProvidersRef = mutableRef<SttProviderCandidate[]>([]),
}: {
  state?: DesktopState;
  voiceProvidersRef?: MutableRefObject<VoiceProviderCandidate[]>;
  sttProvidersRef?: MutableRefObject<SttProviderCandidate[]>;
} = {}) {
  const stateSetter = statefulSetter<DesktopState | undefined>(state);
  const voiceProviders = statefulSetter<VoiceProviderCandidate[]>([]);
  const sttProviders = statefulSetter<SttProviderCandidate[]>([]);
  const voiceLoading = statefulSetter(false);
  const sttLoading = statefulSetter(false);
  const voiceError = statefulSetter<string | undefined>(undefined);
  const sttError = statefulSetter<string | undefined>(undefined);
  const voiceCacheStatus = statefulSetter<VoiceProviderCacheStatus>({ providerCount: 0 });
  const sttCacheStatus = statefulSetter<SttProviderCacheStatus>({ providerCount: 0 });
  const voiceCacheActivity = statefulSetter<VoiceProviderCacheActivity[]>([]);
  const sttCacheActivity = statefulSetter<SttProviderCacheActivity[]>([]);
  const voiceCatalogRefresh = statefulSetter<VoiceCatalogRefreshState | undefined>(undefined);
  const sttSetup = statefulSetter<SttProviderSetupUiState>({ status: "idle" });
  const refs = {
    voiceProviders: voiceProvidersRef,
    sttProviders: sttProvidersRef,
    voiceRequestId: mutableRef(0),
    sttRequestId: mutableRef(0),
    voiceTimer: mutableRef<number | undefined>(undefined),
    sttTimer: mutableRef<number | undefined>(undefined),
  };
  return {
    actions: createAppSpeechProviderActions({
      setState: stateSetter.set,
      setSttProviderCacheActivity: sttCacheActivity.set,
      setSttProviderCacheStatus: sttCacheStatus.set,
      setSttProviderSetup: sttSetup.set,
      setSttProviders: sttProviders.set,
      setSttProvidersError: sttError.set,
      setSttProvidersLoading: sttLoading.set,
      setVoiceCatalogRefresh: voiceCatalogRefresh.set,
      setVoiceProviderCacheActivity: voiceCacheActivity.set,
      setVoiceProviderCacheStatus: voiceCacheStatus.set,
      setVoiceProviders: voiceProviders.set,
      setVoiceProvidersError: voiceError.set,
      setVoiceProvidersLoading: voiceLoading.set,
      state,
      sttProviderRefreshTimerRef: refs.sttTimer,
      sttProviderRequestIdRef: refs.sttRequestId,
      sttProvidersRef,
      voiceProviderRefreshTimerRef: refs.voiceTimer,
      voiceProviderRequestIdRef: refs.voiceRequestId,
      voiceProvidersRef,
    }),
    refs,
    state: stateSetter,
    sttCacheActivity,
    sttCacheStatus,
    sttError,
    sttLoading,
    sttProviders,
    sttSetup,
    voiceCacheActivity,
    voiceCacheStatus,
    voiceCatalogRefresh,
    voiceError,
    voiceLoading,
    voiceProviders,
  };
}

function statefulSetter<T>(initial: T): {
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = { value: initial };
  return {
    get value() {
      return state.value;
    },
    set(next) {
      state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    },
  };
}

function mutableRef<T>(current: T): MutableRefObject<T> {
  return { current };
}

function desktopState(): DesktopState {
  return {
    settings: {
      stt: {
        enabled: false,
        spokenLanguage: "en",
      },
    },
  } as unknown as DesktopState;
}

function voiceProvider(overrides: Partial<VoiceProviderCandidate> = {}): VoiceProviderCandidate {
  return {
    capabilityId: "voice:one",
    providerId: "voice-provider",
    packageId: "voice-package",
    packageName: "voice-package",
    command: "speak",
    label: "Voice Provider",
    available: true,
    ...overrides,
  } as VoiceProviderCandidate;
}

function sttProvider(overrides: Partial<SttProviderCandidate> = {}): SttProviderCandidate {
  return {
    capabilityId: "stt:qwen3",
    providerId: "stt-provider",
    packageId: "stt-package",
    packageName: "stt-package",
    command: "transcribe",
    label: "Qwen3-ASR",
    available: true,
    ...overrides,
  } as SttProviderCandidate;
}

function sttSetupResult(overrides: Partial<SttProviderSetupResult> = {}): SttProviderSetupResult {
  const selectedProvider = overrides.selectedProvider ?? sttProvider();
  return {
    provider: "qwen3-asr",
    packageId: "stt-package",
    packageName: "stt-package",
    status: "ready",
    providers: [selectedProvider],
    selectedProvider,
    installStatuses: [{ packageName: "stt-package", status: "installed" }],
    runtimeInstall: undefined,
    validation: {
      status: "passed",
      runtimeVersion: "qwen3",
    },
    nextSteps: [],
    ...overrides,
  } as SttProviderSetupResult;
}
