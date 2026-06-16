import { describe, expect, it } from "vitest";
import { AMBIENT_DEFAULT_MODEL, AMBIENT_LOCAL_TEXT_MODEL, resolveAmbientModelRuntimeProfile } from "./ambientModels";
import {
  releaseSubagentCapacityLease,
  resolveSubagentCapacityLease,
  type SubagentCapacityLocalMemorySnapshot,
} from "./subagentCapacity";

describe("subagent capacity resolver", () => {
  it("records a provider reservation for cloud models and counts unclosed children", () => {
    const lease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/2:explorer",
      roleId: "explorer",
      model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      existingRuns: [
        { id: "open-complete", status: "completed", modelRuntimeSnapshot: { profile: { providerId: "ambient", modelId: AMBIENT_DEFAULT_MODEL } } },
        { id: "closed", status: "completed", closedAt: "2026-06-05T00:01:00.000Z", modelRuntimeSnapshot: { profile: { providerId: "ambient", modelId: AMBIENT_DEFAULT_MODEL } } },
      ],
      now: "2026-06-05T00:00:00.000Z",
    });

    expect(lease).toMatchObject({
      schemaVersion: "ambient-subagent-capacity-lease-v1",
      status: "reserved",
      depth: { depth: 1, maxDepth: 1, allowed: true },
      provider: {
        providerId: "ambient",
        modelId: AMBIENT_DEFAULT_MODEL,
        locality: "cloud",
        profile: {
          schemaVersion: "ambient-subagent-capacity-model-profile-v1",
          profileId: `ambient:${AMBIENT_DEFAULT_MODEL}`,
          label: "Kimi K2.7 Code",
          available: true,
          selectableAsSubagent: true,
          supportsStreaming: true,
          toolUse: "ambient-tools",
          structuredOutput: "schema",
          supportsVision: true,
          supportsAudio: false,
          costClass: "included",
          trustClass: "ambient-managed",
          privacyLabel: "Ambient managed cloud model",
          contextWindowTokens: 262_144,
          maxOutputTokens: 262_144,
          memoryClass: "remote",
        },
        openRunCount: 1,
        projectedOpenRunCount: 2,
        allowed: true,
      },
      localMemory: {
        outcome: "not_applicable",
        allowed: true,
      },
      blockingReasons: [],
    });
  });

  it("blocks when provider concurrency or local memory policy is unavailable", () => {
    const localMemory: SubagentCapacityLocalMemorySnapshot = {
      outcome: "refuse",
      allowed: false,
      reason: "Projected local-model resident memory exceeds the configured ceiling.",
      requestedEstimatedResidentMemoryBytes: 8,
      activeEstimatedResidentMemoryBytes: 8,
      projectedEstimatedResidentMemoryBytes: 16,
      maxResidentMemoryBytes: 12,
      exceededByBytes: 4,
      unloadCandidateIds: [],
    };
    const lease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/1:summarizer",
      roleId: "summarizer",
      model: {
        ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
        available: true,
        selectableAsSubagent: true,
        locality: "local",
        estimatedResidentMemoryBytes: 8,
      },
      providerConcurrencyLimit: 1,
      existingRuns: [
        { id: "open-local", status: "completed", modelRuntimeSnapshot: { profile: { providerId: "local", modelId: AMBIENT_LOCAL_TEXT_MODEL } } },
      ],
      localMemory,
      now: "2026-06-05T00:00:00.000Z",
    });

    expect(lease.status).toBe("blocked");
    expect(lease.provider.allowed).toBe(false);
    expect(lease.provider.profile).toMatchObject({
      profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}`,
      available: true,
      selectableAsSubagent: true,
      estimatedResidentMemoryBytes: 8,
    });
    expect(lease.localMemory).toEqual(localMemory);
    expect(lease.blockingReasons).toEqual([
      "Provider local would exceed its sub-agent concurrency limit (2/1).",
      localMemory.reason,
    ]);
  });

  it("marks leases released idempotently without deleting the reservation facts", () => {
    const lease = resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:explorer",
      roleId: "explorer",
      model: resolveAmbientModelRuntimeProfile(AMBIENT_DEFAULT_MODEL),
      now: "2026-06-05T00:00:00.000Z",
    });

    const released = releaseSubagentCapacityLease(lease, {
      releasedAt: "2026-06-05T00:05:00.000Z",
      reason: "close_agent",
    });

    expect(released).toMatchObject({
      status: "released",
      releasedAt: "2026-06-05T00:05:00.000Z",
      releaseReason: "close_agent",
      provider: lease.provider,
    });
    expect(releaseSubagentCapacityLease(released, {
      releasedAt: "2026-06-05T00:10:00.000Z",
      reason: "second close",
    })).toBe(released);
  });
});
