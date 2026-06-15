#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultSummaryPath = "test-results/minicpm-v/windows-runtime-smoke/latest.json";
const expectedArtifact = {
  id: "llama-cpp-windows-x64-cpu",
  archiveName: "llama-b9122-bin-win-cpu-x64.zip",
  archiveSha256: "48f35bcb78eb3e50b0b5927f60ac101fd95501a3c14ad39e0ea81444d0da9b40",
  binaryRelativePath: "llama-server.exe",
  binarySha256: "819dacfec0b06b67aeac02388957881ce9483cc4326f507856c99d7881285a4a",
};

export function validateMiniCpmWindowsRuntimeSmokeSummary(summary, options = {}) {
  const checks = [];
  add(checks, "schema", summary?.schemaVersion === "ambient-minicpm-v-windows-runtime-smoke-v1", "summary uses the MiniCPM-V Windows runtime smoke schema");
  add(checks, "status", summary?.status === "passed", "Windows runtime smoke status passed", [`status: ${summary?.status ?? "missing"}`]);
  add(checks, "not-dry-run", summary?.dryRun === false, "run was not a dry-run", [`dryRun: ${String(summary?.dryRun)}`]);
  add(checks, "host", summary?.host?.platform === "win32" && summary?.host?.arch === "x64", "host is real Windows x64", [
    `host: ${summary?.host?.platform ?? "missing"} ${summary?.host?.arch ?? "missing"}`,
  ]);
  add(checks, "artifact-id", summary?.artifactId === expectedArtifact.id && summary?.artifact?.id === expectedArtifact.id, "selected the pinned Windows x64 CPU artifact");
  add(checks, "archive-checksum", summary?.archiveSha256 === expectedArtifact.archiveSha256 && summary?.artifact?.archiveSha256 === expectedArtifact.archiveSha256, "archive checksum matches the pinned Windows zip", [
    `archiveSha256: ${summary?.archiveSha256 ?? "missing"}`,
  ]);
  add(checks, "binary-checksum", summary?.binarySha256 === expectedArtifact.binarySha256 && summary?.artifact?.binarySha256 === expectedArtifact.binarySha256, "extracted llama-server.exe checksum matches the pinned binary", [
    `binarySha256: ${summary?.binarySha256 ?? "missing"}`,
  ]);
  add(checks, "archive-path", windowsPathEndsWith(summary?.paths?.archivePath, expectedArtifact.archiveName), "archive path points at the pinned Windows zip", [
    `archivePath: ${summary?.paths?.archivePath ?? "missing"}`,
  ]);
  add(checks, "binary-path", windowsPathEndsWith(summary?.paths?.binaryPath, expectedArtifact.binaryRelativePath), "binary path points at llama-server.exe", [
    `binaryPath: ${summary?.paths?.binaryPath ?? "missing"}`,
  ]);
  add(checks, "path-quoting", String(summary?.paths?.runtimeRoot ?? "").includes("runtime path with spaces"), "runtime was extracted under a path containing spaces");
  add(checks, "firewall-evidence", nonEmpty(summary?.firewallPromptObserved), "firewall behavior was recorded", [
    `firewallPromptObserved: ${summary?.firewallPromptObserved ?? "missing"}`,
  ]);
  add(checks, "lifecycle-summary", nonEmpty(summary?.lifecycleSummaryPath) && nonEmpty(summary?.lifecycleRunDir), "lifecycle summary path and run directory were recorded");
  add(checks, "lifecycle-args-platform", hasArgPair(summary?.plannedLifecycleArgs, "--platform", "win32") && hasArgPair(summary?.plannedLifecycleArgs, "--arch", "x64"), "lifecycle was forced to Windows x64 manifest selection");
  add(checks, "lifecycle-args-cpu", hasArgPair(summary?.plannedLifecycleArgs, "--gpu-layers", "0"), "lifecycle was forced through the CPU fallback lane");
  add(checks, "lifecycle-args-checksums", hasArg(summary?.plannedLifecycleArgs, "--archive") && hasArg(summary?.plannedLifecycleArgs, "--binary") && hasArgPair(summary?.plannedLifecycleArgs, "--artifact-id", expectedArtifact.id), "lifecycle received archive, binary, and artifact-id inputs");

  const lifecycleSummary = readLifecycleSummary(summary, options);
  if (options.requireArtifacts) {
    add(checks, "artifact-files-present", Boolean(lifecycleSummary), "referenced lifecycle summary artifact exists", [
      `lifecycleSummaryPath: ${summary?.lifecycleSummaryPath ?? "missing"}`,
    ]);
  }
  if (lifecycleSummary) {
    add(checks, "lifecycle-status", lifecycleSummary.status === "passed", "nested lifecycle smoke passed", [`status: ${lifecycleSummary.status ?? "missing"}`]);
    add(checks, "process-cleanup", lifecycleSummary.savedPidAlive === false, "saved llama-server.exe process was not alive after stop", [
      `savedPidAlive: ${String(lifecycleSummary.savedPidAlive)}`,
    ]);
    add(checks, "lifecycle-manifest-artifact", lifecycleSummary.artifactPaths?.manifestVerification && lifecycleSummary.artifactPaths?.analyze && lifecycleSummary.artifactPaths?.stop, "nested lifecycle preserved manifest/analyze/stop artifacts");
  }

  const failed = checks.filter((check) => check.status === "fail");
  return {
    status: failed.length ? "failed" : "passed",
    checks,
    failedChecks: failed.map((check) => check.id),
    summary: {
      runId: summary?.runId,
      startedAt: summary?.startedAt,
      finishedAt: summary?.finishedAt,
      host: `${summary?.host?.platform ?? "missing"} ${summary?.host?.arch ?? "missing"}`,
      artifactId: summary?.artifactId,
      archiveSha256: summary?.archiveSha256,
      binarySha256: summary?.binarySha256,
      lifecycleSummaryPath: summary?.lifecycleSummaryPath,
    },
  };
}

