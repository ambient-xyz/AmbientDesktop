import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V2_HOTSPOTS,
  buildV2Scorecard,
  renderV2ScorecardMarkdown,
  validateV2Scorecard,
} from "./simplification-v2-scorecard.mjs";

describe("simplification V2 scorecard", () => {
  it("exposes package scripts for generating and checking the scorecard", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts).toMatchObject({
      "simplification:v2:scorecard": "node scripts/simplification-v2-scorecard.mjs",
      "simplification:v2:scorecard:check": "node scripts/simplification-v2-scorecard.mjs --check",
      "test:simplification-v2-scorecard": "pnpm exec vitest run scripts/simplification-v2-scorecard.test.mjs",
    });
  });

  it("builds a complete hotspot scorecard from complexity inventory data", () => {
    const scorecard = buildV2Scorecard(fixtureComplexityReport());

    expect(scorecard.hotspotCount).toBe(V2_HOTSPOTS.length);
    expect(scorecard.hotspots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "right-panel-shell",
          owner: "renderer-shell",
          phaseOutcome: "closed-first-pass",
          completedSlice: expect.stringContaining("browser pane"),
          remainingRisk: expect.stringContaining("giant renderer declarations"),
          nextSlice: expect.stringContaining("stable props"),
          current: expect.objectContaining({ fileLines: 14977, declarationLines: 9172 }),
          validationCommand: "pnpm run test:ui-model",
        }),
        expect.objectContaining({
          id: "runtime-send-loop",
          owner: "runtime-send-loop",
          current: expect.objectContaining({ fileLines: 8331, declarationLines: 3077 }),
        }),
      ]),
    );
    expect(validateV2Scorecard(scorecard)).toEqual({ ok: true, issues: [] });
  });

  it("fails checked validation when a hotspot loses baseline or parity evidence", () => {
    const scorecard = buildV2Scorecard({
      topFiles: [],
      topDeclarations: [],
    });
    scorecard.hotspots[0].completedSlice = "";

    expect(validateV2Scorecard(scorecard).issues).toEqual(
      expect.arrayContaining([
        "right-panel-shell: missing completed slice",
        "right-panel-shell: missing current file line measurement",
        "right-panel-shell: missing current declaration line measurement",
      ]),
    );
  });

  it("renders current, baseline, budget, validation, outcomes, and remaining risk", () => {
    const markdown = renderV2ScorecardMarkdown(buildV2Scorecard(fixtureComplexityReport()));

    expect(markdown).toContain("# Simplification V2 Hotspot Scorecard");
    expect(markdown).toContain("RightPanel shell");
    expect(markdown).toContain("9,172 / 9,172 / 10,100");
    expect(markdown).toContain("closed-first-pass");
    expect(markdown).toContain("`pnpm run test:ui-model`");
    expect(markdown).toContain("Remaining risk");
    expect(markdown).toContain("Subagent release gate report");
  });
});

function fixtureComplexityReport() {
  return {
    topFiles: V2_HOTSPOTS.map((target) => ({
      file: target.file,
      lines: target.baseline.fileLines,
    })),
    topDeclarations: V2_HOTSPOTS.filter((target) => target.declaration).map((target) => ({
      file: target.file,
      line: 1,
      kind: target.declaration.kind,
      name: target.declaration.name,
      lines: target.baseline.declarationLines,
    })),
  };
}
