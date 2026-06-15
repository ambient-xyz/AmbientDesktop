#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  defaultWorkflowCompilerLiveBenchmarkTasks,
  runWorkflowCompilerLiveBenchmarks,
  selectWorkflowCompilerLiveBenchmarkTasks,
  workflowCompilerLiveBenchmarkExitCode,
} from "./workflow-compiler-live-benchmark-lib.mjs";

const options = parseArgs(process.argv.slice(2));
const generatedAt = new Date().toISOString();
const outputDir = process.env.AMBIENT_WORKFLOW_COMPILER_BENCHMARK_OUT || "test-results/workflow-compiler-bench";

let exitCode = 0;
if (!options.liveOnly) {
  exitCode = await runInherited("pnpm", ["exec", "vitest", "run", "src/main/workflowCompilerMetrics.test.ts", "--reporter=dot"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AMBIENT_WORKFLOW_COMPILER_BENCHMARK_GENERATED_AT: generatedAt,
    },
  });
  if (exitCode === 0) {
    console.log("Workflow compiler benchmark reports written to test-results/workflow-compiler-bench/latest.json and latest.md");
  }
}

if (exitCode === 0 && options.includeLive) {
  const tasks = selectWorkflowCompilerLiveBenchmarkTasks(defaultWorkflowCompilerLiveBenchmarkTasks(), options.liveTasks);
  const { summary, paths } = await runWorkflowCompilerLiveBenchmarks({
    cwd: process.cwd(),
    outputDir,
    generatedAt,
    retries: options.liveRetries,
    concurrency: options.liveConcurrency,
    timeoutMs: options.liveTimeoutMs,
    tasks,
    log: (line) => console.log(line),
  });
  console.log(`Workflow compiler live benchmark latest report written to ${paths?.jsonPath} and ${paths?.markdownPath}`);
  console.log(`Workflow compiler live benchmark immutable report written to ${paths?.runJsonPath} and ${paths?.runMarkdownPath}`);
  console.log(`Workflow compiler live benchmark attempt logs written under ${paths?.logDirPath}`);
  console.log(`Workflow compiler live benchmark history appended to ${paths?.historyPath}`);
  const liveExitCode = workflowCompilerLiveBenchmarkExitCode(summary, { requireLive: options.requireLive });
  if (liveExitCode !== 0) exitCode = liveExitCode;
}

process.exit(exitCode);

function runInherited(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
  });
  return new Promise((resolve) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

function parseArgs(args) {
  const parsed = {
    includeLive: process.env.AMBIENT_WORKFLOW_COMPILER_BENCHMARK_LIVE === "1",
    liveOnly: false,
    requireLive: false,
    liveRetries: positiveEnvInt("AMBIENT_WORKFLOW_COMPILER_LIVE_RETRIES", 1),
    liveConcurrency: positiveEnvInt("AMBIENT_WORKFLOW_COMPILER_LIVE_CONCURRENCY", 4),
    liveTimeoutMs: positiveEnvInt("AMBIENT_WORKFLOW_COMPILER_LIVE_TIMEOUT_MS", 900_000),
    liveTasks: [],
  };
  for (const arg of args) {
    if (arg === "--include-live") parsed.includeLive = true;
    else if (arg === "--live-only") {
      parsed.includeLive = true;
      parsed.liveOnly = true;
    } else if (arg === "--require-live") parsed.requireLive = true;
    else if (arg.startsWith("--live-retries=")) parsed.liveRetries = positiveIntArg(arg, "--live-retries=");
    else if (arg.startsWith("--live-concurrency=")) parsed.liveConcurrency = positiveIntArg(arg, "--live-concurrency=");
    else if (arg.startsWith("--live-timeout-ms=")) parsed.liveTimeoutMs = positiveIntArg(arg, "--live-timeout-ms=");
    else if (arg.startsWith("--live-task=")) parsed.liveTasks.push(arg.slice("--live-task=".length));
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown option ${arg}. Run with --help for usage.`);
    }
  }
  return parsed;
}

function positiveEnvInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function positiveIntArg(arg, prefix) {
  const value = Number(arg.slice(prefix.length));
  if (!Number.isFinite(value) || value < 0) throw new Error(`Expected a non-negative integer for ${prefix.slice(0, -1)}`);
  return Math.floor(value);
}

function printHelp() {
  console.log(`Usage: node scripts/benchmark-workflow-compiler.mjs [options]

Options:
  --include-live              Run live/provider-inclusive benchmark tasks after deterministic fixtures.
  --live-only                 Run only live/provider-inclusive benchmark tasks.
  --require-live              Exit nonzero for provider-degraded or skipped live rows.
  --live-retries=N            Retry provider-degraded live rows N times. Default: 1.
  --live-concurrency=N        Run up to N live rows concurrently, capped at 4. Default: 4.
  --live-timeout-ms=N         Default timeout for live rows without a task-specific timeout.
  --live-task=ID[,ID]         Run only selected live task ids. Can be repeated.

Reports:
  deterministic: test-results/workflow-compiler-bench/latest.json and latest.md
  live:          test-results/workflow-compiler-bench/live-latest.json and live-latest.md
  live history:  test-results/workflow-compiler-bench/live-runs/*.json/*.md, live-logs/<run-id>/*.log, and live-history.jsonl
`);
}
