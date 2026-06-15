#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultSummaryPath = ".ambient/stt-validation/qwen3-asr-windows/latest/summary.json";

export function validateWindowsQwenValidationSummary(summary) {
  const checks = [];
  add(checks, "schema", summary?.schemaVersion === "ambient-stt-qwen3-asr-phase10-v1", "summary uses the Qwen3-ASR validation schema");
  add(checks, "decision", summary?.decision?.status === "passed", "validation decision passed");
  add(checks, "host", summary?.host?.platform === "win32" && summary?.host?.arch === "x64", "host is real Windows x64", [
    `host: ${summary?.host?.platform ?? "missing"} ${summary?.host?.arch ?? "missing"}`,
  ]);
  add(checks, "runtime", isWindowsRuntime(summary?.host?.runtimeBinary) && nonEmpty(summary?.host?.runtimeVersion), "Windows runtime binary and version are recorded", [
    `runtimeBinary: ${summary?.host?.runtimeBinary ?? "missing"}`,
    `runtimeVersion: ${summary?.host?.runtimeVersion ?? "missing"}`,
  ]);
  add(checks, "not-fake", summary?.config?.fakeTranscript !== true && summary?.config?.requireHostMatch === true, "run was not fake and enforced host matching", [
    `fakeTranscript: ${String(summary?.config?.fakeTranscript)}`,
    `requireHostMatch: ${String(summary?.config?.requireHostMatch)}`,
  ]);

  const lanes = Array.isArray(summary?.results) ? summary.results : [];
  const cudaLane = lanes.find((lane) => lane?.lane?.id === "windows-x64-nvidia-cuda");
  const fallbackLane = lanes.find((lane) => ["windows-x64-cpu", "windows-x64-vulkan"].includes(lane?.lane?.id));
  add(checks, "cuda-lane", Boolean(cudaLane) && cudaLane.status === "passed", "Windows CUDA lane passed");
  add(checks, "fallback-lane", Boolean(fallbackLane) && fallbackLane.status === "passed", "Windows CPU or Vulkan fallback lane passed");

  if (cudaLane) {
    add(checks, "cuda-accelerator", hasCudaEvidence(summary, cudaLane), "CUDA lane includes accelerator evidence");
    addSampleChecks(checks, cudaLane, "cuda");
  }
  if (fallbackLane) {
    add(checks, "fallback-accelerator", hasFallbackEvidence(fallbackLane), "fallback lane includes CPU/Vulkan control evidence");
    addSampleChecks(checks, fallbackLane, "fallback");
  }

  const failed = checks.filter((check) => check.status === "fail");
  return {
    status: failed.length ? "failed" : "passed",
    checks,
    failedChecks: failed.map((check) => check.id),
    summary: {
      runId: summary?.runId,
      completedAt: summary?.completedAt,
      host: `${summary?.host?.platform ?? "missing"} ${summary?.host?.arch ?? "missing"}`,
      runtimeBinary: summary?.host?.runtimeBinary,
      runtimeVersion: summary?.host?.runtimeVersion,
      lanes: lanes.map((lane) => lane?.lane?.id).filter(Boolean),
    },
  };
}

function addSampleChecks(checks, lane, prefix) {
  const samples = Array.isArray(lane.samples) ? lane.samples : [];
  const speech = samples.find((sample) => sample.kind === "speech");
  const silence = samples.find((sample) => sample.kind === "silence" || sample.id === "silence-5s");
  add(checks, `${prefix}-speech`, Boolean(speech) && speech.status === "passed" && speech.execution?.status === "succeeded" && nonEmpty(speech.transcript?.text), `${prefix} speech sample passed with a transcript`);
  add(checks, `${prefix}-speech-gate`, Boolean(speech) && speech.noSpeechGate?.noSpeech === false && Number.isFinite(speech.noSpeechGate?.rmsDbfs), `${prefix} speech sample crossed RMS gate`);
  add(checks, `${prefix}-manifest-runtime`, speech?.runtime?.mode === "llama.cpp" && speech?.runtime?.modelSource === "manifest", `${prefix} speech used manifest-pinned llama.cpp runtime`);
  add(checks, `${prefix}-silence`, Boolean(silence) && silence.status === "passed" && silence.execution?.reason === "no-speech-gate" && silence.noSpeechGate?.noSpeech === true, `${prefix} silence sample was skipped by RMS no-speech gate`);
}

function hasCudaEvidence(summary, lane) {
  const runtimeDevices = (summary?.host?.runtimeDevices ?? []).join("\n").toLowerCase();
  if (runtimeDevices.includes("cuda")) return true;
  return (lane.samples ?? []).some((sample) => {
    const evidence = sample.acceleratorEvidence;
    return evidence?.expectedAccelerator === "nvidia-cuda" && (
      evidence.cudaInitialized === true ||
      (evidence.cudaDeviceLines ?? []).some((line) => /cuda/i.test(line)) ||
      (evidence.gpuLayerLines ?? []).some((line) => /cuda|offload/i.test(line))
    );
  });
}

function hasFallbackEvidence(lane) {
  if (lane.lane?.id === "windows-x64-vulkan") {
    return (lane.samples ?? []).some((sample) => {
      const evidence = sample.acceleratorEvidence;
      return evidence?.expectedAccelerator === "vulkan" && (
        evidence.forcedDeviceOverride === "Vulkan0" ||
        (evidence.gpuLayerLines ?? []).some((line) => /vulkan/i.test(line))
      );
    });
  }
  return lane.lane?.id === "windows-x64-cpu" && (lane.samples ?? []).some((sample) => {
    const evidence = sample.acceleratorEvidence;
    return evidence?.expectedAccelerator === "cpu" && evidence.forcedDeviceOverride === "none";
  });
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

function isWindowsRuntime(value) {
  return typeof value === "string" && /llama-mtmd-cli(?:\.exe)?$/i.test(value.replace(/\\/g, "/"));
}

function parseArgs(argv) {
  const parsed = {
    summaryPath: process.env.AMBIENT_STT_WINDOWS_VALIDATION_SUMMARY || defaultSummaryPath,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--json") {
      parsed.json = true;
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
      checks: [{ id: "summary-exists", label: "Windows validation summary exists", status: "fail", evidence: [`missing: ${options.summaryPath}`] }],
      failedChecks: ["summary-exists"],
    };
    writeResult(result, options.json);
    process.exit(1);
  }

  const result = {
    summaryPath,
    ...validateWindowsQwenValidationSummary(JSON.parse(readFileSync(summaryPath, "utf8"))),
  };
  writeResult(result, options.json);
  if (result.status !== "passed") process.exit(1);
}

function writeResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  process.stdout.write(`Windows Qwen3-ASR evidence: ${result.status.toUpperCase()}\n`);
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
