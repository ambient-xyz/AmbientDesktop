import { describe, expect, it } from "vitest";
import { validateWindowsQwenValidationSummary } from "./stt-qwen-windows-evidence.mjs";

describe("Windows Qwen3-ASR validation evidence", () => {
  it("accepts a real Windows CUDA plus CPU summary shape", () => {
    const result = validateWindowsQwenValidationSummary(validationSummary());
    expect(result.status).toBe("passed");
    expect(result.failedChecks).toEqual([]);
    expect(result.summary).toMatchObject({
      host: "win32 x64",
      lanes: ["windows-x64-nvidia-cuda", "windows-x64-cpu"],
    });
  });

  it("rejects dry-run or wrong-host summaries", () => {
    const summary = validationSummary({
      host: { platform: "darwin", arch: "arm64", runtimeBinary: process.execPath, runtimeVersion: process.version, runtimeDevices: [] },
      config: { fakeTranscript: true, requireHostMatch: false },
    });
    const result = validateWindowsQwenValidationSummary(summary);
    expect(result.status).toBe("failed");
    expect(result.failedChecks).toEqual(expect.arrayContaining(["host", "runtime", "not-fake"]));
  });
});

function validationSummary(overrides = {}) {
  const base = {
    schemaVersion: "ambient-stt-qwen3-asr-phase10-v1",
    runId: "windows-x64-qwen3-asr-test",
    completedAt: "2026-05-10T00:00:00.000Z",
    host: {
      platform: "win32",
      arch: "x64",
      runtimeBinary: "C:/Program Files/llama.cpp/llama-mtmd-cli.exe",
      runtimeVersion: "version: 9090",
      runtimeDevices: ["CUDA0: NVIDIA RTX 4090"],
    },
    config: {
      fakeTranscript: false,
      requireHostMatch: true,
      lanes: ["windows-x64-nvidia-cuda", "windows-x64-cpu"],
    },
    decision: { status: "passed" },
    results: [
      lane("windows-x64-nvidia-cuda", "nvidia-cuda", "CUDA0"),
      lane("windows-x64-cpu", "cpu", "none"),
    ],
  };
  return {
    ...base,
    ...overrides,
    host: { ...base.host, ...(overrides.host ?? {}) },
    config: { ...base.config, ...(overrides.config ?? {}) },
  };
}

function lane(id, accelerator, device) {
  return {
    lane: { id, accelerator },
    status: "passed",
    samples: [
      {
        id: "speech-short",
        kind: "speech",
        status: "passed",
        execution: { status: "succeeded", elapsedMs: 1800 },
        audio: { durationMs: 5100 },
        noSpeechGate: { noSpeech: false, rmsDbfs: -20 },
        transcript: { text: "hello from windows qwen" },
        runtime: { mode: "llama.cpp", modelSource: "manifest" },
        acceleratorEvidence: {
          expectedAccelerator: accelerator,
          forcedDeviceOverride: device,
          cudaInitialized: accelerator === "nvidia-cuda",
          cudaDeviceLines: accelerator === "nvidia-cuda" ? ["CUDA0 NVIDIA RTX 4090"] : [],
          gpuLayerLines: accelerator === "nvidia-cuda" ? ["offload 29 layers to CUDA0"] : [],
        },
      },
      {
        id: "silence-5s",
        kind: "silence",
        status: "passed",
        execution: { status: "skipped", reason: "no-speech-gate" },
        noSpeechGate: { noSpeech: true, rmsDbfs: undefined },
        transcript: { text: "" },
      },
    ],
  };
}
