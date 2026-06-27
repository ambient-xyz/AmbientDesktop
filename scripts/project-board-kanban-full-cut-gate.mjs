#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import {
  KANBAN_FULL_CUT_GMI_DISPATCH_SCRIPT,
  evaluateKanbanFullCutGate,
  findKanbanGmiScenario,
  listKanbanGmiScenarios,
} from "./project-board-kanban-full-cut-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

if (process.argv.includes("--gmi-scenario")) {
  await runKanbanGmiScenarioMode();
  process.exit();
}

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

async function runKanbanGmiScenarioMode() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--gmi-scenario");
  const list = args.includes("--list");
  const json = args.includes("--json");
  const dryRun = args.includes("--dry-run");
  const scenario = readOption(args, "--scenario") ?? readFirstPositional(args);

  if (list) {
    const scenarios = listKanbanGmiScenarios();
    if (json) {
      process.stdout.write(`${JSON.stringify({ scenarios }, null, 2)}\n`);
    } else {
      process.stdout.write("Project Board Kanban GMI scenarios:\n");
      for (const item of scenarios) {
        process.stdout.write(`- ${item.key}: ${item.command} (${item.legacyScript})\n`);
      }
    }
    return;
  }

  const selected = findKanbanGmiScenario(scenario);
  if (!selected) {
    process.stderr.write(usage());
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    process.stdout.write(`${selected.command}\n`);
    return;
  }

  const [bin, ...spawnArgs] = commandParts(selected.command);
  const child = spawn(bin, spawnArgs, {
    env: process.env,
    shell: false,
    stdio: "inherit",
  });

  const exitCode = await new Promise((resolveExit) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolveExit(code ?? 1);
    });
    child.on("error", (error) => {
      process.stderr.write(`Failed to run ${selected.command}: ${error.message}\n`);
      resolveExit(1);
    });
  });
  process.exitCode = exitCode;
}

function readOption(values, name) {
  const inline = values.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

function readFirstPositional(values) {
  return values.find((value, index) => {
    if (value.startsWith("-")) return false;
    const previous = values[index - 1];
    return previous !== "--scenario";
  });
}

function commandParts(command) {
  const match = command.match(/^node\s+([^\s]+\.mjs)$/);
  if (!match) throw new Error(`Unsupported Kanban GMI scenario command: ${command}`);
  return [process.execPath, match[1]];
}

function usage() {
  const [scriptName] = KANBAN_FULL_CUT_GMI_DISPATCH_SCRIPT;
  return [
    `Usage: pnpm run ${scriptName} -- --scenario <scenario-key>`,
    "",
    "Use --list to show available scenarios. Existing reviewed script names are also accepted as scenario identifiers.",
    "",
  ].join("\n");
}
