import { describe, expect, it } from "vitest";
import {
  localDeepResearchInstallProgressModel,
  localDeepResearchQ8OverrideModel,
  localDeepResearchRuntimeInventorySettingsRefreshDecision,
  localDeepResearchSetupActions,
  localDeepResearchSetupResultModel,
  type LocalDeepResearchSetupResult,
} from "./localDeepResearchUiModel";
import type { LocalRuntimeLifecycleDecision } from "../../shared/localRuntimeTypes";

const gib = 1024 ** 3;

describe("localDeepResearchSetupActions", () => {
  it("starts with a read-only status action before setup has been checked", () => {
    expect(localDeepResearchSetupActions()[0]).toMatchObject({
      action: "status",
      primary: true,
    });
    expect(localDeepResearchSetupActions()).toContainEqual(expect.objectContaining({ action: "install" }));
    expect(localDeepResearchSetupActions()).toContainEqual(expect.objectContaining({ action: "validate" }));
  });

  it("makes install the primary action when managed assets are missing", () => {
    expect(localDeepResearchSetupActions(setupResult({ setupStatus: "needs-install" }))[0]).toMatchObject({
      action: "install",
      primary: true,
    });
  });

  it("keeps blocked setups on a re-check first path", () => {
    expect(localDeepResearchSetupActions(setupResult({ setupStatus: "blocked", blockers: ["No search providers enabled."] }))[0]).toMatchObject({
      action: "status",
      primary: true,
    });
  });

  it("makes validation primary when setup is ready", () => {
    const actions = localDeepResearchSetupActions(setupResult({ setupStatus: "ready" }));
    expect(actions[0]).toMatchObject({
      action: "validate",
      primary: true,
    });
    expect(actions).toContainEqual(expect.objectContaining({ action: "smoke" }));
  });
});

describe("localDeepResearchRuntimeInventorySettingsRefreshDecision", () => {
  it("refreshes Local Deep Research status when Settings opens without runtime inventory", () => {
    expect(localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel: "settings",
      workspacePath: "/workspace",
      setupStatus: "success",
      hasRuntimeInventory: false,
    })).toEqual({
      shouldRefresh: true,
      refreshKey: "/workspace:settings:success:missing-runtime-inventory",
    });
  });

  it("does not repeat the same missing-inventory refresh for the same workspace and setup state", () => {
    expect(localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel: "settings",
      workspacePath: "/workspace",
      setupStatus: "success",
      hasRuntimeInventory: false,
      lastRefreshKey: "/workspace:settings:success:missing-runtime-inventory",
    })).toEqual({ shouldRefresh: false, refreshKey: "/workspace:settings:success:missing-runtime-inventory" });
  });

  it("does not refresh before the startup check, while running, or after inventory is available", () => {
    expect(localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel: "settings",
      workspacePath: "/workspace",
      setupStatus: "idle",
      hasRuntimeInventory: false,
    })).toEqual({ shouldRefresh: false });

    expect(localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel: "settings",
      workspacePath: "/workspace",
      setupStatus: "running",
      hasRuntimeInventory: false,
    })).toEqual({ shouldRefresh: false });

    expect(localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel: "settings",
      workspacePath: "/workspace",
      setupStatus: "success",
      hasRuntimeInventory: true,
    })).toEqual({ shouldRefresh: false });
  });

  it("only runs for the Settings panel with a selected workspace", () => {
    expect(localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel: "browser",
      workspacePath: "/workspace",
      setupStatus: "success",
      hasRuntimeInventory: false,
    })).toEqual({ shouldRefresh: false });

    expect(localDeepResearchRuntimeInventorySettingsRefreshDecision({
      panel: "settings",
      setupStatus: "success",
      hasRuntimeInventory: false,
    })).toEqual({ shouldRefresh: false });
  });
});

