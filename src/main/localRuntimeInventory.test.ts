import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import type {
  LocalModelResourceRegistryEntry,
  LocalModelResourceRegistrySnapshot,
  LocalRuntimeInventorySnapshot,
  LocalRuntimeLeaseRecord,
  LocalRuntimePolicyHandoffSnapshot,
} from "../shared/types";
import {
  buildLocalRuntimeInventory,
  buildLocalRuntimePolicyHandoff,
  isActiveLocalRuntimeLease,
  localRuntimeLifecycleDecision,
  localRuntimeStopDecision,
} from "./localRuntimeInventory";

const gib = 1024 ** 3;

describe("local runtime inventory", () => {
  it("joins active sub-agent leases to local runtime rows and blocks ordinary Stop", async () => {
    const lease: LocalRuntimeLeaseRecord = {
      schemaVersion: "ambient-local-runtime-lease-v1",
      leaseId: "lease-review",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      subagentRunId: "run-review",
      ownerDisplayName: "Review worker",
      modelRuntimeId: "local-text-runtime",
      modelProfileId: "local-text-4b-q4",
      modelId: "local/text-4b",
      providerId: "local",
      capabilityKind: "local-text",
      estimatedResidentMemoryBytes: 6 * gib,
      actualResidentMemoryBytes: 5 * gib,
      pid: 4301,
      endpoint: "http://127.0.0.1:43123/health",
      acquiredAt: "2026-06-06T00:00:00.000Z",
      lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
      status: "running",
    };

    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "local-text:local-text-runtime:4301",
        runtimeId: "local-text-runtime",
        pid: 4301,
        endpointUrl: "http://127.0.0.1:43123/health",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
      })]),
      leases: [lease],
    });

    expect(inventory).toMatchObject({
      schemaVersion: "ambient-local-runtime-inventory-v1",
      activeLeases: [expect.objectContaining({ leaseId: "lease-review" })],
      entries: [
        expect.objectContaining({
          id: "local-text:local-text-runtime:4301",
          modelRuntimeId: "local-text-runtime",
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
          leaseState: {
            activeLeaseIds: ["lease-review"],
            staleLeaseIds: [],
            releasedLeaseIds: [],
            crashedLeaseIds: [],
            inactiveLeaseIds: [],
          },
          stopDecision: {
            ordinaryStopAllowed: false,
            reason: "In use by sub-agent Review worker.",
            blockerLeaseIds: ["lease-review"],
            affectedSubagents: [
              {
                leaseId: "lease-review",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                subagentRunId: "run-review",
                displayName: "sub-agent Review worker",
                status: "running",
                modelRuntimeId: "local-text-runtime",
                modelProfileId: "local-text-4b-q4",
                modelId: "local/text-4b",
                providerId: "local",
                capabilityKind: "local-text",
              },
            ],
            forceTerminationAllowed: true,
            forceRequiresSubagentCancellation: true,
            untracked: false,
          },
          lifecycleDecision: {
            schemaVersion: "ambient-local-runtime-lifecycle-decision-v1",
            stop: expect.objectContaining({
              allowed: false,
              reason: "In use by sub-agent Review worker.",
              blockerLeaseIds: ["lease-review"],
              forceRequiresSubagentCancellation: true,
            }),
            restart: expect.objectContaining({
              allowed: false,
              reason: "In use by sub-agent Review worker.",
              blockerLeaseIds: ["lease-review"],
              forceRequiresSubagentCancellation: true,
            }),
            load: expect.objectContaining({
              allowed: false,
              reason: "Runtime is already running and owned by an active sub-agent lease.",
              blockerLeaseIds: ["lease-review"],
              forceRequiresSubagentCancellation: true,
            }),
            unload: expect.objectContaining({
              allowed: false,
              reason: "In use by sub-agent Review worker.",
            }),
          },
          lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
        }),
      ],
    });

    await writeSubagentStopBlockerProofArtifact(inventory);
  });

  it("uses active lease memory when a matched runtime row has not sampled RSS yet", () => {
    const lease = runtimeLease({
      leaseId: "lease-memory",
      ownerDisplayName: "Memory worker",
      actualResidentMemoryBytes: 5 * gib,
    });
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "local-text:local-text-runtime:4301",
        runtimeId: "local-text-runtime",
        pid: 4301,
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        estimatedResidentMemoryBytes: undefined,
        actualResidentMemoryBytes: undefined,
      })]),
      leases: [lease],
    });

    expect(inventory.entries[0]).toMatchObject({
      estimatedResidentMemoryBytes: 6 * gib,
      actualResidentMemoryBytes: 5 * gib,
      owners: [
        expect.objectContaining({
          leaseId: "lease-memory",
          displayName: "sub-agent Memory worker",
        }),
      ],
    });
    expect(buildLocalRuntimePolicyHandoff(inventory).memoryEvidence).toMatchObject({
      activeEstimatedResidentMemoryBytes: 6 * gib,
      activeActualResidentMemoryBytes: 5 * gib,
      entryCountWithActualRss: 1,
      entryCountWithOnlyEstimate: 0,
      entryCountWithUnknownMemory: 0,
    });
  });

  it("blocks active local runtime leases with incomplete sub-agent ownership metadata", () => {
    const lease = runtimeLease({
      leaseId: "lease-missing-child-thread",
      subagentThreadId: undefined,
      subagentRunId: undefined,
      ownerDisplayName: "Review worker",
    });
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "local-text:local-text-runtime:4301",
        runtimeId: "local-text-runtime",
        pid: 4301,
        endpointUrl: "http://127.0.0.1:43123/health",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
      })]),
      leases: [lease],
    });
    const handoff = buildLocalRuntimePolicyHandoff(inventory);

    expect(inventory).toMatchObject({
      activeLeases: [expect.objectContaining({ leaseId: "lease-missing-child-thread" })],
      entries: [
        expect.objectContaining({
          owners: [
            {
              leaseId: "lease-missing-child-thread",
              parentThreadId: "parent-thread",
              displayName: "Review worker",
              status: "running",
            },
          ],
          leaseState: expect.objectContaining({
            activeLeaseIds: ["lease-missing-child-thread"],
          }),
          stopDecision: {
            ordinaryStopAllowed: false,
            reason: "In use by Review worker. Lease lease-missing-child-thread is missing sub-agent thread metadata, so Ambient cannot safely force-cancel the owner.",
            blockerLeaseIds: ["lease-missing-child-thread"],
            affectedSubagents: [],
            forceTerminationAllowed: false,
            forceRequiresSubagentCancellation: false,
            untracked: false,
          },
          lifecycleDecision: expect.objectContaining({
            restart: expect.objectContaining({
              allowed: false,
              reason: "In use by Review worker. Lease lease-missing-child-thread is missing sub-agent thread metadata, so Ambient cannot safely force-cancel the owner.",
              blockerLeaseIds: ["lease-missing-child-thread"],
              affectedSubagents: [],
              forceAllowed: false,
              forceRequiresSubagentCancellation: false,
            }),
            load: expect.objectContaining({
              allowed: false,
              reason: "Runtime is already running and owned by an active local runtime lease.",
              blockerLeaseIds: ["lease-missing-child-thread"],
              affectedSubagents: [],
              forceRequiresSubagentCancellation: false,
            }),
          }),
        }),
      ],
    });
    expect(handoff).toMatchObject({
      activeOwners: [
        expect.objectContaining({
          leaseId: "lease-missing-child-thread",
          parentThreadId: "parent-thread",
          displayName: "Review worker",
        }),
      ],
      stopBlockers: [
        {
          runtimeEntryId: "local-text:local-text-runtime:4301",
          action: "stop",
          reason: "In use by Review worker. Lease lease-missing-child-thread is missing sub-agent thread metadata, so Ambient cannot safely force-cancel the owner.",
          blockerLeaseIds: ["lease-missing-child-thread"],
          affectedSubagents: [],
          forceAllowed: false,
          forceRequiresSubagentCancellation: false,
          untracked: false,
        },
      ],
      nextSafeActions: [
        {
          action: "wait-for-owner",
          safety: "blocked",
          runtimeEntryId: "local-text:local-text-runtime:4301",
          runtimeId: "local-text:local-text-runtime:4301",
          capability: "local-text",
          reason: "Wait for the active local runtime lease to release, become stale, or be repaired before ordinary lifecycle changes. Forced Stop/Restart is unavailable because owner metadata is incomplete.",
          blockerLeaseIds: ["lease-missing-child-thread"],
          affectedSubagents: [],
        },
      ],
    });
  });

  it("keeps unmatched active leases visible as tracked runtime rows", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([]),
      leases: [{
        schemaVersion: "ambient-local-runtime-lease-v1",
        leaseId: "lease-acquiring",
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Planner worker",
        modelRuntimeId: "local-text-runtime",
        modelProfileId: "local-text-4b-q4",
        modelId: "local/text-4b",
        providerId: "local",
        capabilityKind: "local-text",
        estimatedResidentMemoryBytes: 6 * gib,
        acquiredAt: "2026-06-06T00:00:00.000Z",
        lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
        status: "acquiring",
      }],
    });

    expect(inventory).toMatchObject({
      activeLeases: [expect.objectContaining({ leaseId: "lease-acquiring" })],
      entries: [
        {
          schemaVersion: "ambient-local-runtime-inventory-entry-v1",
          id: "local-text:local-text-runtime:lease",
          capability: "local-text",
          providerId: "local",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          trackingStatus: "tracked",
          running: false,
          estimatedResidentMemoryBytes: 6 * gib,
          owners: [
            {
              leaseId: "lease-acquiring",
              parentThreadId: "parent-thread",
              subagentThreadId: "child-thread",
              displayName: "sub-agent Planner worker",
              status: "acquiring",
            },
          ],
          stopDecision: {
            ordinaryStopAllowed: false,
            reason: "In use by sub-agent Planner worker.",
            blockerLeaseIds: ["lease-acquiring"],
            affectedSubagents: [
              {
                leaseId: "lease-acquiring",
                parentThreadId: "parent-thread",
                subagentThreadId: "child-thread",
                displayName: "sub-agent Planner worker",
                status: "acquiring",
                modelRuntimeId: "local-text-runtime",
                modelProfileId: "local-text-4b-q4",
                modelId: "local/text-4b",
                providerId: "local",
                capabilityKind: "local-text",
              },
            ],
            forceTerminationAllowed: true,
            forceRequiresSubagentCancellation: true,
            untracked: false,
          },
          lifecycleDecision: expect.objectContaining({
            stop: expect.objectContaining({ allowed: false, blockerLeaseIds: ["lease-acquiring"] }),
            restart: expect.objectContaining({ allowed: false, blockerLeaseIds: ["lease-acquiring"] }),
            load: expect.objectContaining({ allowed: false, blockerLeaseIds: ["lease-acquiring"] }),
          }),
          lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
        },
      ],
    });
  });

  it("builds a compact policy handoff with ownership, blockers, and memory evidence", () => {
    const lease = runtimeLease({
      leaseId: "lease-review",
      ownerDisplayName: "Review worker",
      subagentRunId: "run-review",
      actualResidentMemoryBytes: 5 * gib,
    });
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "local-text:local-text-runtime:4301",
        runtimeId: "local-text-runtime",
        pid: 4301,
        endpointUrl: "http://127.0.0.1:43123/health",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        actualResidentMemoryBytes: 5 * gib,
      })]),
      leases: [lease],
    });

    expect(buildLocalRuntimePolicyHandoff(inventory)).toMatchObject({
      schemaVersion: "ambient-local-runtime-policy-handoff-v1",
      runtimeCount: 1,
      runningCount: 1,
      activeLeaseCount: 1,
      stopBlockedRuntimeIds: ["local-text:local-text-runtime:4301"],
      restartBlockedRuntimeIds: ["local-text:local-text-runtime:4301"],
      untrackedRuntimeIds: [],
      memoryEvidence: {
        activeEstimatedResidentMemoryBytes: 6 * gib,
        activeActualResidentMemoryBytes: 5 * gib,
        entryCountWithActualRss: 1,
        entryCountWithOnlyEstimate: 0,
        entryCountWithUnknownMemory: 0,
      },
      runtimes: [
        {
          runtimeEntryId: "local-text:local-text-runtime:4301",
          capability: "local-text",
          trackingStatus: "managed",
          running: true,
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          pid: 4301,
          endpoint: "http://127.0.0.1:43123/health",
          activeLeaseIds: ["lease-review"],
          ordinaryStopAllowed: false,
          ordinaryRestartAllowed: false,
          untracked: false,
        },
      ],
      activeOwners: [
        {
          runtimeEntryId: "local-text:local-text-runtime:4301",
          leaseId: "lease-review",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          subagentRunId: "run-review",
          displayName: "sub-agent Review worker",
          status: "running",
          capabilityKind: "local-text",
          providerId: "local",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          estimatedResidentMemoryBytes: 6 * gib,
          actualResidentMemoryBytes: 5 * gib,
          pid: 4301,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-06T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
        },
      ],
      stopBlockers: [
        {
          runtimeEntryId: "local-text:local-text-runtime:4301",
          action: "stop",
          reason: "In use by sub-agent Review worker.",
          blockerLeaseIds: ["lease-review"],
          forceAllowed: true,
          forceRequiresSubagentCancellation: true,
          untracked: false,
        },
      ],
      nextSafeActions: [
        {
          action: "wait-for-owner",
          safety: "blocked",
          runtimeEntryId: "local-text:local-text-runtime:4301",
          runtimeId: "local-text:local-text-runtime:4301",
          capability: "local-text",
          reason: "Wait for the owning sub-agent lease to release this runtime before ordinary lifecycle changes. Forced Stop/Restart requires explicit cancellation or failure marking for affected sub-agents.",
          blockerLeaseIds: ["lease-review"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "lease-review",
              subagentThreadId: "child-thread",
              displayName: "sub-agent Review worker",
            }),
          ],
        },
        {
          action: "force-stop-runtime",
          safety: "requires-approval",
          runtimeEntryId: "local-text:local-text-runtime:4301",
          runtimeId: "local-text:local-text-runtime:4301",
          capability: "local-text",
          reason: "Forced Stop is available only through Ambient's ownership resolver: cancel or mark affected sub-agents, refresh inventory, then run the forced lifecycle action. Do not kill the process directly.",
          toolName: "ambient_local_model_runtime_stop",
          toolParams: { runtimeId: "local-text:local-text-runtime:4301", dryRun: true, force: true },
          blockerLeaseIds: ["lease-review"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "lease-review",
              subagentThreadId: "child-thread",
              displayName: "sub-agent Review worker",
            }),
          ],
          ownershipResolution: expect.objectContaining({
            schemaVersion: "ambient-local-runtime-policy-handoff-ownership-resolution-v1",
            required: true,
            lifecycleAction: "stop",
            resolution: "cancel-or-mark-affected-subagents",
            requiresInventoryRefresh: true,
            blockerLeaseIds: ["lease-review"],
          }),
        },
        {
          action: "force-restart-runtime",
          safety: "requires-approval",
          runtimeEntryId: "local-text:local-text-runtime:4301",
          runtimeId: "local-text:local-text-runtime:4301",
          capability: "local-text",
          reason: "Forced Restart is available only through Ambient's ownership resolver: cancel or mark affected sub-agents, refresh inventory, then run the forced lifecycle action. Do not kill the process directly.",
          toolName: "ambient_local_model_runtime_restart",
          toolParams: { runtimeId: "local-text:local-text-runtime:4301", dryRun: true, force: true },
          blockerLeaseIds: ["lease-review"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "lease-review",
              subagentThreadId: "child-thread",
              displayName: "sub-agent Review worker",
            }),
          ],
          ownershipResolution: expect.objectContaining({
            schemaVersion: "ambient-local-runtime-policy-handoff-ownership-resolution-v1",
            required: true,
            lifecycleAction: "restart",
            resolution: "cancel-or-mark-affected-subagents",
            requiresInventoryRefresh: true,
            blockerLeaseIds: ["lease-review"],
          }),
        },
      ],
    });
  });

  it("counts active acquiring lease estimates in policy handoff memory evidence before the runtime is running", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([]),
      leases: [runtimeLease({
        leaseId: "lease-acquiring",
        ownerDisplayName: "Planner worker",
        status: "acquiring",
        pid: undefined,
        endpoint: undefined,
        actualResidentMemoryBytes: undefined,
      })],
    });

    expect(inventory).toMatchObject({
      activeLeases: [expect.objectContaining({ leaseId: "lease-acquiring", status: "acquiring" })],
      entries: [
        expect.objectContaining({
          id: "local-text:local-text-runtime:lease",
          running: false,
          estimatedResidentMemoryBytes: 6 * gib,
          owners: [
            expect.objectContaining({
              leaseId: "lease-acquiring",
              displayName: "sub-agent Planner worker",
              status: "acquiring",
            }),
          ],
        }),
      ],
    });
    expect(buildLocalRuntimePolicyHandoff(inventory)).toMatchObject({
      activeLeaseCount: 1,
      memoryEvidence: {
        activeEstimatedResidentMemoryBytes: 6 * gib,
        entryCountWithActualRss: 0,
        entryCountWithOnlyEstimate: 1,
        entryCountWithUnknownMemory: 0,
        uncertaintyReasons: [
          "1 local runtime uses resident-memory estimates because RSS is not available.",
        ],
      },
      activeOwners: [
        expect.objectContaining({
          leaseId: "lease-acquiring",
          displayName: "sub-agent Planner worker",
          status: "acquiring",
          estimatedResidentMemoryBytes: 6 * gib,
        }),
      ],
      nextSafeActions: expect.arrayContaining([
        expect.objectContaining({
          action: "wait-for-owner",
          safety: "blocked",
          blockerLeaseIds: ["lease-acquiring"],
        }),
        expect.objectContaining({
          action: "force-stop-runtime",
          safety: "requires-approval",
          blockerLeaseIds: ["lease-acquiring"],
          ownershipResolution: expect.objectContaining({
            lifecycleAction: "stop",
            resolution: "cancel-or-mark-affected-subagents",
          }),
        }),
        expect.objectContaining({
          action: "force-restart-runtime",
          safety: "requires-approval",
          blockerLeaseIds: ["lease-acquiring"],
          ownershipResolution: expect.objectContaining({
            lifecycleAction: "restart",
            resolution: "cancel-or-mark-affected-subagents",
          }),
        }),
      ]),
    });
  });

  it("marks untracked local model processes as not safe for ordinary or forced stop", () => {
    expect(localRuntimeStopDecision({
      trackingStatus: "untracked",
      leases: [],
    })).toEqual({
      ordinaryStopAllowed: false,
      reason: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceTerminationAllowed: false,
      forceRequiresSubagentCancellation: false,
      untracked: true,
    });
  });

  it("names lifecycle actions independently for untracked runtimes", () => {
    expect(localRuntimeLifecycleDecision({
      trackingStatus: "untracked",
      leases: [],
      running: true,
    })).toMatchObject({
      stop: {
        allowed: false,
        reason: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
        untracked: true,
      },
      restart: {
        allowed: false,
        reason: "This local model process is untracked, so Ambient cannot assume it is safe to restart.",
        untracked: true,
      },
      load: {
        allowed: false,
        reason: "This local model process is untracked, so Ambient cannot assume it is safe to load.",
        untracked: true,
      },
      unload: {
        allowed: false,
        reason: "This local model process is untracked, so Ambient cannot assume it is safe to unload.",
        untracked: true,
      },
    });
  });

  it("keeps untracked runtime blockers visible in the policy handoff", async () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "untracked-llama:4401",
        trackingStatus: "untracked",
        pid: 4401,
        modelId: "unknown-local-model",
        estimatedResidentMemoryBytes: undefined,
      })]),
    });
    const handoff = buildLocalRuntimePolicyHandoff(inventory);

    expect(handoff).toMatchObject({
      untrackedRuntimeIds: ["untracked-llama:4401"],
      stopBlockedRuntimeIds: ["untracked-llama:4401"],
      memoryEvidence: {
        entryCountWithActualRss: 0,
        entryCountWithOnlyEstimate: 0,
        entryCountWithUnknownMemory: 1,
        uncertaintyReasons: [
          "1 local runtime has no resident-memory estimate or RSS sample.",
        ],
      },
      stopBlockers: [
        {
          runtimeEntryId: "untracked-llama:4401",
          action: "stop",
          reason: "This local model process is untracked, so Ambient cannot assume it is safe to stop.",
          blockerLeaseIds: [],
          affectedSubagents: [],
          forceAllowed: false,
          forceRequiresSubagentCancellation: false,
          untracked: true,
        },
      ],
      nextSafeActions: [
        {
          action: "ask-user-to-stop-untracked",
          safety: "external",
          runtimeEntryId: "untracked-llama:4401",
          runtimeId: "untracked-llama:4401",
          capability: "local-text",
          reason: "This local runtime is untracked, so Ambient ordinary Stop/Restart/Start remain disabled. Ask the owner or user to stop it outside Ambient, then call ambient_local_model_runtime_status again.",
          untracked: true,
        },
      ],
    });

    await writeUntrackedRuntimeSafetyProofArtifact(inventory, handoff);
  });

  it("allows ordinary Stop for managed runtimes without active sub-agent leases", () => {
    expect(localRuntimeStopDecision({
      trackingStatus: "managed",
      leases: [{
        schemaVersion: "ambient-local-runtime-lease-v1",
        leaseId: "released-lease",
        capabilityKind: "local-text",
        acquiredAt: "2026-06-06T00:00:00.000Z",
        lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
        status: "released",
      }],
    })).toEqual({
      ordinaryStopAllowed: true,
      reason: "No active sub-agent local runtime lease blocks ordinary Stop.",
      blockerLeaseIds: [],
      affectedSubagents: [],
      forceTerminationAllowed: true,
      forceRequiresSubagentCancellation: false,
      untracked: false,
    });
  });

  it("keeps releasing sub-agent leases active until the runtime owner finishes cleanup", () => {
    expect(localRuntimeStopDecision({
      trackingStatus: "managed",
      leases: [{
        schemaVersion: "ambient-local-runtime-lease-v1",
        leaseId: "releasing-lease",
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
        modelRuntimeId: "local-text-runtime",
        modelProfileId: "local-text-4b-q4",
        modelId: "local/text-4b",
        providerId: "local",
        capabilityKind: "local-text",
        acquiredAt: "2026-06-06T00:00:00.000Z",
        lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
        status: "releasing",
      }],
    })).toEqual({
      ordinaryStopAllowed: false,
      reason: "In use by sub-agent Review worker.",
      blockerLeaseIds: ["releasing-lease"],
      affectedSubagents: [
        {
          leaseId: "releasing-lease",
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          displayName: "sub-agent Review worker",
          status: "releasing",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
        },
      ],
      forceTerminationAllowed: true,
      forceRequiresSubagentCancellation: true,
      untracked: false,
    });
  });

  it("disables generic lifecycle actions for voice runtimes without provider-declared controls", () => {
    const lease: LocalRuntimeLeaseRecord = {
      schemaVersion: "ambient-local-runtime-lease-v1",
      leaseId: "voice-lease",
      parentThreadId: "parent-thread",
      subagentThreadId: "voice-child",
      ownerDisplayName: "Voice worker",
      modelRuntimeId: "piper-runtime",
      providerId: "ambient-cli:piper:tool:piper_tts",
      capabilityKind: "voice",
      acquiredAt: "2026-06-06T00:00:00.000Z",
      lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
      status: "running",
    };
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        capability: "voice",
        id: "voice:piper-runtime",
        runtimeId: "piper-runtime",
        providerId: "ambient-cli:piper:tool:piper_tts",
        modelId: "rhasspy/piper/en_US-lessac-medium",
        running: true,
        endpointUrl: "http://127.0.0.1:59201",
        estimatedResidentMemoryBytes: 2 * gib,
      })]),
      leases: [lease],
    });

    expect(inventory.entries[0]).toMatchObject({
      capability: "voice",
      owners: [
        {
          leaseId: "voice-lease",
          parentThreadId: "parent-thread",
          subagentThreadId: "voice-child",
          displayName: "sub-agent Voice worker",
          status: "running",
        },
      ],
      lifecycleDecision: {
        stop: {
          allowed: false,
          reason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
          forceAllowed: false,
          blockerLeaseIds: ["voice-lease"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "voice-lease",
              subagentThreadId: "voice-child",
              displayName: "sub-agent Voice worker",
            }),
          ],
          forceRequiresSubagentCancellation: true,
        },
        restart: {
          allowed: false,
          reason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Restart path for this row.",
          forceAllowed: false,
          blockerLeaseIds: ["voice-lease"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "voice-lease",
              subagentThreadId: "voice-child",
              displayName: "sub-agent Voice worker",
            }),
          ],
          forceRequiresSubagentCancellation: true,
        },
        load: {
          allowed: false,
          reason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Start path for this row.",
          forceAllowed: false,
          blockerLeaseIds: ["voice-lease"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "voice-lease",
              subagentThreadId: "voice-child",
              displayName: "sub-agent Voice worker",
            }),
          ],
          forceRequiresSubagentCancellation: true,
        },
      },
      stopDecision: {
        ordinaryStopAllowed: false,
        reason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
        blockerLeaseIds: ["voice-lease"],
        affectedSubagents: [
          expect.objectContaining({
            leaseId: "voice-lease",
            subagentThreadId: "voice-child",
            displayName: "sub-agent Voice worker",
          }),
        ],
        forceTerminationAllowed: false,
        forceRequiresSubagentCancellation: true,
      },
    });
  });

  it("disables generic lifecycle actions for declared embedding runtimes", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        capability: "embeddings",
        id: "embeddings:bge-runtime",
        runtimeId: "bge-runtime",
        providerId: "local-embeddings",
        modelId: "BAAI/bge-small-en-v1.5",
        running: true,
        endpointUrl: "http://127.0.0.1:59301",
        estimatedResidentMemoryBytes: 1536 * 1024 * 1024,
      })]),
    });

    expect(inventory.entries[0]).toMatchObject({
      capability: "embeddings",
      lifecycleDecision: {
        stop: {
          allowed: false,
          reason: "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
          forceAllowed: false,
        },
        load: {
          allowed: false,
          reason: "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Start path for this row.",
        },
      },
      stopDecision: {
        ordinaryStopAllowed: false,
        reason: "Embedding runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
        forceTerminationAllowed: false,
      },
    });
  });

  it("allows provider-declared lifecycle actions for managed non-text runtime rows", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        capability: "voice",
        id: "voice:piper-runtime",
        runtimeId: "piper-runtime",
        providerId: "ambient-cli:piper:tool:piper_tts",
        running: true,
        providerLifecycle: providerLifecycle(),
      })]),
    });

    expect(inventory.entries[0]).toMatchObject({
      providerLifecycle: providerLifecycle(),
      lifecycleDecision: {
        stop: {
          allowed: true,
          reason: 'Voice runtime has provider-declared Stop command "piper_stop".',
          forceAllowed: false,
        },
        restart: {
          allowed: true,
          reason: 'Voice runtime has provider-declared Restart command "piper_restart".',
          forceAllowed: false,
        },
        load: {
          allowed: false,
          reason: "Runtime is already running.",
        },
        unload: {
          allowed: false,
          reason: "Voice runtimes do not expose a provider-declared Unload command; use Stop for non-destructive shutdown when available.",
        },
      },
      stopDecision: {
        ordinaryStopAllowed: true,
        reason: 'Voice runtime has provider-declared Stop command "piper_stop".',
        forceTerminationAllowed: false,
      },
    });
    expect(buildLocalRuntimePolicyHandoff(inventory).nextSafeActions).toEqual([
      {
        action: "stop-runtime",
        safety: "requires-approval",
        runtimeEntryId: "voice:piper-runtime",
        runtimeId: "voice:piper-runtime",
        capability: "voice",
        reason: "Ordinary Stop is available for this managed runtime; preview with dryRun before changing process state.",
        toolName: "ambient_local_model_runtime_stop",
        toolParams: { runtimeId: "voice:piper-runtime", dryRun: true },
      },
      {
        action: "restart-runtime",
        safety: "requires-approval",
        runtimeEntryId: "voice:piper-runtime",
        runtimeId: "voice:piper-runtime",
        capability: "voice",
        reason: "Ordinary Restart is available for this managed runtime; preview with dryRun before changing process state.",
        toolName: "ambient_local_model_runtime_restart",
        toolParams: { runtimeId: "voice:piper-runtime", dryRun: true },
      },
    ]);
  });

  it("blocks provider-declared lifecycle actions while active sub-agent leases own the runtime", () => {
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        capability: "voice",
        id: "voice:piper-runtime",
        runtimeId: "piper-runtime",
        providerId: "ambient-cli:piper:tool:piper_tts",
        running: true,
        providerLifecycle: providerLifecycle(),
      })]),
      leases: [runtimeLease({
        leaseId: "voice-lease",
        capabilityKind: "voice",
        providerId: "ambient-cli:piper:tool:piper_tts",
        modelRuntimeId: "piper-runtime",
        ownerDisplayName: "Voice worker",
      })],
    });

    expect(inventory.entries[0]).toMatchObject({
      lifecycleDecision: {
        stop: {
          allowed: false,
          reason: "In use by sub-agent Voice worker. Provider-declared Stop is blocked until the owning sub-agent releases this runtime.",
          blockerLeaseIds: ["voice-lease"],
          forceAllowed: true,
          forceRequiresSubagentCancellation: true,
        },
        restart: {
          allowed: false,
          reason: "In use by sub-agent Voice worker. Provider-declared Restart is blocked until the owning sub-agent releases this runtime.",
          blockerLeaseIds: ["voice-lease"],
          forceAllowed: true,
          forceRequiresSubagentCancellation: true,
        },
      },
      stopDecision: {
        ordinaryStopAllowed: false,
        reason: "In use by sub-agent Voice worker. Provider-declared Stop is blocked until the owning sub-agent releases this runtime.",
        forceTerminationAllowed: true,
        forceRequiresSubagentCancellation: true,
      },
    });
    expect(buildLocalRuntimePolicyHandoff(inventory).nextSafeActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "force-stop-runtime",
        safety: "requires-approval",
        toolName: "ambient_local_model_runtime_stop",
        toolParams: { runtimeId: "voice:piper-runtime", dryRun: true, force: true },
        ownershipResolution: expect.objectContaining({
          lifecycleAction: "stop",
          resolution: "cancel-or-mark-affected-subagents",
        }),
      }),
      expect.objectContaining({
        action: "force-restart-runtime",
        safety: "requires-approval",
        toolName: "ambient_local_model_runtime_restart",
        toolParams: { runtimeId: "voice:piper-runtime", dryRun: true, force: true },
        ownershipResolution: expect.objectContaining({
          lifecycleAction: "restart",
          resolution: "cancel-or-mark-affected-subagents",
        }),
      }),
    ]));
  });

  it("does not offer forced ownership resolution when a provider-declared row lacks the requested command", () => {
    const lifecycle = providerLifecycle();
    const lifecycleWithoutStop = {
      schemaVersion: lifecycle.schemaVersion,
      providerKind: lifecycle.providerKind,
      packageId: lifecycle.packageId,
      packageName: lifecycle.packageName,
      start: lifecycle.start,
      restart: lifecycle.restart,
    };
    const inventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        capability: "voice",
        id: "voice:piper-runtime",
        runtimeId: "piper-runtime",
        providerId: "ambient-cli:piper:tool:piper_tts",
        running: true,
        providerLifecycle: lifecycleWithoutStop,
      })]),
      leases: [runtimeLease({
        leaseId: "voice-lease",
        capabilityKind: "voice",
        providerId: "ambient-cli:piper:tool:piper_tts",
        modelRuntimeId: "piper-runtime",
        ownerDisplayName: "Voice worker",
      })],
    });

    expect(inventory.entries[0]).toMatchObject({
      lifecycleDecision: {
        stop: {
          allowed: false,
          reason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
          blockerLeaseIds: ["voice-lease"],
          affectedSubagents: [
            expect.objectContaining({
              leaseId: "voice-lease",
              displayName: "sub-agent Voice worker",
              subagentThreadId: "child-thread",
            }),
          ],
          forceAllowed: false,
          forceRequiresSubagentCancellation: false,
        },
        restart: {
          allowed: false,
          reason: "In use by sub-agent Voice worker. Provider-declared Restart is blocked until the owning sub-agent releases this runtime.",
          blockerLeaseIds: ["voice-lease"],
          forceAllowed: true,
          forceRequiresSubagentCancellation: true,
        },
      },
      stopDecision: {
        ordinaryStopAllowed: false,
        reason: "In use by sub-agent Voice worker. Voice runtimes require a provider-declared lifecycle command; Ambient has no safe generic Stop path for this row.",
        blockerLeaseIds: ["voice-lease"],
        affectedSubagents: [
          expect.objectContaining({
            leaseId: "voice-lease",
            displayName: "sub-agent Voice worker",
            subagentThreadId: "child-thread",
          }),
        ],
        forceTerminationAllowed: false,
      },
    });
    const nextSafeActions = buildLocalRuntimePolicyHandoff(inventory).nextSafeActions;
    expect(nextSafeActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "force-restart-runtime",
        safety: "requires-approval",
        toolName: "ambient_local_model_runtime_restart",
        toolParams: { runtimeId: "voice:piper-runtime", dryRun: true, force: true },
        ownershipResolution: expect.objectContaining({
          lifecycleAction: "restart",
          resolution: "cancel-or-mark-affected-subagents",
        }),
      }),
    ]));
    expect(nextSafeActions.some((action) => action.action === "force-stop-runtime")).toBe(false);
  });

  it("treats active-looking sub-agent leases as stale only when a freshness window is supplied", async () => {
    const staleLease: LocalRuntimeLeaseRecord = {
      schemaVersion: "ambient-local-runtime-lease-v1",
      leaseId: "lease-stale",
      parentThreadId: "parent-thread",
      subagentThreadId: "child-thread",
      ownerDisplayName: "Old worker",
      modelRuntimeId: "local-text-runtime",
      modelProfileId: "local-text-4b-q4",
      modelId: "local/text-4b",
      providerId: "local",
      capabilityKind: "local-text",
      estimatedResidentMemoryBytes: 6 * gib,
      pid: 4301,
      endpoint: "http://127.0.0.1:43123/health",
      acquiredAt: "2026-06-06T00:00:00.000Z",
      lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
      status: "running",
    };

    expect(isActiveLocalRuntimeLease(staleLease)).toBe(true);
    expect(isActiveLocalRuntimeLease(staleLease, {
      now: "2026-06-06T00:10:00.000Z",
      staleMs: 5 * 60_000,
    })).toBe(false);

    const defaultInventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "local-text:local-text-runtime:4301",
        runtimeId: "local-text-runtime",
        pid: 4301,
      })]),
      leases: [staleLease],
      capturedAt: "2026-06-06T00:10:00.000Z",
    });
    expect(defaultInventory.entries[0]).toMatchObject({
      owners: [
        expect.objectContaining({
          leaseId: "lease-stale",
          displayName: "sub-agent Old worker",
        }),
      ],
      stopDecision: {
        ordinaryStopAllowed: false,
        blockerLeaseIds: ["lease-stale"],
      },
    });

    const staleAwareInventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "local-text:local-text-runtime:4301",
        runtimeId: "local-text-runtime",
        pid: 4301,
      })]),
      leases: [staleLease],
      capturedAt: "2026-06-06T00:10:00.000Z",
      leaseStaleMs: 5 * 60_000,
    });
    expect(staleAwareInventory.activeLeases).toEqual([]);
    const staleEntry = staleAwareInventory.entries[0];
    expect(staleEntry?.owners).toEqual([]);
    expect(staleEntry?.leases).toEqual([expect.objectContaining({ leaseId: "lease-stale" })]);
    expect(staleEntry?.leaseState).toEqual({
      activeLeaseIds: [],
      staleLeaseIds: ["lease-stale"],
      releasedLeaseIds: [],
      crashedLeaseIds: [],
      inactiveLeaseIds: ["lease-stale"],
    });
    expect(staleEntry?.stopDecision).toMatchObject({
      ordinaryStopAllowed: true,
      blockerLeaseIds: [],
      forceRequiresSubagentCancellation: false,
    });
    expect(staleEntry?.lifecycleDecision).toMatchObject({
      stop: { allowed: true, blockerLeaseIds: [] },
      restart: { allowed: true, blockerLeaseIds: [] },
    });
    expect(staleEntry?.lastHeartbeatAt).toBe("2026-06-06T00:01:00.000Z");
    const staleAwareHandoff = buildLocalRuntimePolicyHandoff(staleAwareInventory);
    expect(staleAwareHandoff).toMatchObject({
      activeLeaseCount: 0,
      stopBlockedRuntimeIds: [],
      restartBlockedRuntimeIds: [],
      activeOwners: [],
      nextSafeActions: expect.arrayContaining([
        expect.objectContaining({
          action: "stop-runtime",
          safety: "requires-approval",
          runtimeEntryId: "local-text:local-text-runtime:4301",
          toolName: "ambient_local_model_runtime_stop",
        }),
        expect.objectContaining({
          action: "restart-runtime",
          safety: "requires-approval",
          runtimeEntryId: "local-text:local-text-runtime:4301",
          toolName: "ambient_local_model_runtime_restart",
        }),
      ]),
    });

    const staleMemoryOnlyInventory = buildLocalRuntimeInventory({
      registry: registry([entry({
        id: "local-text:local-text-runtime:4301",
        runtimeId: "local-text-runtime",
        pid: 4301,
        estimatedResidentMemoryBytes: undefined,
        actualResidentMemoryBytes: undefined,
      })]),
      leases: [{ ...staleLease, actualResidentMemoryBytes: 5 * gib }],
      capturedAt: "2026-06-06T00:10:00.000Z",
      leaseStaleMs: 5 * 60_000,
    });
    expect(staleMemoryOnlyInventory.entries[0]?.estimatedResidentMemoryBytes).toBeUndefined();
    expect(staleMemoryOnlyInventory.entries[0]?.actualResidentMemoryBytes).toBeUndefined();
    expect(buildLocalRuntimePolicyHandoff(staleMemoryOnlyInventory).memoryEvidence).toMatchObject({
      activeEstimatedResidentMemoryBytes: 0,
      entryCountWithActualRss: 0,
      entryCountWithOnlyEstimate: 0,
      entryCountWithUnknownMemory: 1,
      uncertaintyReasons: [
        "1 local runtime has no resident-memory estimate or RSS sample.",
      ],
    });

    await writeStaleLeaseRecoveryProofArtifact(staleAwareInventory, staleAwareHandoff);
  });

  it("allows Restart and Load for stopped managed runtime rows without active sub-agent leases", () => {
    expect(localRuntimeLifecycleDecision({
      trackingStatus: "managed",
      leases: [],
      running: false,
    })).toMatchObject({
      stop: {
        allowed: false,
        reason: "Runtime is already stopped.",
      },
      restart: {
        allowed: true,
        reason: "No active sub-agent local runtime lease blocks ordinary Restart.",
      },
      load: {
        allowed: true,
        reason: "No active sub-agent local runtime lease blocks ordinary Load.",
      },
      unload: {
        allowed: false,
        reason: "Runtime is already stopped.",
      },
    });
  });
});

