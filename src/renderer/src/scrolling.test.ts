import { describe, expect, it, vi } from "vitest";
import {
  SHOW_SCROLL_TO_BOTTOM_DISTANCE,
  isScrolledToBottom,
  scrollToBottom,
} from "./scrolling";

describe("SHOW_SCROLL_TO_BOTTOM_DISTANCE", () => {
  it("keeps the chat scroll-to-bottom button threshold unchanged", () => {
    expect(SHOW_SCROLL_TO_BOTTOM_DISTANCE).toBe(180);
  });
});

describe("isScrolledToBottom", () => {
  it("treats elements inside the threshold as tailing", () => {
    expect(isScrolledToBottom({ scrollHeight: 1000, scrollTop: 384, clientHeight: 600 })).toBe(true);
  });

  it("detects when the user has scrolled away from the bottom", () => {
    expect(isScrolledToBottom({ scrollHeight: 1000, scrollTop: 200, clientHeight: 600 })).toBe(false);
  });
});

describe("scrollToBottom", () => {
  it("scrolls to the current scroll height", () => {
    const scrollTo = vi.fn();
    scrollToBottom({ scrollHeight: 1000, scrollTop: 0, clientHeight: 600, scrollTo });
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000 });
  });
});
