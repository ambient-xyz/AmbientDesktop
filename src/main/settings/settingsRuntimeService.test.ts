import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import {
  applyAgentMemorySettingsPatch,
  normalizeAgentMemorySettings,
  type AgentMemorySettings,
  type UpdateAgentMemorySettingsInput,
} from "../../shared/agentMemorySettings";
import {
  applyAmbientFeatureFlagSettingsPatch,
  normalizeAmbientFeatureFlagSettings,
  resolveAmbientFeatureFlags,
  type AmbientFeatureFlagSettings,
  type UpdateFeatureFlagSettingsInput,
} from "../../shared/featureFlags";
import type { LocalModelRuntimeLifecycleActionInput, LocalModelRuntimeLifecycleActionResult } from "../../shared/localRuntimeTypes";
import type { ModelRuntimeSettings } from "../../shared/threadTypes";
import {
  createSettingsRuntimeService,
  type SettingsRuntimeProjectRuntime,
  type SettingsRuntimeProjectRuntimeHost,
  type SettingsRuntimeProjectStore,
  type SettingsRuntimeServiceDependencies,
  type SettingsRuntimeStateSlot,
} from "./settingsRuntimeService";

describe("settingsRuntimeService", () => {
  it("updates model runtime settings and only reapplies runtime settings when aggressive retry behavior changes", async () => {
    const fixture = createFixture();

    await fixture.service.updateModelRuntimeSettings({ providerStreamIdleTimeoutMs: 90_000 }, fixture.host);
    expect(fixture.runtime.applyRuntimeSettings).not.toHaveBeenCalled();
    expect(fixture.emitProjectStateIfActive).toHaveBeenCalledTimes(1);

    await fixture.service.updateModelRuntimeSettings({ aggressiveRetries: true }, fixture.host);
    expect(fixture.runtime.applyRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({ aggressiveRetries: true }));
    expect(fixture.emitProjectStateIfActive).toHaveBeenCalledTimes(2);
  });

  it("installs endpoint model providers through managed secret references and reapplies returned settings", async () => {
    const fixture = createFixture({
      readSecretReferenceImpl: vi.fn(async (ref: string) => ref === "secret-ref" ? "  managed-secret  " : undefined),
      installModelProviderEndpointForSettingsImpl: vi.fn(async ({ request, store, resolveSecret }) => {
        const secret = await resolveSecret({
          templateId: request.templateId,
          providerId: request.providerId,
          modelId: request.modelId,
          baseUrl: request.baseUrl,
          credentialRef: request.credentialRef,
        });
        expect(secret).toEqual({
          ambientManagedSecret: "managed-secret",
          secretRef: {
            schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1",
            flow: "ambient_cli_secret_request",
            configured: true,
            label: "Test key",
            ref: "secret-ref",
          },
        });
        const settings = store.setModelRuntimeSettings({ aggressiveRetries: true });
        return {
          schemaVersion: "ambient-model-provider-settings-install-v1" as const,
          installedProviderKey: "test-provider:model",
          settings,
          probeResult: {} as never,
        };
      }),
    });

    const result = await fixture.service.installModelProviderEndpoint({
      templateId: "openai-compatible",
      providerId: "test-provider",
      modelId: "model",
      baseUrl: "https://provider.example/v1",
      credentialRef: {
        flow: "ambient_cli_secret_request",
        managedSecretRef: "secret-ref",
        label: "Test key",
      },
    }, fixture.host);

    expect(result.installedProviderKey).toBe("test-provider:model");
    expect(fixture.runtime.applyRuntimeSettings).toHaveBeenCalledWith(expect.objectContaining({ aggressiveRetries: true }));
    expect(fixture.emitProjectStateIfActive).toHaveBeenCalledWith(fixture.host);
  });

  it("starts and stops managed memory embeddings when feature and memory defaults cross the autostart boundary", async () => {
    const fixture = createFixture();
    fixture.store.featureFlags = normalizeAmbientFeatureFlagSettings({ tencentDbMemory: false });
    fixture.store.memory = normalizeAgentMemorySettings({
      enabled: true,
      defaultThreadEnabled: true,
      embeddings: {
        enabled: true,
        autoStartProvider: true,
      },
    });

    await fixture.service.updateFeatureFlagSettings({ tencentDbMemory: true }, fixture.host);
    expect(fixture.memoryLifecycle.startManagedEmbeddingsAfterSettingsUpdate).toHaveBeenCalledWith(fixture.host, fixture.store);
    expect(fixture.memoryLifecycle.stopManagedEmbeddingsAfterSettingsUpdate).not.toHaveBeenCalled();
    expect(fixture.runtime.applyFeatureFlags).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: "ambient-feature-flags-v1" }));

    await fixture.service.updateFeatureFlagSettings({ tencentDbMemory: false }, fixture.host);
    expect(fixture.memoryLifecycle.stopManagedEmbeddingsAfterSettingsUpdate).toHaveBeenCalledWith(fixture.host, fixture.store);

    await fixture.service.updateMemorySettings({ enabled: false }, fixture.host);
    expect(fixture.runtime.applyMemorySettings).toHaveBeenCalled();
    expect(fixture.emitProjectStateIfActive).toHaveBeenCalledWith(fixture.host);
  });

  it("rejects local model runtime lifecycle actions while subagents are disabled", async () => {
    const fixture = createFixture();

    await expect(fixture.service.runLocalModelRuntimeLifecycleAction({ action: "stop", runtimeId: "llama" }, fixture.host))
      .rejects.toThrow("Local model runtime lifecycle controls are disabled");

    fixture.store.featureFlags = normalizeAmbientFeatureFlagSettings({ subagents: true });
    await expect(fixture.service.runLocalModelRuntimeLifecycleAction({ action: "stop", runtimeId: "llama" }, fixture.host))
      .resolves.toEqual(expect.objectContaining({ action: "stop", runtimeId: "llama", status: "stopped" }));
    expect(fixture.runtime.runLocalModelRuntimeLifecycleAction).toHaveBeenCalledWith({ action: "stop", runtimeId: "llama" });
  });

  it("hydrates search routing settings with active-workspace Ambient CLI and MCP discovery", async () => {
    const discoverAmbientCliCatalogForSearchRouting = vi.fn(async () => ({ packages: [], errors: [] }));
    const discoverMcpToolsForSearchRouting = vi.fn(async () => []);
    const hydrateWebResearchSettingsImpl = vi.fn(async ({ discoverAmbientCliCatalog, discoverMcpTools }) => {
      expect(await discoverAmbientCliCatalog()).toEqual({ packages: [], errors: [] });
      expect(await discoverMcpTools()).toEqual([]);
      return { webResearch: { providers: [] } } as never;
    });
    const fixture = createFixture({
      discoverAmbientCliCatalogForSearchRouting,
      discoverMcpToolsForSearchRouting,
      hydrateWebResearchSettingsImpl,
    });

    await expect(fixture.service.hydrateSearchRoutingSettingsForActiveWorkspace()).resolves.toEqual({
      webResearch: { providers: [] },
    });
    expect(discoverAmbientCliCatalogForSearchRouting).toHaveBeenCalledWith(fixture.host.workspacePath);
    expect(discoverMcpToolsForSearchRouting).toHaveBeenCalledWith(fixture.host.workspacePath);
  });
});