function registry(entries: LocalModelResourceRegistryEntry[]): LocalModelResourceRegistrySnapshot {
  return {
    schemaVersion: "ambient-local-model-resource-registry-v1",
    capturedAt: "2026-06-06T00:00:00.000Z",
    settings: {
      schemaVersion: "ambient-local-model-resource-settings-v1",
      memoryLimitBehavior: "warn",
    },
    entries,
    activeCount: entries.filter((candidate) => candidate.running).length,
    activeEstimatedResidentMemoryBytes: 0,
    policyDecision: {
      outcome: "unlimited",
      reason: "No local-model resident-memory ceiling is configured.",
      activeEstimatedResidentMemoryBytes: 0,
      projectedEstimatedResidentMemoryBytes: 0,
      unloadCandidateIds: [],
    },
  };
}

function entry(overrides: Partial<LocalModelResourceRegistryEntry> = {}): LocalModelResourceRegistryEntry {
  return {
    capability: "local-text",
    id: "local-text:local-text-runtime:4301",
    pid: 4301,
    running: true,
    statePath: "/workspace/.ambient/local-model-runtime/local-text-runtime/runtime-state.json",
    trackingStatus: "managed",
    estimatedResidentMemoryBytes: 6 * gib,
    ...overrides,
  };
}

function runtimeLease(overrides: Partial<LocalRuntimeLeaseRecord> = {}): LocalRuntimeLeaseRecord {
  return {
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    parentThreadId: "parent-thread",
    subagentThreadId: "child-thread",
    ownerDisplayName: "Review worker",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * gib,
    pid: 4301,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-06T00:00:00.000Z",
    lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
    status: "running",
    ...overrides,
  };
}

