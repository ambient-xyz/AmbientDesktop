import type { ThreadSummary, UpdateVoiceSettingsInput, VoiceSettings, WorkspaceState } from "../shared/types";
import type { AgentRuntimeVoiceProviderDogfoodResult } from "./agentRuntimeVoiceProviderDogfood";

export interface AgentRuntimeRegisteredVoiceProvider {
  capabilityId: string;
  label: string;
  format: VoiceSettings["format"];
  voices: Array<{ id: string; label?: string }>;
}

export interface CompleteAgentRuntimeRegisteredVoiceProviderSetupDeps {
  readSettings: () => VoiceSettings | undefined;
  updateSettings?: (input: UpdateVoiceSettingsInput) => Promise<VoiceSettings> | VoiceSettings;
  dogfoodSelectedVoiceProvider: (
    thread: ThreadSummary,
    workspace: WorkspaceState,
    settings: VoiceSettings,
  ) => Promise<AgentRuntimeVoiceProviderDogfoodResult>;
}

export async function completeAgentRuntimeRegisteredVoiceProviderSetup(
  thread: ThreadSummary,
  workspace: WorkspaceState,
  provider: AgentRuntimeRegisteredVoiceProvider,
  deps: CompleteAgentRuntimeRegisteredVoiceProviderSetupDeps,
): Promise<{ text: string; details: Record<string, unknown> }> {
  const current = deps.readSettings();
  let settings = current;
  let selected = false;
  let selectionReason = "Voice settings were not changed.";
  if (current && !current.providerCapabilityId && deps.updateSettings) {
    settings = await deps.updateSettings({
      ...current,
      enabled: true,
      mode: current.mode === "off" ? "assistant-final" : current.mode,
      autoplay: true,
      providerCapabilityId: provider.capabilityId,
      voiceId: provider.voices[0]?.id,
      format: provider.format,
    });
    selected = settings.providerCapabilityId === provider.capabilityId;
    selectionReason = selected
      ? "Selected and enabled this provider because no voice provider was configured."
      : "Attempted first-provider selection, but Desktop voice settings did not select it.";
  } else if (current?.providerCapabilityId === provider.capabilityId) {
    selected = true;
    selectionReason = "Provider was already selected in Desktop voice settings.";
  } else if (current?.providerCapabilityId) {
    selectionReason = `Another voice provider is already selected: ${current.providerCapabilityId}.`;
  } else if (!deps.updateSettings) {
    selectionReason = "Voice settings update hook is unavailable in this runtime.";
  }

  const lines = [
    "Voice provider setup completion",
    `- selection: ${selectionReason}`,
  ];
  const details: Record<string, unknown> = {
    providerCapabilityId: provider.capabilityId,
    selected,
    selectionReason,
  };

  if (selected && settings) {
    const dogfood = await deps.dogfoodSelectedVoiceProvider(thread, workspace, settings);
    lines.push(`- runtime dogfood: ${dogfood.status}${dogfood.audioPath ? ` (${dogfood.audioPath})` : ""}`);
    Object.assign(details, { dogfood });
  } else {
    lines.push("- runtime dogfood: skipped because this provider is not the selected voice provider");
    Object.assign(details, { dogfood: { status: "skipped" } });
  }

  return { text: lines.join("\n"), details };
}
