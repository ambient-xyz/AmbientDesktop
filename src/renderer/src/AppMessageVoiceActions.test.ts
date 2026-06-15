import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DesktopState,
  MessageVoiceState,
} from "../../shared/types";
import {
  createAppMessageVoiceActions,
  desktopStateWithMessageVoiceState,
} from "./AppMessageVoiceActions";

describe("App message voice actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("replaces one message voice state without disturbing existing voice states", () => {
    const existing = voiceState({ messageId: "existing", status: "ready" });
    const replacement = voiceState({ messageId: "target", status: "failed", error: "voice failed" });
    const state = desktopState({ messageVoiceStates: { existing } });

    expect(desktopStateWithMessageVoiceState(state, replacement).messageVoiceStates).toEqual({
      existing,
      target: replacement,
    });
  });

  it("regenerates message voice, refreshes provider cache, and mirrors the returned voice state", async () => {
    const regenerated = voiceState({ messageId: "message-1", status: "synthesizing" });
    const regenerateMessageVoice = vi.fn(async () => regenerated);
    vi.stubGlobal("window", {
      ambientDesktop: {
        regenerateMessageVoice,
      },
    });
    const controller = createController();

    await controller.actions.regenerateMessageVoice("message-1");

    expect(regenerateMessageVoice).toHaveBeenCalledWith({ messageId: "message-1" });
    expect(controller.scheduleVoiceProviderRefresh).toHaveBeenCalledWith(150, "voice regeneration");
    expect(controller.state.value?.messageVoiceStates["message-1"]).toBe(regenerated);
    expect(controller.setError).not.toHaveBeenCalled();
  });

  it("records regeneration errors and still schedules a provider refresh", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        regenerateMessageVoice: vi.fn(async () => {
          throw new Error("provider unavailable");
        }),
      },
    });
    const controller = createController();

    await controller.actions.regenerateMessageVoice("message-1");

    expect(controller.scheduleVoiceProviderRefresh).toHaveBeenCalledWith(150, "voice regeneration failed");
    expect(controller.setError).toHaveBeenCalledWith("provider unavailable");
    expect(controller.state.value?.messageVoiceStates).toEqual({});
  });

  it("reveals voice artifacts and reports reveal failures", async () => {
    const revealMessageVoiceArtifact = vi.fn(async () => undefined);
    vi.stubGlobal("window", {
      ambientDesktop: {
        revealMessageVoiceArtifact,
      },
    });
    const controller = createController();

    await controller.actions.revealMessageVoiceArtifact("message-1");

    expect(revealMessageVoiceArtifact).toHaveBeenCalledWith({ messageId: "message-1" });
    expect(controller.setError).not.toHaveBeenCalled();

    vi.stubGlobal("window", {
      ambientDesktop: {
        revealMessageVoiceArtifact: vi.fn(async () => {
          throw new Error("missing artifact");
        }),
      },
    });
    await controller.actions.revealMessageVoiceArtifact("message-1");

    expect(controller.setError).toHaveBeenCalledWith("missing artifact");
  });

  it("clears voice artifacts and mirrors the returned voice state", async () => {
    const cleared = voiceState({ messageId: "message-1", status: "canceled", error: "Voice artifact cleared." });
    const clearMessageVoiceArtifact = vi.fn(async () => cleared);
    vi.stubGlobal("window", {
      ambientDesktop: {
        clearMessageVoiceArtifact,
      },
    });
    const controller = createController({
      state: desktopState({ messageVoiceStates: { "message-1": voiceState({ messageId: "message-1", status: "ready" }) } }),
    });

    await controller.actions.clearMessageVoiceArtifact("message-1");

    expect(clearMessageVoiceArtifact).toHaveBeenCalledWith({ messageId: "message-1" });
    expect(controller.state.value?.messageVoiceStates["message-1"]).toBe(cleared);
    expect(controller.setError).not.toHaveBeenCalled();
  });
});

function createController({
  state = desktopState(),
}: {
  state?: DesktopState;
} = {}) {
  const stateSetter = statefulSetter<DesktopState | undefined>(state);
  const scheduleVoiceProviderRefresh = vi.fn();
  const setError = vi.fn();
  return {
    actions: createAppMessageVoiceActions({
      scheduleVoiceProviderRefresh,
      setError,
      setState: stateSetter.set,
    }),
    scheduleVoiceProviderRefresh,
    setError,
    state: stateSetter,
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

function desktopState(patch: Partial<DesktopState> = {}): DesktopState {
  return {
    messageVoiceStates: {},
    ...patch,
  } as DesktopState;
}

function voiceState(overrides: Partial<MessageVoiceState> = {}): MessageVoiceState {
  return {
    createdAt: "2026-06-13T00:00:00.000Z",
    messageId: "message-1",
    source: "assistant-text",
    sourceMessageId: "message-1",
    sourceTextChars: 20,
    spokenTextChars: 12,
    status: "ready",
    threadId: "thread-1",
    updatedAt: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}
