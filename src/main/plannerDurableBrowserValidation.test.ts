import { describe, expect, it } from "vitest";
import { plannerDurableBrowserSnapshotValidation } from "./plannerDurableBrowserValidation";

describe("planner durable browser validation", () => {
  it("turns browser DOM findings into structured validation errors", () => {
    const validation = plannerDurableBrowserSnapshotValidation(
      {
        bodyTextLength: 0,
        missingSections: ["diagram-gallery"],
        scriptCount: 1,
        remoteReferences: ["https://example.com/asset.png"],
        svgSnapshots: [
          {
            index: 0,
            width: 0,
            height: 120,
            viewBox: null,
            hasTitle: false,
            hasDesc: false,
            visibleElementCount: 0,
            textLabels: ["A label that is intentionally far too long ".repeat(4)],
          },
        ],
      },
      new Date("2026-05-11T00:00:00.000Z"),
    );

    expect(validation.ok).toBe(false);
    expect(validation.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "browser-empty-body",
        "browser-missing-section",
        "browser-script-present",
        "browser-remote-reference",
        "browser-svg-zero-size",
        "browser-svg-missing-viewbox",
        "browser-svg-missing-accessible-label",
        "browser-svg-empty",
      ]),
    );
    expect(validation.warnings.map((issue) => issue.code)).toContain("browser-svg-long-label");
  });
});
