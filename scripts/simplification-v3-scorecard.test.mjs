import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_HOTSPOTS,
  buildV3Scorecard,
  renderV3ScorecardMarkdown,
  validateV3Scorecard,
} from "./simplification-v3-scorecard.mjs";

describe("simplification V3 scorecard", () => {
  it("exposes package scripts for generating and checking the scorecard", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts).toMatchObject({
      "simplification:v3:scorecard": "node scripts/simplification-v3-scorecard.mjs",
      "simplification:v3:scorecard:check": "node scripts/simplification-v3-scorecard.mjs --check",
      "test:simplification-v3-scorecard": "pnpm exec vitest run scripts/simplification-v3-scorecard.test.mjs",
    });
  });

  it("tracks every V3 hotspot with current metrics, validation, and first extraction target", () => {
    const scorecard = buildV3Scorecard(fixtureComplexityReport());

    expect(scorecard.hotspotCount).toBe(9);
    expect(scorecard.hotspots.map((hotspot) => hotspot.id)).toEqual([
      "right-panel-shell",
      "app-shell",
      "automations-workspace",
      "project-board-workspace",
      "project-board-ui-model",
      "agent-runtime-class",
      "agent-runtime-send",
      "main-ipc-registrar",
      "project-store-facade",
    ]);
    expect(scorecard.hotspots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "right-panel-shell",
          owner: "renderer-shell",
          validationDomain: "renderer-visual",
          firstParityCommand: expect.stringContaining("main-shell-desktop"),
          firstExtractionTarget: expect.stringContaining("artifact/tool/status"),
          current: expect.objectContaining({ fileLines: 14326, declarationLines: 8639 }),
        }),
        expect.objectContaining({
          id: "agent-runtime-send",
          owner: "runtime-send-pipeline",
          current: expect.objectContaining({ fileLines: 8204, declarationLines: 2865 }),
          desiredFirstPassDirection: expect.stringContaining("table of named stages"),
        }),
        expect.objectContaining({
          id: "main-ipc-registrar",
          validationCommand: "pnpm run test:simplification-phase0",
          current: expect.objectContaining({ fileLines: 3191, declarationLines: 2862 }),
        }),
      ]),
    );
    expect(validateV3Scorecard(scorecard)).toEqual({ ok: true, issues: [] });
  });

  it("fails checked validation when required metadata or current measurements are missing", () => {
    const scorecard = buildV3Scorecard({
      topFiles: [],
      topDeclarations: [],
    });
    scorecard.hotspots[0].firstExtractionTarget = "";

    expect(validateV3Scorecard(scorecard).issues).toEqual(
      expect.arrayContaining([
        "right-panel-shell: missing first extraction target",
        "right-panel-shell: missing current file line measurement",
        "right-panel-shell: missing current declaration line measurement",
      ]),
    );
  });

  it("keeps budgets advisory unless a hotspot grows past budget without a status note", () => {
    const scorecard = buildV3Scorecard(fixtureComplexityReport());
    const rightPanel = scorecard.hotspots.find((hotspot) => hotspot.id === "right-panel-shell");
    rightPanel.current.fileLines = rightPanel.budget.fileLines + 1;
    rightPanel.statusNote = "";

    expect(validateV3Scorecard(scorecard).issues).toContain(
      `right-panel-shell: file lines ${rightPanel.current.fileLines} exceed advisory budget ${rightPanel.budget.fileLines} without status note`,
    );

    rightPanel.statusNote = "Known temporary growth while extracting pane owners.";
    expect(validateV3Scorecard(scorecard).issues).not.toContain(
      `right-panel-shell: file lines ${rightPanel.current.fileLines} exceed advisory budget ${rightPanel.budget.fileLines} without status note`,
    );
  });

  it("renders current, baseline, budget, validation, parity command, and extraction target", () => {
    const markdown = renderV3ScorecardMarkdown(buildV3Scorecard(fixtureComplexityReport()));

    expect(markdown).toContain("# Simplification V3 Hotspot Scorecard");
    expect(markdown).toContain("RightPanel shell");
    expect(markdown).toContain("8,639 / 8,639 / 9,200");
    expect(markdown).toContain("`pnpm run test:ui-model");
    expect(markdown).toContain("ProjectStore facade");
    expect(markdown).toContain("First extraction target");
  });
});

function fixtureComplexityReport() {
  return {
    topFiles: V3_HOTSPOTS.map((target) => ({
      file: target.file,
      lines: target.baseline.fileLines,
    })),
    topDeclarations: V3_HOTSPOTS.filter((target) => target.declaration).map((target) => ({
      file: target.file,
      line: 1,
      kind: target.declaration.kind,
      name: target.declaration.name,
      lines: target.baseline.declarationLines,
    })),
  };
}
