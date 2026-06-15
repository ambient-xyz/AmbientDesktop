#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const HARNESS_MANIFEST_SCHEMA_VERSION = "ambient-harness-manifest-v1";
export const HARNESS_RESULT_STATUSES = [
  "passed",
  "harness_environment_failed",
  "harness_failed",
  "provider_failed",
  "product_failed",
];

export function classifyHarnessFailure(input = {}) {
  const output = `${input.stdout ?? ""}\n${input.stderr ?? ""}\n${input.error ?? ""}`;
  if (input.phase && input.phase !== "test" && input.phase !== "dogfood") return "harness_environment_failed";
  if (input.exitCode === 0 && !input.error) return "passed";
  if (/(nested worktree|nested node_modules|native module|ABI|wrong architecture|architecture mismatch|better_sqlite3\.node|better-sqlite3|node-pty)/i.test(output)) {
    return "harness_environment_failed";
  }
  if (/(GMI_CLOUD_API_KEY|GMI_API_KEY|api key|credential|auth denied|401|403|model unavailable|provider outage|stream stalled|did not start streaming|rate limit)/i.test(output)) {
    return "provider_failed";
  }
  if (/(CDP|screenshot|manifest|artifact freshness|Electron exited before CDP|Timed out waiting for Electron CDP|EADDRINUSE)/i.test(output)) {
    return "harness_failed";
  }
  return "product_failed";
}

export function buildHarnessManifest(input = {}) {
  const now = input.now ?? new Date().toISOString();
  const cwd = resolve(input.cwd ?? process.cwd());
  const run = {
    id: input.runId ?? defaultRunId(input.kind),
    kind: input.kind ?? "live_node_test",
    startedAt: input.startedAt ?? now,
    completedAt: input.completedAt ?? now,
    cwd,
    command: Array.isArray(input.command) ? input.command : [],
    branch: input.branch ?? gitValue(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    commitSha: input.commitSha ?? gitValue(["rev-parse", "HEAD"], cwd),
    dirty: input.dirty ?? gitDirty(cwd),
  };
  const status = input.status ?? classifyHarnessFailure(input);
  return {
    schemaVersion: HARNESS_MANIFEST_SCHEMA_VERSION,
    generatedAt: now,
    run,
    result: {
      status,
      exitCode: integerOrUndefined(input.exitCode),
      phase: input.phase,
      summary: input.summary ?? defaultSummary(status),
    },
    checkout: input.checkout,
    nativeRuntime: input.nativeRuntime,
    provider: input.provider,
    desktop: input.desktop,
    evidence: input.evidence,
    artifacts: Array.isArray(input.artifacts) ? input.artifacts : [],
    failures: Array.isArray(input.failures) ? input.failures : [],
  };
}

export async function writeHarnessManifest(path, input = {}) {
  const manifest = input.schemaVersion === HARNESS_MANIFEST_SCHEMA_VERSION
    ? input
    : buildHarnessManifest(input);
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function readHarnessManifest(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function defaultRunId(kind = "harness") {
  return `${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
}

function defaultSummary(status) {
  if (status === "passed") return "Harness gates and delegated command passed.";
  if (status === "harness_environment_failed") return "Harness environment preflight failed before trustworthy product execution.";
  if (status === "harness_failed") return "Harness runner or evidence collection failed.";
  if (status === "provider_failed") return "Provider behavior prevented validation.";
  return "Product behavior failed under validated harness conditions.";
}

function gitValue(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

function gitDirty(cwd) {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim().length > 0 : undefined;
}

function integerOrUndefined(value) {
  return Number.isInteger(value) ? value : undefined;
}

function parseCliArgs(argv) {
  const parsed = {
    out: "test-results/harness/latest.manifest.json",
    kind: "manual",
    status: undefined,
    phase: undefined,
    summary: undefined,
  };
  for (const arg of argv) {
    if (arg.startsWith("--out=")) parsed.out = arg.slice("--out=".length);
    else if (arg.startsWith("--kind=")) parsed.kind = arg.slice("--kind=".length);
    else if (arg.startsWith("--status=")) parsed.status = arg.slice("--status=".length);
    else if (arg.startsWith("--phase=")) parsed.phase = arg.slice("--phase=".length);
    else if (arg.startsWith("--summary=")) parsed.summary = arg.slice("--summary=".length);
    else throw new Error(`Unknown harness manifest argument: ${arg}`);
  }
  if (parsed.status && !HARNESS_RESULT_STATUSES.includes(parsed.status)) {
    throw new Error(`Unsupported harness manifest status: ${parsed.status}`);
  }
  return parsed;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = parseCliArgs(process.argv.slice(2));
  await writeHarnessManifest(args.out, {
    kind: args.kind,
    status: args.status,
    phase: args.phase,
    summary: args.summary,
    command: process.argv,
  });
  process.stdout.write(`Harness manifest: ${resolve(args.out)}\n`);
}
