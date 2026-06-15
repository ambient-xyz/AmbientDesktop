import { describe, expect, it } from "vitest";
import {
  AMBIENT_DEFAULT_MODEL,
  AMBIENT_LOCAL_TEXT_MODEL,
  AMBIENT_PROVIDER_LOCAL,
  ambientModelRuntimeCatalogFromProfiles,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { LocalRuntimeLeaseRecord, LocalRuntimeLeaseStateSummary, LocalRuntimeLifecycleDecision } from "../../shared/types";
import { modelRuntimeCatalogSettingsModel } from "./modelRuntimeCatalogUiModel";

describe("modelRuntimeCatalogSettingsModel", () => {
  it("summarizes default main and sub-agent model eligibility", () => {
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({ generatedAt: "2026-06-05T04:00:00.000Z" }),
      AMBIENT_DEFAULT_MODEL,
    );

    expect(model.statusLabel).toBe("2 main / 2 sub-agent");
    expect(model.summary).toBe("2 available / 1 unavailable");
    expect(model.statusTone).toBe("warning");
    expect(model.selectedProfile).toMatchObject({
      modelId: AMBIENT_DEFAULT_MODEL,
      statusLabel: "Main + sub-agent",
      tone: "success",
      providerLabel: "Ambient",
    });
    expect(model.unavailableProfileRows).toEqual([
      expect.objectContaining({
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        unavailableReason: "Local text runtime is not configured in this Ambient Desktop build.",
      }),
    ]);
    expect(model.providerOnboarding).toMatchObject({
      statusLabel: "5 provider templates",
      summary: "2 known / 2 generic / 1 local",
    });
    expect(model.localModelsStatusLabel).toBe("1 local profile");
    expect(model.localModelsSummary).toBe("0 configured / inventory unavailable");
    expect(model.localProfileRows.map((row) => row.modelId)).toEqual([AMBIENT_LOCAL_TEXT_MODEL]);
    expect(model.searchText).toContain("generic-openai-compatible");
    expect(model.searchText).toContain("Desktop secret request");
  });

  it("shows configured local text runtime profiles as main and sub-agent eligible", () => {
    const ambientProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const configuredLocalText: AmbientModelRuntimeProfile = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
      profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:startup`,
      label: "Local text runtime",
      selectableAsMain: true,
      selectableAsSubagent: true,
      available: true,
      unavailableReason: undefined,
      estimatedResidentMemoryBytes: 4 * 1024 * 1024 * 1024,
      providerQuirks: ["Resolved from an active local runtime descriptor."],
    };

    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({
        generatedAt: "2026-06-05T04:10:00.000Z",
        profiles: [ambientProfile, configuredLocalText],
      }),
      AMBIENT_DEFAULT_MODEL,
    );

    expect(model.statusLabel).toBe("2 main / 2 sub-agent");
    expect(model.summary).toBe("2 available / 0 unavailable");
    expect(model.statusTone).toBe("success");
    expect(model.localModelsStatusLabel).toBe("1 local profile");
    expect(model.localModelsSummary).toBe("1 configured / inventory unavailable");
    expect(model.localProfileRows).toEqual([
      expect.objectContaining({
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        locality: "local",
        statusLabel: "Main + sub-agent",
      }),
    ]);
    expect(model.mainProfileRows.map((row) => row.modelId)).toEqual([AMBIENT_DEFAULT_MODEL, AMBIENT_LOCAL_TEXT_MODEL]);
    expect(model.subagentProfileRows).toEqual([
      expect.objectContaining({ modelId: AMBIENT_DEFAULT_MODEL, statusLabel: "Main + sub-agent" }),
      expect.objectContaining({
        modelId: AMBIENT_LOCAL_TEXT_MODEL,
        statusLabel: "Main + sub-agent",
        capabilityLabels: expect.arrayContaining(["Local", "No tools"]),
        detailLabels: expect.arrayContaining(["Estimated RSS: 4.0 GiB"]),
      }),
    ]);
  });

  it("surfaces Settings-installed provider endpoints in profile detail rows", () => {
    const customProfile: AmbientModelRuntimeProfile = {
      ...resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      profileId: "customer-router:custom/router-model",
      providerId: "customer-router",
      modelId: "custom/router-model",
      label: "Router Model",
      costClass: "metered",
      trustClass: "user-configured",
      privacyLabel: "User configured cloud provider",
      providerQuirks: ["Capability-probed before Settings install."],
    };

    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({
        generatedAt: "2026-06-06T04:25:00.000Z",
        providers: [{
          id: "customer-router",
          label: "Customer Router",
          locality: "cloud",
          secretRequirement: "user-secret",
          supportsStreaming: true,
          supportsTools: true,
          endpoint: {
            schemaVersion: "ambient-model-runtime-installed-provider-endpoint-v1",
            compatibility: "openai-compatible",
            baseUrl: "https://provider.example/v1",
          },
          notes: ["Installed from Settings provider onboarding."],
        }],
        profiles: [customProfile],
      }),
      "custom/router-model",
    );

    expect(model.selectedProfile).toMatchObject({
      providerLabel: "Customer Router",
      detailLabels: expect.arrayContaining([
        "Endpoint: https://provider.example/v1",
        "Endpoint compatibility: OpenAI-compatible",
      ]),
    });
    expect(model.searchText).toContain("https://provider.example/v1");
    expect(model.searchText).toContain("OpenAI-compatible");
  });

  it("fails visible diagnostics when the selected model is missing from the runtime catalog", () => {
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({ generatedAt: "2026-06-05T04:20:00.000Z" }),
      "custom/missing-model",
    );

    expect(model.statusTone).toBe("error");
    expect(model.selectedProfile).toMatchObject({
      modelId: "custom/missing-model",
      statusLabel: "Unavailable",
      tone: "error",
      unavailableReason: "Selected model is not present in the current runtime catalog.",
    });
    expect(model.searchText).toContain("custom/missing-model");
  });

  it("shows local runtime inventory rows with active sub-agent stop blockers", () => {
    const ambientProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const localProfile = configuredLocalTextProfile();
    const lease = runtimeLease({
      leaseId: "lease-review",
      ownerDisplayName: "Review worker",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      subagentRunId: "run-review",
    });
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({
        generatedAt: "2026-06-05T04:30:00.000Z",
        profiles: [ambientProfile, localProfile],
      }),
      AMBIENT_DEFAULT_MODEL,
      {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-05T04:31:00.000Z",
        activeLeases: [lease],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "local-text:local-text-runtime:4301",
            capability: "local-text",
            providerId: AMBIENT_PROVIDER_LOCAL,
            modelRuntimeId: "local-text-runtime",
            modelProfileId: localProfile.profileId,
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            trackingStatus: "managed",
            running: true,
            pid: 4301,
            endpoint: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * 1024 * 1024 * 1024,
            actualResidentMemoryBytes: 5 * 1024 * 1024 * 1024,
            owners: [
              {
                leaseId: "lease-review",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                subagentRunId: "run-review",
                displayName: "sub-agent Review worker",
                status: "running",
              },
            ],
            leases: [lease],
            leaseState: leaseState({ activeLeaseIds: ["lease-review"] }),
            lifecycleDecision: lifecycleDecision({
              stopAllowed: false,
              restartAllowed: false,
              stopReason: "In use by sub-agent Review worker.",
              blockerLeaseIds: ["lease-review"],
              affectedSubagents: [{
                leaseId: "lease-review",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                subagentRunId: "run-review",
                displayName: "sub-agent Review worker",
                status: "running",
                modelRuntimeId: "local-text-runtime",
                modelProfileId: localProfile.profileId,
                modelId: AMBIENT_LOCAL_TEXT_MODEL,
                providerId: AMBIENT_PROVIDER_LOCAL,
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
                modelRuntimeId: "local-text-runtime",
                modelProfileId: localProfile.profileId,
                modelId: AMBIENT_LOCAL_TEXT_MODEL,
                providerId: AMBIENT_PROVIDER_LOCAL,
                capabilityKind: "local-text",
              }],
              forceTerminationAllowed: true,
              forceRequiresSubagentCancellation: true,
              untracked: false,
            },
            startedAt: "2026-06-05T04:00:00.000Z",
            lastUsedAt: "2026-06-05T04:29:00.000Z",
            lastHeartbeatAt: "2026-06-05T04:30:00.000Z",
          },
        ],
      },
    );

    expect(model.localRuntimeSummary).toBe("1 runtime / 1 active lease");
    expect(model.localModelsSummary).toBe("1 configured / 1 running / 1 in use");
    expect(model.localRuntimeTone).toBe("warning");
    expect(model.localRuntimeGroups.find((group) => group.id === "text")).toMatchObject({
      label: "Text",
      summary: "1 runtime / 1 running",
      tone: "warning",
      rows: [
        expect.objectContaining({
          capabilityGroupId: "text",
        }),
      ],
    });
    expect(model.localRuntimeGroups.find((group) => group.id === "voice")).toMatchObject({
      label: "Voice",
      summary: "0 runtimes",
      emptyLabel: "No local voice runtime surfaced yet.",
    });
    expect(model.localRuntimeGroups.find((group) => group.id === "embeddings")).toMatchObject({
      label: "Embeddings",
      summary: "0 runtimes",
      emptyLabel: "No local embedding runtime surfaced yet.",
    });
    expect(model.localRuntimeRows).toEqual([
      expect.objectContaining({
        label: "Local text runtime",
        modelLabel: AMBIENT_LOCAL_TEXT_MODEL,
        capabilityLabel: "Local text",
        capabilityGroupId: "text",
        statusLabel: "Running · Managed",
        ownerLabel: "In use by sub-agent Review worker",
        memoryLabel: "Actual RSS 5.0 GiB / Estimate 6.0 GiB",
        running: true,
        trackingStatusLabel: "Managed",
        endpointLabel: "http://127.0.0.1:43123/health",
        pidLabel: "pid 4301",
        ordinaryStopAction: {
          kind: "stop",
          label: "Stop disabled",
          enabled: false,
          title: "In use by sub-agent Review worker.",
        },
        ordinaryRestartAction: {
          kind: "restart",
          label: "Restart disabled",
          enabled: false,
          title: "In use by sub-agent Review worker.",
        },
        lifecycleActions: [
          {
            kind: "stop",
            label: "Stop disabled",
            enabled: false,
            title: "In use by sub-agent Review worker.",
          },
          {
            kind: "restart",
            label: "Restart disabled",
            enabled: false,
            title: "In use by sub-agent Review worker.",
          },
          {
            kind: "start",
            label: "Start disabled",
            enabled: false,
            title: "Runtime is already running.",
          },
          {
            kind: "unload",
            label: "Unload disabled",
            enabled: false,
            title: "In use by sub-agent Review worker.",
          },
        ],
        forceTerminationLabel: "Forced Stop/Restart cancels affected sub-agents",
        blockerSummaryLabel: "Ordinary Stop/Restart blocked by 1 active sub-agent lease: lease-review",
        forceConsequenceLabel: "Forced Stop/Restart will cancel or mark 1 affected sub-agent: sub-agent Review worker (run run-review, thread child-thread, lease lease-review) before changing this runtime.",
        leaseStateLabel: "1 active lease",
        blockerLabels: ["lease-review"],
        affectedSubagentLabels: ["sub-agent Review worker (run run-review, thread child-thread, lease lease-review)"],
      }),
    ]);
    expect(model.searchText).toContain("In use by sub-agent Review worker");
    expect(model.searchText).toContain("Ordinary Stop/Restart blocked by 1 active sub-agent lease: lease-review");
    expect(model.searchText).toContain("Forced Stop/Restart will cancel or mark 1 affected sub-agent");
    expect(model.searchText).toContain("Stop disabled");
  });

  it("shows untracked local runtimes as visible but not safe to stop", () => {
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({ generatedAt: "2026-06-05T04:40:00.000Z" }),
      AMBIENT_DEFAULT_MODEL,
      {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-05T04:41:00.000Z",
        activeLeases: [],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "untracked-llama:4401",
            capability: "local-text",
            modelId: "unknown-local-model",
            trackingStatus: "untracked",
            running: true,
            pid: 4401,
            owners: [],
            leases: [],
            leaseState: leaseState(),
            lifecycleDecision: lifecycleDecision({
              stopAllowed: false,
              restartAllowed: false,
              stopReason: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
              restartReason: "This local model process is untracked, so Ambient cannot assume it is safe to restart.",
              forceAllowed: false,
              untracked: true,
            }),
            stopDecision: {
              ordinaryStopAllowed: false,
              reason: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
              blockerLeaseIds: [],
              affectedSubagents: [],
              forceTerminationAllowed: false,
              forceRequiresSubagentCancellation: false,
              untracked: true,
            },
          },
        ],
      },
    );

    expect(model.localRuntimeSummary).toBe("1 runtime / 0 active leases");
    expect(model.localModelsSummary).toBe("0 configured / 1 running / 0 in use");
    expect(model.localRuntimeTone).toBe("error");
    expect(model.localRuntimeGroups.find((group) => group.id === "untracked")).toMatchObject({
      label: "Untracked",
      summary: "1 runtime / 1 running",
      tone: "error",
      rows: [
        expect.objectContaining({
          capabilityGroupId: "untracked",
        }),
      ],
    });
    expect(model.localRuntimeRows[0]).toMatchObject({
      label: "unknown-local-model",
      capabilityGroupId: "untracked",
      statusLabel: "Running · Untracked",
      ownerLabel: "No active owner",
      tone: "error",
      trackingStatusLabel: "Untracked",
      ordinaryStopAction: {
        kind: "stop",
        label: "Stop disabled",
        enabled: false,
        title: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
      },
      ordinaryRestartAction: {
        kind: "restart",
        label: "Restart disabled",
        enabled: false,
        title: "This local model process is untracked, so Ambient cannot assume it is safe to restart.",
      },
      lifecycleActions: [
        {
          kind: "stop",
          label: "Stop disabled",
          enabled: false,
          title: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
        },
        {
          kind: "restart",
          label: "Restart disabled",
          enabled: false,
          title: "This local model process is untracked, so Ambient cannot assume it is safe to restart.",
        },
        {
          kind: "start",
          label: "Start disabled",
          enabled: false,
          title: "Runtime is already running.",
        },
        {
          kind: "unload",
          label: "Unload disabled",
          enabled: false,
          title: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
        },
      ],
      forceTerminationLabel: "Force termination unavailable",
      blockerSummaryLabel: "Ordinary Stop/Restart disabled because this local runtime is untracked.",
      forceConsequenceLabel: "Forced termination unavailable for untracked processes; ask the owner to stop it outside Ambient.",
    });
    expect(model.searchText).toContain("untracked");
    expect(model.searchText).toContain("safe to stop");
    expect(model.searchText).toContain("Forced termination unavailable for untracked processes");
  });

  it("surfaces stale lease evidence without marking the runtime in use", () => {
    const ambientProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const localProfile = configuredLocalTextProfile();
    const staleLease = runtimeLease({
      leaseId: "lease-stale",
      ownerDisplayName: "Old worker",
      lastHeartbeatAt: "2026-06-05T04:00:00.000Z",
    });
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({
        generatedAt: "2026-06-05T04:55:00.000Z",
        profiles: [ambientProfile, localProfile],
      }),
      AMBIENT_DEFAULT_MODEL,
      {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-05T04:56:00.000Z",
        activeLeases: [],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "local-text:local-text-runtime:4301",
            capability: "local-text",
            providerId: AMBIENT_PROVIDER_LOCAL,
            modelRuntimeId: "local-text-runtime",
            modelProfileId: localProfile.profileId,
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            trackingStatus: "managed",
            running: true,
            pid: 4301,
            endpoint: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * 1024 * 1024 * 1024,
            owners: [],
            leases: [staleLease],
            leaseState: leaseState({
              staleLeaseIds: ["lease-stale"],
              inactiveLeaseIds: ["lease-stale"],
            }),
            lifecycleDecision: lifecycleDecision({
              stopAllowed: true,
              restartAllowed: true,
              stopReason: "No active sub-agent local runtime lease blocks ordinary Stop.",
              restartReason: "No active sub-agent local runtime lease blocks ordinary Restart.",
              forceAllowed: true,
            }),
            stopDecision: {
              ordinaryStopAllowed: true,
              reason: "No active sub-agent local runtime lease blocks ordinary Stop.",
              blockerLeaseIds: [],
              affectedSubagents: [],
              forceTerminationAllowed: true,
              forceRequiresSubagentCancellation: false,
              untracked: false,
            },
            lastHeartbeatAt: "2026-06-05T04:00:00.000Z",
          },
        ],
      },
    );

    expect(model.localRuntimeSummary).toBe("1 runtime / 0 active leases / 1 stale lease");
    expect(model.localModelsSummary).toBe("1 configured / 1 running / 0 in use");
    expect(model.localRuntimeRows[0]).toMatchObject({
      statusLabel: "Running · Managed",
      ownerLabel: "No active owner",
      leaseStateLabel: "1 stale lease",
      ordinaryStopAction: {
        kind: "stop",
        label: "Stop",
        enabled: true,
        title: "No active sub-agent local runtime lease blocks ordinary Stop.",
      },
    });
    expect(model.localRuntimeRows[0]?.detailLabels).toContain("Lease state: 1 stale lease");
    expect(model.searchText).toContain("1 stale lease");
  });

  it("groups local voice runtime inventory rows separately from text runtimes", () => {
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({ generatedAt: "2026-06-05T04:45:00.000Z" }),
      AMBIENT_DEFAULT_MODEL,
      {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-05T04:46:00.000Z",
        activeLeases: [],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "voice:piper-runtime",
            capability: "voice",
            providerId: "ambient-cli:piper:tool:piper_tts",
            modelRuntimeId: "piper-runtime",
            modelId: "rhasspy/piper/en_US-lessac-medium",
            trackingStatus: "managed",
            running: false,
            endpoint: "http://127.0.0.1:59201",
            estimatedResidentMemoryBytes: 2 * 1024 * 1024 * 1024,
            owners: [],
            leases: [],
            leaseState: leaseState(),
            lifecycleDecision: unsupportedVoiceLifecycleDecision(),
            stopDecision: {
              ordinaryStopAllowed: false,
              reason: "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
              blockerLeaseIds: [],
              affectedSubagents: [],
              forceTerminationAllowed: false,
              forceRequiresSubagentCancellation: false,
              untracked: false,
            },
          },
        ],
      },
    );

    expect(model.localRuntimeGroups.find((group) => group.id === "voice")).toMatchObject({
      label: "Voice",
      summary: "1 runtime / 0 running",
      tone: "info",
      rows: [
        expect.objectContaining({
          capabilityGroupId: "voice",
          capabilityLabel: "Voice",
          statusLabel: "Stopped · Managed",
          memoryLabel: "Estimate 2.0 GiB",
          ordinaryStopAction: {
            kind: "stop",
            label: "Stop disabled",
            enabled: false,
            title: "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
          },
          ordinaryRestartAction: {
            kind: "restart",
            label: "Restart disabled",
            enabled: false,
            title: "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Restart path for this row.",
          },
        }),
      ],
    });
    expect(model.localRuntimeGroups.find((group) => group.id === "text")).toMatchObject({
      summary: "0 runtimes",
    });
    expect(model.searchText).toContain("Voice");
    expect(model.searchText).toContain("piper-runtime");
  });

  it("names force availability by provider lifecycle action", () => {
    const voiceLease = voiceRuntimeLease();
    const affectedVoiceWorker = {
      leaseId: "voice-lease",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      displayName: "sub-agent Voice worker",
      status: "running" as const,
      modelRuntimeId: "piper-runtime",
      modelId: "rhasspy/piper/en_US-lessac-medium",
      providerId: "ambient-cli:piper:tool:piper_tts",
      capabilityKind: "voice" as const,
    };
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({ generatedAt: "2026-06-05T04:46:30.000Z" }),
      AMBIENT_DEFAULT_MODEL,
      {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-05T04:46:31.000Z",
        activeLeases: [voiceLease],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "voice:piper-runtime",
            capability: "voice",
            providerId: "ambient-cli:piper:tool:piper_tts",
            modelRuntimeId: "piper-runtime",
            modelId: "rhasspy/piper/en_US-lessac-medium",
            trackingStatus: "managed",
            running: true,
            endpoint: "http://127.0.0.1:59201",
            estimatedResidentMemoryBytes: 512 * 1024 * 1024,
            owners: [
              {
                leaseId: "voice-lease",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                displayName: "sub-agent Voice worker",
                status: "running",
              },
            ],
            leases: [voiceLease],
            leaseState: leaseState({ activeLeaseIds: ["voice-lease"] }),
            lifecycleDecision: lifecycleDecision({
              stopAllowed: false,
              restartAllowed: false,
              stopReason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
              restartReason: "In use by sub-agent Voice worker. Provider-declared Restart is blocked until the owning sub-agent releases this runtime.",
              blockerLeaseIds: ["voice-lease"],
              affectedSubagents: [affectedVoiceWorker],
              forceAllowed: false,
              restartForceAllowed: true,
              forceRequiresSubagentCancellation: false,
              restartForceRequiresSubagentCancellation: true,
            }),
            stopDecision: {
              ordinaryStopAllowed: false,
              reason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
              blockerLeaseIds: ["voice-lease"],
              affectedSubagents: [affectedVoiceWorker],
              forceTerminationAllowed: false,
              forceRequiresSubagentCancellation: false,
              untracked: false,
            },
          },
        ],
      },
    );

    expect(model.localRuntimeRows[0]).toMatchObject({
      ownerLabel: "In use by sub-agent Voice worker",
      ordinaryStopAction: {
        label: "Stop disabled",
        enabled: false,
      },
      ordinaryRestartAction: {
        label: "Restart disabled",
        enabled: false,
      },
      forceTerminationLabel: "Forced Restart cancels affected sub-agents",
      blockerSummaryLabel: "Ordinary Stop/Restart blocked by 1 active sub-agent lease: voice-lease",
      forceConsequenceLabel: "Forced Restart will cancel or mark 1 affected sub-agent: sub-agent Voice worker (child-thread, lease voice-lease) before changing this runtime.",
      blockerLabels: ["voice-lease"],
      affectedSubagentLabels: ["sub-agent Voice worker (child-thread, lease voice-lease)"],
    });
    expect(model.searchText).toContain("Forced Restart cancels affected sub-agents");
    expect(model.searchText).toContain("Forced Restart will cancel or mark 1 affected sub-agent");
  });

  it("groups declared embedding runtime inventory rows separately from text runtimes", () => {
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({ generatedAt: "2026-06-05T04:47:00.000Z" }),
      AMBIENT_DEFAULT_MODEL,
      {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-05T04:48:00.000Z",
        activeLeases: [],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "embeddings:bge-runtime",
            capability: "embeddings",
            providerId: "local-embeddings",
            modelRuntimeId: "bge-runtime",
            modelId: "BAAI/bge-small-en-v1.5",
            trackingStatus: "managed",
            running: true,
            pid: 7001,
            endpoint: "http://127.0.0.1:59301",
            estimatedResidentMemoryBytes: 1536 * 1024 * 1024,
            actualResidentMemoryBytes: 1280 * 1024 * 1024,
            owners: [],
            leases: [],
            leaseState: leaseState(),
            lifecycleDecision: unsupportedEmbeddingLifecycleDecision(),
            stopDecision: {
              ordinaryStopAllowed: false,
              reason: "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
              blockerLeaseIds: [],
              affectedSubagents: [],
              forceTerminationAllowed: false,
              forceRequiresSubagentCancellation: false,
              untracked: false,
            },
          },
        ],
      },
    );

    expect(model.localRuntimeGroups.find((group) => group.id === "embeddings")).toMatchObject({
      label: "Embeddings",
      summary: "1 runtime / 1 running",
      tone: "warning",
      rows: [
        expect.objectContaining({
          capabilityGroupId: "embeddings",
          capabilityLabel: "Embeddings",
          statusLabel: "Running · Managed",
          memoryLabel: "Actual RSS 1.3 GiB / Estimate 1.5 GiB",
          endpointLabel: "http://127.0.0.1:59301",
          pidLabel: "pid 7001",
          ordinaryStopAction: {
            kind: "stop",
            label: "Stop disabled",
            enabled: false,
            title: "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
          },
        }),
      ],
    });
    expect(model.localRuntimeGroups.find((group) => group.id === "text")).toMatchObject({
      summary: "0 runtimes",
    });
    expect(model.searchText).toContain("Embeddings");
    expect(model.searchText).toContain("bge-runtime");
  });

  it("shows stopped managed local text runtimes as configured and restartable", () => {
    const ambientProfile = resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL);
    const localProfile = configuredLocalTextProfile();
    const model = modelRuntimeCatalogSettingsModel(
      ambientModelRuntimeCatalogFromProfiles({
        generatedAt: "2026-06-05T04:50:00.000Z",
        profiles: [ambientProfile, localProfile],
      }),
      AMBIENT_DEFAULT_MODEL,
      {
        schemaVersion: "ambient-local-runtime-inventory-v1",
        capturedAt: "2026-06-05T04:51:00.000Z",
        activeLeases: [],
        entries: [
          {
            schemaVersion: "ambient-local-runtime-inventory-entry-v1",
            id: "local-text:local-text-runtime:4301",
            capability: "local-text",
            providerId: AMBIENT_PROVIDER_LOCAL,
            modelRuntimeId: "local-text-runtime",
            modelProfileId: localProfile.profileId,
            modelId: AMBIENT_LOCAL_TEXT_MODEL,
            trackingStatus: "managed",
            running: false,
            pid: 4301,
            endpoint: "http://127.0.0.1:43123/health",
            estimatedResidentMemoryBytes: 6 * 1024 * 1024 * 1024,
            owners: [],
            leases: [],
            leaseState: leaseState(),
            lifecycleDecision: stoppedLifecycleDecision(),
            stopDecision: {
              ordinaryStopAllowed: false,
              reason: "Runtime is already stopped.",
              blockerLeaseIds: [],
              affectedSubagents: [],
              forceTerminationAllowed: false,
              forceRequiresSubagentCancellation: false,
              untracked: false,
            },
            startedAt: "2026-06-05T04:00:00.000Z",
            lastUsedAt: "2026-06-05T04:49:00.000Z",
          },
        ],
      },
    );

    expect(model.localRuntimeTone).toBe("info");
    expect(model.localModelsSummary).toBe("1 configured / 0 running / 0 in use");
    expect(model.localRuntimeGroups.find((group) => group.id === "text")).toMatchObject({
      summary: "1 runtime / 0 running",
      tone: "info",
    });
    expect(model.localRuntimeRows).toEqual([
      expect.objectContaining({
        label: "Local text runtime",
        statusLabel: "Stopped · Managed",
        ownerLabel: "No active owner",
        memoryLabel: "Estimate 6.0 GiB",
        running: false,
        ordinaryStopAction: {
          kind: "stop",
          label: "Stop disabled",
          enabled: false,
          title: "Runtime is already stopped.",
        },
        ordinaryRestartAction: {
          kind: "restart",
          label: "Restart",
          enabled: true,
          title: "No active sub-agent local runtime lease blocks ordinary Restart.",
        },
        lifecycleActions: [
          {
            kind: "stop",
            label: "Stop disabled",
            enabled: false,
            title: "Runtime is already stopped.",
          },
          {
            kind: "restart",
            label: "Restart",
            enabled: true,
            title: "No active sub-agent local runtime lease blocks ordinary Restart.",
          },
          {
            kind: "start",
            label: "Start",
            enabled: true,
            title: "No active sub-agent local runtime lease blocks ordinary Load.",
          },
          {
            kind: "unload",
            label: "Unload disabled",
            enabled: false,
            title: "Runtime is already stopped.",
          },
        ],
        forceTerminationLabel: "Forced Restart available",
      }),
    ]);
    expect(model.searchText).toContain("Stopped · Managed");
    expect(model.searchText).toContain("Restart");
    expect(model.searchText).toContain("Start");
  });
});

function configuredLocalTextProfile(): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:startup`,
    label: "Local text runtime",
    selectableAsMain: true,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    estimatedResidentMemoryBytes: 4 * 1024 * 1024 * 1024,
    providerQuirks: ["Resolved from an active local runtime descriptor."],
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
  restartForceAllowed?: boolean;
  forceRequiresSubagentCancellation?: boolean;
  restartForceRequiresSubagentCancellation?: boolean;
  untracked?: boolean;
}): LocalRuntimeLifecycleDecision {
  const blockerLeaseIds = input.blockerLeaseIds ?? [];
  const affectedSubagents = input.affectedSubagents ?? [];
  const forceAllowed = input.forceAllowed ?? input.stopAllowed;
  const restartForceAllowed = input.restartForceAllowed ?? forceAllowed;
  const forceRequiresSubagentCancellation = input.forceRequiresSubagentCancellation ?? false;
  const restartForceRequiresSubagentCancellation = input.restartForceRequiresSubagentCancellation ?? forceRequiresSubagentCancellation;
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
      forceAllowed: restartForceAllowed,
      forceRequiresSubagentCancellation: restartForceRequiresSubagentCancellation,
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

function stoppedLifecycleDecision(): LocalRuntimeLifecycleDecision {
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: {
      allowed: false,
      reason: "Runtime is already stopped.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    },
    restart: {
      allowed: true,
      reason: "No active sub-agent local runtime lease blocks ordinary Restart.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: true,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    },
    load: {
      allowed: true,
      reason: "No active sub-agent local runtime lease blocks ordinary Load.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    },
    unload: {
      allowed: false,
      reason: "Runtime is already stopped.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    },
  };
}

function unsupportedVoiceLifecycleDecision(): LocalRuntimeLifecycleDecision {
  const stopReason = "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.";
  const restartReason = "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Restart path for this row.";
  const startReason = "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Start path for this row.";
  const unloadReason = "Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Unload path for this row.";
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: disabledLifecycleAction(stopReason),
    restart: disabledLifecycleAction(restartReason),
    load: disabledLifecycleAction(startReason),
    unload: disabledLifecycleAction(unloadReason),
  };
}

function unsupportedEmbeddingLifecycleDecision(): LocalRuntimeLifecycleDecision {
  const stopReason = "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.";
  const restartReason = "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Restart path for this row.";
  const startReason = "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Start path for this row.";
  const unloadReason = "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Unload path for this row.";
  return {
    schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
    stop: disabledLifecycleAction(stopReason),
    restart: disabledLifecycleAction(restartReason),
    load: disabledLifecycleAction(startReason),
    unload: disabledLifecycleAction(unloadReason),
  };
}

function disabledLifecycleAction(reason: string): LocalRuntimeLifecycleDecision["stop"] {
  return {
    allowed: false,
    reason,
    blockerLeaseIds: [],
    affectedSubagents: [],
    forceAllowed: false,
    forceRequiresSubagentCancellation: false,
    untracked: false,
  };
}

function leaseState(
  overrides: Partial<LocalRuntimeLeaseStateSummary> = {},
): LocalRuntimeLeaseStateSummary {
  return {
    activeLeaseIds: [],
    staleLeaseIds: [],
    releasedLeaseIds: [],
    crashedLeaseIds: [],
    inactiveLeaseIds: [],
    ...overrides,
  };
}

function runtimeLease(
  overrides: Partial<LocalRuntimeLeaseRecord> = {},
): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Review worker",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: `${AMBIENT_PROVIDER_LOCAL}:${AMBIENT_LOCAL_TEXT_MODEL}:startup`,
    modelId: AMBIENT_LOCAL_TEXT_MODEL,
    providerId: AMBIENT_PROVIDER_LOCAL,
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * 1024 * 1024 * 1024,
    actualResidentMemoryBytes: 5 * 1024 * 1024 * 1024,
    pid: 4301,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-05T04:00:00.000Z",
    lastHeartbeatAt: "2026-06-05T04:30:00.000Z",
    status: "running",
    ...overrides,
  };
}

function voiceRuntimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "voice-lease",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Voice worker",
    modelRuntimeId: "piper-runtime",
    modelId: "rhasspy/piper/en_US-lessac-medium",
    providerId: "ambient-cli:piper:tool:piper_tts",
    capabilityKind: "voice",
    estimatedResidentMemoryBytes: 512 * 1024 * 1024,
    endpoint: "http://127.0.0.1:59201",
    acquiredAt: "2026-06-05T04:30:00.000Z",
    lastHeartbeatAt: "2026-06-05T04:31:00.000Z",
    status: "running",
    ...overrides,
  };
}
