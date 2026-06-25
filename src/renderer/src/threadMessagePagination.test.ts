import { describe, expect, it } from "vitest";

import type { DesktopState, ThreadMessagePage } from "../../shared/desktopTypes";
import { desktopStateWithPrependedThreadMessages } from "./threadMessagePagination";

describe("thread message pagination", () => {
  it("prepends older messages without duplicating the cursor window", () => {
    const current = desktopState({
      activeThreadId: "thread-1",
      messages: [
        message("message-3", "2026-06-13T00:03:00.000Z"),
        message("message-4", "2026-06-13T00:04:00.000Z"),
      ],
      messageWindow: { threadId: "thread-1", order: "latest", limit: 250, loadedCount: 250, hasMoreBefore: true },
    });
    const page: ThreadMessagePage = {
      threadId: "thread-1",
      order: "ascending",
      limit: 100,
      messages: [
        message("message-1", "2026-06-13T00:01:00.000Z"),
        message("message-2", "2026-06-13T00:02:00.000Z"),
        message("message-3", "2026-06-13T00:03:00.000Z"),
      ],
      hasMoreBefore: false,
    };

    const next = desktopStateWithPrependedThreadMessages(current, page);

    expect(next?.messages.map((entry) => entry.id)).toEqual(["message-1", "message-2", "message-3", "message-4"]);
    expect(next?.messageWindow).toEqual({
      threadId: "thread-1",
      order: "latest",
      limit: 250,
      loadedCount: 4,
      hasMoreBefore: false,
    });
  });

  it("ignores pages for inactive threads", () => {
    const current = desktopState({ activeThreadId: "thread-1", messages: [message("message-1", "2026-06-13T00:01:00.000Z")] });
    const page: ThreadMessagePage = {
      threadId: "thread-2",
      order: "ascending",
      limit: 100,
      messages: [message("message-2", "2026-06-13T00:02:00.000Z")],
      hasMoreBefore: true,
    };

    expect(desktopStateWithPrependedThreadMessages(current, page)).toBe(current);
  });
});

function message(id: string, createdAt: string): ThreadMessagePage["messages"][number] {
  return {
    id,
    threadId: "thread-1",
    role: "assistant",
    content: id,
    createdAt,
  };
}

function desktopState(input: Partial<DesktopState>): DesktopState {
  return {
    activeThreadId: "thread-1",
    messages: [],
    ...input,
  } as DesktopState;
}
