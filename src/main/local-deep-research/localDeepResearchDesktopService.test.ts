import { describe, expect, it, vi } from "vitest";
import type { DesktopEvent } from "../../shared/desktopTypes";
import type {
  LocalDeepResearchInstallProgress,
  LocalDeepResearchRunHistoryResult,
  LocalDeepResearchSmokeResult,
  LocalDeepResearchValidationResult,
  LocalModelHostMemorySnapshot,
  LocalModelResourcePolicyDecision,
} from "../../shared/localRuntimeTypes";
import { normalizeLocalDeepResearchAppSettings } from "../desktop-shell/appAppearanceDefaultPreferences";
import type { LocalLlamaResidentProcess } from "./localDeepResearchLocalLlamaFacade";
import type { LocalModelRuntimeStatusSnapshot } from "./localDeepResearchLocalRuntimeFacade";
import type { LocalDeepResearchManagedAssetDetection } from "./localDeepResearchManagedAssets";
import type { LocalDeepResearchInstallJobRecord, LocalDeepResearchInstallServiceResult } from "./localDeepResearchInstallService";
import {
  buildLocalDeepResearchSetupContract,
  type LocalDeepResearchSetupInput,
} from "./localDeepResearchSetup";
import {
  createLocalDeepResearchDesktopService,
  formatLocalModelResourceBytes,
  localModelResourceLimitMessageBoxOptions,
  type LocalDeepResearchDesktopServiceImplementations,
} from "./localDeepResearchDesktopService";

function createHarness(input: {
  showMessageBoxResponse?: number;
  residentProcesses?: LocalLlamaResidentProcess[];
} = {}) {
  const emittedEvents: DesktopEvent[] = [];
  const showMessageBox = vi.fn(async () => ({ response: input.showMessageBoxResponse ?? 0 }));
  const detectManagedAssets = vi.fn(async () => managedAssets("present"));
  const buildRuntimeStatus = vi.fn(async () => runtimeStatusSnapshot());
  const buildSetupContract = vi.fn((setupInput: LocalDeepResearchSetupInput) =>
    buildLocalDeepResearchSetupContract({
      ...setupInput,
      now: () => new Date("2026-06-19T00:00:00.000Z"),
    }),
  );
  const installLocalDeepResearchManagedAssets = vi.fn(async (installInput) => {
    installInput.onProgress?.(installProgress("model-download-started"));
    return installResult();
  });
  const validateLocalDeepResearchSetup = vi.fn(async () => validationResult());
  const runLocalDeepResearchRealAssetSmoke = vi.fn(async (smokeInput) => {
    await smokeInput.approveResourceLimitExceed?.(resourceDecision());
    return smokeResult();
  });
  const listLocalDeepResearchRunHistory = vi.fn(async () => runHistoryResult());
  const implementations: Partial<LocalDeepResearchDesktopServiceImplementations> = {
    buildLocalDeepResearchSetupContract: buildSetupContract,
    buildLocalModelRuntimeStatusSnapshot: buildRuntimeStatus,
    detectLocalDeepResearchManagedAssets: detectManagedAssets,
    detectLocalLlamaResidentProcesses: vi.fn(async () => input.residentProcesses ?? [
      residentProcess({ id: "local-text-1", estimatedResidentMemoryBytes: 1024 }),
      residentProcess({ id: "local-text-2", estimatedResidentMemoryBytes: 2048 }),
    ]),
    installLocalDeepResearchManagedAssets,
    listLocalDeepResearchRunHistory,
    localDeepResearchInstallJobWarnings: vi.fn(() => ["Previous install was interrupted."]),
    reconcileLocalDeepResearchInstallJob: vi.fn(async (): Promise<LocalDeepResearchInstallJobRecord> => ({
      schemaVersion: "ambient-local-deep-research-install-job-v1",
      jobId: "job-1",
      action: "install",
      status: "interrupted",
      processId: 123,
      workspacePath: "/workspace/project",
      startedAt: "2026-06-19T00:00:00.000Z",
      updatedAt: "2026-06-19T00:00:00.000Z",
      profileId: "literesearcher-4b-q4-k-m",
      filename: "model.gguf",
      nextActions: [],
    })),
    runLocalDeepResearchRealAssetSmoke,
    sampleLocalModelHostMemorySnapshot: vi.fn((): LocalModelHostMemorySnapshot => ({
      schemaVersion: "ambient-local-model-host-memory-v1",
      sampledAt: "2026-06-19T00:00:00.000Z",
      totalMemoryBytes: 64 * 1024 ** 3,
      freeMemoryBytes: 32 * 1024 ** 3,
    })),
    validateLocalDeepResearchSetup,
    webResearchSettingsWithDynamicProviderCatalogs: vi.fn((settings) => settings ?? {}),
  };
  const service = createLocalDeepResearchDesktopService({
    activeWorkspacePath: () => "/workspace/project",
    discoverAmbientCliCatalog: vi.fn(async () => ({ packages: [], errors: [] })),
    discoverWebResearchMcpProviderTools: vi.fn(async () => []),
    emitDesktopEvent: (event) => emittedEvents.push(event),
    getLocalDeepResearchSettings: () => normalizeLocalDeepResearchAppSettings(undefined),
    getSearchRoutingSettings: () => ({}),
    listEmbeddingProvidersForSettings: vi.fn(async () => []),
    listVoiceProvidersWithCachedVoices: vi.fn(async () => []),
    showMessageBox,
    implementations,
  });
  return {
    buildRuntimeStatus,
    buildSetupContract,
    detectManagedAssets,
    emittedEvents,
    implementations,
    installLocalDeepResearchManagedAssets,
    listLocalDeepResearchRunHistory,
    runLocalDeepResearchRealAssetSmoke,
    service,
    showMessageBox,
    validateLocalDeepResearchSetup,
  };
}

