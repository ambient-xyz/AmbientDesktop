import { describe, expect, it, vi } from "vitest";

import type { VoiceSettings } from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import {
  completeAgentRuntimeRegisteredVoiceProviderSetup,
  type AgentRuntimeRegisteredVoiceProvider,
} from "./agentRuntimeVoiceProviderSetup";

describe("agentRuntimeVoiceProviderSetup", () => {
  it("selects the first registered provider when no provider is configured", async () => {
    const current = voiceSettings({ mode: "off", providerCapabilityId: undefined, voiceId: undefined });
    const selected = voiceSettings({ providerCapabilityId: "pkg:tool:speak", voiceId: "voice-1", autoplay: true });
    const updateSettings = vi.fn(async () => selected);
    const dogfoodSelectedVoiceProvider = vi.fn(async () => ({
      status: "succeeded" as const,
      audioPath: ".ambient/voice/test.wav",
      mimeType: "audio/wav",
      durationMs: 321,
    }));

    const result = await completeAgentRuntimeRegisteredVoiceProviderSetup(threadSummary(), workspaceState(), registeredProvider(), {
      readSettings: () => current,
      updateSettings,
      dogfoodSelectedVoiceProvider,
    });

    expect(updateSettings).toHaveBeenCalledWith({
      ...current,
      enabled: true,
      mode: "assistant-final",
      autoplay: true,
      providerCapabilityId: "pkg:tool:speak",
      voiceId: "voice-1",
      format: "wav",
    });
    expect(dogfoodSelectedVoiceProvider).toHaveBeenCalledWith(threadSummary(), workspaceState(), selected);
    expect(result).toEqual({
      text: [
        "Voice provider setup completion",
        "- selection: Selected and enabled this provider because no voice provider was configured.",
        "- runtime dogfood: succeeded (.ambient/voice/test.wav)",
      ].join("\n"),
      details: {
        providerCapabilityId: "pkg:tool:speak",
        selected: true,
        selectionReason: "Selected and enabled this provider because no voice provider was configured.",
        dogfood: {
          status: "succeeded",
          audioPath: ".ambient/voice/test.wav",
          mimeType: "audio/wav",
          durationMs: 321,
        },
      },
    });
  });

  it("dogfoods a provider that is already selected", async () => {
    const current = voiceSettings({ providerCapabilityId: "pkg:tool:speak" });
    const updateSettings = vi.fn();
    const dogfoodSelectedVoiceProvider = vi.fn(async () => ({ status: "succeeded" as const }));

    const result = await completeAgentRuntimeRegisteredVoiceProviderSetup(threadSummary(), workspaceState(), registeredProvider(), {
      readSettings: () => current,
      updateSettings,
      dogfoodSelectedVoiceProvider,
    });

    expect(updateSettings).not.toHaveBeenCalled();
    expect(dogfoodSelectedVoiceProvider).toHaveBeenCalledWith(threadSummary(), workspaceState(), current);
    expect(result.text).toBe([
      "Voice provider setup completion",
      "- selection: Provider was already selected in Desktop voice settings.",
      "- runtime dogfood: succeeded",
    ].join("\n"));
    expect(result.details).toMatchObject({
      providerCapabilityId: "pkg:tool:speak",
      selected: true,
      selectionReason: "Provider was already selected in Desktop voice settings.",
      dogfood: { status: "succeeded" },
    });
  });

  it("skips dogfood when another provider is selected", async () => {
    const dogfoodSelectedVoiceProvider = vi.fn();

    const result = await completeAgentRuntimeRegisteredVoiceProviderSetup(threadSummary(), workspaceState(), registeredProvider(), {
      readSettings: () => voiceSettings({ providerCapabilityId: "other:tool:speak" }),
      updateSettings: vi.fn(),
      dogfoodSelectedVoiceProvider,
    });

    expect(dogfoodSelectedVoiceProvider).not.toHaveBeenCalled();
    expect(result).toEqual({
      text: [
        "Voice provider setup completion",
        "- selection: Another voice provider is already selected: other:tool:speak.",
        "- runtime dogfood: skipped because this provider is not the selected voice provider",
      ].join("\n"),
      details: {
        providerCapabilityId: "pkg:tool:speak",
        selected: false,
        selectionReason: "Another voice provider is already selected: other:tool:speak.",
        dogfood: { status: "skipped" },
      },
    });
  });

  it("skips dogfood when voice settings cannot be updated", async () => {
    const dogfoodSelectedVoiceProvider = vi.fn();

    const result = await completeAgentRuntimeRegisteredVoiceProviderSetup(threadSummary(), workspaceState(), registeredProvider(), {
      readSettings: () => voiceSettings({ providerCapabilityId: undefined }),
      dogfoodSelectedVoiceProvider,
    });

    expect(dogfoodSelectedVoiceProvider).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      selected: false,
      selectionReason: "Voice settings update hook is unavailable in this runtime.",
      dogfood: { status: "skipped" },
    });
  });

  it("skips dogfood when settings update does not select the provider", async () => {
    const dogfoodSelectedVoiceProvider = vi.fn();

    const result = await completeAgentRuntimeRegisteredVoiceProviderSetup(threadSummary(), workspaceState(), registeredProvider(), {
      readSettings: () => voiceSettings({ providerCapabilityId: undefined }),
      updateSettings: async () => voiceSettings({ providerCapabilityId: "other:tool:speak" }),
      dogfoodSelectedVoiceProvider,
    });

    expect(dogfoodSelectedVoiceProvider).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({
      selected: false,
      selectionReason: "Attempted first-provider selection, but Desktop voice settings did not select it.",
      dogfood: { status: "skipped" },
    });
  });
});

function registeredProvider(overrides: Partial<AgentRuntimeRegisteredVoiceProvider> = {}): AgentRuntimeRegisteredVoiceProvider {
  return {
    capabilityId: "pkg:tool:speak",
    label: "Test Voice",
    format: "wav",
    voices: [{ id: "voice-1", label: "Voice One" }],
    ...overrides,
  };
}

function voiceSettings(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: false,
    mode: "assistant-final",
    autoplay: false,
    providerCapabilityId: "pkg:tool:speak",
    voiceId: "voice-1",
    maxChars: 100,
    longReply: "skip",
    format: "wav",
    artifactCacheMaxMb: 30,
    ...overrides,
  };
}

function threadSummary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    title: "Voice Thread",
    workspacePath: "/workspace",
    createdAt: "2026-06-12T00:00:00.000Z",
    updatedAt: "2026-06-12T00:00:00.000Z",
    lastMessagePreview: "",
    permissionMode: "workspace",
    collaborationMode: "agent",
    model: "glm-5.1",
    thinkingLevel: "medium",
    ...overrides,
  };
}

function workspaceState(overrides: Partial<WorkspaceState> = {}): WorkspaceState {
  return {
    path: "/workspace",
    name: "Workspace",
    statePath: "/workspace/.ambient/state",
    sessionPath: "/workspace/.ambient/session",
    ...overrides,
  };
}
