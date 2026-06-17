#!/usr/bin/env node
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const argv = process.argv.slice(2);
const scenarioArtifactPath = resolve(optionValue(argv, "--scenarios") || process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_ARTIFACT || "test-results/local-runtime-control-proof/latest.json");
const gateOutputPath = resolve(optionValue(argv, "--out") || process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_GATE_OUT || "test-results/local-runtime-control-proof-gate/latest.json");

await mkdir(dirname(scenarioArtifactPath), { recursive: true });
await mkdir(dirname(gateOutputPath), { recursive: true });
await rm(scenarioArtifactPath, { force: true });
await rm(gateOutputPath, { force: true });

const proofEnv = {
  ...process.env,
  AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_OUT: scenarioArtifactPath,
  AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_ARTIFACT: scenarioArtifactPath,
  AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_GATE_OUT: gateOutputPath,
};

for (const step of proofSteps()) {
  console.log(`\n[local-runtime-control-proof] ${step.label}`);
  run("pnpm", ["exec", "vitest", "run", ...step.vitestArgs], proofEnv);
}

console.log("\n[local-runtime-control-proof] gate");
run("node", ["scripts/local-runtime-control-proof-gate.mjs", ...argv], proofEnv);

function proofSteps() {
  return [
    {
      label: "MiniCPM non-destructive Stop",
      vitestArgs: ["src/main/miniCpmVisionProvider.test.ts", "-t", "stops MiniCPM-V without uninstalling"],
    },
    {
      label: "active sub-agent Stop blocker",
      vitestArgs: ["src/main/local-runtime/localRuntimeInventory.test.ts", "-t", "joins active sub-agent leases"],
    },
    {
      label: "untracked runtime safety",
      vitestArgs: ["src/main/local-runtime/localRuntimeInventory.test.ts", "-t", "keeps untracked runtime blockers visible"],
    },
    {
      label: "stale lease recovery",
      vitestArgs: ["src/main/local-runtime/localRuntimeInventory.test.ts", "-t", "treats active-looking sub-agent leases as stale only when a freshness window is supplied"],
    },
    {
      label: "stopped provider display",
      vitestArgs: ["src/renderer/src/localRuntimeControlProofArtifacts.test.ts", "-t", "writes stopped-provider display proof"],
    },
    {
      label: "provider-declared lifecycle",
      vitestArgs: ["src/main/local-runtime/agentRuntimeLocalRuntimeTools.test.ts", "-t", "runs provider-declared Start, Stop, and Restart"],
    },
  ];
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  if (result.status === 0) return;
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

function optionValue(values, name) {
  const index = values.indexOf(name);
  if (index >= 0) return values[index + 1];
  const prefix = `${name}=`;
  const match = values.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}