describe("createLocalDeepResearchDesktopService", () => {
  it("assembles readiness with dynamic search settings, resident-process facts, assets, and runtime status", async () => {
    const { buildRuntimeStatus, buildSetupContract, detectManagedAssets, service } = createHarness();

    const readiness = await service.readLocalDeepResearchReadinessForSettings("/workspace/project", { q8Override: true });

    expect(readiness.contract.schemaVersion).toBe("ambient-local-deep-research-setup-contract-v1");
    expect(buildSetupContract).toHaveBeenCalledWith(expect.objectContaining({
      q8Override: true,
      machineFacts: expect.objectContaining({
        activeLocalModelCount: 2,
        activeLocalModelEstimatedResidentMemoryBytes: 3072,
      }),
    }));
    expect(detectManagedAssets).toHaveBeenCalledWith("/workspace/project", {
      selectedProfileId: expect.stringMatching(/^literesearcher-4b-/),
    });
    expect(buildRuntimeStatus).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: "/workspace/project",
      residentProcesses: expect.arrayContaining([
        expect.objectContaining({ id: "local-text-1" }),
        expect.objectContaining({ id: "local-text-2" }),
      ]),
      requestedLaunch: expect.objectContaining({
        capability: "local-deep-research",
        id: expect.stringContaining("local-deep-research:literesearcher"),
      }),
    }));
    expect(buildSetupContract).toHaveBeenLastCalledWith(expect.objectContaining({
      assetWarnings: expect.arrayContaining([
        "Managed assets are ready.",
        "Previous install was interrupted.",
      ]),
      modelInstallState: "installed",
      runtimeInstalled: true,
    }));
  });

  it("runs install/repair through readiness, emits progress and setup-updated events, and returns install result", async () => {
    const { emittedEvents, installLocalDeepResearchManagedAssets, service } = createHarness();

    await expect(service.setupLocalDeepResearch({
      action: "install",
      installModel: true,
      installRuntime: false,
      runtimeArtifactId: "runtime-darwin-arm64",
    })).resolves.toMatchObject({
      action: "install",
      installResult: { status: "installed" },
    });

    expect(installLocalDeepResearchManagedAssets).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: "/workspace/project",
      action: "install",
      installModel: true,
      installRuntime: false,
      runtimeArtifactId: "runtime-darwin-arm64",
    }));
    expect(emittedEvents).toEqual([
      expect.objectContaining({
        type: "local-deep-research-install-progress",
        workspacePath: "/workspace/project",
        progress: expect.objectContaining({ phase: "model-download-started" }),
      }),
      expect.objectContaining({
        type: "local-deep-research-setup-updated",
        workspacePath: "/workspace/project",
        result: expect.objectContaining({ action: "install" }),
      }),
    ]);
  });

  it("runs validation and smoke actions without install and wires resource approval through the message box", async () => {
    const {
      emittedEvents,
      runLocalDeepResearchRealAssetSmoke,
      service,
      showMessageBox,
      validateLocalDeepResearchSetup,
    } = createHarness();

    await expect(service.setupLocalDeepResearch({ action: "validate" })).resolves.toMatchObject({
      action: "validate",
      validation: { status: "passed" },
    });
    await expect(service.setupLocalDeepResearch({ action: "smoke" })).resolves.toMatchObject({
      action: "smoke",
      smoke: { status: "passed" },
    });

    expect(validateLocalDeepResearchSetup).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: "/workspace/project",
      setup: expect.objectContaining({ schemaVersion: "ambient-local-deep-research-setup-contract-v1" }),
      managedAssets: expect.objectContaining({ schemaVersion: "ambient-local-deep-research-managed-assets-v1" }),
    }));
    expect(runLocalDeepResearchRealAssetSmoke).toHaveBeenCalledWith(expect.objectContaining({
      workspacePath: "/workspace/project",
      approveResourceLimitExceed: expect.any(Function),
    }));
    expect(showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
      title: "Exceed Local Model Memory Ceiling?",
      detail: expect.stringContaining("Projected resident memory exceeds the configured ceiling by 1.0 GiB."),
    }));
    expect(emittedEvents.filter((event) => event.type === "local-deep-research-setup-updated")).toHaveLength(2);
  });

  it("lists run history from the active workspace by default", async () => {
    const { listLocalDeepResearchRunHistory, service } = createHarness();

    await expect(service.listLocalDeepResearchRunsForSettings({ limit: 5 })).resolves.toEqual(runHistoryResult());
    expect(listLocalDeepResearchRunHistory).toHaveBeenCalledWith("/workspace/project", { limit: 5 });
  });

  it("formats resource-limit confirmation options and byte values", async () => {
    const { service, showMessageBox } = createHarness({ showMessageBoxResponse: 1 });

    expect(formatLocalModelResourceBytes(1024 ** 3)).toBe("1.0 GiB");
    expect(formatLocalModelResourceBytes(512 * 1024 ** 2)).toBe("512 MiB");
    expect(formatLocalModelResourceBytes(-1)).toBe("unknown");
    expect(localModelResourceLimitMessageBoxOptions(resourceDecision())).toMatchObject({
      defaultId: 1,
      cancelId: 1,
      detail: expect.stringContaining("Ceiling: 8.0 GiB."),
    });
    await expect(service.confirmLocalModelResourceLimitExceed(resourceDecision())).resolves.toBe(false);
    expect(showMessageBox).toHaveBeenCalledTimes(1);
  });
});

