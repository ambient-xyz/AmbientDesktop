import { agentMemoryModeAllowsManagedRuntime, type AgentMemorySettings, type UpdateAgentMemorySettingsInput } from "../../shared/agentMemorySettings";
import type {
  AppAppearance,
  ThinkingDisplaySettings,
  UpdateLocalDeepResearchSettingsInput,
  UpdateMediaPlaybackSettingsInput,
  UpdateModelRuntimeSettingsInput,
  UpdatePlannerSettingsInput,
  UpdateSearchRoutingSettingsInput,
  UpdateThinkingDisplaySettingsInput,
} from "../../shared/desktopTypes";
import type { AmbientFeatureFlagSnapshot, AmbientFeatureFlagSettings, UpdateFeatureFlagSettingsInput } from "../../shared/featureFlags";
import { isAmbientSubagentsEnabled, isAmbientTencentDbMemoryEnabled } from "../../shared/featureFlags";
import type {
  LocalDeepResearchSettings,
  LocalModelRuntimeLifecycleActionInput,
  LocalModelRuntimeLifecycleActionResult,
  MediaPlaybackSettings,
} from "../../shared/localRuntimeTypes";
import type { PlannerSettings } from "../../shared/plannerTypes";
import type { ModelProviderCredentialSaveResult } from "../../shared/pluginTypes";
import type {
  InstallModelProviderEndpointInput,
  InstallModelProviderEndpointResult,
  ModelRuntimeInstalledProviderSecretRef,
  ModelRuntimeSettings,
  SaveModelProviderCredentialInput,
} from "../../shared/threadTypes";
import type { SearchRoutingSettings } from "../../shared/webResearchTypes";

export interface SettingsRuntimeProjectStore {
  getModelRuntimeSettings(): ModelRuntimeSettings;
  setModelRuntimeSettings(input: Partial<ModelRuntimeSettings>): ModelRuntimeSettings;
  getFeatureFlagSettings(): AmbientFeatureFlagSettings;
  setFeatureFlagSettings(input: UpdateFeatureFlagSettingsInput): AmbientFeatureFlagSettings;
  getMemorySettings(): AgentMemorySettings;
  setMemorySettings(input: UpdateAgentMemorySettingsInput): AgentMemorySettings;
}

export interface SettingsRuntimeProjectRuntime {
  applyRuntimeSettings(settings: ModelRuntimeSettings): void;
  runLocalModelRuntimeLifecycleAction(input: LocalModelRuntimeLifecycleActionInput): Promise<LocalModelRuntimeLifecycleActionResult>;
  applyFeatureFlags(snapshot: AmbientFeatureFlagSnapshot): void;
  applyMemorySettings(): unknown;
}

export interface SettingsRuntimeProjectRuntimeHost<Store extends SettingsRuntimeProjectStore = SettingsRuntimeProjectStore> {
  workspacePath: string;
  store: Store;
  runtime: SettingsRuntimeProjectRuntime;
}

export interface SettingsRuntimeStateSlot<Value> {
  get(): Value;
  set(value: Value): void;
}

export interface SettingsRuntimeUpdateStateOptions {
  onStateUpdated?: () => void;
}

export interface SettingsRuntimeMemoryLifecycleDependencies<Host extends SettingsRuntimeProjectRuntimeHost> {
  defaultManagedEmbeddingAutoStartEnabled(settings: AgentMemorySettings, store: Host["store"]): boolean;
  defaultManagedEmbeddingAutoStartEnabledForFeature(settings: AgentMemorySettings, featureEnabled: boolean): boolean;
  shouldStartManagedEmbeddingsAfterSettingsUpdate(previous: AgentMemorySettings, next: AgentMemorySettings): boolean;
  startManagedEmbeddingsAfterSettingsUpdate(host: Host, store: Host["store"]): void;
  stopManagedEmbeddingsAfterSettingsUpdate(host: Host, store: Host["store"]): void;
}

export interface SettingsRuntimeSecretRequest {
  templateId: string;
  providerId?: string;
  modelId: string;
  baseUrl: string;
  credentialRef?: InstallModelProviderEndpointInput["credentialRef"];
}

export interface SettingsRuntimeSecretResolution {
  ambientManagedSecret: string;
  secretRef: ModelRuntimeInstalledProviderSecretRef;
}

