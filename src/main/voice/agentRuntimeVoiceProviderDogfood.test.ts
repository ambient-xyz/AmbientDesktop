import { describe, expect, it, vi } from "vitest";

import type { MessageVoiceState, VoiceSettings } from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { dogfoodAgentRuntimeSelectedVoiceProvider } from "./agentRuntimeVoiceProviderDogfood";
import type { SynthesizeQueuedVoiceStateInput } from "./voiceRuntime";

describe("agentRuntimeVoiceProviderDogfood", () => {
  it("synthesizes a selected voice provider dogfood message and returns media metadata", async () => {
    const voiceProviderWorkspacePathForCapabilityId = vi.fn(async () => "/provider-workspace");
    const runner = vi.fn();
    const createMediaUrl = vi.fn();
    const enforceArtifactBudget = vi.fn();
    const synthesizeInputs: SynthesizeQueuedVoiceStateInput[] = [];

    const result = await dogfoodAgentRuntimeSelectedVoiceProvider(threadSummary(), workspaceState(), voiceSettings(), {
      voiceProviderWorkspacePathForCapabilityId,
      runner,
      createMediaUrl,
      enforceArtifactBudget,
      now: fixedNow,
      nowMs: () => 42,
      synthesizeQueuedVoiceState: async (input) => {
        synthesizeInputs.push(input);
        const stored = input.store.setMessageVoiceState({
          messageId: "stored-message",
          threadId: "thread-1",
          status: "queued",
          source: "assistant-text",
          sourceMessageId: "stored-message",
          spokenText: "Stored text",
          spokenTextChars: 11,
          sourceTextChars: 11,
        });
        expect(stored).toMatchObject({
          messageId: "stored-message",
          createdAt: "2026-06-12T00:00:00.000Z",
          updatedAt: "2026-06-12T00:00:00.000Z",
        });
        return readyState(input.state, {
          audioPath: ".ambient/voice/thread-1/dogfood.wav",
          mimeType: "audio/wav",
          durationMs: 321,
        });
      },
    }, { text: "Hello from Ambient voice." });

    expect(voiceProviderWorkspacePathForCapabilityId).toHaveBeenCalledWith("pkg:tool:speak");
    expect(enforceArtifactBudget).toHaveBeenCalledWith("/workspace");
    expect(synthesizeInputs).toHaveLength(1);
    expect(synthesizeInputs[0]).toMatchObject({
      workspacePath: "/workspace",
      packageWorkspacePath: "/provider-workspace",
      state: {
        messageId: "voice-provider-dogfood-42",
        threadId: "thread-1",
        status: "queued",
        source: "assistant-text",
        sourceMessageId: "voice-provider-dogfood-42",
        providerCapabilityId: "pkg:tool:speak",
        voiceId: "voice-1",
        spokenText: "Hello from Ambient voice.",
        spokenTextChars: 25,
        sourceTextChars: 25,
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
      settings: voiceSettings(),
    });
    expect(synthesizeInputs[0].runner).toBe(runner);
    expect(synthesizeInputs[0].createMediaUrl).toBe(createMediaUrl);
    expect(result).toEqual({
      status: "succeeded",
      audioPath: ".ambient/voice/thread-1/dogfood.wav",
      mimeType: "audio/wav",
      durationMs: 321,
    });
  });

  it("uses the default dogfood text and omits missing optional metadata", async () => {
    const result = await dogfoodAgentRuntimeSelectedVoiceProvider(threadSummary(), workspaceState(), voiceSettings(), {
      voiceProviderWorkspacePathForCapabilityId: async () => "/provider-workspace",
      runner: async () => {
        throw new Error("Unexpected runner call.");
      },
      now: fixedNow,
      nowMs: () => 7,
      synthesizeQueuedVoiceState: async (input) => {
        expect(input.state).toMatchObject({
          messageId: "voice-provider-dogfood-7",
          spokenText: "Ambient voice provider test.",
          spokenTextChars: 28,
          sourceTextChars: 28,
        });
        return readyState(input.state);
      },
    });

    expect(result).toEqual({ status: "succeeded" });
  });

  it("throws the existing failure message when dogfood synthesis does not become ready", async () => {
    const enforceArtifactBudget = vi.fn();

    await expect(dogfoodAgentRuntimeSelectedVoiceProvider(threadSummary(), workspaceState(), voiceSettings(), {
      voiceProviderWorkspacePathForCapabilityId: async () => "/provider-workspace",
      runner: async () => {
        throw new Error("Unexpected runner call.");
      },
      enforceArtifactBudget,
      synthesizeQueuedVoiceState: async (input) => ({
        ...input.state,
        status: "failed",
        error: "provider unavailable",
      }),
    })).rejects.toThrow("Registered voice provider runtime dogfood failed: provider unavailable");

    expect(enforceArtifactBudget).not.toHaveBeenCalled();
  });
});

function readyState(state: MessageVoiceState, overrides: Partial<MessageVoiceState> = {}): MessageVoiceState {
  return {
    ...state,
    status: "ready",
    ...overrides,
  };
}

function fixedNow(): Date {
  return new Date("2026-06-12T00:00:00.000Z");
}

function voiceSettings(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: true,
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
