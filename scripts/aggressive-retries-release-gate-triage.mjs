#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAggressiveRetriesGateTriage } from "./aggressive-retries-release-gate-gmi-live-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = resolve(
  process.argv[2] ||
    process.env.AMBIENT_AGGRESSIVE_RETRIES_RELEASE_GATE_OUT ||
    join(repoRoot, "test-results", "aggressive-retries-release-gate-gmi", "latest.json"),
);
const outputPath = resolve(
  process.env.AMBIENT_AGGRESSIVE_RETRIES_RELEASE_GATE_TRIAGE_OUT ||
    join(dirname(inputPath), inputPath.endsWith(".json") ? "latest-triage.json" : "triage.json"),
);

const report = JSON.parse(await readFile(inputPath, "utf8"));
const triage = buildAggressiveRetriesGateTriage(report);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(triage, null, 2), "utf8");
console.log(
  JSON.stringify(
    {
      status: triage.status,
      focusLane: triage.focusLane,
      failureClass: triage.failureClass,
      stabilityStatus: triage.stabilityStatus,
      advisoryIssueCount: triage.evidence?.advisoryIssues?.length ?? 0,
      repeatedPressureScenarioCount: triage.evidence?.pressureTrend?.repeatedPressureScenarioCount ?? 0,
      summary: triage.summary,
      nextAction: triage.nextAction,
      outputPath,
    },
    null,
    2,
  ),
);
if (triage.status !== "clear") process.exitCode = 1;