export interface SettingsRuntimeEndpointInstallInput<Host extends SettingsRuntimeProjectRuntimeHost> {
  request: InstallModelProviderEndpointInput;
  store: Host["store"];
  resolveSecret(input: SettingsRuntimeSecretRequest): Promise<SettingsRuntimeSecretResolution> | SettingsRuntimeSecretResolution;
}

export interface SettingsRuntimeSearchRoutingHydrationInput {
  settings: SearchRoutingSettings;
  discoverAmbientCliCatalog(): Promise<unknown>;
  discoverMcpTools(): Promise<unknown>;
}

export interface SettingsRuntimeServiceDependencies<Host extends SettingsRuntimeProjectRuntimeHost> {
  appearancePreferencesPath(): string;
  setThemePreferenceState(preference: AppAppearance["themePreference"]): AppAppearance;
  publishAppearanceUpdated(): void;
  requireActiveProjectRuntimeHost(): Host;
  currentFeatureFlagSnapshot(store: Host["store"]): AmbientFeatureFlagSnapshot;
  emitDesktopState(): void;
  emitProjectStateIfActive(host: Host): void;
  memoryLifecycle: SettingsRuntimeMemoryLifecycleDependencies<Host>;
  mediaPlaybackSettings: SettingsRuntimeStateSlot<MediaPlaybackSettings>;
  thinkingDisplaySettings: SettingsRuntimeStateSlot<ThinkingDisplaySettings>;
  plannerSettings: SettingsRuntimeStateSlot<PlannerSettings>;
  searchRoutingSettings: SettingsRuntimeStateSlot<SearchRoutingSettings>;
  localDeepResearchSettings: SettingsRuntimeStateSlot<LocalDeepResearchSettings>;
  normalizeThinkingDisplaySettings(input: UpdateThinkingDisplaySettingsInput): ThinkingDisplaySettings;
  normalizePlannerSettings(input: UpdatePlannerSettingsInput): PlannerSettings;
  normalizeSearchRoutingSettings(input: UpdateSearchRoutingSettingsInput): SearchRoutingSettings;
  normalizeLocalDeepResearchAppSettings(input: UpdateLocalDeepResearchSettingsInput): LocalDeepResearchSettings;
  writeThemePreference(path: string, preference: AppAppearance["themePreference"]): Promise<void>;
  writeMediaPlaybackSettings(path: string, settings: MediaPlaybackSettings): Promise<void>;
  writeThinkingDisplaySettings(path: string, settings: ThinkingDisplaySettings): Promise<void>;
  writePlannerSettings(path: string, settings: PlannerSettings): Promise<void>;
  writeSearchRoutingSettings(path: string, settings: SearchRoutingSettings): Promise<void>;
  writeLocalDeepResearchSettings(path: string, settings: LocalDeepResearchSettings): Promise<void>;
  saveModelProviderCredentialForSettingsImpl(input: {
    workspacePath: string;
    input: SaveModelProviderCredentialInput;
  }): Promise<ModelProviderCredentialSaveResult>;
  installModelProviderEndpointForSettingsImpl(input: SettingsRuntimeEndpointInstallInput<Host>): Promise<InstallModelProviderEndpointResult>;
  readSecretReferenceImpl(ref: string): Promise<string | undefined> | string | undefined;
  discoverAmbientCliCatalogForSearchRouting(workspacePath: string): Promise<unknown>;
  discoverMcpToolsForSearchRouting(workspacePath: string): Promise<unknown>;
  hydrateWebResearchSettingsImpl(input: SettingsRuntimeSearchRoutingHydrationInput): Promise<SearchRoutingSettings>;
}

