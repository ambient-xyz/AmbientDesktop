#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLocalDeepResearchReleaseGateReport,
  localDeepResearchReleaseGatePassed,
} from "./local-deep-research-release-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const outputPath = resolve(optionValue(argv, "--out") || process.env.AMBIENT_LOCAL_DEEP_RESEARCH_RELEASE_GATE_OUT || join(repoRoot, "test-results", "local-deep-research-release-gate", "latest.json"));
const jsonOutput = args.has("--json");
const requireLive = args.has("--require-live") || process.env.AMBIENT_LOCAL_DEEP_RESEARCH_RELEASE_GATE_REQUIRE_LIVE === "1";
const requireStrictMemory = args.has("--require-strict-memory") || process.env.AMBIENT_LOCAL_DEEP_RESEARCH_REQUIRE_STRICT_MEMORY === "1";
const runLive = args.has("--run-live") || process.env.AMBIENT_LOCAL_DEEP_RESEARCH_RELEASE_GATE_RUN_LIVE === "1";
const runLocal = args.has("--run-local") || process.env.AMBIENT_LOCAL_DEEP_RESEARCH_RELEASE_GATE_RUN_LOCAL === "1";
const startedAt = new Date().toISOString();

const commandResults = [];
if (runLocal) {
  for (const script of [
    "test:local-deep-research:release-artifacts",
    "test:local-deep-research:memory-certification",
    "test:local-deep-research:runtime-platforms",
    "test:local-deep-research:memory-telemetry",
    "test:local-deep-research:memory-telemetry-gate",
  ]) {
    commandResults.push(await runPackageScript(script));
  }
}
if (runLive) commandResults.push(await runPackageScript("test:local-deep-research:live"));

const completedAt = new Date().toISOString();
const packageJson = await readJson(resolve(repoRoot, "package.json"));
const artifacts = await readArtifacts();
const report = buildLocalDeepResearchReleaseGateReport({
  packageJson,
  files: {
    agentRuntime: await readTexts([
      "src/main/agent-runtime/agentRuntime.ts",
      "src/main/local-deep-research/agentRuntimeLocalDeepResearchRunTools.ts",
      "src/main/local-deep-research/agentRuntimeLocalDeepResearchSetupTools.ts",
      "src/main/desktop-tools/desktopToolRegistry.ts",
    ]),
    settings: await readTexts([
      "src/renderer/src/App.tsx",
      "src/renderer/src/RightPanel.tsx",
      "src/renderer/src/RightPanelSettingsRuntime.tsx",
      "src/renderer/src/RightPanelSettingsWebResearch.tsx",
      "src/renderer/src/RightPanelSettingsWebResearchRows.tsx",
      "src/renderer/src/RightPanelSettingsPane.tsx",
      "src/renderer/src/AppDialogs.tsx",
      "src/renderer/src/localDeepResearchUiModel.ts",
    ]),
    preload: await readText("src/preload/index.ts"),
    providerCatalog: await readText("src/main/provider/providerCatalog.ts"),
    plan: await readText("llamaResearchImplementation.html"),
  },
  artifacts,
  commandResults,
  liveResults: commandResults.filter((result) => result.kind === "live"),
  requireLive,
  requireStrictMemory,
  startedAt,
  completedAt,
});
report.commandResults = commandResults;
report.artifactPaths = artifactPaths(artifacts);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (jsonOutput) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printHumanSummary(report);
}

if (!localDeepResearchReleaseGatePassed(report, { requireLive })) process.exitCode = 1;

