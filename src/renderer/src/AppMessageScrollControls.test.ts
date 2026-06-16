import { describe, expect, it } from "vitest";

import {
  nextScrollToBottomVisibility,
  scrollControlsCollectionRevision,
  shouldRequestMessageTail,
  shouldShowScrollToBottom,
} from "./AppMessageScrollControls";

describe("AppMessageScrollControls", () => {
  it("shows the jump control only beyond the scroll distance threshold", () => {
    expect(shouldShowScrollToBottom(null)).toBe(false);
    expect(shouldShowScrollToBottom({ scrollHeight: 1_000, scrollTop: 220, clientHeight: 600 })).toBe(false);
    expect(shouldShowScrollToBottom({ scrollHeight: 1_000, scrollTop: 219, clientHeight: 600 })).toBe(true);
  });

  it("uses hysteresis when hiding the jump control", () => {
    expect(nextScrollToBottomVisibility({ scrollHeight: 1_000, scrollTop: 340, clientHeight: 600 }, true)).toBe(false);
    expect(nextScrollToBottomVisibility({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 600 }, true)).toBe(true);
    expect(nextScrollToBottomVisibility({ scrollHeight: 1_000, scrollTop: 300, clientHeight: 600 }, false)).toBe(false);
  });

  it("requests message tailing only for the active thread", () => {
    expect(shouldRequestMessageTail(undefined, "thread-1")).toBe(false);
    expect(shouldRequestMessageTail("thread-2", "thread-1")).toBe(false);
    expect(shouldRequestMessageTail("thread-1", "thread-1")).toBe(true);
  });

  it("builds stable scroll revisions from content instead of array identity", () => {
    expect(scrollControlsCollectionRevision([{ id: "m1", content: "hello" }])).toBe("1:m1:::5:");
    expect(scrollControlsCollectionRevision([{ id: "m1", content: "hello!" }])).not.toBe(scrollControlsCollectionRevision([{ id: "m1", content: "hello" }]));
    expect(scrollControlsCollectionRevision([{ id: "a1", kind: "tool", text: "Running" }])).toBe("1:a1:tool:::7");
  });
});
