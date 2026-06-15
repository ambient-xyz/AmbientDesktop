#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateDependencyAuditGate } from "./dependency-audit-gate-lib.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = new Set(process.argv.slice(2));
const report = await evaluateDependencyAuditGate({ repoRoot });

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${report.summary}\n`);
  for (const check of report.checks) {
    process.stdout.write(`- ${check.status.toUpperCase()} ${check.name}: ${check.evidence}\n`);
  }
  if (report.issues.length > 0) {
    process.stdout.write("\nIssues:\n");
    for (const issue of report.issues) process.stdout.write(`- ${issue}\n`);
  }
}

process.exit(report.status === "passed" ? 0 : 1);
