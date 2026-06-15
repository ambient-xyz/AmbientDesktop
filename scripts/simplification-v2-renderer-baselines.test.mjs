import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V2_RENDERER_BASELINE_HOTSPOT_IDS,
  buildV2RendererBaselineManifest,
  extractUiModelScenarioNames,
  renderV2RendererBaselinesMarkdown,
  validateV2RendererBaselineManifest,
} from "./simplification-v2-renderer-baselines.mjs";

describe("simplification V2 renderer baselines", () => {
  it("exposes package scripts for rendering and checking baseline capture commands", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts).toMatchObject({
      "simplification:v2:renderer-baselines": "node scripts/simplification-v2-renderer-baselines.mjs",
      "simplification:v2:renderer-baselines:check": "node scripts/simplification-v2-renderer-baselines.mjs --check",
      "test:simplification-v2-renderer-baselines": "pnpm exec vitest run scripts/simplification-v2-renderer-baselines.test.mjs",
    });
  });

  it("covers every Phase 0 renderer snapshot target with UI-model commands", () => {
    const manifest = buildV2RendererBaselineManifest();

    expect(manifest.groups.map((group) => group.hotspotId).sort()).toEqual([...V2_RENDERER_BASELINE_HOTSPOT_IDS].sort());
    expect(manifest.groups.find((group) => group.hotspotId === "right-panel-shell")).toMatchObject({
      owner: "renderer-shell",
      file: "src/renderer/src/RightPanel.tsx",
      command: expect.stringContaining("pnpm run test:ui-model --"),
    });
    expect(manifest.groups.find((group) => group.hotspotId === "project-board-workspace")?.scenarios).toEqual(
      expect.arrayContaining(["project-board-desktop", "project-board-pm-review-open"]),
    );
    expect(validateV2RendererBaselineManifest(manifest)).toEqual({ ok: true, issues: [] });
  });

  it("checks manifest scenarios against the UI-model scenario catalog", () => {
    const source = readFileSync(new URL("./ui-model/collect-ui-model.mjs", import.meta.url), "utf8");
    const scenarios = extractUiModelScenarioNames(source);

    expect(scenarios).toEqual(expect.arrayContaining(["main-shell-desktop", "local-tasks-edit-card-open"]));
    expect(validateV2RendererBaselineManifest(buildV2RendererBaselineManifest(), { availableScenarios: scenarios })).toEqual({
      ok: true,
      issues: [],
    });
  });

  it("fails checked validation when a required hotspot or scenario is missing", () => {
    const manifest = buildV2RendererBaselineManifest();
    const withoutRightPanel = {
      ...manifest,
      groups: manifest.groups.filter((group) => group.hotspotId !== "right-panel-shell"),
    };
    const withUnknownScenario = {
      ...manifest,
      groups: manifest.groups.map((group) =>
        group.hotspotId === "app-shell" ? { ...group, scenarios: [...group.scenarios, "missing-scenario"] } : group,
      ),
    };

    expect(validateV2RendererBaselineManifest(withoutRightPanel).issues).toContain(
      "right-panel-shell: missing renderer baseline group",
    );
    expect(validateV2RendererBaselineManifest(withUnknownScenario).issues).toContain(
      "app-shell: unknown UI-model scenario missing-scenario",
    );
  });

  it("renders capture commands, expected outputs, and parity targets", () => {
    const markdown = renderV2RendererBaselinesMarkdown(buildV2RendererBaselineManifest());

    expect(markdown).toContain("# Simplification V2 Renderer Baselines");
    expect(markdown).toContain("RightPanel shell");
    expect(markdown).toContain("`main-shell-desktop`");
    expect(markdown).toContain("test-results/simplification-v2-baselines/right-panel-shell/summary.json");
    expect(markdown).toContain("Board columns, dense cards, long generated content");
  });
});
