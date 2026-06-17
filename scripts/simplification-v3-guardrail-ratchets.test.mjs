import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  classifyImportBoundaryEdge,
  compareGuardrailSnapshots,
  renderGuardrailSnapshotMarkdown,
} from "./simplification-v3-guardrail-ratchets.mjs";

describe("simplification V3 guardrail ratchets", () => {
  it("exposes package scripts for checking and updating guardrail baselines", () => {
    const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

    expect(packageJson.scripts).toMatchObject({
      "simplification:v3:guardrails": "node scripts/simplification-v3-guardrail-ratchets.mjs",
      "simplification:v3:guardrails:check": "node scripts/simplification-v3-guardrail-ratchets.mjs --check",
      "simplification:v3:guardrails:update": "node scripts/simplification-v3-guardrail-ratchets.mjs --update-baseline",
      "test:simplification-v3-guardrails": "pnpm exec vitest run scripts/simplification-v3-guardrail-ratchets.test.mjs",
    });
    expect(packageJson.scripts["simplification:v3:phase6:check"]).toContain("pnpm run simplification:v3:guardrails:check");
  });

  it("passes when current guardrail evidence matches the baseline", () => {
    expect(compareGuardrailSnapshots(fixtureSnapshot(), fixtureSnapshot())).toEqual({ ok: true, issues: [] });
  });

  it("classifies targeted import-boundary edges", () => {
    expect(classifyImportBoundaryEdge("src/main/ipc/registerProjectIpc.ts", "src/main/projectStore/projectBoardReadRepository.ts")).toBe(
      "main-owner-peer:ipc->projectStore:src/main/ipc/registerProjectIpc.ts->src/main/projectStore/projectBoardReadRepository.ts",
    );
    expect(classifyImportBoundaryEdge("src/main/ipc/registerProjectIpc.ts", "src/main/ipc/registerSettingsIpc.ts")).toBeUndefined();
    expect(classifyImportBoundaryEdge("src/main/index.ts", "src/main/projectStore/projectBoardReadRepository.ts")).toBeUndefined();
    expect(classifyImportBoundaryEdge("src/main/index.ts", "src/renderer/src/App.tsx")).toBe(
      "main-to-renderer:src/main/index.ts->src/renderer/src/App.tsx",
    );
    expect(classifyImportBoundaryEdge("src/renderer/src/App.tsx", "src/main/index.ts")).toBe(
      "renderer-to-main:src/renderer/src/App.tsx->src/main/index.ts",
    );
    expect(classifyImportBoundaryEdge("src/shared/types.ts", "src/main/index.ts")).toBe(
      "shared-reaches-up:src/shared/types.ts->src/main/index.ts",
    );
  });

  it("fails only on net-new guardrail drift", () => {
    const baseline = fixtureSnapshot();
    const current = fixtureSnapshot({
      metrics: {
        srcMainFlatFiles: 3,
        sharedTypesImporters: 2,
        importCycles: 2,
      },
      flatMainFiles: ["src/main/a.ts", "src/main/b.ts", "src/main/newFlat.ts"],
      sharedTypesImporters: ["src/main/a.ts", "src/main/newImporter.ts"],
      importCycles: ["src/main/a.ts -> src/main/b.ts", "src/main/newCycle.ts -> src/main/a.ts"],
      importBoundaryEdges: [
        "main-owner-peer:ipc->projectStore:src/main/ipc/a.ts->src/main/projectStore/a.ts",
        "main-owner-peer:ipc->projectStore:src/main/ipc/new.ts->src/main/projectStore/a.ts",
      ],
      largeFileLineCeilings: {
        "src/main/a.ts": 910,
        "src/main/newLarge.ts": 825,
      },
      hotspotCeilings: {
        "app-shell": { file: "src/renderer/src/App.tsx", fileLines: 101, declarationLines: 80 },
      },
      lint: {
        totalErrors: 0,
        totalWarnings: 4,
        ruleCounts: { "no-unused-vars": 4 },
      },
    });

    expect(compareGuardrailSnapshots(current, baseline).issues).toEqual(
      expect.arrayContaining([
        "src-main-flat-files: 1 new flat files: src/main/newFlat.ts",
        "shared-types-fan-in: 1 new importers: src/main/newImporter.ts",
        "import-cycles: 1 new cycles: src/main/newCycle.ts -> src/main/a.ts",
        "import-boundaries: 1 new boundary imports: main-owner-peer:ipc->projectStore:src/main/ipc/new.ts->src/main/projectStore/a.ts",
        "large-file: src/main/a.ts grew from ceiling 900 to 910 lines",
        "large-file: new file src/main/newLarge.ts has 825 lines above threshold 800",
        "hotspot-size: app-shell file lines grew from ceiling 100 to 101",
        "lint: warnings increased from ceiling 3 to 4",
        "lint: no-unused-vars warnings increased from ceiling 3 to 4",
      ]),
    );
  });

  it("allows explicit baseline exceptions", () => {
    const baseline = fixtureSnapshot({
      exceptions: {
        flatMainFiles: { "src/main/newFlat.ts": { reason: "temporary owner shim" } },
        sharedTypesImporters: { "src/main/newImporter.ts": { reason: "temporary type migration shim" } },
        importCycles: { "src/main/newCycle.ts -> src/main/a.ts": { reason: "temporary cycle while moving owners" } },
        importBoundaryEdges: {
          "main-owner-peer:ipc->projectStore:src/main/ipc/new.ts->src/main/projectStore/a.ts": {
            reason: "temporary direct peer import before facade extraction",
          },
        },
        largeFiles: { "src/main/newLarge.ts": { lineCeiling: 825, reason: "temporary large generated fixture owner" } },
        hotspots: { "app-shell": { fileLines: 101, reason: "temporary shell adapter during move-only extraction" } },
        lintRuleCounts: { "no-unused-vars": { count: 4, reason: "temporary report-only lint debt" } },
        lintTotalWarnings: 4,
      },
    });
    const current = fixtureSnapshot({
      metrics: {
        srcMainFlatFiles: 3,
        sharedTypesImporters: 2,
        importCycles: 2,
      },
      flatMainFiles: ["src/main/a.ts", "src/main/b.ts", "src/main/newFlat.ts"],
      sharedTypesImporters: ["src/main/a.ts", "src/main/newImporter.ts"],
      importCycles: ["src/main/a.ts -> src/main/b.ts", "src/main/newCycle.ts -> src/main/a.ts"],
      importBoundaryEdges: [
        "main-owner-peer:ipc->projectStore:src/main/ipc/a.ts->src/main/projectStore/a.ts",
        "main-owner-peer:ipc->projectStore:src/main/ipc/new.ts->src/main/projectStore/a.ts",
      ],
      largeFileLineCeilings: {
        "src/main/a.ts": 900,
        "src/main/newLarge.ts": 825,
      },
      hotspotCeilings: {
        "app-shell": { file: "src/renderer/src/App.tsx", fileLines: 101, declarationLines: 80 },
      },
      lint: {
        totalErrors: 0,
        totalWarnings: 4,
        ruleCounts: { "no-unused-vars": 4 },
      },
    });

    expect(compareGuardrailSnapshots(current, baseline)).toEqual({ ok: true, issues: [] });
  });

  it("renders the guardrail status without raw lint output", () => {
    const markdown = renderGuardrailSnapshotMarkdown(fixtureSnapshot(), { ok: true, issues: [] });

    expect(markdown).toContain("# Simplification V3 Guardrail Ratchets");
    expect(markdown).toContain("flat src/main files");
    expect(markdown).toContain("lint errors / warnings");
    expect(markdown).toContain("import-boundary edges");
    expect(markdown).toContain("Guardrail ratchets passed.");
  });
});

function fixtureSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    largeFileLineThreshold: 800,
    metrics: {
      sourceFiles: 10,
      srcMainFlatFiles: 2,
      srcMainNestedFiles: 1,
      sharedTypesImporters: 1,
      importCycles: 1,
      importBoundaryEdges: 1,
      largeFiles: 1,
      ...overrides.metrics,
    },
    localTooling: {
      eslintConfig: "eslint.config.mjs",
      prettierConfig: "prettier.config.mjs",
      workflowFiles: 0,
      ...overrides.localTooling,
    },
    lint: {
      totalErrors: 0,
      totalWarnings: 3,
      ruleCounts: { "no-unused-vars": 3 },
      ...overrides.lint,
    },
    hotspotCeilings: {
      "app-shell": { file: "src/renderer/src/App.tsx", fileLines: 100, declarationLines: 80 },
      ...overrides.hotspotCeilings,
    },
    flatMainFiles: overrides.flatMainFiles ?? ["src/main/a.ts", "src/main/b.ts"],
    sharedTypesImporters: overrides.sharedTypesImporters ?? ["src/main/a.ts"],
    importCycles: overrides.importCycles ?? ["src/main/a.ts -> src/main/b.ts"],
    importBoundaryEdges: overrides.importBoundaryEdges ?? [
      "main-owner-peer:ipc->projectStore:src/main/ipc/a.ts->src/main/projectStore/a.ts",
    ],
    largeFileLineCeilings: overrides.largeFileLineCeilings ?? {
      "src/main/a.ts": 900,
    },
    exceptions: {
      flatMainFiles: {},
      sharedTypesImporters: {},
      importCycles: {},
      importBoundaryEdges: {},
      largeFiles: {},
      hotspots: {},
      lintRuleCounts: {},
      lintTotalWarnings: undefined,
      ...overrides.exceptions,
    },
  };
}