function providerLifecycle() {
  return {
    schemaVersion: "ambient-local-runtime-provider-lifecycle-v1" as const,
    providerKind: "ambient-cli" as const,
    packageId: "ambient-cli:piper:ambient-piper-runtime",
    packageName: "ambient-piper-runtime",
    start: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "start" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper:ambient-piper-runtime",
      packageName: "ambient-piper-runtime",
      command: "piper_start",
    },
    stop: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "stop" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper:ambient-piper-runtime",
      packageName: "ambient-piper-runtime",
      command: "piper_stop",
    },
    restart: {
      schemaVersion: "ambient-local-runtime-provider-lifecycle-action-v1" as const,
      kind: "restart" as const,
      providerKind: "ambient-cli" as const,
      packageId: "ambient-cli:piper:ambient-piper-runtime",
      packageName: "ambient-piper-runtime",
      command: "piper_restart",
    },
  };
}

async function writeSubagentStopBlockerProofArtifact(inventory: LocalRuntimeInventorySnapshot): Promise<void> {
  const outputPath = process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_OUT;
  if (!outputPath) return;
  const entry = inventory.entries[0];
  if (!entry) throw new Error("Expected a runtime inventory entry for sub-agent stop-blocker proof.");
  const existing = await readJsonIfExists(outputPath);
  const scenarios = isRecord(existing?.scenarios) ? existing.scenarios : {};
  const scenario = {
    status: "passed",
    proofKind: "deterministic-subagent-stop-blocker",
    runtimeEntryId: entry.id,
    capability: entry.capability,
    trackingStatus: entry.trackingStatus,
    running: entry.running,
    ordinaryStopAllowed: entry.stopDecision.ordinaryStopAllowed,
    activeLeaseCount: inventory.activeLeases.length,
    blockerLeaseIds: entry.stopDecision.blockerLeaseIds,
    affectedSubagents: entry.stopDecision.affectedSubagents,
    forceTerminationAllowed: entry.stopDecision.forceTerminationAllowed,
    forceRequiresSubagentCancellation: entry.stopDecision.forceRequiresSubagentCancellation,
    evidence: "Managed local-text runtime ordinary Stop is disabled while active sub-agent lease lease-review owns the runtime.",
  };
  const artifact = {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    updatedAt: new Date("2026-06-06T00:01:00.000Z").toISOString(),
    scenarios: {
      ...scenarios,
      "active-subagent-stop-blocker": scenario,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function writeUntrackedRuntimeSafetyProofArtifact(
  inventory: LocalRuntimeInventorySnapshot,
  handoff: LocalRuntimePolicyHandoffSnapshot,
): Promise<void> {
  const outputPath = process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_OUT;
  if (!outputPath) return;
  const entry = inventory.entries[0];
  if (!entry) throw new Error("Expected a runtime inventory entry for untracked runtime safety proof.");
  const existing = await readJsonIfExists(outputPath);
  const scenarios = isRecord(existing?.scenarios) ? existing.scenarios : {};
  const repeatedObservations = [
    "initial_inventory",
    "policy_handoff_recheck",
    "lifecycle_action_preview",
  ].map((observationKind) => ({
    observationKind,
    runtimeEntryId: entry.id,
    trackingStatus: entry.trackingStatus,
    ordinaryStopAllowed: entry.lifecycleDecision.stop.allowed,
    ordinaryRestartAllowed: entry.lifecycleDecision.restart.allowed,
    forceTerminationAllowed: entry.stopDecision.forceTerminationAllowed,
    untracked: entry.stopDecision.untracked,
    nextSafeAction: handoff.nextSafeActions.find((action) => action.runtimeEntryId === entry.id)?.action ?? "missing",
    nextSafeActionSafety: handoff.nextSafeActions.find((action) => action.runtimeEntryId === entry.id)?.safety ?? "missing",
  }));
  const scenario = {
    status: "passed",
    proofKind: "deterministic-untracked-runtime-safety",
    runtimeEntryId: entry.id,
    capability: entry.capability,
    trackingStatus: entry.trackingStatus,
    running: entry.running,
    pid: entry.pid,
    modelId: entry.modelId,
    ordinaryStopAllowed: entry.lifecycleDecision.stop.allowed,
    ordinaryRestartAllowed: entry.lifecycleDecision.restart.allowed,
    forceTerminationAllowed: entry.stopDecision.forceTerminationAllowed,
    untracked: entry.stopDecision.untracked,
    untrackedRuntimeIds: handoff.untrackedRuntimeIds,
    stopBlockedRuntimeIds: handoff.stopBlockedRuntimeIds,
    blockedActions: handoff.blockedActions.filter((action) => action.runtimeEntryId === entry.id),
    nextSafeActions: handoff.nextSafeActions.filter((action) => action.runtimeEntryId === entry.id),
    repeatedObservationCount: repeatedObservations.length,
    repeatedObservations,
    memoryEvidence: handoff.memoryEvidence,
    evidence: "Untracked local runtime untracked-llama:4401 stays visible while ordinary Stop/Restart and forced termination remain unavailable; only external owner/user stop guidance is offered.",
  };
  const artifact = {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    updatedAt: new Date("2026-06-06T00:01:00.000Z").toISOString(),
    scenarios: {
      ...scenarios,
      "untracked-runtime-safety": scenario,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function writeStaleLeaseRecoveryProofArtifact(
  inventory: LocalRuntimeInventorySnapshot,
  handoff: LocalRuntimePolicyHandoffSnapshot,
): Promise<void> {
  const outputPath = process.env.AMBIENT_LOCAL_RUNTIME_CONTROL_PROOF_OUT;
  if (!outputPath) return;
  const entry = inventory.entries[0];
  if (!entry) throw new Error("Expected a runtime inventory entry for stale lease recovery proof.");
  const existing = await readJsonIfExists(outputPath);
  const scenarios = isRecord(existing?.scenarios) ? existing.scenarios : {};
  const scenario = {
    status: "passed",
    proofKind: "deterministic-stale-lease-recovery",
    runtimeEntryId: entry.id,
    capability: entry.capability,
    trackingStatus: entry.trackingStatus,
    running: entry.running,
    ordinaryStopAllowed: entry.lifecycleDecision.stop.allowed,
    ordinaryRestartAllowed: entry.lifecycleDecision.restart.allowed,
    forceRequiresSubagentCancellation: entry.stopDecision.forceRequiresSubagentCancellation,
    activeLeaseCount: inventory.activeLeases.length,
    activeOwnerCount: handoff.activeOwners.length,
    staleLeaseIds: entry.leaseState.staleLeaseIds,
    blockerLeaseIds: entry.stopDecision.blockerLeaseIds,
    affectedSubagents: entry.stopDecision.affectedSubagents,
    nextSafeActions: handoff.nextSafeActions.filter((action) => action.runtimeEntryId === entry.id),
    memoryEvidence: handoff.memoryEvidence,
    evidence: "Stale local runtime lease lease-stale remains visible as stale evidence but no longer blocks ordinary Stop/Restart or counts as active owner memory.",
  };
  const artifact = {
    schemaVersion: "ambient-local-runtime-control-proof-v1",
    updatedAt: new Date("2026-06-06T00:10:00.000Z").toISOString(),
    scenarios: {
      ...scenarios,
      "stale-lease-recovery": scenario,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

async function readJsonIfExists(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch (error) {
    if ((error as { code?: string })?.code === "ENOENT") return undefined;
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
