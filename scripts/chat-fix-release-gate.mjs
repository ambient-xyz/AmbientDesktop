#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const includeLive = process.argv.includes("--include-live");
const requireLive = process.argv.includes("--require-live");

const deterministicSteps = [
  {
    label: "stream watchdog and Ambient stream transport",
    command: "pnpm",
    args: ["exec", "vitest", "run", "src/main/piStreamWatchdog.test.ts", "src/main/ambientStreamTransport.test.ts"],
  },
  {
    label: "post-tool continuation and session file persistence guards",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "src/main/postToolContinuationScheduler.test.ts",
      "src/main/sessionFileCommit.test.ts",
      "src/main/piSessionAtomicPersistence.test.ts",
    ],
  },
  {
    label: "tool runner liveness and managed dev-server controls",
    command: "pnpm",
    args: ["exec", "vitest", "run", "src/main/toolRunner.test.ts"],
  },
  {
    label: "retry accounting and provider diagnostics",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "src/main/agentRuntime.test.ts",
      "--testNamePattern",
      "assistant finalization retry accounting|runtime provider diagnostics",
    ],
  },
  {
    label: "TypeScript",
    command: "pnpm",
    args: ["exec", "tsc", "--noEmit"],
  },
];

const liveSteps = [
  {
    label: "live Ambient/Pi chat and post-tool continuation smoke",
    command: "node",
    args: ["scripts/e2e-ambient-live.mjs"],
    env: { AMBIENT_PROVIDER: "ambient", AMBIENT_LIVE_POST_TOOL_CONTINUATION: "1" },
  },
];

function runStep(step) {
  console.log(`\n[chat-fix] ${step.label}`);
  console.log(`[chat-fix] $ ${[step.command, ...step.args].join(" ")}`);
  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    env: { ...process.env, ...(step.env ?? {}) },
  });
  if (result.error) {
    console.error(`[chat-fix] failed to start ${step.label}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

let failed = false;
for (const step of deterministicSteps) {
  const status = runStep(step);
  if (status !== 0) {
    failed = true;
    break;
  }
}

if (!failed && includeLive) {
  for (const step of liveSteps) {
    const status = runStep(step);
    if (status !== 0) {
      failed = requireLive;
      if (requireLive) break;
      console.warn(`[chat-fix] live smoke failed but --require-live was not set; continuing.`);
    }
  }
}

if (failed) process.exit(1);
console.log("\n[chat-fix] gate passed");
