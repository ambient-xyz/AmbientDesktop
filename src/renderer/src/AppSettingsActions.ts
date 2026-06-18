import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { LocalModelRuntimeLifecycleActionInput, LocalModelRuntimeLifecycleActionResult } from "../../shared/localRuntimeTypes";
import type { ModelProviderCredentialSaveResult } from "../../shared/pluginTypes";
import type { InstallModelProviderEndpointInput, InstallModelProviderEndpointResult, SaveModelProviderCredentialInput } from "../../shared/threadTypes";
import type { LocalDeepResearchSetupUiState } from "./RightPanel";
import { CLEAR_AGENT_MEMORY_CONFIRMATION } from "../../shared/agentMemoryPrivacy";

export { CLEAR_AGENT_MEMORY_CONFIRMATION };

export function desktopStateWithUpdatedSettings<K extends keyof DesktopState["settings"]>(
  state: DesktopState,
  key: K,
  value: DesktopState["settings"][K],
): DesktopState {
  return {
    ...state,
    settings: {
      ...state.settings,
      [key]: value,
    },
  };
}

export function localDeepResearchSetupAfterLocalRuntimeAction(
  current: LocalDeepResearchSetupUiState,
  result: LocalModelRuntimeLifecycleActionResult,
): LocalDeepResearchSetupUiState {
  if (!result.after || !current.result) return current;
  return {
    ...current,
    result: {
      ...current.result,
      localModelResources: result.after.localModelResources,
      localRuntimeInventory: result.after.inventory,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireDesktopState(state: DesktopState | undefined): DesktopState {
  if (!state) throw new Error("Desktop state is not ready.");
  return state;
}

export function createAppSettingsActions({
  setLocalDeepResearchSetup,
  setSearchRoutingHydrationError,
  setSearchRoutingHydrating,
  setState,
  state,
}: {
  setLocalDeepResearchSetup: Dispatch<SetStateAction<LocalDeepResearchSetupUiState>>;
  setSearchRoutingHydrationError: Dispatch<SetStateAction<string | undefined>>;
  setSearchRoutingHydrating: Dispatch<SetStateAction<boolean>>;
  setState: Dispatch<SetStateAction<DesktopState | undefined>>;
  state: DesktopState | undefined;
}): {
  clearAgentMemory: () => Promise<void>;
  hydrateSearchRoutingSettingsForSettingsPanel: () => Promise<void>;
  installModelProviderEndpoint: (input: InstallModelProviderEndpointInput) => Promise<InstallModelProviderEndpointResult>;
  runLocalModelRuntimeLifecycleAction: (input: LocalModelRuntimeLifecycleActionInput) => Promise<LocalModelRuntimeLifecycleActionResult>;
  saveModelProviderCredential: (input: SaveModelProviderCredentialInput) => Promise<ModelProviderCredentialSaveResult>;
  updateFeatureFlagSettings: (featureFlags: DesktopState["settings"]["featureFlags"]) => Promise<void>;
  updateLocalDeepResearchSettings: (localDeepResearch: DesktopState["settings"]["localDeepResearch"]) => Promise<void>;
  updateMediaPlaybackSettings: (media: DesktopState["settings"]["media"]) => Promise<void>;
  updateMemorySettings: (memory: DesktopState["settings"]["memory"]) => Promise<void>;
  updateModelRuntimeSettings: (modelRuntime: DesktopState["settings"]["modelRuntime"]) => Promise<void>;
  updatePlannerSettings: (planner: DesktopState["settings"]["planner"]) => Promise<void>;
  updateSearchRoutingSettings: (search: DesktopState["settings"]["search"]) => Promise<void>;
  updateSttSettings: (stt: DesktopState["settings"]["stt"]) => Promise<void>;
  updateThinkingDisplaySettings: (thinkingDisplay: DesktopState["settings"]["thinkingDisplay"]) => Promise<void>;
  updateVoiceSettings: (voice: DesktopState["settings"]["voice"]) => Promise<void>;
} {
  async function updateSettingsSection<K extends keyof DesktopState["settings"]>(
    key: K,
    value: DesktopState["settings"][K],
    persist: (value: DesktopState["settings"][K]) => Promise<DesktopState["settings"][K]>,
  ): Promise<void> {
    if (!state) return;
    const nextValue = await persist(value);
    setState(desktopStateWithUpdatedSettings(state, key, nextValue));
  }

  async function updateMediaPlaybackSettings(media: DesktopState["settings"]["media"]): Promise<void> {
    await updateSettingsSection("media", media, (value) => window.ambientDesktop.updateMediaPlaybackSettings(value));
  }

  async function updateThinkingDisplaySettings(thinkingDisplay: DesktopState["settings"]["thinkingDisplay"]): Promise<void> {
    await updateSettingsSection("thinkingDisplay", thinkingDisplay, (value) => window.ambientDesktop.updateThinkingDisplaySettings(value));
  }

  async function updateModelRuntimeSettings(modelRuntime: DesktopState["settings"]["modelRuntime"]): Promise<void> {
    await updateSettingsSection("modelRuntime", modelRuntime, (value) => window.ambientDesktop.updateModelRuntimeSettings(value));
  }

  async function saveModelProviderCredential(input: SaveModelProviderCredentialInput): Promise<ModelProviderCredentialSaveResult> {
    requireDesktopState(state);
    return window.ambientDesktop.saveModelProviderCredential(input);
  }

  async function installModelProviderEndpoint(input: InstallModelProviderEndpointInput): Promise<InstallModelProviderEndpointResult> {
    requireDesktopState(state);
    const result = await window.ambientDesktop.installModelProviderEndpoint(input);
    setState((current) => current
      ? desktopStateWithUpdatedSettings(current, "modelRuntime", result.settings)
      : current);
    return result;
  }

  async function runLocalModelRuntimeLifecycleAction(
    input: LocalModelRuntimeLifecycleActionInput,
  ): Promise<LocalModelRuntimeLifecycleActionResult> {
    requireDesktopState(state);
    const result = await window.ambientDesktop.runLocalModelRuntimeLifecycleAction(input);
    if (result.after) {
      setLocalDeepResearchSetup((current) => localDeepResearchSetupAfterLocalRuntimeAction(current, result));
    }
    return result;
  }

  async function updateFeatureFlagSettings(featureFlags: DesktopState["settings"]["featureFlags"]): Promise<void> {
    await updateSettingsSection("featureFlags", featureFlags, (value) => window.ambientDesktop.updateFeatureFlagSettings(value));
  }

  async function updateMemorySettings(memory: DesktopState["settings"]["memory"]): Promise<void> {
    await updateSettingsSection("memory", memory, (value) => window.ambientDesktop.updateMemorySettings(value));
  }

  async function clearAgentMemory(): Promise<void> {
    if (!state) return;
    const confirmed = window.confirm(CLEAR_AGENT_MEMORY_CONFIRMATION);
    if (!confirmed) return;
    await window.ambientDesktop.clearAgentMemory();
  }

  async function updatePlannerSettings(planner: DesktopState["settings"]["planner"]): Promise<void> {
    await updateSettingsSection("planner", planner, (value) => window.ambientDesktop.updatePlannerSettings(value));
  }

  async function updateSearchRoutingSettings(search: DesktopState["settings"]["search"]): Promise<void> {
    await updateSettingsSection("search", search, (value) => window.ambientDesktop.updateSearchRoutingSettings(value));
  }

  async function updateLocalDeepResearchSettings(localDeepResearch: DesktopState["settings"]["localDeepResearch"]): Promise<void> {
    await updateSettingsSection("localDeepResearch", localDeepResearch, (value) => window.ambientDesktop.updateLocalDeepResearchSettings(value));
  }

  async function hydrateSearchRoutingSettingsForSettingsPanel(): Promise<void> {
    if (!state) return;
    setSearchRoutingHydrationError(undefined);
    setSearchRoutingHydrating(true);
    try {
      const search = await window.ambientDesktop.hydrateSearchRoutingSettings();
      setState((current) => current ? desktopStateWithUpdatedSettings(current, "search", search) : current);
    } catch (error) {
      setSearchRoutingHydrationError(errorMessage(error));
    } finally {
      setSearchRoutingHydrating(false);
    }
  }

  async function updateVoiceSettings(voice: DesktopState["settings"]["voice"]): Promise<void> {
    await updateSettingsSection("voice", voice, (value) => window.ambientDesktop.updateVoiceSettings(value));
  }

  async function updateSttSettings(stt: DesktopState["settings"]["stt"]): Promise<void> {
    await updateSettingsSection("stt", stt, (value) => window.ambientDesktop.updateSttSettings(value));
  }

  return {
    clearAgentMemory,
    hydrateSearchRoutingSettingsForSettingsPanel,
    installModelProviderEndpoint,
    runLocalModelRuntimeLifecycleAction,
    saveModelProviderCredential,
    updateFeatureFlagSettings,
    updateLocalDeepResearchSettings,
    updateMediaPlaybackSettings,
    updateMemorySettings,
    updateModelRuntimeSettings,
    updatePlannerSettings,
    updateSearchRoutingSettings,
    updateSttSettings,
    updateThinkingDisplaySettings,
    updateVoiceSettings,
  };
}
