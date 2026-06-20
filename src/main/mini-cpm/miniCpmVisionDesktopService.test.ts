import { describe, expect, it, vi } from "vitest";
import type {
  MiniCpmVisionAnalysisResult,
  MiniCpmVisionAnalyzeInput,
  MiniCpmVisionSetupInput,
  MiniCpmVisionSetupResult,
} from "../../shared/localRuntimeTypes";
import { createMiniCpmVisionDesktopService } from "./miniCpmVisionDesktopService";

describe("MiniCPM vision desktop service", () => {
  it("uses the explicit workspace for setup and preserves default provider options outside E2E", async () => {
    const setupMiniCpmVisionProvider = vi.fn(async (): Promise<MiniCpmVisionSetupResult> => setupResult());
    const service = createMiniCpmVisionDesktopService({
      activeWorkspacePath: () => "/workspace/active",
      env: {},
      setupMiniCpmVisionProvider,
    });
    const input: MiniCpmVisionSetupInput = { provider: "minicpm-v", action: "validate" };

    await expect(service.setupMiniCpmVision(input, "/workspace/explicit")).resolves.toEqual(setupResult());

    expect(setupMiniCpmVisionProvider).toHaveBeenCalledWith("/workspace/explicit", input, {});
  });

  it("falls back to the active workspace for setup", async () => {
    const setupMiniCpmVisionProvider = vi.fn(async (): Promise<MiniCpmVisionSetupResult> => setupResult());
    const service = createMiniCpmVisionDesktopService({
      activeWorkspacePath: () => "/workspace/active",
      env: {},
      setupMiniCpmVisionProvider,
    });

    await service.setupMiniCpmVision({ provider: "minicpm-v" });

    expect(setupMiniCpmVisionProvider).toHaveBeenCalledWith("/workspace/active", { provider: "minicpm-v" }, {});
  });

  it("passes E2E runtime auto-detect override into setup and analysis", async () => {
    const setupMiniCpmVisionProvider = vi.fn(async (): Promise<MiniCpmVisionSetupResult> => setupResult());
    const analyzeMiniCpmVisionInput = vi.fn(async (): Promise<MiniCpmVisionAnalysisResult> => analysisResult());
    const service = createMiniCpmVisionDesktopService({
      activeWorkspacePath: () => "/workspace/active",
      env: {
        AMBIENT_E2E: "1",
        AMBIENT_E2E_MINICPM_DISABLE_RUNTIME_AUTODETECT: "1",
      },
      setupMiniCpmVisionProvider,
      analyzeMiniCpmVisionInput,
    });
    const setupInput: MiniCpmVisionSetupInput = { provider: "minicpm-v" };
    const analyzeInput: MiniCpmVisionAnalyzeInput = {
      image: { path: "screenshots/ui.png", source: "workspace_file" },
    };

    await service.setupMiniCpmVision(setupInput);
    await service.analyzeMiniCpmVision(analyzeInput, "/workspace/analysis");

    expect(setupMiniCpmVisionProvider).toHaveBeenCalledWith("/workspace/active", setupInput, {
      disableRuntimeAutoDetect: true,
    });
    expect(analyzeMiniCpmVisionInput).toHaveBeenCalledWith("/workspace/analysis", analyzeInput, {
      disableRuntimeAutoDetect: true,
    });
  });
});

function setupResult(): MiniCpmVisionSetupResult {
  return {
    provider: "minicpm-v",
    action: "validate",
    status: "ready",
    packageName: "ambient-minicpm-v-vision",
    installStatuses: [],
    runtimeCandidates: [],
    validation: {
      schemaVersion: "ambient-minicpm-v-provider-validation-v1",
      provider: "minicpm-v",
      packageName: "ambient-minicpm-v-vision",
      status: "passed",
      updatedAt: "2026-06-20T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      lane: "native",
      missingHints: [],
    },
    diagnostics: [],
    nextSteps: [],
  };
}

function analysisResult(): MiniCpmVisionAnalysisResult {
  return {
    provider: "minicpm-v",
    packageName: "ambient-minicpm-v-vision",
    status: "passed",
    task: "ui_review",
    prompt: "Review this UI.",
    durationMs: 25,
    summary: "Looks usable.",
    observations: [],
    limitations: [],
    image: {
      path: "/workspace/analysis/screenshots/ui.png",
      basename: "ui.png",
      bytes: 128,
      sha256: "sha",
      role: "primary",
      source: "workspace_file",
    },
    artifacts: {
      jsonPath: "artifacts/minicpm-analysis.json",
    },
    installStatuses: [],
    commands: [],
    validation: {
      valid: true,
      errors: [],
    },
    redaction: {
      returnedImagePathIsWorkspaceRelative: true,
      stdoutDoesNotContainAbsoluteImagePath: true,
      artifactPathIsWorkspaceRelative: true,
    },
  };
}
