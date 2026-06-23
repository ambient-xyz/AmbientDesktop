import { describe, expect, it } from "vitest";

import {
  calculateVirtualMessageRange,
  estimateMessageRowHeight,
  shouldVirtualizeMessages,
  type VirtualMessageLike,
} from "./messageVirtualization";

describe("message virtualization", () => {
  it("renders only rows intersecting the viewport plus overscan", () => {
    const items = messages(100);
    const measuredHeights = new Map(items.map((item) => [item.id, 100]));
    const range = calculateVirtualMessageRange({
      items,
      scrollTop: 2_000,
      viewportHeight: 500,
      overscanPx: 200,
      measuredHeights,
    });

    expect(range.totalHeight).toBe(10_000);
    expect(range.rows[0]?.index).toBe(17);
    expect(range.rows.at(-1)?.index).toBe(27);
    expect(range.rows.length).toBeLessThan(20);
  });

  it("keeps active message rows mounted even when they are outside the viewport", () => {
    const items = messages(100);
    const measuredHeights = new Map(items.map((item) => [item.id, 100]));
    const range = calculateVirtualMessageRange({
      items,
      scrollTop: 0,
      viewportHeight: 400,
      overscanPx: 0,
      measuredHeights,
      activeIds: new Set(["message-99"]),
    });

    expect(range.rows.map((row) => row.index)).toContain(99);
    expect(range.rows.at(-1)).toMatchObject({ index: 99, start: 9_900 });
  });

  it("keeps virtualization off for small, find, and subagent-inspector transcripts", () => {
    expect(shouldVirtualizeMessages({ messageCount: 10, chatFindOpen: false, activeSubagentInspector: false })).toBe(false);
    expect(shouldVirtualizeMessages({ messageCount: 100, chatFindOpen: true, activeSubagentInspector: false })).toBe(false);
    expect(shouldVirtualizeMessages({ messageCount: 100, chatFindOpen: false, activeSubagentInspector: true })).toBe(false);
    expect(shouldVirtualizeMessages({ messageCount: 100, chatFindOpen: false, activeSubagentInspector: false })).toBe(true);
  });

  it("bounds estimates for very large messages so initial scroll height remains usable", () => {
    const height = estimateMessageRowHeight({
      id: "large",
      role: "assistant",
      content: "line\n".repeat(4_000),
    });

    expect(height).toBeGreaterThan(300);
    expect(height).toBeLessThanOrEqual(760);
  });
});

function messages(count: number): VirtualMessageLike[] {
  return Array.from({ length: count }, (_value, index) => ({
    id: `message-${index}`,
    role: index % 3 === 0 ? "tool" : "assistant",
    content: `message ${index}`,
  }));
}
