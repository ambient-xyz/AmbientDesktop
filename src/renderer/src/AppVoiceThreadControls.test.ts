import { describe, expect, it } from "vitest";

import type { MessageVoiceState } from "../../shared/types";
import {
  activeThreadVoiceStatusPresentation,
  activeVoiceMessageStillPlayable,
} from "./AppVoiceThreadControls";
import type { VoiceThreadStatusModel } from "./voiceUiModel";

describe("AppVoiceThreadControls", () => {
  it("keeps the active thread voice status visible until its dismiss key is recorded", () => {
    const status = voiceStatus({ label: "Voice ready", detail: "1 ready message" });
    const first = activeThreadVoiceStatusPresentation({
      activeThreadId: "thread-1",
      dismissedKeys: new Set(),
      providerCapabilityId: "provider-1",
      status,
    });

    expect(first.visible).toBe(true);
    expect(first.dismissKey).toContain("thread-1");
    expect(activeThreadVoiceStatusPresentation({
      activeThreadId: "thread-1",
      dismissedKeys: new Set([first.dismissKey ?? ""]),
      providerCapabilityId: "provider-1",
      status,
    }).visible).toBe(false);
  });

  it("keeps only ready playable voice from the selected provider active", () => {
    const states = {
      ready: voiceState({ messageId: "ready", providerCapabilityId: "provider-1", mediaUrl: "file:///voice.wav" }),
      failed: voiceState({ messageId: "failed", status: "failed", providerCapabilityId: "provider-1", mediaUrl: "file:///failed.wav" }),
      other: voiceState({ messageId: "other", providerCapabilityId: "provider-2", mediaUrl: "file:///other.wav" }),
    };

    expect(activeVoiceMessageStillPlayable({ activeVoiceMessageId: "ready", messageVoiceStates: states, providerCapabilityId: "provider-1" })).toBe(true);
    expect(activeVoiceMessageStillPlayable({ activeVoiceMessageId: "failed", messageVoiceStates: states, providerCapabilityId: "provider-1" })).toBe(false);
    expect(activeVoiceMessageStillPlayable({ activeVoiceMessageId: "other", messageVoiceStates: states, providerCapabilityId: "provider-1" })).toBe(false);
  });
});

function voiceStatus(overrides: Partial<VoiceThreadStatusModel>): VoiceThreadStatusModel {
  return {
    visible: true,
    tone: "ready",
    label: "Voice ready",
    detail: "Ready",
    counts: {
      ready: 1,
      failed: 0,
      skipped: 0,
      canceled: 0,
      queued: 0,
      synthesizing: 0,
    },
    settingsRouteLabel: "Voice settings",
    ...overrides,
  };
}

function voiceState(overrides: Partial<MessageVoiceState>): MessageVoiceState {
  return {
    messageId: "message-1",
    threadId: "thread-1",
    status: "ready",
    source: "assistant-text",
    sourceMessageId: "message-1",
    spokenTextChars: 12,
    sourceTextChars: 20,
    createdAt: "2026-06-13T00:00:00.000Z",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}
