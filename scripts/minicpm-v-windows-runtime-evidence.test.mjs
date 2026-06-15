import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateMiniCpmWindowsRuntimeSmokeSummary } from "./minicpm-v-windows-runtime-evidence.mjs";

describe("MiniCPM-V Windows runtime smoke evidence", () => {
  it("accepts a real Windows x64 CPU summary shape", () => {
    const result = validateMiniCpmWindowsRuntimeSmokeSummary(windowsSmokeSummary());

    expect(result.status).toBe("passed");
    expect(result.failedChecks).toEqual([]);
    expect(result.summary).toMatchObject({
      host: "win32 x64",
      artifactId: "llama-cpp-windows-x64-cpu",
      archiveSha256: "48f35bcb78eb3e50b0b5927f60ac101fd95501a3c14ad39e0ea81444d0da9b40",
      binarySha256: "819dacfec0b06b67aeac02388957881ce9483cc4326f507856c99d7881285a4a",
    });
  });

  it("rejects dry-run, wrong-host, and skipped lifecycle summaries", () => {
    const result = validateMiniCpmWindowsRuntimeSmokeSummary(windowsSmokeSummary({
      status: "dry-run",
      dryRun: true,
      host: { platform: "darwin", arch: "arm64", release: "25.0.0" },
      archiveSha256: "wrong",
      binarySha256: "wrong",
      plannedLifecycleArgs: ["--gpu-layers", "99"],
    }));

    expect(result.status).toBe("failed");
    expect(result.failedChecks).toEqual(expect.arrayContaining([
      "status",
      "not-dry-run",
      "host",
      "archive-checksum",
      "binary-checksum",
      "lifecycle-args-platform",
      "lifecycle-args-cpu",
    ]));
  });

  it("validates nested lifecycle artifacts when requested", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "ambient-minicpm-windows-evidence-"));
    const lifecycleSummaryPath = join(workspace, "lifecycle", "summary.json");
    await mkdir(join(workspace, "lifecycle"), { recursive: true });
    await writeFile(
      lifecycleSummaryPath,
      `${JSON.stringify({
        status: "passed",
        savedPidAlive: false,
        artifactPaths: {
          manifestVerification: "commands/verify-runtime-manifest.json",
          analyze: "commands/analyze.json",
          stop: "commands/stop.json",
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const result = validateMiniCpmWindowsRuntimeSmokeSummary(windowsSmokeSummary({ lifecycleSummaryPath }), {
      requireArtifacts: true,
    });

    expect(result.status).toBe("passed");
    expect(result.failedChecks).toEqual([]);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "artifact-files-present", status: "pass" }),
      expect.objectContaining({ id: "lifecycle-status", status: "pass" }),
      expect.objectContaining({ id: "process-cleanup", status: "pass" }),
    ]));
  });
});

function windowsSmokeSummary(overrides = {}) {
  const base = {
    schemaVersion: "ambient-minicpm-v-windows-runtime-smoke-v1",
    runId: "windows-x64-b9122-test",
    status: "passed",
    message: "Windows x64 CPU runtime smoke downloaded, extracted, verified, analyzed a screenshot, and stopped cleanly.",
    startedAt: "2026-05-12T21:00:00.000Z",
    finishedAt: "2026-05-12T21:10:00.000Z",
    artifactId: "llama-cpp-windows-x64-cpu",
    archiveSha256: "48f35bcb78eb3e50b0b5927f60ac101fd95501a3c14ad39e0ea81444d0da9b40",
    binarySha256: "819dacfec0b06b67aeac02388957881ce9483cc4326f507856c99d7881285a4a",
    lifecycleSummaryPath: "C:/a/ambient/test-results/minicpm-v/windows-runtime-smoke/windows/lifecycle/summary.json",
    lifecycleRunDir: "C:/a/ambient/test-results/minicpm-v/windows-runtime-smoke/windows/lifecycle",
    firewallPromptObserved: "not-observed-on-noninteractive-runner",
    artifact: {
      id: "llama-cpp-windows-x64-cpu",
      archiveName: "llama-b9122-bin-win-cpu-x64.zip",
      archiveSha256: "48f35bcb78eb3e50b0b5927f60ac101fd95501a3c14ad39e0ea81444d0da9b40",
      binaryRelativePath: "llama-server.exe",
      binarySha256: "819dacfec0b06b67aeac02388957881ce9483cc4326f507856c99d7881285a4a",
    },
    host: { platform: "win32", arch: "x64", release: "10.0.26100" },
    paths: {
      runtimeRoot: "C:/a/ambient/test-results/minicpm-v/windows-runtime-smoke/windows/runtime path with spaces",
      archivePath: "C:/a/ambient/test-results/minicpm-v/windows-runtime-smoke/windows/runtime path with spaces/downloaded archive/llama-b9122-bin-win-cpu-x64.zip",
      binaryPath: "C:/a/ambient/test-results/minicpm-v/windows-runtime-smoke/windows/runtime path with spaces/extracted runtime/llama-server.exe",
    },
    dryRun: false,
    plannedLifecycleArgs: [
      "scripts/minicpm-v-runtime-lifecycle-smoke.mjs",
      "--binary",
      "C:/a/ambient/test-results/minicpm-v/windows-runtime-smoke/windows/runtime path with spaces/extracted runtime/llama-server.exe",
      "--archive",
      "C:/a/ambient/test-results/minicpm-v/windows-runtime-smoke/windows/runtime path with spaces/downloaded archive/llama-b9122-bin-win-cpu-x64.zip",
      "--artifact-id",
      "llama-cpp-windows-x64-cpu",
      "--platform",
      "win32",
      "--arch",
      "x64",
      "--gpu-layers",
      "0",
    ],
  };
  return {
    ...base,
    ...overrides,
    artifact: { ...base.artifact, ...(overrides.artifact ?? {}) },
    host: { ...base.host, ...(overrides.host ?? {}) },
    paths: { ...base.paths, ...(overrides.paths ?? {}) },
  };
}
