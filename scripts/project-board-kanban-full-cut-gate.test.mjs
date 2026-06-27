import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateKanbanFullCutGate,
  evaluateKanbanFullCutGateFacts,
  findKanbanGmiScenario,
  listKanbanGmiScenarios,
  readKanbanFullCutGateFacts,
} from "./project-board-kanban-full-cut-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("project-board kanban full-cut gate", () => {
  it("keeps reviewed GMI scenarios addressable by key and legacy script name", () => {
    expect(listKanbanGmiScenarios()).toHaveLength(15);
    expect(findKanbanGmiScenario("contrast-native-task-actions")).toMatchObject({
      legacyScript: "test:project-board-kanban-contrast-native-task-actions:gmi",
      command: "node scripts/e2e-kanban-contrast-native-task-actions-gmi.mjs",
    });
    expect(findKanbanGmiScenario("test:project-board-kanban-contrast-native-task-actions:gmi")).toMatchObject({
      key: "contrast-native-task-actions",
      command: "node scripts/e2e-kanban-contrast-native-task-actions-gmi.mjs",
    });
  });

  it("passes against the current kanban plan and gate scripts", async () => {
    const report = await evaluateKanbanFullCutGate({ repoRoot });

    expect(report.status).toBe("passed");
    expect(report.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        "kanban seven-phase map",
        "phase 6 structure",
        "phase 7 closure evidence",
        "package kanban GMI scenario dispatcher",
        "kanban GMI harness source contracts",
        "native task action prompt contract",
        "kanban full-cut release guidance",
        "kanban plan closure state",
      ]),
    );
  });

  it("fails when a phase loses its Progress section", async () => {
    const facts = await readKanbanFullCutGateFacts(repoRoot);
    facts.planHtml = facts.planHtml.replace("<h3>Progress</h3>", "<h3>Progress Notes</h3>");

    const report = evaluateKanbanFullCutGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "Phase 1 must keep separate Implementation Slice, Progress, and Gate Scenario sections with Gate A and B.",
    );
  });

  it("fails when the table-driven GMI scenario dispatcher is removed", async () => {
    const facts = await readKanbanFullCutGateFacts(repoRoot);
    delete facts.packageJson.scripts["test:project-board-kanban:gmi"];

    const report = evaluateKanbanFullCutGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "package.json must expose the table-driven kanban GMI dispatcher and keep reviewed one-off GMI scripts out of package.json.",
    );
  });

  it("fails when reviewed GMI scenario scripts are re-expanded into package.json", async () => {
    const facts = await readKanbanFullCutGateFacts(repoRoot);
    facts.packageJson.scripts["test:project-board-kanban-contrast-native-task-actions:gmi"] =
      "node scripts/e2e-kanban-contrast-native-task-actions-gmi.mjs";

    const report = evaluateKanbanFullCutGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "package.json must expose the table-driven kanban GMI dispatcher and keep reviewed one-off GMI scripts out of package.json.",
    );
  });

  it("fails when the native task prompt falls back to the old broad availability wording", async () => {
    const facts = await readKanbanFullCutGateFacts(repoRoot);
    facts.taskToolsSource = facts.taskToolsSource
      .replace("Primary path: call native project-board task tools directly", "If Ambient exposes native tools named task_show")
      .replace(
        "Fallback path: use a fenced ```task_actions JSON array only when native task tools are unavailable",
        "Fallback path omitted.",
      );

    const report = evaluateKanbanFullCutGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "Phase 7 must keep native task tools as the primary contract and fenced task_actions JSON as fallback-only.",
    );
  });

  it("fails when release guidance no longer exposes the full-cut gate", async () => {
    const facts = await readKanbanFullCutGateFacts(repoRoot);
    delete facts.packageJson.scripts["test:project-board-kanban-full-cut-gate"];

    const report = evaluateKanbanFullCutGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain("Release Cut Guidance must name the local kanban full-cut gate and package.json must expose it.");
  });

  it("fails when the plan loses its explicit closure state", async () => {
    const facts = await readKanbanFullCutGateFacts(repoRoot);
    facts.planHtml = facts.planHtml.replace("All seven ordered phase gates are complete.", "Some phase gates may remain.");

    const report = evaluateKanbanFullCutGateFacts(facts);

    expect(report.status).toBe("failed");
    expect(report.issues).toContain(
      "Release Cut Guidance must explicitly mark the seven-phase kanban plan closed with no remaining implementation slice.",
    );
  });
});
