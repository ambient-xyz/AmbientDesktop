import { describe, expect, it } from "vitest";

import {
  localDeepResearchStatusCheckingState,
  localDeepResearchStatusErrorState,
  localDeepResearchStatusResultState,
} from "./AppLocalDeepResearchLifecycle";
import type {
  LocalDeepResearchSetupResult,
} from "./localDeepResearchUiModel";
import type {
  LocalDeepResearchSetupUiState,
} from "./RightPanel";

describe("AppLocalDeepResearchLifecycle", () => {
  it("starts a status check without replacing an already running setup action", () => {
    const running: LocalDeepResearchSetupUiState = {
      status: "running",
      action: "install",
      message: "Installing Local Deep Research...",
    };

    expect(localDeepResearchStatusCheckingState(running)).toBe(running);
    expect(localDeepResearchStatusCheckingState({ status: "success" })).toEqual({
      status: "running",
      action: "status",
      message: "Checking Local Deep Research...",
    });
  });

  it("maps status results and preserves status-progress continuity only for status checks", () => {
    const progress = {
      schemaVersion: "ambient-local-deep-research-install-progress-v1",
      action: "install",
      component: "runtime",
      phase: "runtime-install-started",
      status: "running",
      message: "Checking runtime...",
      recordedAt: "2026-06-13T00:00:00.000Z",
    } satisfies NonNullable<LocalDeepResearchSetupUiState["progress"]>;
    const ready = localDeepResearchStatusResultState(setupResult({ setupStatus: "ready" }), {
      status: "running",
      action: "status",
      progress,
    });
    const blocked = localDeepResearchStatusResultState(setupResult({ setupStatus: "blocked" }), {
      status: "running",
      action: "install",
      progress,
    });

    expect(ready).toMatchObject({
      status: "success",
      action: "status",
      message: "Local Deep Research ready",
      progress,
    });
    expect(blocked).toMatchObject({
      status: "error",
      action: "status",
      message: "Local Deep Research blocked",
      progress: undefined,
    });
  });

  it("maps status bootstrap failures without adding setup diagnostics", () => {
    expect(localDeepResearchStatusErrorState(new Error("status failed"))).toEqual({
      status: "error",
      action: "status",
      message: "status failed",
    });
    expect(localDeepResearchStatusErrorState("offline")).toEqual({
      status: "error",
      action: "status",
      message: "offline",
    });
  });
});

function setupResult(input: {
  setupStatus?: LocalDeepResearchSetupResult["setupStatus"];
} = {}): LocalDeepResearchSetupResult {
  const setupStatus = input.setupStatus ?? "ready";
  const ready = setupStatus === "ready";
  return {
    action: "status",
    setupStatus,
    modelSelection: {
      profile: {
        id: "lite-researcher-4b-q4",
        displayName: "LiteResearcher-4B Q4_K_M",
        filename: "LiteResearcher-4B.Q4_K_M.gguf",
        quantization: "Q4_K_M",
        sizeBytes: 2_716_069_088,
      },
      memoryTier: "standard",
      contextMode: "target-16k",
      contextTokens: 16384,
      q8OverrideDecision: "not-requested",
      warnings: [],
      blockers: [],
      rationale: ["24-64 GiB hosts use Q4 with the 16k target by default."],
    },
    modelInstall: {
      status: ready ? "installed" : "missing",
      selectedProfileId: "lite-researcher-4b-q4",
      filename: "LiteResearcher-4B.Q4_K_M.gguf",
      sourceUrl: "https://example.test/LiteResearcher-4B.Q4_K_M.gguf",
      sizeBytes: 2_716_069_088,
      sha256: "ff1ed3bcd8a04cb5dc6f9eea3d89823035fbc099eb2061a0bbf99ec253f605d8",
      contextTokens: 16384,
    },
    llamaRuntime: {
      status: ready ? "ready" : "blocked",
      source: "shared-llama-cpp-runtime",
      manifestId: "ambient-llama-cpp-runtime-v1",
      selectedArtifactId: "llama-cpp-darwin-arm64-metal",
      verification: {
        status: ready ? "passed" : "blocked",
        selectedArtifactId: "llama-cpp-darwin-arm64-metal",
      },
    },
    providerSnapshot: {
      capturedAt: "2026-06-13T00:00:00.000Z",
      searchOrder: ["exa"],
      fetchOrder: ["scrapling"],
      skippedSearchProviders: [],
      skippedFetchProviders: [],
      fallbackPolicy: {
        allowBrowserFallback: true,
      },
    },
    managedAssets: {
      managedRoot: "/workspace/.ambient",
      model: {
        status: ready ? "present" : "missing",
        profileId: "lite-researcher-4b-q4",
        filename: "LiteResearcher-4B.Q4_K_M.gguf",
        verification: ready ? "size-matched" : "not-run",
      },
      runtime: {
        status: ready ? "present" : "missing",
        source: "shared-llama-cpp-runtime",
        manifestId: "ambient-llama-cpp-runtime-v1",
        artifactId: "llama-cpp-darwin-arm64-metal",
        verification: ready ? "binary-present" : "binary-missing",
      },
      warnings: [],
    },
    warnings: [],
    blockers: ready ? [] : ["Runtime is blocked."],
    nextActions: ready ? [] : ["Resolve runtime blockers."],
  };
}
