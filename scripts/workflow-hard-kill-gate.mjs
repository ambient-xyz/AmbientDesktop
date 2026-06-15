#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runWorkflowHardKillGate } from "./workflow-hard-kill-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jsonOutput = process.argv.includes("--json");
const timeoutMs = Number(optionValue("--timeout-ms") ?? 90_000);
const killGraceMs = Number(optionValue("--kill-grace-ms") ?? 1_000);

const report = await runWorkflowHardKillGate({ repoRoot, timeoutMs, killGraceMs });
writeReport(report);
if (report.status !== "passed") process.exitCode = 1;

function writeReport(reportToWrite) {
  if (jsonOutput) {
    process.stdout.write(`${JSON.stringify(reportToWrite, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Workflow hard-kill gate: ${reportToWrite.status}\n`);
  process.stdout.write(`Checked: ${reportToWrite.checked}\n`);
  process.stdout.write(`Status counts: ${JSON.stringify(reportToWrite.counts)}\n`);
  for (const check of reportToWrite.checks) {
    process.stdout.write(`- ${check.id}: ${check.status} (${Math.round(check.elapsedMs)}ms)\n`);
    if (check.status !== "passed") process.stdout.write(`  ${check.summary}\n`);
  }
  if (reportToWrite.issues.length > 0) {
    process.stdout.write("Issues:\n");
    for (const issue of reportToWrite.issues) process.stdout.write(`- ${issue.issue}\n`);
  }
}

function optionValue(name) {
  const arg = process.argv.find((item) => item === name || item.startsWith(`${name}=`));
  if (!arg) return undefined;
  if (arg === name) return process.argv[process.argv.indexOf(arg) + 1];
  return arg.slice(name.length + 1);
}