class FakeSettingsStore implements SettingsRuntimeProjectStore {
  modelRuntime: ModelRuntimeSettings = {
    aggressiveRetries: false,
    showPromptCacheStatus: false,
    providerPreStreamTimeoutMs: 30_000,
    providerStreamIdleTimeoutMs: 30_000,
    installedProviders: [],
  };
  featureFlags: AmbientFeatureFlagSettings = normalizeAmbientFeatureFlagSettings();
  memory: AgentMemorySettings = normalizeAgentMemorySettings();

  getModelRuntimeSettings(): ModelRuntimeSettings {
    return this.modelRuntime;
  }

  setModelRuntimeSettings(input: Partial<ModelRuntimeSettings>): ModelRuntimeSettings {
    this.modelRuntime = { ...this.modelRuntime, ...input };
    return this.modelRuntime;
  }

  getFeatureFlagSettings(): AmbientFeatureFlagSettings {
    return this.featureFlags;
  }

  setFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput): AmbientFeatureFlagSettings {
    this.featureFlags = applyAmbientFeatureFlagSettingsPatch(this.featureFlags, input);
    return this.featureFlags;
  }

  getMemorySettings(): AgentMemorySettings {
    return this.memory;
  }

  setMemorySettings(input: UpdateAgentMemorySettingsInput): AgentMemorySettings {
    this.memory = applyAgentMemorySettingsPatch(this.memory, input);
    return this.memory;
  }
}

