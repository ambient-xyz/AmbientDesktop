import { describe, expect, it } from "vitest";
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
  maxSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  parseStoredSidebarWidth,
  readInitialSidebarWidth,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "./sidebarLayout";

describe("sidebar layout", () => {
  it("clamps sidebar width to usable bounds", () => {
    expect(clampSidebarWidth(100, 1200)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(900, 1200)).toBe(MAX_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(333.6, 1200)).toBe(334);
  });

  it("leaves space for main content on narrow windows", () => {
    expect(maxSidebarWidth(620)).toBe(380);
    expect(clampSidebarWidth(520, 620)).toBe(380);
  });

  it("falls back to the default for missing or invalid persisted values", () => {
    expect(parseStoredSidebarWidth(null, 1200)).toBe(DEFAULT_SIDEBAR_WIDTH);
    expect(parseStoredSidebarWidth("nope", 1200)).toBe(DEFAULT_SIDEBAR_WIDTH);
  });

  it("reads the initial sidebar width from browser storage", () => {
    const restore = stubWindow({
      innerWidth: 900,
      localStorage: {
        getItem: (key: string) => key === SIDEBAR_WIDTH_STORAGE_KEY ? "360.4" : null,
      },
    });

    expect(readInitialSidebarWidth()).toBe(360);

    restore();
  });

  it("uses the default initial sidebar width when storage is unavailable", () => {
    const restore = stubWindow({
      innerWidth: 900,
      localStorage: {
        getItem: () => {
          throw new Error("storage unavailable");
        },
      },
    });

    expect(readInitialSidebarWidth()).toBe(DEFAULT_SIDEBAR_WIDTH);

    restore();
  });
});

function stubWindow(windowValue: { innerWidth: number; localStorage: { getItem: (key: string) => string | null } }): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowValue,
  });
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, "window", previous);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  };
}
