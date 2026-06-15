#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPlannerModeReleaseGateReport,
  plannerModeReleaseGatePassed,
} from "./planner-mode-release-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const outputPath = resolve(optionValue(argv, "--out") || process.env.AMBIENT_PLANNER_RELEASE_GATE_OUT || join(repoRoot, "test-results", "planner-mode-release-gate", "latest.json"));
const jsonOutput = args.has("--json");
const requireLive = args.has("--require-live") || process.env.AMBIENT_PLANNER_RELEASE_GATE_REQUIRE_LIVE === "1";
const requireCurrentHead = args.has("--require-current-head") || process.env.AMBIENT_PLANNER_RELEASE_GATE_REQUIRE_CURRENT_HEAD === "1";
const startedAt = new Date().toISOString();

const packageJson = await readJson("package.json");
const selectedLiveCommands = liveCommands(packageJson.scripts ?? {}, args);
const liveResults = [];
for (const command of selectedLiveCommands) {
  liveResults.push(await runLiveCommand(command));
}

const completedAt = new Date().toISOString();
const report = buildPlannerModeReleaseGateReport({
  packageJson,
  files: {
    plannerDogfoodTest: await readText("src/main/plannerDogfood.test.ts"),
    agentRuntime: await readText("src/main/agentRuntime.ts"),
    projectStore: await readText("src/main/projectStore.ts"),
    planningModeEnhancements: await readText("planningModeEnhancements.md"),
  },
  liveResults,
  requireLive,
  requireCurrentHead,
  sourceRevision: await readSourceRevision(repoRoot),
  startedAt,
  completedAt,
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanSummary(report);
}

if (!plannerModeReleaseGatePassed(report, { requireLive })) process.exitCode = 1;

async function readJson(path) {
  return JSON.parse(await readText(path));
}

async function readText(path) {
  return readFile(resolve(repoRoot, path), "utf8");
}

function liveCommands(scripts, selectedArgs) {
  const commands = [
    { flag: "--run-small-live", name: "small", script: "test:planner-dogfood:live" },
    { flag: "--run-repair-live", name: "repair", script: "test:planner-dogfood:repair-live" },
    { flag: "--run-medium-live", name: "medium", script: "test:planner-dogfood:medium-live" },
  ];
  const runAll = selectedArgs.has("--run-live");
  return commands
    .filter((command) => runAll || selectedArgs.has(command.flag))
    .map((command) => ({
      ...command,
      command: "pnpm",
      args: ["run", command.script],
      packageScript: scripts[command.script],
    }));
}

async function runLiveCommand(command) {
  const started = Date.now();
  const env = {
    ...process.env,
    AMBIENT_PLANNER_DOGFOOD_TURN_TIMEOUT_MS: process.env.AMBIENT_PLANNER_DOGFOOD_TURN_TIMEOUT_MS || "480000",
    AMBIENT_PLANNER_DOGFOOD_TEST_TIMEOUT_MS: process.env.AMBIENT_PLANNER_DOGFOOD_TEST_TIMEOUT_MS || "1200000",
  };
  try {
    await runCommand(command.command, command.args, { cwd: repoRoot, env });
    return {
      name: command.name,
      script: command.script,
      packageScript: command.packageScript,
      status: "passed",
      durationMs: Date.now() - started,
      exitCode: 0,
    };
  } catch (error) {
    return {
      name: command.name,
      script: command.script,
      packageScript: command.packageScript,
      status: "failed",
      durationMs: Date.now() - started,
      exitCode: typeof error?.code === "number" ? error.code : undefined,
      signal: typeof error?.signal === "string" ? error.signal : undefined,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function runCommand(command, commandArgs, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: "inherit",
    });
    child.on("error", rejectRun);
    child.on("close", (code, signal) => {
      if (code === 0) resolveRun({ code, signal });
      else {
        const error = new Error(`${command} ${commandArgs.join(" ")} failed with code=${code ?? "none"} signal=${signal ?? "none"}`);
        error.code = code;
        error.signal = signal;
        rejectRun(error);
      }
    });
  });
}

async function readSourceRevision(cwd) {
  try {
    const [gitHead, status] = await Promise.all([
      execFileText("git", ["rev-parse", "HEAD"], cwd),
      execFileText("git", ["status", "--short", "--untracked-files=no"], cwd),
    ]);
    return { gitHead: gitHead.trim(), dirty: status.trim().length > 0 };
  } catch {
    return {};
  }
}

function execFileText(commandName, commandArgs, cwd) {
  return new Promise((resolveText, rejectText) => {
    execFile(commandName, commandArgs, { cwd, encoding: "utf8" }, (error, stdout) => {
      if (error) rejectText(error);
      else resolveText(stdout);
    });
  });
}

function optionValue(values, name) {
  const direct = values.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

function printHumanSummary(report) {
  const counts = report.checks.reduce(
    (acc, check) => {
      acc[check.status] = (acc[check.status] ?? 0) + 1;
      return acc;
    },
    {},
  );
  console.log(
    JSON.stringify(
      {
        status: report.status,
        checks: counts,
        live: report.live,
        blockingIssues: report.releaseDecision.blockingIssues,
        advisoryIssues: report.releaseDecision.advisoryIssues,
        nextSlice: report.releaseDecision.nextSlice,
        outputPath,
      },
      null,
      2,
    ),
  );
}
