import { describe, expect, it } from "vitest";

import type { ChatMessage } from "../../shared/threadTypes";
import {
  chatFindMatchCount,
  nextChatFindIndex,
} from "./AppChatFindControls";

describe("AppChatFindControls", () => {
  it("counts visible chat matches using the active thinking display mode", () => {
    const messages = [
      message({ id: "user-1", role: "user", content: "Plan the launch plan." }),
      message({ id: "thinking-1", role: "assistant", content: "Hidden plan", metadata: { kind: "thinking", status: "done" } }),
      message({ id: "assistant-1", role: "assistant", content: "The plan is ready." }),
    ];

    expect(chatFindMatchCount({ messages, query: "plan", running: false, thinkingDisplayMode: "off" })).toBe(3);
    expect(chatFindMatchCount({ messages, query: "plan", running: false, thinkingDisplayMode: "transient" })).toBe(3);
    expect(chatFindMatchCount({ messages, query: "plan", running: false, thinkingDisplayMode: "full" })).toBe(4);
  });

  it("wraps previous and next indices and returns zero for empty matches", () => {
    expect(nextChatFindIndex({ count: 0, current: 5, direction: "next" })).toBe(0);
    expect(nextChatFindIndex({ count: 3, current: 0, direction: "previous" })).toBe(2);
    expect(nextChatFindIndex({ count: 3, current: 2, direction: "next" })).toBe(0);
  });
});

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    ...overrides,
    id: overrides.id ?? "message",
    threadId: overrides.threadId ?? "thread-1",
    role: overrides.role ?? "assistant",
    content: overrides.content ?? "",
    createdAt: overrides.createdAt ?? "2026-06-13T00:00:00.000Z",
  };
}