export interface SettingsRuntimeService {
  setThemePreference(input: { themePreference: AppAppearance["themePreference"] }): Promise<AppAppearance>;
  updateMediaPlaybackSettings(
    input: UpdateMediaPlaybackSettingsInput,
    options?: SettingsRuntimeUpdateStateOptions,
  ): Promise<MediaPlaybackSettings>;
  updateThinkingDisplaySettings(input: UpdateThinkingDisplaySettingsInput): Promise<ThinkingDisplaySettings>;
  updateModelRuntimeSettings(input: UpdateModelRuntimeSettingsInput, host?: SettingsRuntimeProjectRuntimeHost): Promise<ModelRuntimeSettings>;
  saveModelProviderCredential(
    input: SaveModelProviderCredentialInput,
    host?: SettingsRuntimeProjectRuntimeHost,
  ): Promise<ModelProviderCredentialSaveResult>;
  installModelProviderEndpoint(
    input: InstallModelProviderEndpointInput,
    host?: SettingsRuntimeProjectRuntimeHost,
  ): Promise<InstallModelProviderEndpointResult>;
  runLocalModelRuntimeLifecycleAction(
    input: LocalModelRuntimeLifecycleActionInput,
    host?: SettingsRuntimeProjectRuntimeHost,
  ): Promise<LocalModelRuntimeLifecycleActionResult>;
  updateFeatureFlagSettings(
    input: UpdateFeatureFlagSettingsInput,
    host?: SettingsRuntimeProjectRuntimeHost,
    options?: { runManagedEmbeddingLifecycle?: boolean },
  ): Promise<AmbientFeatureFlagSettings>;
  updateMemorySettings(
    input: UpdateAgentMemorySettingsInput,
    host?: SettingsRuntimeProjectRuntimeHost,
    options?: { runManagedEmbeddingLifecycle?: boolean; startManagedEmbeddings?: boolean },
  ): Promise<AgentMemorySettings>;
  updatePlannerSettings(input: UpdatePlannerSettingsInput, options?: SettingsRuntimeUpdateStateOptions): Promise<PlannerSettings>;
  updateSearchRoutingSettings(input: UpdateSearchRoutingSettingsInput, options?: SettingsRuntimeUpdateStateOptions): Promise<SearchRoutingSettings>;
  updateLocalDeepResearchSettings(
    input: UpdateLocalDeepResearchSettingsInput,
    options?: SettingsRuntimeUpdateStateOptions,
  ): Promise<LocalDeepResearchSettings>;
  hydrateSearchRoutingSettingsForActiveWorkspace(): Promise<SearchRoutingSettings>;
}