function createFixture(overrides: Partial<SettingsRuntimeServiceDependencies<TestHost>> = {}) {
  const store = new FakeSettingsStore();
  const runtime: SettingsRuntimeProjectRuntime = {
    applyRuntimeSettings: vi.fn(),
    runLocalModelRuntimeLifecycleAction: vi.fn(async (input: LocalModelRuntimeLifecycleActionInput): Promise<LocalModelRuntimeLifecycleActionResult> => ({
      schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
      action: input.action,
      runtimeId: input.runtimeId,
      status: "stopped",
      message: "Stopped.",
      dryRun: Boolean(input.dryRun),
      forceRequested: Boolean(input.force),
      before: {
        inventory: {} as never,
        localModelResources: {} as never,
      },
    })),
    applyFeatureFlags: vi.fn(),
    applyMemorySettings: vi.fn(),
  };
  const host: TestHost = {
    workspacePath: "/tmp/ambient-workspace",
    store,
    runtime,
  };
  const mediaPlaybackSettings = stateSlot({ generatedMediaAutoplay: false });
  const thinkingDisplaySettings = stateSlot({ mode: "transient" as const, showRunStatusCard: false });
  const plannerSettings = stateSlot({ autoFinalize: true });
  const searchRoutingSettings = stateSlot({});
  const localDeepResearchSettings = stateSlot({
    enabled: false,
    providers: [],
  } as never);
  const memoryLifecycle = {
    defaultManagedEmbeddingAutoStartEnabled: vi.fn((settings: AgentMemorySettings) =>
      Boolean(settings.enabled && settings.embeddings.enabled && settings.embeddings.autoStartProvider),
    ),
    defaultManagedEmbeddingAutoStartEnabledForFeature: vi.fn((settings: AgentMemorySettings, featureEnabled: boolean) =>
      Boolean(featureEnabled && settings.enabled && settings.embeddings.enabled && settings.embeddings.autoStartProvider),
    ),
    shouldStartManagedEmbeddingsAfterSettingsUpdate: vi.fn((previous: AgentMemorySettings, next: AgentMemorySettings) =>
      !previous.embeddings.autoStartProvider && next.embeddings.autoStartProvider,
    ),
    startManagedEmbeddingsAfterSettingsUpdate: vi.fn(),
    stopManagedEmbeddingsAfterSettingsUpdate: vi.fn(),
  };
  const emitDesktopState = vi.fn();
  const emitProjectStateIfActive = vi.fn();
  const dependencies: SettingsRuntimeServiceDependencies<TestHost> = {
    appearancePreferencesPath: () => join(tmpdir(), "ambient-settings-runtime-test.json"),
    setThemePreferenceState: vi.fn((themePreference) => ({ themePreference, resolvedTheme: themePreference === "dark" ? "dark" as const : "light" as const })),
    publishAppearanceUpdated: vi.fn(),
    requireActiveProjectRuntimeHost: () => host,
    currentFeatureFlagSnapshot: (targetStore) => resolveAmbientFeatureFlags({ settings: targetStore.getFeatureFlagSettings() }),
    emitDesktopState,
    emitProjectStateIfActive,
    memoryLifecycle,
    mediaPlaybackSettings,
    thinkingDisplaySettings,
    plannerSettings,
    searchRoutingSettings,
    localDeepResearchSettings,
    normalizeThinkingDisplaySettings: (input) => input,
    normalizePlannerSettings: (input) => input,
    normalizeSearchRoutingSettings: (input) => input,
    normalizeLocalDeepResearchAppSettings: (input) => input as never,
    writeThemePreference: vi.fn(async () => undefined),
    writeMediaPlaybackSettings: vi.fn(async () => undefined),
    writeThinkingDisplaySettings: vi.fn(async () => undefined),
    writePlannerSettings: vi.fn(async () => undefined),
    writeSearchRoutingSettings: vi.fn(async () => undefined),
    writeLocalDeepResearchSettings: vi.fn(async () => undefined),
    saveModelProviderCredentialForSettingsImpl: vi.fn(async ({ input }) => ({
      schemaVersion: "ambient-model-provider-credential-save-v1" as const,
      templateId: input.templateId,
      providerId: input.providerId ?? "provider",
      modelId: input.modelId,
      baseUrl: input.baseUrl,
      configured: true as const,
      credentialRef: {
        flow: "ambient_cli_secret_request" as const,
        managedSecretRef: "secret-ref",
      },
    })),
    installModelProviderEndpointForSettingsImpl: vi.fn(async ({ store }) => ({
      schemaVersion: "ambient-model-provider-settings-install-v1" as const,
      installedProviderKey: "provider:model",
      settings: store.getModelRuntimeSettings(),
      probeResult: {} as never,
    })),
    readSecretReferenceImpl: vi.fn(async () => "managed-secret"),
    discoverAmbientCliCatalogForSearchRouting: vi.fn(async () => ({ packages: [], errors: [] })),
    discoverMcpToolsForSearchRouting: vi.fn(async () => []),
    hydrateWebResearchSettingsImpl: vi.fn(async () => ({})),
    ...overrides,
  };

  return {
    service: createSettingsRuntimeService(dependencies),
    host,
    store,
    runtime,
    memoryLifecycle,
    emitDesktopState,
    emitProjectStateIfActive,
  };
}

type TestHost = SettingsRuntimeProjectRuntimeHost<FakeSettingsStore>;

function stateSlot<Value>(initial: Value): SettingsRuntimeStateSlot<Value> {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
}
