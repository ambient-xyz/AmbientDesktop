import { describe, expect, it } from "vitest";

import {
  shouldRequestMessageTail,
  shouldShowScrollToBottom,
} from "./AppMessageScrollControls";

describe("AppMessageScrollControls", () => {
  it("shows the jump control only beyond the scroll distance threshold", () => {
    expect(shouldShowScrollToBottom(null)).toBe(false);
    expect(shouldShowScrollToBottom({ scrollHeight: 1_000, scrollTop: 220, clientHeight: 600 })).toBe(false);
    expect(shouldShowScrollToBottom({ scrollHeight: 1_000, scrollTop: 219, clientHeight: 600 })).toBe(true);
  });

  it("requests message tailing only for the active thread", () => {
    expect(shouldRequestMessageTail(undefined, "thread-1")).toBe(false);
    expect(shouldRequestMessageTail("thread-2", "thread-1")).toBe(false);
    expect(shouldRequestMessageTail("thread-1", "thread-1")).toBe(true);
  });
});
