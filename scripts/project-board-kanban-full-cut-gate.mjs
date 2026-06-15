#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateKanbanFullCutGate } from "./project-board-kanban-full-cut-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(
  process.env.AMBIENT_PROJECT_BOARD_KANBAN_FULL_CUT_GATE_OUT ||
    join(repoRoot, "test-results", "project-board-kanban-full-cut", "latest.json"),
);
const report = await evaluateKanbanFullCutGate({ repoRoot });

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${report.summary}\nReport: ${outputPath}\n`);
  if (report.issues.length) {
    for (const issue of report.issues) process.stdout.write(`- ${issue}\n`);
  }
}

if (report.status !== "passed") process.exitCode = 1;
