import { describe, expect, it } from "vitest";
import { richMarkdownIconLabel, richMarkdownIconLabels, richMarkdownTableIconLabel } from "./richMarkdownIcons";

describe("rich markdown icons", () => {
  it("recognizes every icon label used by the Welcome icon tour", () => {
    for (const label of richMarkdownIconLabels) {
      expect(richMarkdownIconLabel(label)).toBe(label);
      expect(richMarkdownTableIconLabel(["Area", "Icon", "Meaning"], 1, label)).toBe(label);
    }
  });

  it("only treats values in an Icon column as renderable icon labels", () => {
    expect(richMarkdownTableIconLabel(["Area", "Meaning"], 1, "PanelLeft")).toBeUndefined();
    expect(richMarkdownTableIconLabel(["Area", "Icon", "Meaning"], 1, "NotAnIcon")).toBeUndefined();
  });
});
