import { describe, expect, it } from "vitest";
import {
  miniCpmVisionSetupActions,
  miniCpmVisionSetupResultModel,
} from "./miniCpmVisionUiModel";
import type { MiniCpmVisionSetupResult } from "../../shared/localRuntimeTypes";

describe("miniCpmVisionUiModel", () => {
  it("prefers install before a setup result exists", () => {
    expect(miniCpmVisionSetupActions()[0]).toMatchObject({ action: "install", primary: true });
    expect(miniCpmVisionSetupActions()).toContainEqual(expect.objectContaining({ action: "uninstall", danger: true }));
  });

  it("prefers repair after a failed setup", () => {
    expect(miniCpmVisionSetupActions(setupResult("needs-runtime"))[0]).toMatchObject({ action: "repair", primary: true });
    expect(miniCpmVisionSetupActions(setupResult("needs-runtime"))).toContainEqual(expect.objectContaining({ action: "uninstall", danger: true }));
  });

  it("summarizes uninstalled cleanup state", () => {
    const model = miniCpmVisionSetupResultModel(setupResult("uninstalled"));
    expect(model.statusLabel).toBe("MiniCPM-V cleaned up");
    expect(model.statusTone).toBe("info");
    expect(model.detailLabels.join("\n")).toContain("Package cleanup: uninstalled");
    expect(miniCpmVisionSetupActions(setupResult("uninstalled"))[0]).toMatchObject({ action: "install", primary: true });
  });

  it("summarizes stopped runtime state without treating setup as broken", () => {
    const model = miniCpmVisionSetupResultModel(setupResult("stopped"));
    expect(model.statusLabel).toBe("MiniCPM-V stopped");
    expect(model.statusTone).toBe("info");
    expect(model.detailLabels.join("\n")).toContain("Runtime state: stopped");
    expect(model.detailLabels.join("\n")).toContain("Runtime previous pid: 4242");
    expect(miniCpmVisionSetupActions(setupResult("ready"))).toContainEqual(expect.objectContaining({ action: "stop" }));
    expect(miniCpmVisionSetupActions(setupResult("stopped"))[0]).toMatchObject({ action: "validate", primary: true });
  });

  it("summarizes setup diagnostics and next actions", () => {
    const model = miniCpmVisionSetupResultModel(setupResult("needs-runtime"));
    expect(model.statusLabel).toBe("MiniCPM-V needs llama-server");
    expect(model.statusTone).toBe("warning");
    expect(model.detailLabels.join("\n")).toContain("Run Repair");
    expect(model.detailLabels.join("\n")).toContain("Runtime acquisition: user-managed-runtime");
    expect(model.detailLabels.join("\n")).toContain("Runtime cache: .ambient/vision/minicpm-v/runtime");
    expect(model.detailLabels.join("\n")).toContain("Runtime manifest: blocked");
    expect(model.detailLabels.join("\n")).toContain("Runtime artifact: llama-cpp-macos-arm64-metal");
    expect(model.detailLabels.join("\n")).toContain("Runtime manifest Artifact checksum pin: passed");
    expect(model.detailLabels.join("\n")).toContain("Preflight llama-server binary: failed");
    expect(model.diagnostics[0]).toMatchObject({ code: "missing-runtime-binary" });
  });
});

