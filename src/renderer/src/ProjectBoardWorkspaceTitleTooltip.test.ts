import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectBoardTitleTooltipAnchor,
  projectBoardTitleTooltipTrigger,
  sameProjectBoardTitleTooltipAnchor,
} from "./ProjectBoardWorkspaceTitleTooltip";

class FakeElement {
  dataset: Record<string, string | undefined> = {};
  private title?: string;
  private closestTarget?: FakeElement | null;

  constructor(input: { tooltip?: string; title?: string; closestTarget?: FakeElement | null } = {}) {
    this.dataset.projectBoardTooltip = input.tooltip;
    this.title = input.title;
    this.closestTarget = input.closestTarget;
  }

  closest(): FakeElement | null {
    return this.closestTarget === undefined ? this : this.closestTarget;
  }

  getAttribute(name: string): string | null {
    return name === "title" ? this.title ?? null : null;
  }

  getBoundingClientRect(): Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height"> {
    return {
      left: 12,
      right: 92,
      top: 18,
      bottom: 42,
      width: 80,
      height: 24,
    };
  }
}

describe("ProjectBoardWorkspaceTitleTooltip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("finds the closest project-board tooltip trigger", () => {
    vi.stubGlobal("Element", FakeElement);
    const trigger = new FakeElement({ tooltip: "Explain this action" });
    const child = new FakeElement({ closestTarget: trigger });

    expect(projectBoardTitleTooltipTrigger(child as unknown as EventTarget)).toBe(trigger);
  });

  it("falls back to button title copy and ignores blank triggers", () => {
    vi.stubGlobal("Element", FakeElement);
    const titleTrigger = new FakeElement({ title: "Open board" });
    const blankTrigger = new FakeElement({ title: " " });

    expect(projectBoardTitleTooltipTrigger(titleTrigger as unknown as EventTarget)).toBe(titleTrigger);
    expect(projectBoardTitleTooltipTrigger(blankTrigger as unknown as EventTarget)).toBeUndefined();
    expect(projectBoardTitleTooltipTrigger({} as EventTarget)).toBeUndefined();
  });

  it("captures anchor geometry and compares stable anchors with tolerance", () => {
    const anchor = projectBoardTitleTooltipAnchor(new FakeElement() as unknown as HTMLElement);

    expect(anchor).toEqual({
      left: 12,
      right: 92,
      top: 18,
      bottom: 42,
      width: 80,
      height: 24,
    });
    expect(sameProjectBoardTitleTooltipAnchor(anchor, { ...anchor, left: 12.4, top: 18.4 })).toBe(true);
    expect(sameProjectBoardTitleTooltipAnchor(anchor, { ...anchor, left: 13, top: 18 })).toBe(false);
  });
});