export function createSettingsRuntimeService<Host extends SettingsRuntimeProjectRuntimeHost>(
  dependencies: SettingsRuntimeServiceDependencies<Host>,
): SettingsRuntimeService {
  function requireHost(host: SettingsRuntimeProjectRuntimeHost | undefined): Host {
    return (host ?? dependencies.requireActiveProjectRuntimeHost()) as Host;
  }

  function notifyStateUpdated(options: SettingsRuntimeUpdateStateOptions | undefined): void {
    if (options?.onStateUpdated) options.onStateUpdated();
    else dependencies.emitDesktopState();
  }

  async function setThemePreference(input: { themePreference: AppAppearance["themePreference"] }): Promise<AppAppearance> {
    await dependencies.writeThemePreference(dependencies.appearancePreferencesPath(), input.themePreference);
    const appearance = dependencies.setThemePreferenceState(input.themePreference);
    dependencies.publishAppearanceUpdated();
    return appearance;
  }

  async function updateMediaPlaybackSettings(
    input: UpdateMediaPlaybackSettingsInput,
    options: SettingsRuntimeUpdateStateOptions = {},
  ): Promise<MediaPlaybackSettings> {
    const next = { generatedMediaAutoplay: input.generatedMediaAutoplay };
    dependencies.mediaPlaybackSettings.set(next);
    await dependencies.writeMediaPlaybackSettings(dependencies.appearancePreferencesPath(), next);
    notifyStateUpdated(options);
    return next;
  }

  async function updateThinkingDisplaySettings(input: UpdateThinkingDisplaySettingsInput): Promise<ThinkingDisplaySettings> {
    const next = dependencies.normalizeThinkingDisplaySettings(input);
    dependencies.thinkingDisplaySettings.set(next);
    await dependencies.writeThinkingDisplaySettings(dependencies.appearancePreferencesPath(), next);
    dependencies.emitDesktopState();
    return next;
  }

  async function updateModelRuntimeSettings(
    input: UpdateModelRuntimeSettingsInput,
    host?: SettingsRuntimeProjectRuntimeHost,
  ): Promise<ModelRuntimeSettings> {
    const targetHost = requireHost(host);
    const previous = targetHost.store.getModelRuntimeSettings();
    const next = targetHost.store.setModelRuntimeSettings(input);
    if (previous.aggressiveRetries !== next.aggressiveRetries) {
      targetHost.runtime.applyRuntimeSettings(next);
    }
    dependencies.emitProjectStateIfActive(targetHost);
    return next;
  }

  async function saveModelProviderCredential(
    input: SaveModelProviderCredentialInput,
    host?: SettingsRuntimeProjectRuntimeHost,
  ): Promise<ModelProviderCredentialSaveResult> {
    const targetHost = requireHost(host);
    return dependencies.saveModelProviderCredentialForSettingsImpl({
      workspacePath: targetHost.workspacePath,
      input,
    });
  }

  async function installModelProviderEndpoint(
    input: InstallModelProviderEndpointInput,
    host?: SettingsRuntimeProjectRuntimeHost,
  ): Promise<InstallModelProviderEndpointResult> {
    const targetHost = requireHost(host);
    const result = await dependencies.installModelProviderEndpointForSettingsImpl({
      request: {
        templateId: input.templateId,
        providerId: input.providerId,
        providerLabel: input.providerLabel,
        modelId: input.modelId,
        modelLabel: input.modelLabel,
        baseUrl: input.baseUrl,
        generatedAt: input.generatedAt,
        measuredAt: input.measuredAt,
        timeoutMs: input.timeoutMs,
        anthropicVersion: input.anthropicVersion,
        reliabilitySampleCount: input.reliabilitySampleCount,
        extraProbeIds: input.extraProbeIds,
        enabled: input.enabled,
        credentialRef: input.credentialRef,
      },
      store: targetHost.store,
      resolveSecret: async (request) => {
        const credentialRef = request.credentialRef;
        if (!credentialRef) throw new Error("Model provider endpoint install requires credentialRef.managedSecretRef.");
        const ref = credentialRef.managedSecretRef;
        const ambientManagedSecret = (await dependencies.readSecretReferenceImpl(ref))?.trim();
        if (!ambientManagedSecret) throw new Error("Model provider endpoint install credential reference is not configured.");
        return {
          ambientManagedSecret,
          secretRef: {
            schemaVersion: "ambient-model-runtime-installed-provider-secret-ref-v1",
            flow: credentialRef.flow,
            configured: true,
            label: credentialRef.label,
            ref,
          },
        };
      },
    });
    targetHost.runtime.applyRuntimeSettings(result.settings);
    dependencies.emitProjectStateIfActive(targetHost);
    return result;
  }

  async function runLocalModelRuntimeLifecycleAction(
    input: LocalModelRuntimeLifecycleActionInput,
    host?: SettingsRuntimeProjectRuntimeHost,
  ): Promise<LocalModelRuntimeLifecycleActionResult> {
    const targetHost = requireHost(host);
    if (!isAmbientSubagentsEnabled(dependencies.currentFeatureFlagSnapshot(targetHost.store))) {
      throw new Error("Local model runtime lifecycle controls are disabled while ambient.subagents is off.");
    }
    const result = await targetHost.runtime.runLocalModelRuntimeLifecycleAction(input);
    dependencies.emitProjectStateIfActive(targetHost);
    return result;
  }

  async function updateFeatureFlagSettings(
    input: UpdateFeatureFlagSettingsInput,
    host?: SettingsRuntimeProjectRuntimeHost,
    options: { runManagedEmbeddingLifecycle?: boolean } = {},
  ): Promise<AmbientFeatureFlagSettings> {
    const targetHost = requireHost(host);
    const targetStore = targetHost.store;
    const memorySettings = targetStore.getMemorySettings();
    const previousFeatureEnabled = isAmbientTencentDbMemoryEnabled(dependencies.currentFeatureFlagSnapshot(targetStore));
    const previousDefaultAutoStart = dependencies.memoryLifecycle.defaultManagedEmbeddingAutoStartEnabledForFeature(
      memorySettings,
      previousFeatureEnabled,
    );
    const next = targetStore.setFeatureFlagSettings(input);
    const nextFeatureEnabled = isAmbientTencentDbMemoryEnabled(dependencies.currentFeatureFlagSnapshot(targetStore));
    const nextDefaultAutoStart = dependencies.memoryLifecycle.defaultManagedEmbeddingAutoStartEnabledForFeature(memorySettings, nextFeatureEnabled);
    targetHost.runtime.applyFeatureFlags(dependencies.currentFeatureFlagSnapshot(targetStore));
    if (options.runManagedEmbeddingLifecycle !== false) {
      if ((previousFeatureEnabled && !nextFeatureEnabled) || (previousDefaultAutoStart && !nextDefaultAutoStart)) {
        dependencies.memoryLifecycle.stopManagedEmbeddingsAfterSettingsUpdate(targetHost, targetStore);
      } else if (!previousDefaultAutoStart && nextDefaultAutoStart) {
        dependencies.memoryLifecycle.startManagedEmbeddingsAfterSettingsUpdate(targetHost, targetStore);
      }
    }
    dependencies.emitProjectStateIfActive(targetHost);
    return next;
  }

  async function updateMemorySettings(
    input: UpdateAgentMemorySettingsInput,
    host?: SettingsRuntimeProjectRuntimeHost,
    options: { runManagedEmbeddingLifecycle?: boolean; startManagedEmbeddings?: boolean } = {},
  ): Promise<AgentMemorySettings> {
    const targetHost = requireHost(host);
    const targetStore = targetHost.store;
    const previous = targetStore.getMemorySettings();
    const next = targetStore.setMemorySettings(input);
    targetHost.runtime.applyMemorySettings();
    const previousDefaultAutoStart = dependencies.memoryLifecycle.defaultManagedEmbeddingAutoStartEnabled(previous, targetStore);
    const nextDefaultAutoStart = dependencies.memoryLifecycle.defaultManagedEmbeddingAutoStartEnabled(next, targetStore);
    if (options.runManagedEmbeddingLifecycle !== false) {
      if (!agentMemoryModeAllowsManagedRuntime(next) || !next.embeddings.enabled || (previousDefaultAutoStart && !nextDefaultAutoStart)) {
        dependencies.memoryLifecycle.stopManagedEmbeddingsAfterSettingsUpdate(targetHost, targetStore);
      } else if (
        nextDefaultAutoStart &&
        options.startManagedEmbeddings !== false &&
        dependencies.memoryLifecycle.shouldStartManagedEmbeddingsAfterSettingsUpdate(previous, next)
      ) {
        dependencies.memoryLifecycle.startManagedEmbeddingsAfterSettingsUpdate(targetHost, targetStore);
      }
    }
    dependencies.emitProjectStateIfActive(targetHost);
    return targetStore.getMemorySettings();
  }

  async function updatePlannerSettings(
    input: UpdatePlannerSettingsInput,
    options: SettingsRuntimeUpdateStateOptions = {},
  ): Promise<PlannerSettings> {
    const next = dependencies.normalizePlannerSettings(input);
    dependencies.plannerSettings.set(next);
    await dependencies.writePlannerSettings(dependencies.appearancePreferencesPath(), next);
    notifyStateUpdated(options);
    return next;
  }

  async function updateSearchRoutingSettings(
    input: UpdateSearchRoutingSettingsInput,
    options: SettingsRuntimeUpdateStateOptions = {},
  ): Promise<SearchRoutingSettings> {
    const next = dependencies.normalizeSearchRoutingSettings(input);
    dependencies.searchRoutingSettings.set(next);
    await dependencies.writeSearchRoutingSettings(dependencies.appearancePreferencesPath(), next);
    notifyStateUpdated(options);
    return next;
  }

  async function updateLocalDeepResearchSettings(
    input: UpdateLocalDeepResearchSettingsInput,
    options: SettingsRuntimeUpdateStateOptions = {},
  ): Promise<LocalDeepResearchSettings> {
    const next = dependencies.normalizeLocalDeepResearchAppSettings(input);
    dependencies.localDeepResearchSettings.set(next);
    await dependencies.writeLocalDeepResearchSettings(dependencies.appearancePreferencesPath(), next);
    notifyStateUpdated(options);
    return next;
  }

  async function hydrateSearchRoutingSettingsForActiveWorkspace(): Promise<SearchRoutingSettings> {
    const targetHost = dependencies.requireActiveProjectRuntimeHost();
    return dependencies.hydrateWebResearchSettingsImpl({
      settings: dependencies.searchRoutingSettings.get(),
      discoverAmbientCliCatalog: () => dependencies.discoverAmbientCliCatalogForSearchRouting(targetHost.workspacePath),
      discoverMcpTools: () => dependencies.discoverMcpToolsForSearchRouting(targetHost.workspacePath),
    });
  }

  return {
    setThemePreference,
    updateMediaPlaybackSettings,
    updateThinkingDisplaySettings,
    updateModelRuntimeSettings,
    saveModelProviderCredential,
    installModelProviderEndpoint,
    runLocalModelRuntimeLifecycleAction,
    updateFeatureFlagSettings,
    updateMemorySettings,
    updatePlannerSettings,
    updateSearchRoutingSettings,
    updateLocalDeepResearchSettings,
    hydrateSearchRoutingSettingsForActiveWorkspace,
  };
}
