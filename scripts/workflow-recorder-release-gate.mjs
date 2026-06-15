#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildWorkflowRecorderReleaseGateReport,
  renderWorkflowRecorderReleaseGateMarkdown,
  workflowRecorderReleaseArtifactIntegrity,
  workflowRecorderReleaseGatePassed,
} from "./workflow-recorder-release-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const jitterReportPath = resolve(optionValue(argv, "--jitter-report") ?? join(repoRoot, "test-results", "workflow-recorder-jitter", "latest.json"));
const outputPath = resolve(optionValue(argv, "--out") ?? join(repoRoot, "test-results", "workflow-recorder-release-gate", "latest.json"));
const markdownPath = outputPath.replace(/\.json$/i, ".md");
const requireLive = args.has("--require-live") || process.env.AMBIENT_WORKFLOW_RECORDER_REQUIRE_LIVE === "1";
const jsonOutput = args.has("--json");
const generatedAt = new Date().toISOString();

const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const jitterReport = JSON.parse(await readFile(jitterReportPath, "utf8"));
const jitterArchive = await readJitterArchive(jitterReport);
const currentGitHeadValue = await currentGitHead();
const currentTrackedStatusLinesValue = await currentGitTrackedStatusLines();
const releaseArchivePath = releaseArchiveOutputPath({
  argv,
  args,
  currentGitHead: currentGitHeadValue,
  generatedAt,
  outputPath,
});
const releaseArchiveMarkdownPath = releaseArchivePath ? releaseArchivePath.replace(/\.json$/i, ".md") : undefined;
const planHtml = await readFile(join(repoRoot, "workflowRecorder.html"), "utf8");
const report = buildWorkflowRecorderReleaseGateReport({
  packageJson,
  jitterReport,
  jitterReportPath,
  ...jitterArchive,
  currentGitHead: currentGitHeadValue,
  currentTrackedStatusLines: currentTrackedStatusLinesValue,
  planHtml,
  requireLive,
  outputPath,
  markdownPath,
  releaseArchivePath,
  releaseArchiveMarkdownPath,
  generatedAt,
});
const plannedArtifactIntegrity = workflowRecorderReleaseArtifactIntegrity({
  report,
  outputPath,
  outputJson: `${JSON.stringify(report, null, 2)}\n`,
  markdownPath,
  markdownText: renderWorkflowRecorderReleaseGateMarkdown(report),
  releaseArchivePath,
  releaseArchiveJson: releaseArchivePath ? `${JSON.stringify(report, null, 2)}\n` : undefined,
  releaseArchiveMarkdownPath,
  releaseArchiveMarkdownText: releaseArchiveMarkdownPath ? renderWorkflowRecorderReleaseGateMarkdown(report) : undefined,
});
const releaseReport = {
  ...report,
  artifactIntegrity: {
    status: plannedArtifactIntegrity.status === "pass" ? "pass" : "pending",
    issues: [],
    checkedArtifacts: plannedArtifactIntegrity.checkedArtifacts,
  },
};
const reportJson = `${JSON.stringify(releaseReport, null, 2)}\n`;
const reportMarkdown = renderWorkflowRecorderReleaseGateMarkdown(releaseReport);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, reportJson, "utf8");
await writeFile(markdownPath, reportMarkdown, "utf8");
if (releaseArchivePath) {
  await mkdir(dirname(releaseArchivePath), { recursive: true });
  await writeFile(releaseArchivePath, reportJson, "utf8");
  if (releaseArchiveMarkdownPath) {
    await writeFile(releaseArchiveMarkdownPath, reportMarkdown, "utf8");
  }
}
const artifactIntegrity = workflowRecorderReleaseArtifactIntegrity({
  report: releaseReport,
  outputPath,
  outputJson: await readFile(outputPath, "utf8"),
  markdownPath,
  markdownText: await readFile(markdownPath, "utf8"),
  releaseArchivePath,
  releaseArchiveJson: releaseArchivePath ? await readFile(releaseArchivePath, "utf8") : undefined,
  releaseArchiveMarkdownPath,
  releaseArchiveMarkdownText: releaseArchiveMarkdownPath ? await readFile(releaseArchiveMarkdownPath, "utf8") : undefined,
});
if (artifactIntegrity.status !== "pass") {
  console.error(JSON.stringify({ status: "artifact_integrity_failed", issues: artifactIntegrity.issues }, null, 2));
  process.exitCode = 1;
}

if (jsonOutput) {
  console.log(JSON.stringify({ ...releaseReport, artifactIntegrity }, null, 2));
} else {
  console.log(
    JSON.stringify(
      {
        status: releaseReport.status,
        liveRequired: releaseReport.releaseDecision.liveRequired,
        liveSkipped: releaseReport.releaseDecision.liveSkipped,
        blockingIssues: releaseReport.releaseDecision.blockingIssues,
        advisoryIssues: releaseReport.releaseDecision.advisoryIssues,
        nextSlice: releaseReport.releaseDecision.nextSlice,
        outputPath,
        markdownPath,
        releaseArchivePath,
        releaseArchiveMarkdownPath,
        artifactIntegrity: artifactIntegrity.status,
      },
      null,
      2,
    ),
  );
}

if (!workflowRecorderReleaseGatePassed(releaseReport, { requireLive }) || artifactIntegrity.status !== "pass") process.exitCode = 1;

function optionValue(values, name) {
  const direct = values.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

async function readJitterArchive(jitterReport) {
  const archivePath = typeof jitterReport?.archivePath === "string" && jitterReport.archivePath.trim()
    ? resolve(jitterReport.archivePath)
    : undefined;
  if (!archivePath) return {};
  try {
    return { jitterArchiveReport: JSON.parse(await readFile(archivePath, "utf8")) };
  } catch (error) {
    return { jitterArchiveReadError: error instanceof Error ? error.message : String(error) };
  }
}

function releaseArchiveOutputPath(input) {
  if (input.args.has("--no-release-archive")) return undefined;
  const archiveOut = optionValue(input.argv, "--release-archive-out");
  if (archiveOut) return resolve(archiveOut);
  const gitHead = typeof input.currentGitHead === "string" && input.currentGitHead.trim() ? input.currentGitHead.trim() : "unknown";
  const shortHead = gitHead.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 12) || "unknown";
  const timestamp = input.generatedAt.replace(/[:.]/g, "-");
  return resolve(dirname(input.outputPath), "runs", `${shortHead}-${timestamp}.json`);
}

async function currentGitHead() {
  try {
    const result = await runCommandCapture("git", ["rev-parse", "HEAD"], { cwd: repoRoot, env: process.env });
    return result.stdout.trim();
  } catch {
    return undefined;
  }
}

async function currentGitTrackedStatusLines() {
  try {
    const result = await runCommandCapture("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: repoRoot, env: process.env });
    return result.stdout.split(/\r?\n/).map((line) => line.trimEnd()).filter(Boolean);
  } catch {
    return undefined;
  }
}

function runCommandCapture(command, commandArgs, options) {
  return new Promise((resolveRun, rejectRun) => {
    const stdout = [];
    const stderr = [];
    const child = spawn(command, commandArgs, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", rejectRun);
    child.on("close", (code, signal) => {
      const result = {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code === 0) resolveRun(result);
      else rejectRun(new Error(`${command} ${commandArgs.join(" ")} failed with code=${code ?? "none"} signal=${signal ?? "none"}`));
    });
  });
}
