#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProjectBoardWorkerReleaseMatrixReport,
  workerReleaseMatrixPassed,
} from "./project-board-worker-release-matrix-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = resolve(process.env.AMBIENT_PROJECT_BOARD_WORKER_RELEASE_MATRIX_OUT_DIR || join(repoRoot, "test-results", "project-board-release-matrix"));
const dogfoodOutputRoot = resolve(process.env.AMBIENT_PROJECT_BOARD_WORKER_RELEASE_MATRIX_DOGFOOD_OUT_DIR || join(outputRoot, "worker-dogfood"));
const dogfoodOutputPath = resolve(process.env.AMBIENT_PROJECT_BOARD_WORKER_RELEASE_MATRIX_DOGFOOD_OUT || join(dogfoodOutputRoot, "latest.json"));
const outputPath = resolve(process.env.AMBIENT_PROJECT_BOARD_WORKER_RELEASE_MATRIX_OUT || join(outputRoot, "latest-worker.json"));
const startedAt = new Date().toISOString();

const dogfoodEnv = {
  ...process.env,
  AMBIENT_PROJECT_BOARD_DOGFOOD_OUT_DIR: dogfoodOutputRoot,
  AMBIENT_PROJECT_BOARD_DOGFOOD_OUT: dogfoodOutputPath,
  AMBIENT_PROJECT_BOARD_DOGFOOD_MANUAL_RUNTIME_SPLIT_CARD: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_MANUAL_RUNTIME_SPLIT_CARD ?? "1",
  AMBIENT_PROJECT_BOARD_DOGFOOD_FORCE_CARD_RUNTIME_BUDGET_MS:
    process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_FORCE_CARD_RUNTIME_BUDGET_MS ?? "60000",
  AMBIENT_PROJECT_BOARD_DOGFOOD_REQUIRE_RUNTIME_SPLIT: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_REQUIRE_RUNTIME_SPLIT ?? "1",
  AMBIENT_PROJECT_BOARD_DOGFOOD_SPLIT_DECISION_ACTION: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_SPLIT_DECISION_ACTION ?? "approve_split",
  AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_MAX_TIMEOUT_MS: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_MAX_TIMEOUT_MS ?? "180000",
  AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_IDLE_TIMEOUT_MS: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_IDLE_TIMEOUT_MS ?? "240000",
  AMBIENT_PROJECT_BOARD_DOGFOOD_PREPARE_TIMEOUT_MS: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_PREPARE_TIMEOUT_MS ?? "300000",
  AMBIENT_PROJECT_BOARD_DOGFOOD_REVIEW_TIMEOUT_MS: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_REVIEW_TIMEOUT_MS ?? "240000",
  AMBIENT_PROJECT_BOARD_DOGFOOD_WINDOW_WIDTH: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_WINDOW_WIDTH ?? "1720",
  AMBIENT_PROJECT_BOARD_DOGFOOD_WINDOW_HEIGHT: process.env.AMBIENT_PROJECT_BOARD_DOGFOOD_WINDOW_HEIGHT ?? "1120",
};

const command = {
  cwd: repoRoot,
  argv: ["node", "scripts/project-board-in-app-dogfood.mjs"],
  env: {
    AMBIENT_PROJECT_BOARD_DOGFOOD_MANUAL_RUNTIME_SPLIT_CARD: dogfoodEnv.AMBIENT_PROJECT_BOARD_DOGFOOD_MANUAL_RUNTIME_SPLIT_CARD,
    AMBIENT_PROJECT_BOARD_DOGFOOD_FORCE_CARD_RUNTIME_BUDGET_MS: dogfoodEnv.AMBIENT_PROJECT_BOARD_DOGFOOD_FORCE_CARD_RUNTIME_BUDGET_MS,
    AMBIENT_PROJECT_BOARD_DOGFOOD_REQUIRE_RUNTIME_SPLIT: dogfoodEnv.AMBIENT_PROJECT_BOARD_DOGFOOD_REQUIRE_RUNTIME_SPLIT,
    AMBIENT_PROJECT_BOARD_DOGFOOD_SPLIT_DECISION_ACTION: dogfoodEnv.AMBIENT_PROJECT_BOARD_DOGFOOD_SPLIT_DECISION_ACTION,
    AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_MAX_TIMEOUT_MS: dogfoodEnv.AMBIENT_PROJECT_BOARD_DOGFOOD_RUN_MAX_TIMEOUT_MS,
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(dogfoodOutputPath), { recursive: true });

const dogfoodRun = await runCommand(command.argv[0], command.argv.slice(1), {
  cwd: command.cwd,
  env: dogfoodEnv,
});
const completedAt = new Date().toISOString();
const dogfood = await readDogfoodOutput(dogfoodOutputPath, dogfoodRun);
const report = buildProjectBoardWorkerReleaseMatrixReport({
  dogfood,
  dogfoodOutputPath,
  dogfoodExitCode: dogfoodRun.code,
  dogfoodSignal: dogfoodRun.signal,
  startedAt,
  completedAt,
  command,
  sourceRevision: await readSourceRevision(repoRoot),
});
await writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      status: report.status,
      outputPath,
      dogfoodOutputPath,
      releaseGateStatus: report.observations.releaseGateStatus,
      taskActionProtocolObserved: report.observations.taskActionProtocolObserved,
      proofReviewStatus: report.observations.proofReviewStatus,
      proofRecommendedAction: report.observations.proofRecommendedAction,
      runtimeBudgetSplitCount: report.observations.runtimeBudgetSplitCount,
      productRuntimeBudgetClosureObserved: report.observations.productRuntimeBudgetClosureObserved,
      proofActionIntegrityIssueCount: report.observations.proofActionIntegrityIssueCount,
      notes: report.observations.notes,
    },
    null,
    2,
  ),
);

if (!workerReleaseMatrixPassed(report)) {
  process.exitCode = 1;
}

async function readDogfoodOutput(path, run) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return {
      status: "failed",
      error: `Could not read dogfood output ${path}: ${error instanceof Error ? error.message : String(error)}`,
      electronOutputTail: `${run.stdout}\n${run.stderr}`.slice(-6000),
      steps: [],
      releaseGate: undefined,
    };
  }
}

function runCommand(commandName, args, options) {
  return new Promise((resolveRun) => {
    const child = spawn(commandName, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      process.stderr.write(text);
    });
    child.on("error", (error) => {
      stderr += `\n${error instanceof Error ? error.stack ?? error.message : String(error)}`;
    });
    child.on("close", (code, signal) => resolveRun({ code: code ?? 1, signal, stdout, stderr }));
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

function execFileText(commandName, args, cwd) {
  return new Promise((resolveText, rejectText) => {
    execFile(commandName, args, { cwd, encoding: "utf8" }, (error, stdout) => {
      if (error) rejectText(error);
      else resolveText(stdout);
    });
  });
}