function managedAssets(status: "present" | "missing"): LocalDeepResearchManagedAssetDetection {
  return {
    schemaVersion: "ambient-local-deep-research-managed-assets-v1",
    managedRoot: "/workspace/project/.ambient",
    model: {
      status,
      profileId: "literesearcher-4b-q4-k-m",
      filename: "model.gguf",
      cachePath: "/workspace/project/.ambient/local-deep-research/models/model.gguf",
      expectedSizeBytes: 1,
      expectedSha256: "sha",
      verification: status === "present" ? "size-matched" : "not-run",
    },
    runtime: {
      status,
      source: "shared-llama-cpp-runtime",
      manifestId: "llama.cpp",
      artifactId: "runtime-darwin-arm64",
      cacheSubdir: "darwin-arm64",
      binaryPath: "/workspace/project/.ambient/vision/minicpm-v/runtime/darwin-arm64/llama-server",
      receiptPath: "/workspace/project/.ambient/vision/minicpm-v/runtime/darwin-arm64/ambient-runtime-install.json",
      verification: status === "present" ? "binary-present" : "binary-missing",
    },
    warnings: ["Managed assets are ready."],
  };
}

function runtimeStatusSnapshot(): LocalModelRuntimeStatusSnapshot {
  return {
    registry: {
      schemaVersion: "ambient-local-model-resource-registry-v1",
      capturedAt: "2026-06-19T00:00:00.000Z",
      settings: {},
      entries: [],
      activeCount: 0,
      activeEstimatedResidentMemoryBytes: 0,
      policyDecision: resourceDecision(),
    },
    inventory: {
      schemaVersion: "ambient-local-runtime-inventory-v1",
      capturedAt: "2026-06-19T00:00:00.000Z",
      entries: [],
      activeLeases: [],
    },
  } as unknown as LocalModelRuntimeStatusSnapshot;
}

