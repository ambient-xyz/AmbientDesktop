import { describe, expect, it } from "vitest";

import { slashCommandDescriptionPopoverPosition } from "./slashCommandDescriptionPopoverPosition";

describe("slashCommandDescriptionPopoverPosition", () => {
  it("places the slash command detail below the anchor when there is no room above", () => {
    const position = slashCommandDescriptionPopoverPosition({
      anchor: { left: 120, top: 20, right: 420, bottom: 42 },
      popover: { height: 96 },
      viewport: { width: 900, height: 700 },
    });

    expect(position).toEqual({
      left: 120,
      top: 50,
      width: 360,
      placement: "below",
    });
  });

  it("keeps the detail inside the viewport when the anchor is near the right edge", () => {
    const position = slashCommandDescriptionPopoverPosition({
      anchor: { left: 760, top: 280, right: 880, bottom: 302 },
      popover: { height: 90 },
      viewport: { width: 900, height: 700 },
    });

    expect(position.left).toBe(528);
    expect(position.width).toBe(360);
    expect(position.placement).toBe("above");
  });

  it("shrinks the detail width for narrow viewports", () => {
    const position = slashCommandDescriptionPopoverPosition({
      anchor: { left: 8, top: 220, right: 240, bottom: 242 },
      popover: { height: 80 },
      viewport: { width: 320, height: 600 },
    });

    expect(position.left).toBe(12);
    expect(position.width).toBe(296);
  });
});
