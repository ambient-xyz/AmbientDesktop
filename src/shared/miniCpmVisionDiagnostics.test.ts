import { describe, expect, it } from "vitest";
import { miniCpmVisionDiagnosticsForFailure } from "./miniCpmVisionDiagnostics";

describe("miniCpmVisionDiagnosticsForFailure", () => {
  it("classifies missing llama-server runtime setup", () => {
    expect(miniCpmVisionDiagnosticsForFailure({
      setupStatus: "needs-runtime",
      error: "llama-server was not found at /missing/llama-server.",
    })).toEqual([
      expect.objectContaining({
        code: "missing-runtime-binary",
        severity: "warning",
      }),
    ]);
  });

  it("classifies video frame extraction and missing ffmpeg failures", () => {
    const diagnostics = miniCpmVisionDiagnosticsForFailure({
      error: "MiniCPM-V video frame extraction failed: ffmpeg was not found on PATH.",
    });
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain("missing-ffmpeg");
  });

  it("classifies endpoint, timeout, schema, and memory failures", () => {
    expect(miniCpmVisionDiagnosticsForFailure({ error: "MiniCPM-V local endpoint returned ECONNREFUSED" })[0].code).toBe("endpoint-refused");
    expect(miniCpmVisionDiagnosticsForFailure({ error: "MiniCPM-V endpointUrl must be local-only. Remote endpoints require a separate security review." })[0]).toMatchObject({
      code: "remote-endpoint-blocked",
      severity: "warning",
      nextAction: expect.stringContaining("allowed hosts"),
    });
    expect(miniCpmVisionDiagnosticsForFailure({ error: "llama-server did not become healthy within 180000 ms" }).map((item) => item.code)).toContain("timeout-or-stall");
    expect(miniCpmVisionDiagnosticsForFailure({ error: "MiniCPM-V returned invalid visual JSON: observations[0].kind is invalid." }).map((item) => item.code)).toContain("invalid-model-output-schema");
    expect(miniCpmVisionDiagnosticsForFailure({ error: "Vulkan failed to allocate VRAM: out of memory" }).map((item) => item.code)).toContain("insufficient-memory");
  });

  it("classifies path approval and model download failures", () => {
    expect(miniCpmVisionDiagnosticsForFailure({ error: "MiniCPM-V image input must stay inside the workspace unless allowExternalImagePaths is enabled." })[0].code).toBe("input-permission-or-path");
    expect(miniCpmVisionDiagnosticsForFailure({ error: "Hugging Face model download failed while offline" }).map((item) => item.code)).toContain("model-download-failed");
  });

  it("does not infer stale failures from successful statuses or runtime path names", () => {
    expect(miniCpmVisionDiagnosticsForFailure({
      setupStatus: "ready",
      validationStatus: "passed",
      runtimeCandidates: [{
        path: "/workspace/.ambient/vision/minicpm-v/runtime/b9122/macos-arm64-metal/llama-b9122/llama-server",
        source: "ambient-managed-runtime",
        available: true,
      }],
    })).toEqual([]);
  });

  it("falls back to unknown failure when no specific rule matches", () => {
    expect(miniCpmVisionDiagnosticsForFailure({ setupStatus: "failed", error: "Unexpected MiniCPM failure" })).toEqual([
      expect.objectContaining({ code: "unknown-failure" }),
    ]);
  });
});