async function readArtifacts() {
  const coverageArtifacts = await readLatestMemoryCoverageArtifacts();
  return {
    validation: await readJsonIfExists(resolve(repoRoot, ".ambient/local-deep-research/validation.json")),
    smoke: await readLatestJson(".ambient/local-deep-research/smoke", (item) => item.schemaVersion === "ambient-local-deep-research-smoke-v1" && item.status === "passed"),
    providerPreferenceSmoke: await readLatestJson(".ambient/local-deep-research/provider-preference-smoke", (item) => item.schemaVersion === "ambient-local-deep-research-provider-preference-smoke-v1"),
    profileBenchmark: await readLatestJson(".ambient/local-deep-research/profile-benchmarks", (item) => item.schemaVersion === "ambient-local-deep-research-profile-benchmark-v1"),
    memoryCertification: await readLatestJson(".ambient/local-deep-research/memory-certification", (item) => item.schemaVersion === "ambient-local-deep-research-memory-certification-v1"),
    memoryTelemetryCoverage: coverageArtifacts.complete,
    strictMemoryTelemetryCoverage: coverageArtifacts.strict,
    runtimePlatformCertification: await readLatestJson(".ambient/local-deep-research/runtime-platform-certification", (item) => item.schemaVersion === "ambient-local-deep-research-runtime-platform-certification-v1"),
  };
}

async function readLatestMemoryCoverageArtifacts() {
  const artifacts = await readJsonFiles(".ambient/local-deep-research/memory-telemetry/coverage");
  const coverage = artifacts.filter((artifact) => artifact.data?.schemaVersion === "ambient-local-deep-research-memory-telemetry-coverage-v1");
  const complete = latestByTimestamp(coverage.filter((artifact) => artifact.data?.status === "complete"))?.data;
  const strict = latestByTimestamp(coverage.filter((artifact) => artifact.data?.estimateMode === "disabled"))?.data;
  return { complete, strict };
}

async function readLatestJson(relativeDir, predicate) {
  const candidates = await readJsonFiles(relativeDir);
  return latestByTimestamp(candidates.filter((candidate) => predicate(candidate.data)))?.data;
}

async function readJsonFiles(relativeDir) {
  const dir = resolve(repoRoot, relativeDir);
  const names = await readdir(dir).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const files = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const path = join(dir, name);
    const data = await readJsonIfExists(path);
    if (!data) continue;
    const info = await stat(path);
    files.push({ path, data: { ...data, __artifactPath: relativePath(path) }, mtimeMs: info.mtimeMs });
  }
  return files;
}

