#!/usr/bin/env node
import { spawn } from "node:child_process";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const validatorPath = join(scriptDir, "stt-qwen-cross-platform-validation.mjs");
const rawArgs = process.argv.slice(2);
const dryRun = hasFlag(rawArgs, "--dry-run");
const generatedRunId = `windows-x64-qwen3-asr-${new Date().toISOString().replace(/[:.]/g, "-")}`;

if ((platform() !== "win32" || arch() !== "x64") && !dryRun) {
  process.stderr.write(
    [
      "Qwen3-ASR Windows validation must run on a real Windows x64 machine.",
      `Current host is ${platform()} ${arch()}.`,
      "Use --dry-run only to materialize the planned command/artifact shape from another host.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const args = [...rawArgs];
ensureOption(args, "--lanes", "windows-cuda,windows-cpu");
ensureOption(args, "--out", ".ambient/stt-validation/qwen3-asr-windows");
ensureOption(args, "--run-id", generatedRunId);
if (!dryRun && !hasFlag(args, "--require-host-match")) args.push("--require-host-match");

const outRoot = resolve(process.cwd(), optionValue(args, "--out"));
const runId = optionValue(args, "--run-id");

const child = spawn(process.execPath, [validatorPath, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("error", (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  void (async () => {
    if (signal) {
      process.stderr.write(`Qwen3-ASR Windows validation stopped by ${signal}.\n`);
      process.exit(1);
    }
    await publishLatestEvidence({ outRoot, runId, exitCode: code ?? 1 }).catch((error) => {
      process.stderr.write(`Could not publish latest Windows validation evidence: ${error instanceof Error ? error.message : String(error)}\n`);
    });
    process.exit(code ?? 1);
  })();
});

async function publishLatestEvidence(input) {
  const runDir = join(input.outRoot, input.runId);
  const summaryJsonPath = join(runDir, "summary.json");
  const summaryMarkdownPath = join(runDir, "summary.md");
  const latestDir = join(input.outRoot, "latest");
  await mkdir(latestDir, { recursive: true });
  await copyFile(summaryJsonPath, join(latestDir, "summary.json"));
  await copyFile(summaryMarkdownPath, join(latestDir, "summary.md"));
  await writeFile(
    join(latestDir, "evidence.json"),
    `${JSON.stringify({
      schemaVersion: "ambient-stt-qwen3-asr-windows-latest-v1",
      runId: input.runId,
      sourceRunDir: runDir,
      summaryJsonPath,
      summaryMarkdownPath,
      latestSummaryJsonPath: join(latestDir, "summary.json"),
      latestSummaryMarkdownPath: join(latestDir, "summary.md"),
      exitCode: input.exitCode,
      dryRun,
      publishedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`Windows Qwen3-ASR latest evidence updated\n`);
  process.stdout.write(`- latest: ${join(latestDir, "summary.json")}\n`);
  process.stdout.write(`- verify: pnpm run stt:qwen-validate:windows-evidence -- --summary ${join(latestDir, "summary.json")}\n`);
  if (dryRun) {
    process.stdout.write(`- note: this was a dry-run and should not satisfy release evidence.\n`);
  }
}

function optionValue(args, name) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
    if (arg === name) {
      const value = args[index + 1];
      if (value && !value.startsWith("--")) return value;
    }
  }
  throw new Error(`Missing required option value after defaults were applied: ${name}`);
}

function ensureOption(args, name, value) {
  if (hasOption(args, name)) return;
  args.push(name, value);
}

function hasOption(args, name) {
  return args.some((arg, index) => arg === name || arg.startsWith(`${name}=`) || (index > 0 && args[index - 1] === name));
}

function hasFlag(args, name) {
  return args.includes(name);
}