function residentProcess(input: Partial<LocalLlamaResidentProcess> = {}): LocalLlamaResidentProcess {
  return {
    capability: "local-text",
    id: "local-text",
    pid: 42,
    running: true,
    statePath: "/workspace/project/.ambient/local-model-runtime/state.json",
    ...input,
  };
}

function installProgress(phase: LocalDeepResearchInstallProgress["phase"]): LocalDeepResearchInstallProgress {
  return {
    schemaVersion: "ambient-local-deep-research-install-progress-v1",
    action: "install",
    component: "model",
    phase,
    status: "running",
    message: "Downloading model.",
    recordedAt: "2026-06-19T00:00:00.000Z",
  };
}

function installResult(): LocalDeepResearchInstallServiceResult {
  return {
    schemaVersion: "ambient-local-deep-research-install-result-v1",
    status: "installed",
    managedAssets: managedAssets("present"),
    nextActions: [],
  };
}

function validationResult(): LocalDeepResearchValidationResult {
  return {
    schemaVersion: "ambient-local-deep-research-validation-v1",
    checkedAt: "2026-06-19T00:00:00.000Z",
    status: "passed",
    setupStatus: "ready",
    modelProfileId: "literesearcher-4b-q4-k-m",
    contextTokens: 8192,
    providerSnapshot: buildLocalDeepResearchSetupContract({ now: () => new Date("2026-06-19T00:00:00.000Z") }).providerSnapshot,
    checks: [],
    artifactPath: ".ambient/local-deep-research/validation.json",
  };
}

function smokeResult(): LocalDeepResearchSmokeResult {
  return {
    schemaVersion: "ambient-local-deep-research-smoke-v1",
    checkedAt: "2026-06-19T00:00:00.000Z",
    status: "passed",
    setupStatus: "ready",
    modelProfileId: "literesearcher-4b-q4-k-m",
    contextTokens: 8192,
    providerSnapshot: buildLocalDeepResearchSetupContract({ now: () => new Date("2026-06-19T00:00:00.000Z") }).providerSnapshot,
    checks: [],
    artifactPath: ".ambient/local-deep-research/smoke.json",
    markdownPath: ".ambient/local-deep-research/smoke.md",
  };
}

function runHistoryResult(): LocalDeepResearchRunHistoryResult {
  return {
    schemaVersion: "ambient-local-deep-research-run-history-v1",
    runsRootPath: "/workspace/project/.ambient/local-deep-research/runs",
    entries: [],
    truncated: false,
  };
}

function resourceDecision(): LocalModelResourcePolicyDecision {
  return {
    outcome: "ask-to-exceed",
    reason: "Projected resident memory exceeds configured ceiling.",
    activeResidentMemoryBasis: "estimated",
    maxResidentMemoryBytes: 8 * 1024 ** 3,
    activeEstimatedResidentMemoryBytes: 6 * 1024 ** 3,
    requestedEstimatedResidentMemoryBytes: 3 * 1024 ** 3,
    projectedEstimatedResidentMemoryBytes: 9 * 1024 ** 3,
    projectedResidentMemoryBytes: 9 * 1024 ** 3,
    exceededByBytes: 1024 ** 3,
    unloadCandidateIds: [],
  };
}
