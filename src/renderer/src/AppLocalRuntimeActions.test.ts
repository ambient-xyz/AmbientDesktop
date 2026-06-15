import type { Dispatch, SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  LocalDeepResearchRunHistoryResult,
  MiniCpmVisionSetupResult,
} from "../../shared/types";
import type {
  LocalDeepResearchRunHistoryUiState,
  LocalDeepResearchSetupUiState,
  MiniCpmVisionSetupUiState,
} from "./RightPanel";
import type { LocalDeepResearchSetupResult } from "./localDeepResearchUiModel";
import {
  createAppLocalRuntimeActions,
  localDeepResearchSetupRunningMessage,
  miniCpmVisionSetupInputForSettings,
  miniCpmVisionSetupRunningMessage,
} from "./AppLocalRuntimeActions";

describe("App local runtime actions", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps setup running copy and MiniCPM-V settings payload shaping stable", () => {
    expect(miniCpmVisionSetupRunningMessage("install")).toBe("Installing MiniCPM-V...");
    expect(miniCpmVisionSetupRunningMessage("stop")).toBe("Stopping MiniCPM-V runtime...");
    expect(localDeepResearchSetupRunningMessage("status")).toBe("Checking Local Deep Research...");
    expect(localDeepResearchSetupRunningMessage("smoke")).toBe("Running Local Deep Research smoke...");

    expect(miniCpmVisionSetupInputForSettings({
      action: "install",
      endpointUrl: " http://127.0.0.1:8080 ",
      runtimePath: " /usr/local/bin/llama-server ",
    })).toEqual({
      provider: "minicpm-v",
      action: "install",
      installRuntime: false,
      endpointUrl: "http://127.0.0.1:8080",
    });
    expect(miniCpmVisionSetupInputForSettings({
      action: "install",
      endpointUrl: "",
      runtimePath: "",
    })).toMatchObject({
      provider: "minicpm-v",
      action: "install",
      installRuntime: true,
    });
    expect(miniCpmVisionSetupInputForSettings({
      action: "validate",
      endpointUrl: "",
      runtimePath: "/opt/llama-server",
    })).toEqual({
      provider: "minicpm-v",
      action: "validate",
      installRuntime: false,
      runtimeBinaryPath: "/opt/llama-server",
    });
  });

  it("sets MiniCPM-V running and success states around the Desktop setup call", async () => {
    const result = miniCpmSetupResult();
    const setupMiniCpmVisionProvider = vi.fn(async () => result);
    vi.stubGlobal("window", { ambientDesktop: { setupMiniCpmVisionProvider } });
    const controller = createController({
      miniCpmVisionEndpointUrl: " http://127.0.0.1:8080 ",
      miniCpmVisionRuntimePath: "/ignored/when/endpoint",
    });

    await controller.actions.setupMiniCpmVisionProviderFromSettings("install");

    expect(setupMiniCpmVisionProvider).toHaveBeenCalledWith({
      provider: "minicpm-v",
      action: "install",
      installRuntime: false,
      endpointUrl: "http://127.0.0.1:8080",
    });
    expect(controller.miniCpmVisionSetup.calls[0]).toEqual({
      status: "running",
      action: "install",
      message: "Installing MiniCPM-V...",
    });
    expect(controller.miniCpmVisionSetup.value).toMatchObject({
      status: "success",
      action: "install",
      message: "MiniCPM-V validated",
      result,
    });
  });

  it("sets MiniCPM-V error diagnostics when setup fails", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        setupMiniCpmVisionProvider: vi.fn(async () => {
          throw new Error("llama-server did not become healthy within 180000 ms");
        }),
      },
    });
    const controller = createController();

    await controller.actions.setupMiniCpmVisionProviderFromSettings("repair");

    expect(controller.miniCpmVisionSetup.value.status).toBe("error");
    expect(controller.miniCpmVisionSetup.value.message).toBe("llama-server did not become healthy within 180000 ms");
    expect(controller.miniCpmVisionSetup.value.diagnostics?.map((item) => item.code)).toContain("timeout-or-stall");
  });

  it("passes Local Deep Research Q8 override and preserves matching progress after async setup updates", async () => {
    const deferred = deferredValue<LocalDeepResearchSetupResult>();
    const setupLocalDeepResearch = vi.fn(() => deferred.promise);
    vi.stubGlobal("window", { ambientDesktop: { setupLocalDeepResearch } });
    const controller = createController({ localDeepResearchQ8Override: true });

    const promise = controller.actions.setupLocalDeepResearchFromSettings("install");
    expect(controller.localDeepResearchSetup.value).toEqual({
      status: "running",
      action: "install",
      message: "Installing Local Deep Research...",
    });

    const progress = {
      schemaVersion: "ambient-local-deep-research-install-progress-v1",
      action: "install",
      component: "model",
      phase: "model-download-started",
      status: "running",
      message: "Downloading model",
      bytesReceived: 10,
      totalBytes: 20,
      recordedAt: "2026-06-14T00:00:00.000Z",
    } satisfies NonNullable<LocalDeepResearchSetupUiState["progress"]>;
    controller.localDeepResearchSetup.set({
      status: "running",
      action: "install",
      message: "Downloading Local Deep Research...",
      progress,
    });
    deferred.resolve(localDeepResearchSetupResult({ setupStatus: "ready" }));
    await promise;

    expect(setupLocalDeepResearch).toHaveBeenCalledWith({
      action: "install",
      q8Override: true,
    });
    expect(controller.localDeepResearchSetup.value).toMatchObject({
      status: "success",
      action: "install",
      message: "Local Deep Research ready",
      progress,
    });
  });

  it("opens the Local Deep Research follow-up when status is not ready", async () => {
    vi.stubGlobal("window", {
      ambientDesktop: {
        setupLocalDeepResearch: vi.fn(async () => localDeepResearchSetupResult({ setupStatus: "needs-install" })),
      },
    });
    const controller = createController();

    await controller.actions.openLocalDeepResearchFollowupIfSetupNeeded();

    expect(controller.localDeepResearchFollowupOpen.value).toBe(true);
  });

  it("loads Local Deep Research run history success and error states", async () => {
    const history = localDeepResearchRunHistory(2);
    const listLocalDeepResearchRuns = vi.fn(async () => history);
    vi.stubGlobal("window", { ambientDesktop: { listLocalDeepResearchRuns } });
    const controller = createController();

    await controller.actions.loadLocalDeepResearchRunHistory();

    expect(listLocalDeepResearchRuns).toHaveBeenCalledWith({ limit: 8 });
    expect(controller.localDeepResearchRunHistory.calls[0]).toEqual({
      status: "loading",
      message: "Loading Local Deep Research runs...",
    });
    expect(controller.localDeepResearchRunHistory.value).toEqual({
      status: "success",
      message: "2 Local Deep Research runs found",
      result: history,
    });

    vi.stubGlobal("window", {
      ambientDesktop: {
        listLocalDeepResearchRuns: vi.fn(async () => {
          throw new Error("history failed");
        }),
      },
    });
    const errorController = createController();

    await errorController.actions.loadLocalDeepResearchRunHistory();

    expect(errorController.localDeepResearchRunHistory.value).toEqual({
      status: "error",
      message: "history failed",
    });
  });
});

