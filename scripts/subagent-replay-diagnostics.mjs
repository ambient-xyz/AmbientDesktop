#!/usr/bin/env node
import { runSubagentReplayDiagnostics } from "./subagent-replay-diagnostics-lib.mjs";

const options = parseArgs(process.argv.slice(2));
const report = await runSubagentReplayDiagnostics(options);

if (options.printJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`Sub-agent replay diagnostics ${report.status}: ${report.diagnostics.nextAction}\n`);
  if (options.outputPath !== false) process.stdout.write(`Report: ${report.plan.outputPath}\n`);
}

if (report.status !== "passed") process.exitCode = 1;

function parseArgs(args) {
  const options = {};
  for (const arg of args) {
    if (arg === "--json") {
      options.printJson = true;
    } else if (arg === "--no-write") {
      options.outputPath = false;
    } else if (arg.startsWith("--output=")) {
      options.outputPath = arg.slice("--output=".length);
    } else if (arg.startsWith("--vitest-output=")) {
      options.vitestOutputPath = arg.slice("--vitest-output=".length);
    } else {
      throw new Error(`Unknown sub-agent replay diagnostics argument: ${arg}`);
    }
  }
  return options;
}
