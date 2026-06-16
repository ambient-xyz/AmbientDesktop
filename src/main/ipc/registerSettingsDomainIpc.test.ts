import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { describe, expect, it, vi } from "vitest";

import { settingsIpcChannels } from "./registerSettingsIpc";
import {
  registerSettingsDomainIpc,
  settingsDomainIpcChannels,
  type SettingsDomainServices,
} from "./registerSettingsDomainIpc";

type IpcListener = Parameters<IpcMain["handle"]>[1];

describe("registerSettingsDomainIpc", () => {
  it("registers settings channels in the underlying settings registrar order", () => {
    const { handlers } = registerWithFakes();

    expect([...handlers.keys()]).toEqual([...settingsDomainIpcChannels]);
    expect([...settingsDomainIpcChannels]).toEqual([...settingsIpcChannels]);
  });

  it("routes settings actions through the settings service bundle", async () => {
    const { invoke, settingsServices } = registerWithFakes();

    await expect(invoke("appearance:set-theme-preference", { themePreference: "dark" }))
      .resolves.toEqual({ themePreference: "dark" });
    await expect(invoke("model-runtime:lifecycle-action", { action: "stop", runtimeId: "local-text-runtime" }))
      .resolves.toEqual({ status: "stopped" });

    expect(settingsServices.setThemePreference).toHaveBeenCalledWith({ themePreference: "dark" });
    expect(settingsServices.runLocalModelRuntimeLifecycleAction).toHaveBeenCalledWith({
      action: "stop",
      runtimeId: "local-text-runtime",
    });
  });

  it("keeps app packaging status as the domain-level app adapter", async () => {
    const { invoke, isAppPackaged, settingsServices } = registerWithFakes({ packaged: true });

    await expect(invoke("voice:onboarding-host-facts")).resolves.toEqual({ packaged: true });

    expect(isAppPackaged).toHaveBeenCalledOnce();
    expect(settingsServices.collectVoiceOnboardingHostFacts).toHaveBeenCalledWith({ isPackaged: true });
  });
});

function registerWithFakes({
  packaged = false,
}: {
  packaged?: boolean;
} = {}) {
  const handlers = new Map<string, IpcListener>();
  const isAppPackaged = vi.fn(() => packaged);
  const settingsServices = createSettingsServices();

  registerSettingsDomainIpc({
    handleIpc: vi.fn((channel: string, listener: IpcListener) => {
      handlers.set(channel, listener);
    }),
    isAppPackaged,
    settingsServices,
  });

  return {
    handlers,
    isAppPackaged,
    settingsServices,
    invoke: (channel: string, raw?: unknown) => {
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();
      if (!handler) throw new Error(`Missing handler for ${channel}`);
      return Promise.resolve(handler({} as IpcMainInvokeEvent, raw));
    },
  };
}

function createSettingsServices(): SettingsDomainServices {
  return {
    activeVoiceSttContextForProjectHost: vi.fn(() => ({
      targetStore: "project-store",
      workspacePath: "/workspace",
    })),
    analyzeMiniCpmVision: vi.fn(async () => ({} as any)),
    cancelSttTranscription: vi.fn(async () => ({} as any)),
    clearAgentMemory: vi.fn(async () => ({} as any)),
    clearMessageVoiceArtifact: vi.fn(async () => ({} as any)),
    collectVoiceOnboardingHostFacts: vi.fn(async ({ isPackaged }) => ({ packaged: isPackaged } as any)),
    emitRuntimeFeatureStateUpdated: vi.fn(),
    getAgentMemoryDiagnostics: vi.fn(async () => ({} as any)),
    hydrateSearchRoutingSettingsForActiveWorkspace: vi.fn(async () => ({} as any)),
    inspectVoiceArtifacts: vi.fn(async () => ({} as any)),
    installModelProviderEndpoint: vi.fn(async () => ({} as any)),
    listLocalDeepResearchRunsForSettings: vi.fn(async () => ({} as any)),
    listSttProvidersWithValidation: vi.fn(async () => []),
    listVoiceProvidersWithCachedVoices: vi.fn(async () => []),
    pruneVoiceArtifacts: vi.fn(async () => ({} as any)),
    refreshVoiceProviderCatalog: vi.fn(async () => ({} as any)),
    regenerateMessageVoice: vi.fn(async () => ({} as any)),
    requireActiveProjectRuntimeHost: vi.fn(() => ({
      store: "project-store",
    })),
    requireProjectRuntimeHostForThread: vi.fn(() => ({
      store: "thread-store",
    })),
    revealMessageVoiceArtifact: vi.fn(),
    runAgentMemoryEmbeddingLifecycleAction: vi.fn(async () => ({} as any)),
    runLocalModelRuntimeLifecycleAction: vi.fn(async () => ({ status: "stopped" } as any)),
    saveModelProviderCredential: vi.fn(async () => ({} as any)),
    saveSttTestAudio: vi.fn(async () => ({} as any)),
    setSttTtsSpeaking: vi.fn(async () => ({} as any)),
    setThemePreference: vi.fn(async (input) => input as any),
    setupLocalDeepResearch: vi.fn(async () => ({} as any)),
    setupMiniCpmVision: vi.fn(async () => ({} as any)),
    setupSttProvider: vi.fn(async () => ({} as any)),
    transcribeSttAudio: vi.fn(async () => ({} as any)),
    updateFeatureFlagSettings: vi.fn(async () => ({} as any)),
    updateLocalDeepResearchSettings: vi.fn(async () => ({} as any)),
    updateMediaPlaybackSettings: vi.fn(async () => ({} as any)),
    updateMemorySettings: vi.fn(async () => ({} as any)),
    updateModelRuntimeSettings: vi.fn(async () => ({} as any)),
    updatePlannerSettings: vi.fn(async () => ({} as any)),
    updateSearchRoutingSettings: vi.fn(async () => ({} as any)),
    updateSttSettings: vi.fn(async () => ({} as any)),
    updateThinkingDisplaySettings: vi.fn(async () => ({} as any)),
    updateVoiceSettings: vi.fn(async () => ({} as any)),
  };
}
