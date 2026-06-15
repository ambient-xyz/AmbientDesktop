import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  V3_RENDERER_BASELINE_HOTSPOT_IDS,
  buildV3RendererBaselineManifest,
  extractUiModelScenarioNames,
  renderV3RendererBaselinesMarkdown,
  validateV3RendererBaselineManifest,
} from "./simplification-v3-renderer-baselines.mjs";

describe("simplification V3 renderer baselines", () => {
  it("exposes package scripts for rendering and checking baseline capture commands", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts).toMatchObject({
      "simplification:v3:renderer-baselines": "node scripts/simplification-v3-renderer-baselines.mjs",
      "simplification:v3:renderer-baselines:check": "node scripts/simplification-v3-renderer-baselines.mjs --check",
      "test:simplification-v3-renderer-baselines": "pnpm exec vitest run scripts/simplification-v3-renderer-baselines.test.mjs",
    });
  });

  it("covers every Phase 0 renderer snapshot target with UI-model commands", () => {
    const manifest = buildV3RendererBaselineManifest();

    expect(manifest.groups.map((group) => group.hotspotId).sort()).toEqual([...V3_RENDERER_BASELINE_HOTSPOT_IDS].sort());
    expect(manifest.groups.find((group) => group.hotspotId === "right-panel-shell")).toMatchObject({
      owner: "renderer-shell",
      file: "src/renderer/src/RightPanel.tsx",
      command: expect.stringContaining("pnpm run test:ui-model --"),
    });
    expect(manifest.groups.find((group) => group.hotspotId === "project-board-workspace")?.scenarios).toEqual(
      expect.arrayContaining(["project-board-desktop", "project-board-pm-review-open"]),
    );
    expect(manifest.groups.find((group) => group.hotspotId === "app-shell")?.scenarios).toEqual(
      expect.arrayContaining(["workflow-recordings-home"]),
    );
    expect(validateV3RendererBaselineManifest(manifest)).toEqual({ ok: true, issues: [] });
  });

  it("checks manifest scenarios against the UI-model scenario catalog", () => {
    const source = readFileSync(new URL("./ui-model/collect-ui-model.mjs", import.meta.url), "utf8");
    const scenarios = extractUiModelScenarioNames(source);

    expect(scenarios).toEqual(expect.arrayContaining(["main-shell-desktop", "local-tasks-edit-card-open"]));
    expect(validateV3RendererBaselineManifest(buildV3RendererBaselineManifest(), { availableScenarios: scenarios })).toEqual({
      ok: true,
      issues: [],
    });
  });

  it("fails checked validation when a required hotspot or scenario is missing", () => {
    const manifest = buildV3RendererBaselineManifest();
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

    expect(validateV3RendererBaselineManifest(withoutRightPanel).issues).toContain(
      "right-panel-shell: missing renderer baseline group",
    );
    expect(validateV3RendererBaselineManifest(withUnknownScenario).issues).toContain(
      "app-shell: unknown UI-model scenario missing-scenario",
    );
  });

  it("renders capture commands, expected outputs, and parity targets", () => {
    const markdown = renderV3RendererBaselinesMarkdown(buildV3RendererBaselineManifest());

    expect(markdown).toContain("# Simplification V3 Renderer Baselines");
    expect(markdown).toContain("RightPanel shell");
    expect(markdown).toContain("`main-shell-desktop`");
    expect(markdown).toContain("test-results/simplification-v3-baselines/right-panel-shell/summary.json");
    expect(markdown).toContain("Board columns, dense cards, long generated content");
  });
});