function readLifecycleSummary(summary, options) {
  const lifecycleSummaryPath = summary?.lifecycleSummaryPath;
  if (!nonEmpty(lifecycleSummaryPath)) return undefined;
  const candidates = [
    lifecycleSummaryPath,
    options.summaryPath ? resolve(options.summaryPath, "..", lifecycleSummaryPath) : undefined,
  ].filter(Boolean);
  for (const candidate of candidates) {
    const absolutePath = resolve(String(candidate));
    if (!existsSync(absolutePath)) continue;
    try {
      return JSON.parse(readFileSync(absolutePath, "utf8"));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function add(checks, id, passed, label, evidence = []) {
  checks.push({
    id,
    label,
    status: passed ? "pass" : "fail",
    evidence,
  });
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function windowsPathEndsWith(value, suffix) {
  if (!nonEmpty(value)) return false;
  return value.replace(/\\/g, "/").toLowerCase().endsWith(suffix.toLowerCase());
}

function hasArg(args, name) {
  return Array.isArray(args) && args.includes(name);
}

function hasArgPair(args, name, value) {
  if (!Array.isArray(args)) return false;
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] === value;
}

function parseArgs(argv) {
  const parsed = {
    summaryPath: process.env.AMBIENT_MINICPM_WINDOWS_RUNTIME_SUMMARY || defaultSummaryPath,
    json: false,
    requireArtifacts: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--require-artifacts") {
      parsed.requireArtifacts = true;
      continue;
    }
    if (arg === "--summary") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--summary requires a path.");
      parsed.summaryPath = value;
      index += 1;
      continue;
    }
    if (!arg.startsWith("--") && index === 0) {
      parsed.summaryPath = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const summaryPath = resolve(process.cwd(), options.summaryPath);
  if (!existsSync(summaryPath)) {
    const result = {
      status: "missing",
      summaryPath,
      checks: [{ id: "summary-exists", label: "Windows MiniCPM-V runtime smoke summary exists", status: "fail", evidence: [`missing: ${options.summaryPath}`] }],
      failedChecks: ["summary-exists"],
    };
    writeResult(result, options.json);
    process.exit(1);
  }

  const result = {
    summaryPath,
    ...validateMiniCpmWindowsRuntimeSmokeSummary(JSON.parse(readFileSync(summaryPath, "utf8")), {
      summaryPath,
      requireArtifacts: options.requireArtifacts,
    }),
  };
  writeResult(result, options.json);
  if (result.status !== "passed") process.exit(1);
}

function writeResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`MiniCPM-V Windows runtime smoke evidence: ${result.status.toUpperCase()}\n`);
  process.stdout.write(`Summary: ${result.summaryPath}\n`);
  for (const check of result.checks) {
    const marker = check.status === "pass" ? "PASS" : "FAIL";
    process.stdout.write(`[${marker}] ${check.label}\n`);
    for (const line of check.evidence ?? []) process.stdout.write(`  - ${line}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
