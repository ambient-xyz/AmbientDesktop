import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export const WORKFLOW_HARD_KILL_REQUIRED_CHECKS = [
  "workflow-loader-vm-timeout-regressions",
  "parent-process-hard-kill-escalation",
];

export async function runWorkflowHardKillGate(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const timeoutMs = positiveInteger(options.timeoutMs) ?? 90_000;
  const killGraceMs = positiveInteger(options.killGraceMs) ?? 1_000;
  const checks = [
    await runWorkflowLoaderVmTimeoutRegression({ repoRoot, timeoutMs, killGraceMs }),
    await runParentProcessHardKillEscalation({
      repoRoot,
      timeoutMs: Math.min(2_000, Math.max(500, timeoutMs)),
      killGraceMs: Math.min(500, Math.max(50, killGraceMs)),
    }),
  ];
  const gate = evaluateWorkflowHardKillGateResults(checks);
  return {
    status: gate.status,
    checked: gate.checked,
    counts: gate.counts,
    issues: gate.issues,
    checks,
  };
}

export function evaluateWorkflowHardKillGateResults(checks) {
  const byId = new Map((checks ?? []).map((check) => [check.id, check]));
  const counts = {};
  for (const check of checks ?? []) counts[check.status] = (counts[check.status] ?? 0) + 1;
  const issues = [];
  for (const id of WORKFLOW_HARD_KILL_REQUIRED_CHECKS) {
    const check = byId.get(id);
    if (!check) {
      issues.push({ id, status: "missing", issue: `${id} did not run.` });
      continue;
    }
    if (check.status !== "passed") {
      issues.push({ id, status: check.status, issue: check.summary ?? `${id} failed.` });
    }
  }
  return {
    status: issues.length === 0 ? "passed" : "failed",
    checked: WORKFLOW_HARD_KILL_REQUIRED_CHECKS.filter((id) => byId.has(id)).length,
    counts,
    issues,
  };
}

export async function runWorkflowLoaderVmTimeoutRegression(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const timeoutMs = positiveInteger(options.timeoutMs) ?? 90_000;
  const killGraceMs = positiveInteger(options.killGraceMs) ?? 1_000;
  const testNamePattern = [
    "terminates synchronous CPU loops when invoking the exported run function",
    "terminates synchronous CPU loops inside workflow callbacks",
    "terminates CPU loops after awaited workflow host calls",
    "terminates CPU loops after awaited host calls inside workflow callbacks",
  ].join("|");
  const result = await runCommand(pnpmCommand(), [
    "exec",
    "vitest",
    "run",
    "src/main/workflowProgramLoader.test.ts",
    "-t",
    testNamePattern,
  ], { cwd: repoRoot, timeoutMs, killGraceMs });
  const passed = result.code === 0 && !result.timedOut;
  return {
    id: "workflow-loader-vm-timeout-regressions",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "Workflow loader VM timeout regressions completed in a child process."
      : `Workflow loader VM timeout regressions failed or hung. exit=${result.code ?? "none"} signal=${result.signal ?? "none"} timedOut=${result.timedOut ? "yes" : "no"}.`,
    command: result.command,
    elapsedMs: result.elapsedMs,
    exitCode: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    escalatedToSigkill: result.escalatedToSigkill,
    stdout: preview(result.stdout),
    stderr: preview(result.stderr),
    error: result.error,
  };
}

export async function runParentProcessHardKillEscalation(options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const timeoutMs = positiveInteger(options.timeoutMs) ?? 750;
  const killGraceMs = positiveInteger(options.killGraceMs) ?? 100;
  const fixture = [
    "process.on('SIGTERM', () => {});",
    "process.stderr.write('sigterm-resistant-loop-started\\n');",
    "while (1) {}",
  ].join("\n");
  const result = await runCommand(process.execPath, ["-e", fixture], { cwd: repoRoot, timeoutMs, killGraceMs });
  const passed = result.timedOut && result.signal === "SIGKILL" && result.elapsedMs < timeoutMs + killGraceMs + 5_000;
  return {
    id: "parent-process-hard-kill-escalation",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "A SIGTERM-resistant child process was escalated to SIGKILL without blocking the parent."
      : `Hard-kill escalation failed. exit=${result.code ?? "none"} signal=${result.signal ?? "none"} timedOut=${result.timedOut ? "yes" : "no"} elapsedMs=${Math.round(result.elapsedMs)}.`,
    command: result.command,
    elapsedMs: result.elapsedMs,
    exitCode: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    escalatedToSigkill: result.escalatedToSigkill,
    stdout: preview(result.stdout),
    stderr: preview(result.stderr),
    error: result.error,
  };
}

function runCommand(command, args, options) {
  const startedAt = performance.now();
  const commandLine = [command, ...args].join(" ");
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let escalatedToSigkill = false;
    let sigkillTimer;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      sigkillTimer = setTimeout(() => {
        if (settled) return;
        escalatedToSigkill = true;
        child.kill("SIGKILL");
      }, options.killGraceMs ?? 1_000);
    }, options.timeoutMs);
    const append = (target, chunk) => {
      const next = target + chunk.toString("utf8");
      return next.length > 120_000 ? next.slice(-120_000) : next;
    };
    child.stdout.on("data", (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once("error", (error) => {
      settled = true;
      clearTimeout(timeout);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      resolveRun({
        command: commandLine,
        code: undefined,
        signal: undefined,
        stdout,
        stderr,
        timedOut,
        escalatedToSigkill,
        elapsedMs: performance.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    child.once("close", (code, signal) => {
      settled = true;
      clearTimeout(timeout);
      if (sigkillTimer) clearTimeout(sigkillTimer);
      resolveRun({
        command: commandLine,
        code,
        signal,
        stdout,
        stderr,
        timedOut,
        escalatedToSigkill,
        elapsedMs: performance.now() - startedAt,
      });
    });
  });
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function positiveInteger(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

function preview(value, maxLength = 4_000) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