describe("localDeepResearchSetupResultModel", () => {
  it("summarizes the missing install state with model, runtime, provider, and next-action details", () => {
    const model = localDeepResearchSetupResultModel(setupResult({
      setupStatus: "needs-install",
      modelInstallStatus: "missing",
      runtimeStatus: "needs-install",
      managedModelStatus: "missing",
      managedRuntimeStatus: "missing",
      searchOrder: ["exa", "brave"],
      fetchOrder: ["scrapling", "browser"],
    }));

    expect(model.statusLabel).toBe("Local Deep Research needs install");
    expect(model.statusTone).toBe("warning");
    expect(model.detailLabels).toContain("Model: LiteResearcher-4B Q4_K_M (Q4_K_M), 16,384 tokens");
    expect(model.detailLabels).toContain("Runtime: needs install via shared llama cpp runtime");
    expect(model.detailLabels).toContain("Search route: exa -> brave");
    expect(model.detailLabels).toContain("Fetch route: scrapling -> browser");
    expect(model.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "model-missing", severity: "warning" }),
      expect.objectContaining({ code: "runtime-missing", severity: "warning" }),
    ]));
  });

  it("surfaces runtime inventory ownership and stop blockers in setup details", () => {
    const model = localDeepResearchSetupResultModel(setupResult({
      setupStatus: "ready",
      localRuntimeInventory: {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-05-28T12:10:00.000Z",
        activeLeases: [
          {
            schemaVersion: "ambient-local-runtime-lease-v1",
            leaseId: "lease-review",
            parentThreadId: "parent-thread",
            subagentThreadId: "child-thread",
            ownerDisplayName: "Review worker",
            modelRuntimeId: "local-text-runtime",
            providerId: "local",
            capabilityKind: "local-text",
            estimatedResidentMemoryBytes: 6 * gib,
            acquiredAt: "2026-05-28T12:00:00.000Z",
            lastHeartbeatAt: "2026-05-28T12:09:00.000Z",
            status: "running",
          },
        ],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "local-text-runtime",
            capability: "local-text",
            providerId: "local",
            modelRuntimeId: "local-text-runtime",
            modelId: "local/text",
            trackingStatus: "managed",
            running: true,
            estimatedResidentMemoryBytes: 6 * gib,
            owners: [
              {
                leaseId: "lease-review",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                displayName: "sub-agent Review worker",
                status: "running",
              },
            ],
            leases: [],
            leaseState: {
              activeLeaseIds: ["lease-review"],
              staleLeaseIds: [],
              releasedLeaseIds: [],
              crashedLeaseIds: [],
              inactiveLeaseIds: [],
            },
            lifecycleDecision: lifecycleDecision({
              stopAllowed: false,
              restartAllowed: false,
              stopReason: "In use by sub-agent Review worker.",
              blockerLeaseIds: ["lease-review"],
              affectedSubagents: [{
                leaseId: "lease-review",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                displayName: "sub-agent Review worker",
                status: "running",
                modelId: "local/text",
                capabilityKind: "local-text",
              }],
              forceAllowed: true,
              forceRequiresSubagentCancellation: true,
            }),
            stopDecision: {
              ordinaryStopAllowed: false,
              reason: "In use by sub-agent Review worker.",
              blockerLeaseIds: ["lease-review"],
              affectedSubagents: [{
                leaseId: "lease-review",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                displayName: "sub-agent Review worker",
                status: "running",
                modelId: "local/text",
                capabilityKind: "local-text",
              }],
              forceTerminationAllowed: true,
              forceRequiresSubagentCancellation: true,
              untracked: false,
            },
          },
        ],
      },
    }));

    expect(model.detailLabels).toContain("Local runtime inventory: 1 runtime; 1 running; 1 active lease");
    expect(model.detailLabels).toContain("Local runtime stop policy: In use by sub-agent Review worker.");
    expect(model.statusLabel).toBe("Local Deep Research ready");
    expect(model.statusTone).toBe("success");
    expect(model.diagnostics).toContainEqual(expect.objectContaining({
      code: "local-runtime-stop-blocked",
      severity: "warning",
      title: "Local runtime Stop needs owner action",
      detail: "local-text-runtime: In use by sub-agent Review worker.",
      nextAction: expect.stringContaining("does not block Local Deep Research readiness"),
    }));
  });

  it("models a ready Q8 override as a successful advanced selection with Q4 fallback", () => {
    const model = localDeepResearchSetupResultModel(setupResult({
      setupStatus: "ready",
      profile: q8Profile(),
      fallbackProfile: q4Profile(),
      q8OverrideDecision: "accepted",
      modelInstallStatus: "installed",
      runtimeStatus: "ready",
      managedModelStatus: "present",
      managedRuntimeStatus: "present",
    }));

    expect(model.statusLabel).toBe("Local Deep Research ready");
    expect(model.statusTone).toBe("success");
    expect(model.q8Override).toMatchObject({
      checked: true,
      label: "Q8 override accepted",
      tone: "success",
    });
    expect(model.detailLabels).toContain("Fallback model: LiteResearcher-4B Q4_K_M (Q4_K_M)");
    expect(model.detailLabels).toContain("Runtime artifact: llama-cpp-darwin-arm64-metal");
  });

  it("surfaces blocked setup and skipped providers as diagnostics", () => {
    const model = localDeepResearchSetupResultModel(setupResult({
      setupStatus: "blocked",
      runtimeStatus: "blocked",
      blockers: ["Local Deep Research needs at least one enabled search provider in the Ambient web research stack."],
      skippedSearchProviders: [{ providerId: "exa", reason: "missing secret" }],
      skippedFetchProviders: [{ providerId: "scrapling", reason: "runtime unavailable" }],
      q8OverrideDecision: "rejected",
    }));

    expect(model.statusLabel).toBe("Local Deep Research blocked");
    expect(model.statusTone).toBe("error");
    expect(model.q8Override).toMatchObject({
      checked: false,
      label: "Q8 override rejected",
      tone: "error",
    });
    expect(model.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "setup-blocked", severity: "error" }),
      expect.objectContaining({ code: "runtime-blocked", severity: "error" }),
      expect.objectContaining({ code: "search-provider-skipped", detail: "exa: missing secret" }),
      expect.objectContaining({ code: "fetch-provider-skipped", detail: "scrapling: runtime unavailable" }),
    ]));
  });

  it("keeps provider preference changes visible in the route summary", () => {
    const first = localDeepResearchSetupResultModel(setupResult({
      searchOrder: ["exa", "brave"],
      fetchOrder: ["scrapling", "browser"],
    }));
    const second = localDeepResearchSetupResultModel(setupResult({
      searchOrder: ["brave", "exa"],
      fetchOrder: ["browser", "scrapling"],
    }));

    expect(first.detailLabels).toContain("Search route: exa -> brave");
    expect(first.detailLabels).toContain("Fetch route: scrapling -> browser");
    expect(second.detailLabels).toContain("Search route: brave -> exa");
    expect(second.detailLabels).toContain("Fetch route: browser -> scrapling");
  });

  it("includes validation artifact and failed validation checks in diagnostics", () => {
    const model = localDeepResearchSetupResultModel(setupResult({
      validation: {
        status: "needs-install",
        checkedAt: "2026-05-28T13:00:00.000Z",
        artifactPath: ".ambient/local-deep-research/validation.json",
        memoryTelemetry: {
          status: "recorded",
          capturedAt: "2026-05-28T13:00:00.000Z",
          physicalMemoryClass: "32gb",
          memoryTier: "standard",
          memoryPressure: "normal",
          selectedProfileId: "literesearcher-4b-q4-k-m",
          contextTokens: 16384,
          q8OverrideDecision: "not-requested",
          reservationStatus: "reserved",
          reservationReason: "Q4 fits with required launch headroom.",
          activeLocalModelCount: 0,
          activeLocalModelEstimatedResidentMemoryBytes: 0,
          coverageMissingPhysicalMemoryClasses: ["16gb", "64gb", "128gb-plus"],
          artifactPath: ".ambient/local-deep-research/memory-telemetry/2026-05-28T13-00-00-000Z-32gb-recorded.json",
          markdownPath: ".ambient/local-deep-research/memory-telemetry/2026-05-28T13-00-00-000Z-32gb-recorded.md",
        },
        providerPreferenceSmoke: {
          status: "passed",
          checkedAt: "2026-05-28T13:00:00.000Z",
          checkCount: 5,
          artifactPath: ".ambient/local-deep-research/provider-preference-smoke/2026-05-28T13-00-00-000Z-passed.json",
          markdownPath: ".ambient/local-deep-research/provider-preference-smoke/2026-05-28T13-00-00-000Z-passed.md",
        },
        checks: [
          {
            id: "model-cache",
            title: "LiteResearcher model",
            status: "warning",
            detail: "Selected LiteResearcher GGUF is not present.",
            nextAction: "Install Local Deep Research.",
          },
        ],
      },
    }));

    expect(model.detailLabels).toContain("Validation: needs install at 2026-05-28T13:00:00.000Z");
    expect(model.detailLabels).toContain("Validation artifact: .ambient/local-deep-research/validation.json");
    expect(model.detailLabels).toContain("Memory telemetry: recorded for 32gb at 2026-05-28T13:00:00.000Z");
    expect(model.detailLabels).toContain("Memory telemetry report: .ambient/local-deep-research/memory-telemetry/2026-05-28T13-00-00-000Z-32gb-recorded.md");
    expect(model.detailLabels).toContain("Memory reservation: reserved - Q4 fits with required launch headroom.");
    expect(model.detailLabels).toContain("Memory telemetry still missing: 16gb, 64gb, 128gb-plus");
    expect(model.detailLabels).toContain("Provider preference smoke: passed at 2026-05-28T13:00:00.000Z");
    expect(model.detailLabels).toContain("Provider preference report: .ambient/local-deep-research/provider-preference-smoke/2026-05-28T13-00-00-000Z-passed.md");
    expect(model.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "validation-model-cache",
        severity: "warning",
        detail: "Selected LiteResearcher GGUF is not present.",
      }),
    ]));
  });

  it("includes smoke artifact, response preview, and failed smoke checks in diagnostics", () => {
    const model = localDeepResearchSetupResultModel(setupResult({
      smoke: {
        status: "failed",
        checkedAt: "2026-05-28T14:05:00.000Z",
        artifactPath: ".ambient/local-deep-research/smoke/smoke.json",
        markdownPath: ".ambient/local-deep-research/smoke/smoke.md",
        checks: [
          {
            id: "llama-chat",
            title: "llama.cpp chat completion",
            status: "failed",
            detail: "Local llama-server returned an empty assistant message.",
          },
        ],
        chat: {
          prompt: "Reply with one short sentence containing the exact token LOCAL_DEEP_RESEARCH_SMOKE_OK.",
          response: "empty",
          durationMs: 250,
          requestTimeoutMs: 60000,
        },
        error: "Local llama-server returned an empty assistant message.",
      },
    }));

    expect(model.detailLabels).toContain("Smoke: failed at 2026-05-28T14:05:00.000Z");
    expect(model.detailLabels).toContain("Smoke artifact: .ambient/local-deep-research/smoke/smoke.json");
    expect(model.detailLabels).toContain("Smoke report: .ambient/local-deep-research/smoke/smoke.md");
    expect(model.detailLabels).toContain("Smoke response: empty");
    expect(model.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "smoke-llama-chat",
        severity: "error",
        detail: "Local llama-server returned an empty assistant message.",
      }),
      expect.objectContaining({
        code: "smoke-failed",
        severity: "error",
      }),
    ]));
  });
});

