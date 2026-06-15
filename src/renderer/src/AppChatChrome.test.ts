import { describe, expect, it } from "vitest";

import type { BrowserUserActionState } from "../../shared/types";
import { chatBrowserUserActionForThread, voiceThreadStatusDismissKey } from "./AppChatChrome";
import type { voiceThreadStatusModel } from "./voiceUiModel";

describe("chatBrowserUserActionForThread", () => {
  const action = {
    id: "browser-action-1",
    active: true,
    sourceThreadId: "thread-1",
  } as BrowserUserActionState;

  it("returns the active action for its source thread", () => {
    expect(chatBrowserUserActionForThread(action, "thread-1")).toBe(action);
  });

  it("hides inactive or unrelated browser actions", () => {
    expect(chatBrowserUserActionForThread(action, "thread-2")).toBeUndefined();
    expect(chatBrowserUserActionForThread({ ...action, active: false }, "thread-1")).toBeUndefined();
    expect(chatBrowserUserActionForThread(action, undefined)).toBeUndefined();
  });
});

describe("voiceThreadStatusDismissKey", () => {
  it("includes the thread, provider, tone, text, and counts", () => {
    const status = {
      tone: "warning",
      label: "Voice artifacts need review",
      detail: "One failed synthesis",
      settingsRouteLabel: "Voice Settings",
      visible: true,
      counts: {
        ready: 2,
        failed: 1,
        skipped: 0,
        canceled: 0,
        queued: 3,
        synthesizing: 4,
      },
    } as ReturnType<typeof voiceThreadStatusModel>;

    expect(voiceThreadStatusDismissKey("thread-1", "voice-provider", status)).toBe(
      [
        "thread-1",
        "voice-provider",
        "warning",
        "Voice artifacts need review",
        "One failed synthesis",
        2,
        1,
        0,
        0,
        3,
        4,
      ].join("\u0000"),
    );
  });
});