function createController({
  localDeepResearchQ8Override = false,
  miniCpmVisionEndpointUrl = "",
  miniCpmVisionRuntimePath = "",
}: {
  localDeepResearchQ8Override?: boolean;
  miniCpmVisionEndpointUrl?: string;
  miniCpmVisionRuntimePath?: string;
} = {}) {
  const localDeepResearchFollowupOpen = statefulSetter(false);
  const localDeepResearchRunHistory = statefulSetter<LocalDeepResearchRunHistoryUiState>({ status: "idle" });
  const localDeepResearchSetup = statefulSetter<LocalDeepResearchSetupUiState>({ status: "idle" });
  const miniCpmVisionSetup = statefulSetter<MiniCpmVisionSetupUiState>({ status: "idle" });
  const actions = createAppLocalRuntimeActions({
    localDeepResearchQ8Override,
    miniCpmVisionEndpointUrl,
    miniCpmVisionRuntimePath,
    setLocalDeepResearchFollowupOpen: localDeepResearchFollowupOpen.set,
    setLocalDeepResearchRunHistory: localDeepResearchRunHistory.set,
    setLocalDeepResearchSetup: localDeepResearchSetup.set,
    setMiniCpmVisionSetup: miniCpmVisionSetup.set,
  });
  return {
    actions,
    localDeepResearchFollowupOpen,
    localDeepResearchRunHistory,
    localDeepResearchSetup,
    miniCpmVisionSetup,
  };
}

