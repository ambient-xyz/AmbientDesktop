import { describe, expect, it } from "vitest";
import { buildLocalDeepResearchSetupContract, buildLocalDeepResearchProviderSnapshot, localDeepResearchSetupContractText } from "./localDeepResearchSetup";
import { normalizeWebResearchProviderStackSettings } from "../webResearchProviderStack";

const gib = 1024 ** 3;
const fixedNow = () => new Date("2026-05-28T12:00:00.000Z");

describe("Local Deep Research setup contract", () => {
  it("builds a needs-install contract with Q4 and default provider snapshot on standard hosts", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    });

    expect(contract).toMatchObject({
      schemaVersion: "ambient-local-deep-research-setup-contract-v1",
      capabilityId: "local.deep-research.literesearcher",
      status: "needs-install",
      modelSelection: {
        memoryTier: "standard",
        contextMode: "target-32k",
        contextTokens: 32768,
        profile: { id: "literesearcher-4b-q4-k-m" },
      },
      modelInstall: {
        status: "missing",
        selectedProfileId: "literesearcher-4b-q4-k-m",
        filename: "LiteResearcher-4B.Q4_K_M.gguf",
        contextTokens: 32768,
      },
      runtime: {
        status: "needs-install",
        source: "shared-llama-cpp-runtime",
        selectedArtifactId: "llama-cpp-macos-arm64-metal",
      },
      installerShape: {
        schemaVersion: "ambient-local-model-installer-shape-v1",
        installerKind: "local-model",
        modelFamily: "LiteResearcher-4B",
        modelProfileId: "literesearcher-4b-q4-k-m",
        quantization: "Q4_K_M",
        runtime: {
          source: "shared-llama-cpp-runtime",
          selectedArtifactId: "llama-cpp-macos-arm64-metal",
          downloadBytes: 8647910,
        },
        disk: {
          modelDownloadBytes: 2716069088,
          runtimeDownloadBytes: 8647910,
          expectedDiskBytes: 2724716998,
          cacheRoots: [
            ".ambient/local-deep-research/models",
            ".ambient/vision/minicpm-v/runtime",
          ],
        },
        memory: {
          memoryTier: "standard",
          contextMode: "target-32k",
          contextTokens: 32768,
          estimatedResidentMemoryBytes: 11 * gib,
          activeLocalModelCount: 0,
          activeLocalModelEstimatedResidentMemoryBytes: 0,
          fit: "selected",
        },
        server: {
          host: "127.0.0.1",
          port: "auto",
          portAllocation: "loopback-auto-on-launch",
          lifecycle: "lease-managed",
          idleTimeoutMs: 300000,
          startsOnActions: ["smoke", "run"],
        },
        confirmation: {
          required: true,
          requiredForActions: ["install", "repair", "smoke"],
        },
        lifecycle: {
          progressEvent: "local-deep-research-install-progress",
          cancellation: {
            supported: true,
            mechanism: "tool-abort-signal",
            resumableDownloads: true,
          },
          logs: {
            installJobRoot: ".ambient/local-deep-research/install-jobs",
            serverStateRoot: ".ambient/local-deep-research/llama-server",
          },
          cleanup: {
            managedModelRoot: ".ambient/local-deep-research/models",
            managedRuntimeRoot: ".ambient/vision/minicpm-v/runtime",
            action: "settings-managed-cleanup",
          },
          smokeTest: {
            setupAction: "smoke",
            queryKind: "tiny-local-chat",
          },
        },
      },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-registry-v1",
        activeCount: 0,
        activeEstimatedResidentMemoryBytes: 0,
        policyDecision: {
          outcome: "unlimited",
          requestedEstimatedResidentMemoryBytes: 11 * gib,
          projectedEstimatedResidentMemoryBytes: 11 * gib,
        },
      },
      providerSnapshot: {
        capturedAt: "2026-05-28T12:00:00.000Z",
        searchOrder: ["exa-mcp-default", "ambient-browser"],
        fetchOrder: ["scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
      },
    });
    expect(contract.nextActions).toEqual(expect.arrayContaining([
      expect.stringContaining("Install the selected LiteResearcher GGUF profile"),
      expect.stringContaining("Install or validate the shared Ambient-managed llama.cpp runtime"),
    ]));
    expect(contract.blockers).toEqual([]);
  });

  it("reports ready when runtime and selected model are already installed", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      modelInstallState: "installed",
      runtimeInstalled: true,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 64 * gib, memoryPressure: "normal" },
    });

    expect(contract).toMatchObject({
      status: "ready",
      modelSelection: {
        memoryTier: "high",
        profile: { id: "literesearcher-4b-q8-0" },
        fallbackProfile: { id: "literesearcher-4b-q4-k-m" },
      },
      modelInstall: {
        status: "installed",
        selectedProfileId: "literesearcher-4b-q8-0",
      },
      runtime: {
        status: "ready",
      },
    });
    expect(contract.nextActions).toEqual(["Run Local Deep Research validation with a bounded mixed multi-source synthesis task."]);
  });

  it("keeps ready setup warning-only when another local model is resident but memory policy allows launch", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      modelInstallState: "installed",
      runtimeInstalled: true,
      machineFacts: {
        platform: "darwin",
        arch: "arm64",
        memoryBytes: 32 * gib,
        memoryPressure: "normal",
        activeLocalModelCount: 1,
      },
    });

    expect(contract.status).toBe("ready");
    expect(contract.modelSelection.blockers).toEqual([]);
    expect(contract.modelSelection.warnings.join("\n")).toContain("will account for resident memory in launch preflight");
    expect(contract.installerShape.memory).toMatchObject({
      activeLocalModelCount: 1,
      fit: "warning",
    });
    expect(contract.nextActions).toEqual(["Run Local Deep Research validation with a bounded mixed multi-source synthesis task."]);
  });

  it("formats the setup contract as Pi-readable readiness text", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
    });

    const text = localDeepResearchSetupContractText(contract);

    expect(text).toContain("Local Deep Research setup status: needs-install.");
    expect(text).toContain("Model: LiteResearcher-4B Q4_K_M");
    expect(text).toContain("Installer shape: local-model");
    expect(text).toContain("Local model resources: 0 active");
    expect(text).toContain("Local runtime inventory: 0 runtimes; 0 active leases; no resident runtime rows.");
    expect(text).toContain("Local model memory ceiling: not configured.");
    expect(text).toContain("Confirmation required for: install, repair, smoke.");
    expect(text).toContain("Lifecycle: progress event local-deep-research-install-progress");
    expect(text).toContain("Search route: exa-mcp-default -> ambient-browser.");
    expect(text).toContain("Provider preferences are captured at call time.");
  });

  it("formats host-memory utilization policy evidence in setup text", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 64 * gib, memoryPressure: "normal" },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-registry-v1",
        capturedAt: "2026-05-28T12:00:00.000Z",
        settings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          memoryLimitBehavior: "warn",
        },
        entries: [],
        hostMemory: {
          schemaVersion: "ambient-local-model-host-memory-v1",
          sampledAt: "2026-05-28T12:00:00.000Z",
          totalMemoryBytes: 64 * gib,
          freeMemoryBytes: 40 * gib,
          availableMemoryBytes: 40 * gib,
        },
        activeCount: 0,
        activeEstimatedResidentMemoryBytes: 0,
        policyDecision: {
          outcome: "within-limit",
          reason: "Projected local-model launch keeps 29% system memory free after launch.",
          requestedEstimatedResidentMemoryBytes: 21 * gib,
          activeEstimatedResidentMemoryBytes: 0,
          activeResidentMemoryBasis: "none",
          projectedEstimatedResidentMemoryBytes: 21 * gib,
          projectedResidentMemoryBytes: 21 * gib,
          projectedSystemMemoryUtilization: 0.671875,
          maxProjectedMemoryUtilization: 0.8,
          projectedFreeMemoryBytes: 19 * gib,
          projectedFreeMemoryRatio: 0.296875,
          minFreeMemoryRatioAfterLaunch: 0.2,
          comfortableFreeMemoryRatio: 0.4,
          unloadCandidateIds: [],
        },
      },
    });

    const text = localDeepResearchSetupContractText(contract);

    expect(text).toContain("Local model memory policy: ceiling 80% system utilization; keep 20% free; projected utilization 67%; projected free 19.00 GiB.");
  });

  it("derives local runtime inventory from local model resources for setup handoff", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 64 * gib, memoryPressure: "normal" },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-registry-v1",
        capturedAt: "2026-05-28T12:00:00.000Z",
        settings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          memoryLimitBehavior: "warn",
        },
        entries: [
          {
            capability: "local-text",
            id: "untracked-llama:4401",
            pid: 4401,
            running: true,
            statePath: "/tmp/untracked-llama.json",
            trackingStatus: "untracked",
            modelId: "unknown-local-model",
            estimatedResidentMemoryBytes: 4 * gib,
          },
        ],
        activeCount: 1,
        activeEstimatedResidentMemoryBytes: 4 * gib,
        policyDecision: {
          outcome: "within-limit",
          reason: "Projected local-model resident memory is within the configured ceiling.",
          activeEstimatedResidentMemoryBytes: 4 * gib,
          projectedEstimatedResidentMemoryBytes: 11 * gib,
          unloadCandidateIds: [],
        },
      },
    });

    expect(contract.localRuntimeInventory).toMatchObject({
      schemaVersion: "ambient-local-runtime-inventory-v1",
      capturedAt: "2026-05-28T12:00:00.000Z",
      activeLeases: [],
      entries: [
        {
          id: "untracked-llama:4401",
          trackingStatus: "untracked",
          running: true,
          modelId: "unknown-local-model",
          stopDecision: {
            ordinaryStopAllowed: false,
            untracked: true,
          },
        },
      ],
    });
    expect(localDeepResearchSetupContractText(contract)).toContain("This local model process is untracked");
  });

  it("surfaces resident runtime inventory as warning evidence instead of setup blockers", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      modelInstallState: "installed",
      runtimeInstalled: true,
      machineFacts: {
        platform: "darwin",
        arch: "arm64",
        memoryBytes: 32 * gib,
        memoryPressure: "normal",
        activeLocalModelCount: 1,
      },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-registry-v1",
        capturedAt: "2026-05-28T12:00:00.000Z",
        settings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          memoryLimitBehavior: "warn",
        },
        entries: [
          {
            capability: "local-text",
            id: "untracked-llama:4401",
            pid: 4401,
            running: true,
            statePath: "process:4401",
            trackingStatus: "untracked",
            endpointUrl: "http://127.0.0.1:11488",
            modelId: "/Users/travis/models/gemma-4-12b-it.Q4_K_XL.gguf",
            actualResidentMemoryBytes: 9 * gib,
          },
        ],
        activeCount: 1,
        activeEstimatedResidentMemoryBytes: 0,
        activeActualResidentMemoryBytes: 9 * gib,
        policyDecision: {
          outcome: "within-limit",
          reason: "Projected local-model launch stays within utilization policy.",
          activeEstimatedResidentMemoryBytes: 0,
          activeActualResidentMemoryBytes: 9 * gib,
          activeResidentMemoryBasis: "actual-rss",
          projectedEstimatedResidentMemoryBytes: 7 * gib,
          projectedResidentMemoryBytes: 16 * gib,
          unloadCandidateIds: [],
        },
      },
    });

    const warningText = contract.warnings.join("\n");

    expect(contract.status).toBe("ready");
    expect(contract.blockers).toEqual([]);
    expect(contract.modelSelection.blockers).toEqual([]);
    expect(warningText).toContain("Untracked local llama.cpp process is already resident");
    expect(warningText).toContain("pid 4401");
    expect(warningText).toContain("endpoint http://127.0.0.1:11488");
    expect(warningText).toContain("model gemma-4-12b-it.Q4_K_XL.gguf");
    expect(warningText).toContain("actual RSS 9.00 GiB");
    expect(warningText).toContain("Ambient will not stop it automatically: This local model process is untracked");
    expect(warningText).not.toContain("will wait rather than overlap llama.cpp processes");
  });

  it("blocks resident overlap only when the local model memory policy refuses launch", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      modelInstallState: "installed",
      runtimeInstalled: true,
      machineFacts: {
        platform: "darwin",
        arch: "arm64",
        memoryBytes: 32 * gib,
        memoryPressure: "normal",
        activeLocalModelCount: 1,
      },
      localModelResources: {
        schemaVersion: "ambient-local-model-resource-registry-v1",
        capturedAt: "2026-05-28T12:00:00.000Z",
        settings: {
          schemaVersion: "ambient-local-model-resource-settings-v1",
          memoryLimitBehavior: "refuse",
        },
        entries: [
          {
            capability: "embeddings",
            id: "embeddings:embeddinggemma",
            pid: 1774,
            running: true,
            statePath: "process:1774",
            trackingStatus: "untracked",
            endpointUrl: "http://127.0.0.1:57110",
            modelId: "embeddinggemma-300m-qat-Q8_0.gguf",
            actualResidentMemoryBytes: 9 * 1024 ** 2,
          },
        ],
        hostMemory: {
          schemaVersion: "ambient-local-model-host-memory-v1",
          sampledAt: "2026-05-28T12:00:00.000Z",
          totalMemoryBytes: 32 * gib,
          freeMemoryBytes: 6 * gib,
          availableMemoryBytes: 6 * gib,
        },
        requestedLaunch: {
          capability: "local-deep-research",
          id: "local-deep-research:literesearcher-4b-q4-k-m:requested",
          profileId: "literesearcher-4b-q4-k-m",
          estimatedResidentMemoryBytes: 11 * gib,
        },
        activeCount: 1,
        activeEstimatedResidentMemoryBytes: 0,
        activeActualResidentMemoryBytes: 9 * 1024 ** 2,
        policyDecision: {
          outcome: "refuse",
          reason: "Projected local-model launch is over policy: projected free memory would fall below the configured floor. Refusing launch.",
          requestedEstimatedResidentMemoryBytes: 11 * gib,
          activeEstimatedResidentMemoryBytes: 0,
          activeActualResidentMemoryBytes: 9 * 1024 ** 2,
          activeResidentMemoryBasis: "actual-rss",
          projectedEstimatedResidentMemoryBytes: 11 * gib,
          projectedResidentMemoryBytes: 11 * gib + 9 * 1024 ** 2,
          projectedSystemMemoryUtilization: 1,
          maxProjectedMemoryUtilization: 0.8,
          projectedFreeMemoryBytes: 0,
          projectedFreeMemoryRatio: 0,
          minFreeMemoryRatioAfterLaunch: 0.2,
          comfortableFreeMemoryRatio: 0.4,
          unloadCandidateIds: [],
        },
      },
    });

    expect(contract.status).toBe("blocked");
    expect(contract.modelSelection.blockers).toEqual([]);
    expect(contract.blockers).toEqual([
      "Projected local-model launch is over policy: projected free memory would fall below the configured floor. Refusing launch.",
    ]);
    expect(contract.warnings.join("\n")).toContain("Untracked local llama.cpp process is already resident");
  });

  it("records provider preference changes in the run-start snapshot", () => {
    const searchSettings = {
      webResearch: normalizeWebResearchProviderStackSettings({
        providers: [
          {
            providerId: "ambient-brave-search",
            label: "Brave Search",
            kind: "ambient-cli",
            roles: ["search"],
            status: "enabled",
          },
          {
            providerId: "custom-fetch",
            label: "Custom Fetch",
            kind: "toolhive-mcp",
            roles: ["fetch"],
            status: "enabled",
          },
        ],
        preferences: {
          search: ["ambient-brave-search", "ambient-browser"],
          fetch: ["custom-fetch", "scrapling-mcp-default"],
        },
        fallbackPolicy: { allowBrowserFallback: true },
      }),
    };

    const snapshot = buildLocalDeepResearchProviderSnapshot({
      settings: searchSettings,
      capturedAt: "2026-05-28T12:01:00.000Z",
    });

    expect(snapshot).toMatchObject({
      schemaVersion: "ambient-local-deep-research-provider-snapshot-v1",
      capturedAt: "2026-05-28T12:01:00.000Z",
      providers: expect.arrayContaining([
        expect.objectContaining({ providerId: "ambient-brave-search", roles: ["search"] }),
        expect.objectContaining({ providerId: "custom-fetch", roles: ["fetch"] }),
      ]),
      searchOrder: ["ambient-brave-search", "ambient-browser", "exa-mcp-default"],
      fetchOrder: ["custom-fetch", "scrapling-mcp-default", "exa-mcp-default", "ambient-browser"],
      fallbackPolicy: { allowBrowserFallback: true },
    });
  });

  it("blocks setup when strict provider preferences leave no search or fetch route", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      runtimeInstalled: true,
      modelInstallState: "installed",
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 32 * gib, memoryPressure: "normal" },
      searchSettings: {
        webResearch: normalizeWebResearchProviderStackSettings({
          providers: [
            { providerId: "exa-mcp-default", label: "Exa Search", kind: "remote-mcp", roles: ["search", "fetch"], status: "disabled" },
            { providerId: "scrapling-mcp-default", label: "Scrapling", kind: "toolhive-mcp", roles: ["fetch"], status: "disabled" },
            { providerId: "ambient-browser", label: "Ambient Browser", kind: "built-in-browser", roles: ["search", "fetch", "interactive_browser"], status: "enabled" },
          ],
          preferences: {
            search: ["exa-mcp-default", "ambient-browser"],
            fetch: ["scrapling-mcp-default", "ambient-browser"],
          },
          fallbackPolicy: { allowBrowserFallback: false },
        }),
      },
    });

    expect(contract.status).toBe("blocked");
    expect(contract.providerSnapshot).toMatchObject({
      searchOrder: [],
      fetchOrder: [],
      skippedSearchProviders: expect.arrayContaining([
        { providerId: "exa-mcp-default", reason: "Provider is disabled in Ambient settings." },
        { providerId: "ambient-browser", reason: "Ambient Browser fallback is disabled in web research settings." },
      ]),
      skippedFetchProviders: expect.arrayContaining([
        { providerId: "scrapling-mcp-default", reason: "Provider is disabled in Ambient settings." },
        { providerId: "ambient-browser", reason: "Ambient Browser fallback is disabled in web research settings." },
      ]),
    });
    expect(contract.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("at least one enabled search provider"),
      expect.stringContaining("at least one enabled fetch/scrape provider"),
    ]));
  });

  it("surfaces runtime blockers for unsupported managed-download lanes", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      modelInstallState: "installed",
      runtimeInstalled: false,
      machineFacts: { platform: "win32", arch: "x64", memoryBytes: 64 * gib, memoryPressure: "normal" },
    });

    expect(contract.status).toBe("blocked");
    expect(contract.runtime).toMatchObject({
      status: "blocked",
      selectedArtifactId: "llama-cpp-windows-x64-cpu",
    });
    expect(contract.blockers.join("\n")).toContain("Windows x64 has a pinned CPU zip artifact");
  });

  it("carries Q8 override blockers into the setup contract", () => {
    const contract = buildLocalDeepResearchSetupContract({
      now: fixedNow,
      q8Override: true,
      machineFacts: { platform: "darwin", arch: "arm64", memoryBytes: 16 * gib, memoryPressure: "normal" },
    });

    expect(contract.status).toBe("blocked");
    expect(contract.modelSelection).toMatchObject({
      q8OverrideDecision: "rejected",
      profile: { id: "literesearcher-4b-q4-k-m" },
      contextMode: "safe-8k",
    });
    expect(contract.blockers.join("\n")).toContain("Q8 override requires known host memory at or above 24 GiB.");
  });
});
