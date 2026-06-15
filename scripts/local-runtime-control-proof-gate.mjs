#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLocalRuntimeControlProofGateReport,
  localRuntimeControlProofGatePassed,
} from "./local-runtime-control-proof-gate-lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const args = new Set(argv);
const outputPath = resolve(optionValue(argv, "--out") || process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_GATE_OUT || "test-results/local-runtime-control-proof-gate/latest.json");
const scenarioArtifactPath = resolve(optionValue(argv, "--scenarios") || process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_ARTIFACT || "test-results/local-runtime-control-proof/latest.json");
const ldrLiveSummaryPath = resolve(optionValue(argv, "--ldr-live-summary") || process.env.AMBIENT_LOCAL_DEEP_RESEARCH_LIVE_SUMMARY || "test-results/local-deep-research-live/latest.json");
const requireLiveProof = args.has("--require-live-proof") || process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_REQUIRE_LIVE_PROOF === "1";
const startedAt = new Date().toISOString();

const artifacts = {
  localDeepResearchLive: await readJsonIfExists(ldrLiveSummaryPath),
  localRuntimeControl: await readJsonIfExists(scenarioArtifactPath),
};

const report = buildLocalRuntimeControlProofGateReport({
  artifacts,
  requireLiveProof,
  startedAt,
  completedAt: new Date().toISOString(),
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (args.has("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  printHumanSummary(report);
}

if (!localRuntimeControlProofGatePassed(report, { requireLiveProof })) process.exitCode = 1;

async function readJsonIfExists(path) {
  try {
    const data = JSON.parse(await readFile(path, "utf8"));
    return { ...data, __artifactPath: relativePath(path) };
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function printHumanSummary(report) {
  console.log(`Local runtime control proof gate: ${report.status}`);
  for (const check of report.checks) {
    const mark = check.status === "passed" ? "PASS" : check.status === "failed" ? "FAIL" : "INFO";
    console.log(`[${mark}] ${check.id}: ${check.evidence ?? check.issue ?? check.expectation}`);
  }
  console.log(`Report: ${relativePath(outputPath)}`);
}

function optionValue(values, name) {
  const index = values.indexOf(name);
  if (index >= 0) return values[index + 1];
  const prefix = `${name}=`;
  const match = values.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function relativePath(path) {
  return path.startsWith(`${repoRoot}/`) ? path.slice(repoRoot.length + 1) : path;
}