function miniCpmSetupResult(overrides: Partial<MiniCpmVisionSetupResult> = {}): MiniCpmVisionSetupResult {
  return {
    provider: "minicpm-v",
    action: "install",
    status: "ready",
    packageName: "minicpm-v",
    installStatuses: [
      {
        packageName: "minicpm-v",
        source: "managed",
        status: "installed",
      },
    ],
    runtimeCandidates: [],
    validation: {
      schemaVersion: "ambient-minicpm-v-provider-validation-v1",
      provider: "minicpm-v",
      packageName: "minicpm-v",
      status: "passed",
      updatedAt: "2026-06-14T00:00:00.000Z",
      platform: "darwin",
      arch: "arm64",
      lane: "settings",
      missingHints: [],
    },
    diagnostics: [],
    nextSteps: [],
    ...overrides,
  };
}

function localDeepResearchSetupResult(
  overrides: Partial<LocalDeepResearchSetupResult> = {},
): LocalDeepResearchSetupResult {
  return {
    action: "status",
    setupStatus: "ready",
    modelSelection: {
      profile: {
        id: "literesearcher-4b-q4-k-m",
        displayName: "LiteResearcher 4B",
        filename: "literesearcher.gguf",
        quantization: "Q4_K_M",
        role: "everyday",
        sourceUrl: "https://example.com/model.gguf",
        sizeBytes: 1_000,
        estimatedResidentMemoryBytes: {
          safe8k: 2_000,
          target16k: 3_000,
        },
      },
      memoryTier: "standard",
      contextMode: "safe-8k",
      contextTokens: 8192,
      q8OverrideDecision: "not-requested",
      warnings: [],
      blockers: [],
      rationale: [],
    },
    modelInstall: {
      status: "installed",
      selectedProfileId: "literesearcher-4b-q4-k-m",
      filename: "literesearcher.gguf",
      sourceUrl: "https://example.com/model.gguf",
      sizeBytes: 1_000,
      sha256: "sha",
      contextTokens: 8192,
    },
    llamaRuntime: {
      status: "ready",
      source: "ambient-managed",
      manifestId: "llama",
    },
    providerSnapshot: {
      capturedAt: "2026-06-14T00:00:00.000Z",
      searchOrder: ["local"],
      fetchOrder: ["local"],
      skippedSearchProviders: [],
      skippedFetchProviders: [],
      fallbackPolicy: {
        allowBrowserFallback: false,
      },
    },
    warnings: [],
    blockers: [],
    nextActions: [],
    ...overrides,
  } as unknown as LocalDeepResearchSetupResult;
}

function localDeepResearchRunHistory(count: number): LocalDeepResearchRunHistoryResult {
  return {
    schemaVersion: "ambient-local-deep-research-run-history-v1",
    runsRootPath: "/runs",
    entries: Array.from({ length: count }, (_, index) => ({
      id: `run-${index + 1}`,
      createdAt: "2026-06-14T00:00:00.000Z",
      status: "completed",
      question: `Question ${index + 1}`,
      toolCallCount: 3,
      jsonPath: `/runs/run-${index + 1}.json`,
      jsonBytes: 1200,
    })),
    truncated: false,
  };
}

function deferredValue<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function statefulSetter<T>(initial: T): {
  calls: T[];
  set: Dispatch<SetStateAction<T>>;
  value: T;
} {
  const state = {
    calls: [] as T[],
    value: initial,
  };
  const set: Dispatch<SetStateAction<T>> = (next) => {
    state.value = typeof next === "function" ? (next as (current: T) => T)(state.value) : next;
    state.calls.push(state.value);
  };
  return {
    get calls() {
      return state.calls;
    },
    set,
    get value() {
      return state.value;
    },
  };
}
