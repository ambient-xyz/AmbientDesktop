#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const repoRoot = process.cwd();
const resultsRelativePath = "test-results/provider-restart-behavior/live-gates.json";
const resultsPath = join(repoRoot, resultsRelativePath);
const gates = [
  {
    id: "gate-a-hidden-goal-continuation-provider-stall",
    manifest: "test-results/harness/provider-restart-gate-a.manifest.json",
  },
  {
    id: "gate-b-post-tool-provider-stall",
    manifest: "test-results/harness/provider-restart-gate-b.manifest.json",
  },
  {
    id: "gate-c-provider-retry-cap",
    manifest: "test-results/harness/provider-restart-gate-c.manifest.json",
  },
  {
    id: "gate-d-no-stall-live-smoke",
    manifest: "test-results/harness/provider-restart-gate-d.manifest.json",
  },
];

const startedAt = new Date().toISOString();
const gateResults = [];
let status = "passed";

for (const gate of gates) {
  const result = await runGate(gate);
  gateResults.push(result);
  if (result.exitCode !== 0 || result.manifestStatus !== "passed") {
    status = "failed";
    break;
  }
}

const report = {
  schemaVersion: "ambient-provider-restart-behavior-live-gates-v1",
  status,
  generatedAt: new Date().toISOString(),
  startedAt,
  completedAt: new Date().toISOString(),
  provider: process.env.AMBIENT_PROVIDER || "ambient",
  model: process.env.AMBIENT_LIVE_MODEL || process.env.AMBIENT_MODEL || "example/model-id",
  headful: true,
  gates: gateResults,
};

await mkdir(dirname(resultsPath), { recursive: true });
await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (status !== "passed") process.exit(1);

async function runGate(gate) {
  const command = [
    "scripts/run-electron-dogfood.mjs",
    `--manifest-out=${gate.manifest}`,
    "--scenario=provider-restart-behavior",
    "--",
    `--gate=${gate.id}`,
  ];
  const child = spawn("node", command, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  const [code, signal] = await once(child, "exit");
  const exitCode = code ?? (signal ? 1 : 0);
  const manifest = await readJson(join(repoRoot, gate.manifest));
  return {
    id: gate.id,
    manifestPath: gate.manifest,
    exitCode,
    manifestStatus: manifest?.result?.status ?? "missing",
    summary: manifest?.result?.summary,
  };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}
