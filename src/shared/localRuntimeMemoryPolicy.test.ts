import { describe, expect, it } from "vitest";
import { resolveLocalRuntimeMemoryPolicy } from "./localRuntimeMemoryPolicy";

const gib = 1024 ** 3;

describe("local runtime memory policy", () => {
  it("uses actual RSS for resident models and estimates for requested models under the projected utilization policy", () => {
    const decision = resolveLocalRuntimeMemoryPolicy({
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        memoryLimitBehavior: "refuse",
      },
      hostMemory: {
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-06T00:00:00.000Z",
        totalMemoryBytes: 32 * gib,
        freeMemoryBytes: 14 * gib,
      },
      activeEstimatedResidentMemoryBytes: 20 * gib,
      activeActualResidentMemoryBytes: 10 * gib,
      requestedEstimatedResidentMemoryBytes: 6 * gib,
    });

    expect(decision).toMatchObject({
      outcome: "within-limit",
      activeResidentMemoryBasis: "actual-rss",
      activeEstimatedResidentMemoryBytes: 20 * gib,
      activeActualResidentMemoryBytes: 10 * gib,
      projectedEstimatedResidentMemoryBytes: 26 * gib,
      projectedResidentMemoryBytes: 16 * gib,
      projectedFreeMemoryBytes: 8 * gib,
      projectedFreeMemoryRatio: 0.25,
      projectedSystemMemoryUtilization: 0.75,
      maxProjectedMemoryUtilization: 0.8,
      minFreeMemoryRatioAfterLaunch: 0.2,
      comfortableFreeMemoryRatio: 0.4,
      unloadCandidateIds: [],
    });
  });

  it("mixes actual RSS and estimates when only some active runtimes have memory samples", () => {
    const decision = resolveLocalRuntimeMemoryPolicy({
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        memoryLimitBehavior: "refuse",
      },
      hostMemory: {
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-06T00:00:00.000Z",
        totalMemoryBytes: 32 * gib,
        freeMemoryBytes: 20 * gib,
      },
      activeEstimatedResidentMemoryBytes: 16 * gib,
      activeActualResidentMemoryBytes: 7 * gib,
      activeEstimatedResidentMemoryBytesWithoutActual: 6 * gib,
      requestedEstimatedResidentMemoryBytes: 5 * gib,
    });

    expect(decision).toMatchObject({
      outcome: "within-limit",
      activeResidentMemoryBasis: "mixed",
      activeEstimatedResidentMemoryBytes: 16 * gib,
      activeActualResidentMemoryBytes: 7 * gib,
      requestedEstimatedResidentMemoryBytes: 5 * gib,
      projectedEstimatedResidentMemoryBytes: 21 * gib,
      projectedResidentMemoryBytes: 18 * gib,
      uncertaintyReasons: [
        "Active resident model memory mixes actual RSS for sampled runtimes with estimates for runtimes that have not reported RSS.",
      ],
      unloadCandidateIds: [],
    });
  });

  it("blocks by configured behavior when projected launch violates the utilization ceiling and free-memory floor", () => {
    const decision = resolveLocalRuntimeMemoryPolicy({
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        memoryLimitBehavior: "refuse",
      },
      hostMemory: {
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-06T00:00:00.000Z",
        totalMemoryBytes: 32 * gib,
        freeMemoryBytes: 9 * gib,
      },
      activeEstimatedResidentMemoryBytes: 7 * gib,
      requestedEstimatedResidentMemoryBytes: 4 * gib,
      unloadCandidateIds: ["idle-local-text"],
    });

    expect(decision).toMatchObject({
      outcome: "refuse",
      projectedFreeMemoryBytes: 5 * gib,
      projectedFreeMemoryRatio: 0.15625,
      projectedSystemMemoryUtilization: 0.84375,
      unloadCandidateIds: ["idle-local-text"],
      uncertaintyReasons: ["Active resident model memory uses estimates because actual RSS is not available."],
    });
    expect(decision.reason).toContain("above the 80% ceiling");
    expect(decision.reason).toContain("below the 20% floor");
  });

  it("preserves the legacy unlimited and absolute-ceiling behavior when host memory is absent", () => {
    expect(resolveLocalRuntimeMemoryPolicy({
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        memoryLimitBehavior: "warn",
      },
      activeEstimatedResidentMemoryBytes: 0,
    })).toMatchObject({
      outcome: "unlimited",
      reason: "No local-model resident-memory ceiling is configured.",
    });

    expect(resolveLocalRuntimeMemoryPolicy({
      settings: {
        schemaVersion: "ambient-local-model-resource-settings-v1",
        maxResidentMemoryBytes: 8 * gib,
        memoryLimitBehavior: "refuse",
      },
      activeEstimatedResidentMemoryBytes: 7 * gib,
      requestedEstimatedResidentMemoryBytes: 4 * gib,
    })).toMatchObject({
      outcome: "refuse",
      reason: "Projected local-model resident memory exceeds the configured ceiling by 3.0 GiB; refusing launch.",
      exceededByBytes: 3 * gib,
    });
  });
});
