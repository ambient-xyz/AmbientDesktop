import { describe, expect, it, vi } from "vitest";

import type { ChatMessage, MessageVoiceState, ThreadSummary, VoiceSettings } from "../../shared/types";
import {
  recordAgentRuntimeVoiceDispatch,
  type AgentRuntimeVoiceDispatchStore,
} from "./agentRuntimeVoiceDispatch";
import type { SynthesizeQueuedVoiceStateInput } from "./voiceRuntime";

describe("agentRuntimeVoiceDispatch", () => {
  it("does nothing when voice settings are unavailable or disabled", () => {
    const store = voiceStore();
    const onStateUpdated = vi.fn();

    expect(recordAgentRuntimeVoiceDispatch(assistantMessage(), deps({ store, readSettings: () => undefined, onStateUpdated }))).toBeUndefined();
    expect(recordAgentRuntimeVoiceDispatch(assistantMessage(), deps({
      store,
      readSettings: () => ({ ...voiceSettings(), enabled: false }),
      onStateUpdated,
    }))).toBeUndefined();

    expect(store.states).toEqual([]);
    expect(onStateUpdated).not.toHaveBeenCalled();
  });

  it("records dispatch state without starting synthesis for non Ambient CLI providers", () => {
    const store = voiceStore();
    const onStateUpdated = vi.fn();
    const synthesizeQueuedVoiceState = vi.fn();

    expect(recordAgentRuntimeVoiceDispatch(assistantMessage(), deps({
      store,
      readSettings: () => ({ ...voiceSettings(), providerCapabilityId: "voice:fixture" }),
      onStateUpdated,
      synthesizeQueuedVoiceState,
    }))).toBeUndefined();

    expect(store.states).toHaveLength(1);
    expect(store.states[0]).toMatchObject({
      messageId: "message-1",
      threadId: "thread-1",
      status: "queued",
      providerCapabilityId: "voice:fixture",
      spokenText: "Short assistant reply.",
    });
    expect(onStateUpdated).toHaveBeenCalledOnce();
    expect(synthesizeQueuedVoiceState).not.toHaveBeenCalled();
  });

  it("synthesizes Ambient CLI voice dispatches with runtime provider context", async () => {
    const store = voiceStore();
    const onStateUpdated = vi.fn();
    const enforceArtifactBudget = vi.fn();
    const createMediaUrl = vi.fn();
    const voiceProviderWorkspacePathForCapabilityId = vi.fn(async () => "/provider-workspace");
    const runner = vi.fn();
    const synthesizeInputs: SynthesizeQueuedVoiceStateInput[] = [];

    const promise = recordAgentRuntimeVoiceDispatch(assistantMessage(), deps({
      store,
      onStateUpdated,
      enforceArtifactBudget,
      createMediaUrl,
      voiceProviderWorkspacePathForCapabilityId,
      runner,
      synthesizeQueuedVoiceState: async (input) => {
        synthesizeInputs.push(input);
        return readyState(input.state);
      },
    }));

    await expect(promise).resolves.toBeUndefined();

    expect(voiceProviderWorkspacePathForCapabilityId).toHaveBeenCalledWith("pkg:tool:speak");
    expect(onStateUpdated).toHaveBeenCalledTimes(2);
    expect(enforceArtifactBudget).toHaveBeenCalledWith("/workspace");
    expect(synthesizeInputs).toHaveLength(1);
    expect(synthesizeInputs[0]).toMatchObject({
      workspacePath: "/workspace",
      packageWorkspacePath: "/provider-workspace",
      sourceText: undefined,
      settings: voiceSettings(),
      summary: {
        model: "glm-5.1",
        apiKey: "test-api-key",
        baseUrl: "https://provider.example/v1",
      },
    });
    expect(synthesizeInputs[0].store).toBe(store);
    expect(synthesizeInputs[0].runner).toBe(runner);
    expect(synthesizeInputs[0].createMediaUrl).toBe(createMediaUrl);
  });

  it("passes source text for summarized voice dispatches", async () => {
    const store = voiceStore();
    const longContent = [
      "This is a long assistant reply that should be summarized before voice synthesis.",
      "The source text must still be available to the voice runtime.",
    ].join(" ");
    const synthesizeQueuedVoiceState = vi.fn(async (input: SynthesizeQueuedVoiceStateInput) => readyState(input.state));

    await recordAgentRuntimeVoiceDispatch(assistantMessage({ content: longContent }), deps({
      store,
      readSettings: () => ({ ...voiceSettings(), maxChars: 40, longReply: "summarize" }),
      synthesizeQueuedVoiceState,
    }));

    expect(synthesizeQueuedVoiceState).toHaveBeenCalledOnce();
    expect(synthesizeQueuedVoiceState.mock.calls[0]?.[0].sourceText).toBe(longContent);
    expect(synthesizeQueuedVoiceState.mock.calls[0]?.[0].state).toMatchObject({
      status: "queued",
      source: "summary",
      spokenTextChars: 0,
      sourceTextChars: longContent.length,
    });
  });

  it("warns and still emits cleanup updates when synthesis fails", async () => {
    const store = voiceStore();
    const warn = vi.fn();
    const onStateUpdated = vi.fn();
    const enforceArtifactBudget = vi.fn();

    await recordAgentRuntimeVoiceDispatch(assistantMessage(), deps({
      store,
      warn,
      onStateUpdated,
      enforceArtifactBudget,
      synthesizeQueuedVoiceState: async () => {
        throw new Error("provider failed");
      },
    }));

    expect(warn).toHaveBeenCalledWith("Ambient voice synthesis failed: provider failed");
    expect(onStateUpdated).toHaveBeenCalledTimes(2);
    expect(enforceArtifactBudget).toHaveBeenCalledWith("/workspace");
  });
});

function deps(overrides: Partial<Parameters<typeof recordAgentRuntimeVoiceDispatch>[1]> = {}): Parameters<typeof recordAgentRuntimeVoiceDispatch>[1] {
  return {
    readSettings: () => voiceSettings(),
    store: voiceStore(),
    voiceProviderWorkspacePathForCapabilityId: async () => "/workspace",
    getProviderStatus: () => ({ baseUrl: "https://provider.example/v1" }),
    readAmbientApiKey: () => "test-api-key",
    runner: async () => {
      throw new Error("Unexpected voice runner call.");
    },
    ...overrides,
  };
}

function voiceStore(thread: ThreadSummary = threadSummary()): AgentRuntimeVoiceDispatchStore & { states: MessageVoiceState[] } {
  const states: MessageVoiceState[] = [];
  return {
    states,
    getThread(threadId: string) {
      if (threadId !== thread.id) throw new Error(`Unexpected thread: ${threadId}`);
      return thread;
    },
    setMessageVoiceState(input) {
      const state: MessageVoiceState = {
        ...input,
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      };
      states.push(state);
      return state;
    },
  };
}

function readyState(state: MessageVoiceState): MessageVoiceState {
  return {
    ...state,
    status: "ready",
    audioPath: ".ambient/voice/thread-1/message-1.wav",
    mimeType: "audio/wav",
    durationMs: 321,
  };
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    role: "assistant",
    content: "Short assistant reply.",
    createdAt: "2026-06-12T00:00:00.000Z",
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

function voiceSettings(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: true,
    mode: "assistant-final",
    autoplay: false,
    providerCapabilityId: "pkg:tool:speak",
    voiceId: "default",
    maxChars: 100,
    longReply: "skip",
    format: "wav",
    artifactCacheMaxMb: 30,
    ...overrides,
  };
}
