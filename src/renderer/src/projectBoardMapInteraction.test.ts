import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectBoardMapViewsFilePath = fileURLToPath(new URL("./ProjectBoardMapViews.tsx", import.meta.url));

describe("ProjectBoardMapTab interactions", () => {
  it("keeps map and critical-path selection from moving scroll on hover or focus", async () => {
    const projectBoardMapViews = await readFile(projectBoardMapViewsFilePath, "utf8");
    const start = projectBoardMapViews.indexOf("function ProjectBoardMapTab");
    const end = projectBoardMapViews.indexOf("function projectBoardDependencyRefLabel");
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const mapBlock = projectBoardMapViews.slice(start, end);

    expect(mapBlock).not.toContain("scrollIntoView");
    expect(mapBlock).not.toContain("onMouseEnter");
    expect(mapBlock).toContain("project-board-critical-path-card");
    expect(mapBlock).toContain('const done = card.status === "done"');
    expect(mapBlock).toContain('${done ? "done" : ""}');
    expect(mapBlock).toContain('<Check size={13} aria-hidden="true" />');
    expect(mapBlock).toContain("onFocus={() => onSelectCard(card.id)}");
  });
});
