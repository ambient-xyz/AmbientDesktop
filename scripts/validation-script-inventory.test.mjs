import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildValidationScriptInventory,
  classifyLiveProvider,
  classifyScriptCost,
  classifyScriptDomain,
  compareValidationScriptEntries,
  CURRENT_PROVIDER_GUIDANCE,
  isValidationScriptName,
  recommendedValidationScriptEntries,
  renderValidationScriptInventoryMarkdown,
  renderValidationScriptRecommendationsMarkdown,
  validateValidationScriptInventory,
  validationCostRank,
  validationProviderRank,
  validationScriptMatchesFilters,
} from "./validation-script-inventory.mjs";

describe("validation script inventory", () => {
  it("exposes package scripts for inventory and recommendation views", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts).toMatchObject({
      "validation:inventory": "node scripts/validation-script-inventory.mjs",
      "validation:recommend": "node scripts/validation-script-inventory.mjs --recommend",
      "validation:inventory:check": "node scripts/validation-script-inventory.mjs --check",
      "simplification:v2:scorecard": "node scripts/simplification-v2-scorecard.mjs",
      "simplification:v2:scorecard:check": "node scripts/simplification-v2-scorecard.mjs --check",
      "simplification:v2:renderer-baselines": "node scripts/simplification-v2-renderer-baselines.mjs",
      "simplification:v2:renderer-baselines:check": "node scripts/simplification-v2-renderer-baselines.mjs --check",
      "simplification:v3:scorecard": "node scripts/simplification-v3-scorecard.mjs",
      "simplification:v3:scorecard:check": "node scripts/simplification-v3-scorecard.mjs --check",
      "simplification:v3:renderer-baselines": "node scripts/simplification-v3-renderer-baselines.mjs",
      "simplification:v3:renderer-baselines:check": "node scripts/simplification-v3-renderer-baselines.mjs --check",
    });
  });

  it("classifies validation scripts by domain, cost, and live provider", () => {
    const packageJson = {
      scripts: {
        typecheck: "tsc --noEmit",
        test: "pnpm run prepare:node-native && vitest run",
        "dev:gmi-cloud":
          "GMI_CLOUD_API_KEY_FILE=${GMI_CLOUD_API_KEY_FILE:-$(node scripts/resolve-gmi-cloud-key-file.mjs)} AMBIENT_PROVIDER=gmi-cloud electron-vite dev",
        "test:project-board-pm-review-provider-fixtures": "pnpm exec vitest run src/main/project-board/projectBoardSynthesisProvider.test.ts",
        "test:project-board-release-gate:phase8": "node scripts/project-board-phase8-release-gate.mjs",
        "test:workflow-local-file:live":
          "GMI_CLOUD_API_KEY_FILE=${GMI_CLOUD_API_KEY_FILE:-$(node scripts/resolve-gmi-cloud-key-file.mjs)} AMBIENT_PROVIDER=gmi-cloud bash scripts/test-node-native.sh src/main/workflow/workflowDogfood.test.ts",
        "simplification:v3:scorecard:check": "node scripts/simplification-v3-scorecard.mjs --check",
        "build:google-sidecar": "node scripts/build-google-sidecar.mjs",
      },
    };

    const report = buildValidationScriptInventory(packageJson);

    expect(report.entries.map((entry) => entry.name)).not.toContain("build:google-sidecar");
    expect(report.entries.find((entry) => entry.name === "typecheck")).toMatchObject({
      domain: "general",
      cost: "local-fast",
      liveProvider: "none",
      requiresSecrets: false,
    });
    expect(report.entries.find((entry) => entry.name === "test:project-board-release-gate:phase8")).toMatchObject({
      domain: "project-board",
      cost: "local-heavy",
      liveProvider: "none",
    });
    expect(report.entries.find((entry) => entry.name === "test:workflow-local-file:live")).toMatchObject({
      domain: "workflow",
      cost: "live-provider",
      liveProvider: "gmi-cloud",
      requiresSecrets: true,
    });
    expect(report.entries.find((entry) => entry.name === "simplification:v3:scorecard:check")).toMatchObject({
      domain: "simplification",
      cost: "local-fast",
      liveProvider: "none",
      requiresSecrets: false,
    });
    expect(validateValidationScriptInventory(report)).toEqual({ ok: true, issues: [] });
  });

  it("renders a compact markdown summary grouped by domain", () => {
    const report = buildValidationScriptInventory({
      scripts: {
        typecheck: "tsc --noEmit",
        test: "pnpm run prepare:node-native && vitest run",
        "dev:gmi-cloud": "AMBIENT_PROVIDER=gmi-cloud electron-vite dev",
        "test:project-board-pm-review-provider-fixtures": "pnpm exec vitest run src/main/project-board/projectBoardSynthesisProvider.test.ts",
        "test:project-board-release-gate:phase8": "node scripts/project-board-phase8-release-gate.mjs",
      },
    });

    const markdown = renderValidationScriptInventoryMarkdown(report);

    expect(markdown).toContain("# Validation Script Inventory");
    expect(markdown).toContain("Provider guidance: Provider-dependent validation should use AMBIENT_PROVIDER=ambient");
    expect(markdown).toContain("## project-board");
    expect(markdown).toContain("`test:project-board-pm-review-provider-fixtures`");
    expect(markdown).toContain("| `dev:gmi-cloud` | live-provider | gmi-cloud | yes | GMI Cloud failover only |");
  });

  it("filters the generated inventory by cost, provider, secrets, and search text", () => {
    const report = buildValidationScriptInventory({
      scripts: {
        typecheck: "tsc --noEmit",
        "test:browser": "node scripts/e2e-browser-capability.mjs",
        "test:project-board-release-gate:phase8": "node scripts/project-board-phase8-release-gate.mjs",
        "test:project-board-kanban-health-report-artifact-promotion:gmi": "node scripts/e2e-kanban-health-report-artifact-promotion-gmi.mjs",
        "test:web-research-preferences:live": "AMBIENT_PROVIDER=ambient node scripts/e2e-web-research-preferences-live.mjs",
      },
    }, {
      domain: "project-board",
      cost: "live-provider",
      liveProvider: "gmi-cloud",
      requiresSecrets: true,
      search: "health-report",
    });

    expect(report.entries).toEqual([
      expect.objectContaining({
        name: "test:project-board-kanban-health-report-artifact-promotion:gmi",
        domain: "project-board",
        cost: "live-provider",
        liveProvider: "gmi-cloud",
        requiresSecrets: true,
      }),
    ]);

    const localReport = buildValidationScriptInventory({
      scripts: {
        typecheck: "tsc --noEmit",
        "test:browser": "node scripts/e2e-browser-capability.mjs",
        "test:web-research-preferences:live": "AMBIENT_PROVIDER=ambient node scripts/e2e-web-research-preferences-live.mjs",
      },
    }, {
      liveProvider: "none",
      requiresSecrets: false,
    });

    expect(localReport.entries.map((entry) => entry.name)).toEqual(["test:browser", "typecheck"]);
  });

  it("matches individual entries with the same composable filters used by the CLI", () => {
    const entry = {
      name: "test:workflow-local-file:live",
      command: "AMBIENT_PROVIDER=gmi-cloud bash scripts/test-node-native.sh src/main/workflow/workflowDogfood.test.ts",
      domain: "workflow",
      cost: "live-provider",
      liveProvider: "gmi-cloud",
      requiresSecrets: true,
      notes: "uses GMI Cloud override",
    };

    expect(validationScriptMatchesFilters(entry, { domain: "workflow", liveProvider: "gmi-cloud", search: "local-file" })).toBe(true);
    expect(validationScriptMatchesFilters(entry, { cost: "local-fast" })).toBe(false);
    expect(validationScriptMatchesFilters(entry, { requiresSecrets: false })).toBe(false);
  });

  it("sorts inventories by cheapest local validation before broader or live checks", () => {
    const report = buildValidationScriptInventory({
      scripts: {
        "test:project-board-release-gate:phase8": "node scripts/project-board-phase8-release-gate.mjs",
        "test:project-board-kanban-health-report-artifact-promotion:gmi": "node scripts/e2e-kanban-health-report-artifact-promotion-gmi.mjs",
        "test:project-board-pm-review-provider-fixtures": "pnpm exec vitest run src/main/project-board/projectBoardSynthesisProvider.test.ts -t \"lightweight PM Review contract fixtures\"",
        "test:project-board-pm-review-provider-fixtures-gate": "node scripts/project-board-pm-review-provider-fixtures-gate.mjs",
      },
    }, {
      domain: "project-board",
    });

    expect(report.entries.map((entry) => `${entry.cost}:${entry.name}`)).toEqual([
      "local-fast:test:project-board-pm-review-provider-fixtures",
      "local-medium:test:project-board-pm-review-provider-fixtures-gate",
      "local-heavy:test:project-board-release-gate:phase8",
      "live-provider:test:project-board-kanban-health-report-artifact-promotion:gmi",
    ]);
  });

  it("uses explicit cost and provider ranks instead of alphabetical order", () => {
    expect(["live-provider", "local-heavy", "local-medium", "local-fast"].sort((left, right) => validationCostRank(left) - validationCostRank(right))).toEqual([
      "local-fast",
      "local-medium",
      "local-heavy",
      "live-provider",
    ]);
    expect(["provider-dependent", "ambient", "gmi-cloud", "none"].sort((left, right) => validationProviderRank(left) - validationProviderRank(right))).toEqual([
      "none",
      "ambient",
      "provider-dependent",
      "gmi-cloud",
    ]);

    const sorted = [
      { domain: "project-board", cost: "live-provider", liveProvider: "provider-dependent", requiresSecrets: true, name: "live" },
      { domain: "project-board", cost: "local-fast", liveProvider: "none", requiresSecrets: false, name: "fast" },
    ].sort(compareValidationScriptEntries);

    expect(sorted.map((entry) => entry.name)).toEqual(["fast", "live"]);
  });

  it("recommends the cheapest local no-secret validation script per included domain", () => {
    const report = buildValidationScriptInventory({
      scripts: {
        "test:project-board-kanban-health-report-artifact-promotion:gmi": "node scripts/e2e-kanban-health-report-artifact-promotion-gmi.mjs",
        "test:project-board-release-gate:phase8": "node scripts/project-board-phase8-release-gate.mjs",
        "test:project-board-pm-review-provider-fixtures": "pnpm exec vitest run src/main/project-board/projectBoardSynthesisProvider.test.ts",
        "test:workflow-local-file:live": "AMBIENT_PROVIDER=gmi-cloud bash scripts/test-node-native.sh src/main/workflow/workflowDogfood.test.ts",
        "test:workflow-dogfood": "bash scripts/test-node-native.sh src/main/workflow/workflowDogfood.test.ts",
      },
    });

    expect(recommendedValidationScriptEntries(report).map((entry) => `${entry.domain}:${entry.name}`)).toEqual([
      "project-board:test:project-board-pm-review-provider-fixtures",
      "workflow:test:workflow-dogfood",
    ]);
  });

  it("renders recommended scripts as runnable pnpm commands", () => {
    const report = buildValidationScriptInventory({
      scripts: {
        "test:project-board-kanban-health-report-artifact-promotion:gmi": "node scripts/e2e-kanban-health-report-artifact-promotion-gmi.mjs",
        "test:project-board-pm-review-provider-fixtures": "pnpm exec vitest run src/main/project-board/projectBoardSynthesisProvider.test.ts",
      },
    });

    const markdown = renderValidationScriptRecommendationsMarkdown(report);

    expect(markdown).toContain("# Recommended Validation Scripts");
    expect(markdown).toContain("<model>");
    expect(markdown).toContain("| project-board | `pnpm run test:project-board-pm-review-provider-fixtures` | local-fast | Vitest |");
    expect(markdown).not.toContain("health-report-artifact-promotion");
  });

  it("keeps recommendation output aligned with current live-provider policy", () => {
    const report = buildValidationScriptInventory({
      scripts: {
        "test:ambient-live": "AMBIENT_PROVIDER=ambient node scripts/e2e-web-research-preferences-live.mjs",
        "test:gmi-live": "AMBIENT_PROVIDER=gmi-cloud node scripts/e2e-kanban-health-report-artifact-promotion-gmi.mjs",
      },
    });

    expect(report.providerGuidance).toBe(CURRENT_PROVIDER_GUIDANCE);
    expect(report.providerGuidance).toMatchObject({
      preferredLiveProvider: "ambient",
      preferredLiveModel: "<model>",
      gmiCloudPolicy: "explicit request or approved failover only",
    });
    expect(report.entries.map((entry) => `${entry.liveProvider}:${entry.name}`)).toEqual([
      "ambient:test:ambient-live",
      "gmi-cloud:test:gmi-live",
    ]);
    expect(renderValidationScriptRecommendationsMarkdown(report)).toContain("GMI Cloud entries are failover inventory, not default recommendations");
  });

  it("keeps the core heuristics stable", () => {
    expect(classifyScriptDomain("test:mcp-live-pi-smoke:gmi-live", "AMBIENT_PROVIDER=gmi-cloud pnpm exec vitest run src/main/mcp/mcpLivePiSmoke.live.test.ts")).toBe("mcp");
    expect(classifyScriptDomain("test:visual:composer-controls", "AMBIENT_PROVIDER=gmi-cloud node scripts/e2e-composer-controls-visual-smoke.mjs")).toBe(
      "renderer-visual",
    );
    expect(classifyLiveProvider("test:web-research-preferences:live", "AMBIENT_PROVIDER=ambient node scripts/e2e-web-research-preferences-live.mjs")).toBe(
      "ambient",
    );
    expect(classifyLiveProvider("test:project-board-kanban-health-report-artifact-promotion:gmi", "node scripts/e2e-kanban-health-report-artifact-promotion-gmi.mjs")).toBe(
      "gmi-cloud",
    );
    expect(classifyScriptCost("pack", "pnpm run build && electron-builder --dir --publish=never")).toBe("local-heavy");
    expect(classifyScriptCost("test:workflow-dogfood", "bash scripts/test-node-native.sh src/main/workflow/workflowDogfood.test.ts")).toBe("local-medium");
    expect(isValidationScriptName("simplification:v2:scorecard:check")).toBe(true);
  });
});
