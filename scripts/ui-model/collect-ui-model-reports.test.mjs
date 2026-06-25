import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { writeUiModelReports } from "./collect-ui-model-reports.mjs";

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("UI model report writer", () => {
  it("writes summary, markdown, and HTML reports with grouped findings and annotations", async () => {
    const resultsDir = await mkdtemp(join(tmpdir(), "ambient-ui-model-report-test-"));
    tempRoots.push(resultsDir);
    const model = {
      scenario: "main-shell-desktop",
      scenarioMeta: {
        surface: "main-shell",
        exposure: "common",
        profiles: ["core"],
        viewportName: "desktop",
        description: "Fixture scenario",
      },
      viewport: { width: 1440, height: 900 },
      summary: { visibleNodeCount: 2, gateFailureCount: 1 },
      accessibility: { exportedNodeCount: 1 },
      tooltipSamples: [{}],
      violations: [
        {
          id: "main-shell-desktop-001-text-vertical-clipping",
          type: "text-vertical-clipping",
          severity: "error",
          gate: "fail",
          impact: "major",
          selector: ".composer-title",
          text: "Clipped composer title",
          message: "Visible composer title is clipped.",
          details: { hasDisclosure: false },
        },
      ],
      nodes: [{ selector: ".composer-title", text: "Composer title", data: { ownAllowTruncation: true } }],
    };
    await writeFile(join(resultsDir, `${model.scenario}.json`), `${JSON.stringify(model, null, 2)}\n`, "utf8");

    await writeUiModelReports([model], {
      resultsDir,
      workspace: "/tmp/ambient-ui-model-workspace",
      failOnViolations: true,
      failOnAnyViolation: false,
      selfTestDefects: false,
      activeProfiles: ["core"],
      themePreference: "system",
    });

    const summary = JSON.parse(await readFile(join(resultsDir, "summary.json"), "utf8"));
    const markdown = await readFile(join(resultsDir, "report.md"), "utf8");
    const html = await readFile(join(resultsDir, "report.html"), "utf8");

    expect(summary).toMatchObject({
      workspace: "/tmp/ambient-ui-model-workspace",
      reportOnly: false,
      zeroBaseline: false,
      themePreference: "system",
      violationCount: 1,
      gateFailureCount: 1,
      violationsByGate: { fail: 1 },
      violationsByImpact: { major: 1 },
    });
    expect(summary.scenarios[0]).toMatchObject({
      scenario: "main-shell-desktop",
      file: "main-shell-desktop.json",
      violationCount: 1,
      gateFailureCount: 1,
      tooltipSampleCount: 1,
      violationsByType: { "text-vertical-clipping": 1 },
    });
    expect(summary.violationGroups[0]).toMatchObject({
      surface: "main-shell",
      component: "Composer",
      type: "text-vertical-clipping",
      gate: "fail",
      impact: "major",
      violationCount: 1,
    });
    expect(summary.annotationGroups[0]).toMatchObject({
      surface: "main-shell",
      component: "Composer",
      annotation: "allow-truncation",
      nodeCount: 1,
    });
    expect(markdown).toContain("## Finding Groups");
    expect(markdown).toContain("## Annotation Inventory");
    expect(html).toContain("/repro?scenario=main-shell-desktop");
    expect(html).toContain("Launch repro");
  });
});
