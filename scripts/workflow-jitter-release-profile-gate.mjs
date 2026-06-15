#!/usr/bin/env node
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const WORKFLOW_JITTER_RELEASE_PROFILE_MATRIX_ARGS = [
  "scripts/workflow-jitter-matrix.mjs",
  "--profile=release",
  "--require-live",
  "--promotion-gate",
  "--retries=1",
];

export const WORKFLOW_JITTER_RELEASE_PROFILE_GATE_ARGS = [
  "scripts/workflow-jitter-release-gate.mjs",
  "--release-profile",
];
const WORKFLOW_JITTER_RELEASE_PROFILE_MUTABLE_ARTIFACTS = [
  "test-results/workflow-jitter-matrix/latest.json",
  "test-results/workflow-jitter-matrix/latest.md",
  "test-results/workflow-jitter-release-gate/latest.json",
  "test-results/workflow-jitter-release-gate/latest.md",
];

export async function runWorkflowJitterReleaseProfileGate(input = {}) {
  const runCommand = input.runCommand ?? runCommandInherit;
  const matrixArgs = [
    ...(input.matrixArgs ?? WORKFLOW_JITTER_RELEASE_PROFILE_MATRIX_ARGS),
    ...workflowJitterReleaseProfileMatrixTaskArgs(input.matrixTasks),
  ];
  const gateArgs = input.gateArgs ?? WORKFLOW_JITTER_RELEASE_PROFILE_GATE_ARGS;
  const env = {
    ...process.env,
    AMBIENT_PROVIDER: process.env.AMBIENT_PROVIDER || "gmi-cloud",
    ...(input.env ?? {}),
  };
  if (input.clearLatestArtifacts !== false) {
    await clearWorkflowJitterReleaseProfileLatestArtifacts(input.cwd ?? repoRoot);
  }
  const matrix = await runCommand({
    label: "workflow jitter release-profile matrix",
    command: input.nodePath ?? process.execPath,
    args: matrixArgs,
    cwd: input.cwd ?? repoRoot,
    env,
  });
  const gate = await runCommand({
    label: "workflow jitter release-profile gate",
    command: input.nodePath ?? process.execPath,
    args: gateArgs,
    cwd: input.cwd ?? repoRoot,
    env,
  });
  return {
    matrix,
    gate,
    exitCode: matrix.exitCode === 0 && gate.exitCode === 0 ? 0 : 1,
  };
}

export async function clearWorkflowJitterReleaseProfileLatestArtifacts(cwd = repoRoot) {
  await Promise.all(
    WORKFLOW_JITTER_RELEASE_PROFILE_MUTABLE_ARTIFACTS.map((path) =>
      rm(resolve(cwd, path), { force: true }),
    ),
  );
}

function workflowJitterReleaseProfileMatrixTaskArgs(tasks = []) {
  return tasks.map((task) => `--task=${task}`);
}

function runCommandInherit(input) {
  console.log(`[workflow-jitter-release-profile] ${input.label}: ${[input.command, ...input.args].join(" ")}`);
  return new Promise((resolveRun) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: input.env,
      stdio: "inherit",
    });
    child.on("error", (error) => {
      console.error(`${input.label} failed to start: ${error instanceof Error ? error.message : String(error)}`);
      resolveRun({ label: input.label, exitCode: 1, signal: undefined });
    });
    child.on("close", (exitCode, signal) => {
      resolveRun({ label: input.label, exitCode: exitCode ?? 1, signal });
    });
  });
}

function parseCliArgs(args) {
  const parsed = { matrixTasks: [], help: false };
  for (const arg of args) {
    if (arg.startsWith("--matrix-task=")) parsed.matrixTasks.push(arg.slice("--matrix-task=".length));
    else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unknown option ${arg}. Run with --help for usage.`);
  }
  parsed.matrixTasks = parsed.matrixTasks.flatMap((value) => String(value).split(",")).map((value) => value.trim()).filter(Boolean);
  return parsed;
}

function usage() {
  return `Usage: node scripts/workflow-jitter-release-profile-gate.mjs [options]

Runs the release-profile workflow jitter matrix, then always runs the release-profile gate so
test-results/workflow-jitter-release-gate/latest.json exists even when the matrix reports a
blocked environment row. The command exits 0 only when both the matrix and gate pass.

Options:
  --matrix-task=ID[,ID]   Forward selected task ids to the matrix. Mainly for focused local proof runs.
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      process.exit(0);
    }
    const result = await runWorkflowJitterReleaseProfileGate(options);
    process.exit(result.exitCode);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
