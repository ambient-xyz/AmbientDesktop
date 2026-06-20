#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const resultsDir = join(repoRoot, "test-results", "symphony-gap-phase5-dogfood");
const latestArtifactPath = join(resultsDir, "latest.json");
const sourceResultsDir = join(resultsDir, "source-subagent-desktop-dogfood");
const sourceArtifactPath = join(sourceResultsDir, "latest.json");
const scenarioName = "symphony_gap_phase5_failure_approval_recovery";
const startedAt = new Date().toISOString();
const startedMs = Date.now();

let exitCode = 0;

try {
  await rm(latestArtifactPath, { force: true });
  await mkdir(resultsDir, { recursive: true });
  await runSubagentDesktopDogfood();
  const sourceReport = await readJson(sourceArtifactPath);
  const phase5Report = buildPhase5Report(sourceReport, "passed");
  await writeReport(phase5Report);
  if (!phase5Report.checks?.phase5RecoveryVerified) {
    throw new Error("Phase 5 recovery dogfood completed but did not verify denial/restart recovery.");
  }
} catch (error) {
  exitCode = 1;
  const sourceReport = await readJsonIfExists(sourceArtifactPath);
  await writeReport(buildPhase5Report(sourceReport, "failed", error));
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
}

process.exit(exitCode);

async function runSubagentDesktopDogfood() {
  await run("node", [
    "scripts/subagent-desktop-dogfood.mjs",
    "--testNamePattern",
    "denies child approval and rehydrates Symphony recovery state",
  ], {
    ...process.env,
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_PHASE5_RECOVERY: "1",
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_RESULTS_DIR: sourceResultsDir,
    AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_HISTORY_APPEND: "0",
  });
}

function buildPhase5Report(sourceReport, status, error) {
  const checks = sourceReport?.checks ?? {};
  const approvalDenial = checks.approvalDenial ?? {};
  const restartRehydration = checks.restartRehydration ?? {};
  const phase5RecoveryVerified = sourceReport?.status === "passed" &&
    sourceReport?.scenarios?.includes(scenarioName) &&
    approvalDenial.forwardedVisible === true &&
    approvalDenial.deniedDecisionVisible === true &&
    approvalDenial.approvalRequestActionsRemoved === true &&
    approvalDenial.parentStillBlockedAfterForward === true &&
    approvalDenial.siblingStillVisible === true &&
    restartRehydration.approvalForwardedRehydrated === true &&
    restartRehydration.parentStillBlockedAfterRelaunch === true &&
    restartRehydration.childRowsRehydrated === true &&
    restartRehydration.patternGraphsRehydrated === true;
  const completedAt = new Date().toISOString();
  return {
    schemaVersion: "ambient-symphony-gap-phase5-dogfood-v1",
    status: status === "passed" && phase5RecoveryVerified ? "passed" : "failed",
    classification: status === "passed" && phase5RecoveryVerified ? "passed" : "failed",
    generatedAt: completedAt,
    startedAt: sourceReport?.startedAt ?? startedAt,
    completedAt,
    durationMs: Date.now() - startedMs,
    gitCommit: sourceReport?.gitCommit ?? gitValue(["rev-parse", "HEAD"]),
    gitBranch: sourceReport?.gitBranch ?? gitValue(["rev-parse", "--abbrev-ref", "HEAD"]),
    provider: sourceReport?.provider ?? process.env.AMBIENT_PROVIDER ?? "ambient",
    model: sourceReport?.model ?? process.env.AMBIENT_LIVE_MODEL ?? process.env.GMI_CLOUD_MODEL ?? process.env.AMBIENT_MODEL,
    featureFlag: sourceReport?.featureFlag ?? "ambient.subagents",
    headful: sourceReport?.headful === true,
    cdpPort: sourceReport?.cdpPort ?? Number(process.env.AMBIENT_SUBAGENT_DESKTOP_DOGFOOD_CDP_PORT ?? -1),
    scenarios: [scenarioName],
    parentThreadId: sourceReport?.parentThreadId,
    parentMessageId: sourceReport?.parentMessageId,
    childRunIds: sourceReport?.childRunIds,
    childThreadIds: sourceReport?.childThreadIds,
    approvalRequestParentMailboxEventId: sourceReport?.approvalRequestParentMailboxEventId,
    approvalWaitBarrierId: sourceReport?.approvalWaitBarrierId,
    approvalId: sourceReport?.approvalId,
    sourceReportPath: relative(repoRoot, sourceArtifactPath),
    checks: {
      approvalDenial,
      restartRehydration,
      phase5RecoveryVerified,
    },
    artifacts: sourceReport?.artifacts ?? {},
    ...(error ? { error: error instanceof Error ? error.stack ?? error.message : String(error) } : {}),
  };
}

async function run(executable, args, env) {
  const child = spawn(executable, args, {
    cwd: repoRoot,
    env: cleanChildEnv(env),
    stdio: ["ignore", "inherit", "inherit"],
  });
  const exitCode = await new Promise((resolve) => child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0))));
  if (exitCode !== 0) throw new Error(`${executable} ${args.join(" ")} exited with ${exitCode}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfExists(path) {
  try {
    return await readJson(path);
  } catch {
    return undefined;
  }
}

async function writeReport(report) {
  await mkdir(resultsDir, { recursive: true });
  await writeFile(latestArtifactPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function gitValue(args) {
  try {
    const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : "unknown";
  } catch {
    return "unknown";
  }
}

function cleanChildEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}