function setupResult(status: MiniCpmVisionSetupResult["status"]): MiniCpmVisionSetupResult {
  return {
    provider: "minicpm-v",
    action: status === "uninstalled" ? "uninstall" : status === "stopped" ? "stop" : "install",
    status,
    packageName: "ambient-minicpm-v-vision",
    installStatuses: status === "uninstalled" ? [] : [{ packageName: "ambient-minicpm-v-vision", source: "first-party", status: "installed" }],
    runtimeCandidates: [],
    validation: {
      schemaVersion: "ambient-minicpm-v-provider-validation-v1",
      provider: "minicpm-v",
      packageName: "ambient-minicpm-v-vision",
      status: status === "ready" ? "runtime-ready" : status === "stopped" ? "stopped" : status === "uninstalled" ? "uninstalled" : "needs-runtime",
      updatedAt: "2026-05-12T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      lane: "macos-arm64-metal",
      ...(status === "uninstalled" || status === "stopped" ? {} : { error: "llama-server was not found" }),
      missingHints: status === "uninstalled" || status === "stopped" ? [] : ["Run Repair after installing llama-server."],
      ...(status === "stopped"
        ? {
            runtimeState: {
              status: "stopped",
              running: false,
              recordedAt: "2026-05-12T00:01:00.000Z",
              previousPid: 4242,
              endpoint: "http://127.0.0.1:39217",
              stoppedAt: "2026-05-12T00:01:00.000Z",
            },
          }
        : {}),
      runtimeContract: {
        mode: "user-managed-runtime",
        status: "active",
        runtime: "llama.cpp llama-server",
        runtimeCacheRoot: ".ambient/vision/minicpm-v/runtime",
        modelCacheRoots: ["/path/to/user/Library/Caches/llama.cpp"],
        modelAssets: ["openbmb/MiniCPM-V-4_5-gguf:q4_k_m"],
        installPlan: ["Use a user-managed llama-server binary."],
        preflight: [
          {
            id: "runtime-binary-present",
            label: "llama-server binary",
            status: "failed",
            detail: "llama-server was not found",
          },
        ],
        ambientManagedDownload: {
          status: "planned",
          cacheRoot: ".ambient/vision/minicpm-v/runtime",
          requirements: ["Pinned manifest"],
          blockers: ["macOS signing policy is pending."],
          manifestVerification: {
            schemaVersion: "ambient-minicpm-v-runtime-release-manifest-v1",
            manifestId: "minicpm-v-llamacpp-runtime-pinned-b9122-2026-05-12",
            status: "blocked",
            downloadEnabled: true,
            checksumAlgorithm: "sha256",
            selectedArtifactId: "llama-cpp-macos-arm64-metal",
            requiredArtifactFields: ["sourceUrl", "archiveSha256", "binaryRelativePath"],
            artifacts: [{
              id: "llama-cpp-macos-arm64-metal",
              platform: "darwin",
              arch: "arm64",
              lane: "macos-arm64-metal",
              supportTier: "conditional",
              acceleration: "metal",
              defaultDownloadEnabled: true,
              releaseTag: "b9122",
              sourceUrl: "https://github.com/ggml-org/llama.cpp/releases/download/b9122/llama-b9122-bin-macos-arm64.tar.gz",
              archiveName: "llama-b9122-bin-macos-arm64.tar.gz",
              archiveFormat: "tar.gz",
              archiveSha256: "ba89bf2de1275b22d3d24e2fdb34500062b05371cbeb1e8cd6052a918b392de3",
              binaryRelativePath: "llama-b9122/llama-server",
              expectedBinaryNames: ["llama-server"],
              cacheSubdir: "b9122/macos-arm64-metal",
              license: "MIT",
              pinStatus: "pinned",
              smokeRequirements: ["Start/status/analyze/stop."],
            }],
            checks: [
              {
                id: "artifact-checksum-pin",
                label: "Artifact checksum pin",
                status: "passed",
                detail: "Pinned release checksums are present.",
              },
            ],
            blockers: ["macOS signing policy is pending."],
          },
        },
      },
      diagnostics: status === "uninstalled" || status === "stopped"
        ? []
        : [
            {
              code: "missing-runtime-binary",
              severity: "warning",
              title: "MiniCPM-V runtime missing",
              detail: "llama-server was not found",
              nextAction: "Install llama.cpp and run Repair.",
            },
          ],
      ...(status === "uninstalled"
        ? {
            cleanup: {
              stopStatus: "stopped",
              packageStatus: "uninstalled",
              paths: [{ path: ".ambient/vision/minicpm-v/state", status: "removed" }],
              preserved: ["User-managed llama-server binaries are never removed."],
            },
          }
        : {}),
    },
    diagnostics: status === "uninstalled" || status === "stopped"
      ? []
      : [
          {
            code: "missing-runtime-binary",
            severity: "warning",
            title: "MiniCPM-V runtime missing",
            detail: "llama-server was not found",
            nextAction: "Install llama.cpp and run Repair.",
          },
        ],
    ...(status === "uninstalled"
      ? {
          cleanup: {
            stopStatus: "stopped",
            packageStatus: "uninstalled",
            paths: [{ path: ".ambient/vision/minicpm-v/state", status: "removed" }],
            preserved: ["User-managed llama-server binaries are never removed."],
          },
        }
      : {}),
    nextSteps: status === "uninstalled"
      ? ["Run Install to add the provider again."]
      : status === "stopped"
        ? ["Run Validate to restart or verify the runtime."]
        : ["Run Repair after installing llama-server."],
  };
}