function latestByTimestamp(candidates) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      timestamp: Date.parse(candidate.data.checkedAt ?? candidate.data.createdAt ?? candidate.data.capturedAt ?? "") || candidate.mtimeMs,
    }))
    .sort((a, b) => b.timestamp - a.timestamp)[0];
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfExists(path) {
  try {
    const data = await readJson(path);
    return { ...data, __artifactPath: relativePath(path) };
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readText(relativePath) {
  return readFile(resolve(repoRoot, relativePath), "utf8");
}

async function readTexts(relativePaths) {
  const contents = await Promise.all(relativePaths.map((relativePath) => readText(relativePath)));
  return contents.join("\n");
}

async function runPackageScript(script) {
  const started = Date.now();
  const env = { ...process.env };
  if (script === "test:local-deep-research:release-artifacts") {
    env.AMBIENT_LOCAL_DEEP_RESEARCH_RELEASE_ARTIFACT_WORKSPACE = repoRoot;
  }
  if (script === "test:local-deep-research:live" && !env.AMBIENT_PROVIDER) {
    env.AMBIENT_PROVIDER = "ambient";
  }
  try {
    await runCommand("pnpm", ["run", script], {
      cwd: repoRoot,
      env,
    });
    return {
      kind: script.includes(":live") ? "live" : "local",
      script,
      status: "passed",
      durationMs: Date.now() - started,
      exitCode: 0,
    };
  } catch (error) {
    const liveSummary = script.includes(":live")
      ? await freshLiveSummaryAfter(started)
      : undefined;
    if (liveSummary?.status === "blocked") {
      return {
        kind: "live",
        script,
        status: "blocked",
        durationMs: Date.now() - started,
        exitCode: typeof error?.code === "number" ? error.code : undefined,
        signal: typeof error?.signal === "string" ? error.signal : undefined,
        blockerKind: liveSummary.blockerKind,
        setupStatus: liveSummary.setupStatus,
        blockers: Array.isArray(liveSummary.blockers) ? liveSummary.blockers : [],
        memoryEvidence: liveBlockedMemoryEvidence(liveSummary),
        summaryPath: liveSummary.__artifactPath,
        message: liveSummary.retryAdvice ?? (error instanceof Error ? error.message : String(error)),
      };
    }
    return {
      kind: script.includes(":live") ? "live" : "local",
      script,
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

async function freshLiveSummaryAfter(startedMs) {
  const summary = await readJsonIfExists(resolve(repoRoot, "test-results/local-deep-research-live/latest.json"));
  if (summary?.schemaVersion !== "ambient-local-deep-research-live-smoke-v1") return undefined;
  const createdMs = Date.parse(summary.createdAt ?? "");
  if (!Number.isFinite(createdMs) || createdMs + 10_000 < startedMs) return undefined;
  return summary;
}

function liveBlockedMemoryEvidence(summary) {
  const resourcePolicy = summary?.localModelResources?.policyDecision;
  const inventoryPolicy = summary?.localRuntimeInventory?.memoryPolicy;
  return compactObject({
    activeActualResidentMemoryBytes: finiteNumber(summary?.localModelResources?.activeActualResidentMemoryBytes),
    activeEstimatedResidentMemoryBytes: finiteNumber(summary?.localModelResources?.activeEstimatedResidentMemoryBytes),
    projectedSystemMemoryUtilization: finiteNumber(resourcePolicy?.projectedSystemMemoryUtilization)
      ?? finiteNumber(inventoryPolicy?.projectedSystemMemoryUtilization),
    maxProjectedMemoryUtilization: finiteNumber(resourcePolicy?.maxProjectedMemoryUtilization)
      ?? finiteNumber(inventoryPolicy?.maxProjectedMemoryUtilization),
    projectedFreeMemoryBytes: finiteNumber(resourcePolicy?.projectedFreeMemoryBytes)
      ?? finiteNumber(inventoryPolicy?.projectedFreeMemoryBytes),
    projectedFreeMemoryRatio: finiteNumber(resourcePolicy?.projectedFreeMemoryRatio)
      ?? finiteNumber(inventoryPolicy?.projectedFreeMemoryRatio),
    minFreeMemoryRatioAfterLaunch: finiteNumber(resourcePolicy?.minFreeMemoryRatioAfterLaunch)
      ?? finiteNumber(inventoryPolicy?.minFreeMemoryRatioAfterLaunch),
  });
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function artifactPaths(artifacts) {
  return Object.fromEntries(
    Object.entries(artifacts)
      .filter(([, artifact]) => artifact?.__artifactPath)
      .map(([name, artifact]) => [name, artifact.__artifactPath]),
  );
}

function relativePath(path) {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function optionValue(values, name) {
  const direct = values.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1] : undefined;
}

function printHumanSummary(report) {
  const counts = report.checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] ?? 0) + 1;
    return acc;
  }, {});
  process.stdout.write(`Local Deep Research release gate: ${report.status}\n`);
  process.stdout.write(`Checks: ${JSON.stringify(counts)}\n`);
  process.stdout.write(`Live: ${report.live.selected ? "selected" : "skipped"}${report.live.required ? " (required)" : ""}\n`);
  process.stdout.write(`Output: ${outputPath}\n`);
  if (report.releaseDecision.blockingIssues.length) {
    process.stdout.write("\nBlocking issues:\n");
    for (const issue of report.releaseDecision.blockingIssues) process.stdout.write(`- ${issue}\n`);
  }
  if (report.releaseDecision.advisoryIssues.length) {
    process.stdout.write("\nAdvisories:\n");
    for (const issue of report.releaseDecision.advisoryIssues) process.stdout.write(`- ${issue}\n`);
  }
}