describe("localDeepResearchQ8OverrideModel", () => {
  it("has a neutral automatic state before setup is checked", () => {
    expect(localDeepResearchQ8OverrideModel()).toMatchObject({
      checked: false,
      label: "Automatic Q4/Q8 selection",
      tone: "info",
    });
  });
});

describe("localDeepResearchInstallProgressModel", () => {
  it("summarizes byte-level model download progress", () => {
    expect(localDeepResearchInstallProgressModel({
      action: "install",
      component: "model",
      phase: "model-download-progress",
      status: "running",
      message: "Downloading LiteResearcher-4B.Q4_K_M.gguf.",
      filename: "LiteResearcher-4B.Q4_K_M.gguf",
      bytesReceived: 512 * 1024 ** 2,
      totalBytes: 1024 ** 3,
      recordedAt: "2026-05-28T13:00:00.000Z",
    })).toMatchObject({
      title: "Downloading LiteResearcher-4B.Q4_K_M.gguf.",
      detail: "model · LiteResearcher-4B.Q4_K_M.gguf · 512 MiB of 1.0 GiB · 50%",
      percent: 50,
      tone: "info",
    });
  });
});

function setupResult(input: {
  setupStatus?: LocalDeepResearchSetupResult["setupStatus"];
  profile?: LocalDeepResearchSetupResult["modelSelection"]["profile"];
  fallbackProfile?: LocalDeepResearchSetupResult["modelSelection"]["fallbackProfile"];
  q8OverrideDecision?: LocalDeepResearchSetupResult["modelSelection"]["q8OverrideDecision"];
  modelInstallStatus?: LocalDeepResearchSetupResult["modelInstall"]["status"];
  runtimeStatus?: LocalDeepResearchSetupResult["llamaRuntime"]["status"];
  managedModelStatus?: NonNullable<LocalDeepResearchSetupResult["managedAssets"]>["model"]["status"];
  managedRuntimeStatus?: NonNullable<LocalDeepResearchSetupResult["managedAssets"]>["runtime"]["status"];
  searchOrder?: string[];
  fetchOrder?: string[];
  skippedSearchProviders?: LocalDeepResearchSetupResult["providerSnapshot"]["skippedSearchProviders"];
  skippedFetchProviders?: LocalDeepResearchSetupResult["providerSnapshot"]["skippedFetchProviders"];
  warnings?: string[];
  blockers?: string[];
  nextActions?: string[];
  validation?: LocalDeepResearchSetupResult["validation"];
  smoke?: LocalDeepResearchSetupResult["smoke"];
  localRuntimeInventory?: LocalDeepResearchSetupResult["localRuntimeInventory"];
} = {}): LocalDeepResearchSetupResult {
  const profile = input.profile ?? q4Profile();
  const setupStatus = input.setupStatus ?? "needs-install";
  const runtimeStatus = input.runtimeStatus ?? (setupStatus === "ready" ? "ready" : "needs-install");
  const modelInstallStatus = input.modelInstallStatus ?? (setupStatus === "ready" ? "installed" : "missing");
  const managedModelStatus = input.managedModelStatus ?? (modelInstallStatus === "installed" ? "present" : "missing");
  const managedRuntimeStatus = input.managedRuntimeStatus ?? (runtimeStatus === "ready" ? "present" : "missing");
  return {
    action: "status",
    setupStatus,
    modelSelection: {
      profile,
      ...(input.fallbackProfile ? { fallbackProfile: input.fallbackProfile } : {}),
      memoryTier: profile.quantization === "Q8_0" ? "workstation" : "standard",
      contextMode: "target-16k",
      contextTokens: 16384,
      q8OverrideDecision: input.q8OverrideDecision ?? "not-requested",
      warnings: [],
      blockers: [],
      rationale: ["24-64 GiB hosts use Q4 with the 16k target by default."],
    },
    modelInstall: {
      status: modelInstallStatus,
      selectedProfileId: profile.id,
      filename: profile.filename,
      sourceUrl: `https://huggingface.co/mradermacher/LiteResearcher-4B-GGUF/resolve/revision/${profile.filename}`,
      sizeBytes: profile.sizeBytes ?? 2_716_069_088,
      sha256: "ff1ed3bcd8a04cb5dc6f9eea3d89823035fbc099eb2061a0bbf99ec253f605d8",
      contextTokens: 16384,
    },
    llamaRuntime: {
      status: runtimeStatus,
      source: "shared-llama-cpp-runtime",
      manifestId: "ambient-llama-cpp-runtime-v1",
      selectedArtifactId: "llama-cpp-darwin-arm64-metal",
      verification: {
        status: runtimeStatus === "blocked" ? "blocked" : "passed",
        selectedArtifactId: "llama-cpp-darwin-arm64-metal",
      },
    },
    providerSnapshot: {
      capturedAt: "2026-05-28T00:00:00.000Z",
      searchOrder: input.searchOrder ?? ["exa", "brave"],
      fetchOrder: input.fetchOrder ?? ["scrapling", "browser"],
      skippedSearchProviders: input.skippedSearchProviders ?? [],
      skippedFetchProviders: input.skippedFetchProviders ?? [],
      fallbackPolicy: {
        allowBrowserFallback: true,
      },
    },
    ...(input.localRuntimeInventory ? { localRuntimeInventory: input.localRuntimeInventory } : {}),
    managedAssets: {
      managedRoot: "/workspace/.ambient",
      model: {
        status: managedModelStatus,
        profileId: profile.id,
        filename: profile.filename,
        verification: managedModelStatus === "present" ? "size-matched" : "not-run",
      },
      runtime: {
        status: managedRuntimeStatus,
        source: "shared-llama-cpp-runtime",
        manifestId: "ambient-llama-cpp-runtime-v1",
        artifactId: "llama-cpp-darwin-arm64-metal",
        verification: managedRuntimeStatus === "present" ? "binary-present" : "binary-missing",
      },
      warnings: [],
    },
    ...(input.validation ? { validation: input.validation } : {}),
    ...(input.smoke ? { smoke: input.smoke } : {}),
    warnings: input.warnings ?? [],
    blockers: input.blockers ?? [],
    nextActions: input.nextActions ?? ["Install the selected LiteResearcher GGUF profile into the Ambient Local Deep Research model cache."],
  };
}

