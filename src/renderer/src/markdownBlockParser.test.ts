import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks } from "./markdownBlockParser";

describe("parseMarkdownBlocks", () => {
  it("keeps blank-line separated ordered items in one list", () => {
    const blocks = parseMarkdownBlocks(
      [
        "The Standouts:",
        "",
        "1. The Beverly on Main -- first item.",
        "",
        "1. AZ/88 -- second item.",
        "",
        "1. Bourbon & Bones -- third item.",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      { kind: "paragraph", text: "The Standouts:" },
      {
        kind: "ordered-list",
        start: 1,
        items: ["The Beverly on Main -- first item.", "AZ/88 -- second item.", "Bourbon & Bones -- third item."],
      },
    ]);
  });

  it("does not absorb a following paragraph into a list", () => {
    const blocks = parseMarkdownBlocks(["1. First item.", "", "A separate paragraph."].join("\n"));

    expect(blocks).toEqual([
      { kind: "ordered-list", start: 1, items: ["First item."] },
      { kind: "paragraph", text: "A separate paragraph." },
    ]);
  });

  it("preserves indented continuation lines inside list items", () => {
    const blocks = parseMarkdownBlocks(["1. First item.", "   Continued detail.", "2. Second item."].join("\n"));

    expect(blocks).toEqual([
      {
        kind: "ordered-list",
        start: 1,
        items: ["First item.\nContinued detail.", "Second item."],
      },
    ]);
  });
});