function lifecycleDecision(input: {
  stopAllowed: boolean;
  restartAllowed: boolean;
  stopReason: string;
  restartReason?: string;
  blockerLeaseIds?: string[];
  affectedSubagents?: LocalRuntimeLifecycleDecision["stop"]["affectedSubagents"];
  forceAllowed?: boolean;
  forceRequiresSubagentCancellation?: boolean;
  untracked?: boolean;
}): LocalRuntimeLifecycleDecision {
  const blockerLeaseIds = input.blockerLeaseIds ?? [];
  const affectedSubagents = input.affectedSubagents ?? [];
  const forceAllowed = input.forceAllowed ?? input.stopAllowed;
  const forceRequiresSubagentCancellation = input.forceRequiresSubagentCancellation ?? false;
  const untracked = input.untracked ?? false;
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: {
      allowed: input.stopAllowed,
      reason: input.stopReason,
      blockerLeaseIds,
      affectedSubagents,
      forceAllowed,
      forceRequiresSubagentCancellation,
      untracked,
    },
    restart: {
      allowed: input.restartAllowed,
      reason: input.restartReason ?? input.stopReason,
      blockerLeaseIds,
      affectedSubagents,
      forceAllowed,
      forceRequiresSubagentCancellation,
      untracked,
    },
    load: {
      allowed: false,
      reason: "Runtime is already running.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked,
    },
    unload: {
      allowed: input.stopAllowed,
      reason: input.stopAllowed ? "No active sub-agent local runtime lease blocks ordinary Unload." : input.stopReason,
      blockerLeaseIds,
      affectedSubagents,
      forceAllowed,
      forceRequiresSubagentCancellation,
      untracked,
    },
  };
}

function q4Profile(): LocalDeepResearchSetupResult["modelSelection"]["profile"] {
  return {
    id: "literesearcher-4b-q4-k-m",
    displayName: "LiteResearcher-4B Q4_K_M",
    filename: "LiteResearcher-4B.Q4_K_M.gguf",
    quantization: "Q4_K_M",
    sizeBytes: 2_716_069_088,
    estimatedResidentMemoryBytes: {
      safe8k: 5 * gib,
      target16k: 7 * gib,
    },
  };
}

function q8Profile(): LocalDeepResearchSetupResult["modelSelection"]["profile"] {
  return {
    id: "literesearcher-4b-q8-0",
    displayName: "LiteResearcher-4B Q8_0",
    filename: "LiteResearcher-4B.Q8_0.gguf",
    quantization: "Q8_0",
    sizeBytes: 4_693_671_648,
    estimatedResidentMemoryBytes: {
      safe8k: 7 * gib,
      target16k: 10 * gib,
    },
  };
}
