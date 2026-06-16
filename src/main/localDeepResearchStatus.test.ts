import { describe, expect, it } from "vitest";

import type { LocalModelResourceRegistrySnapshot } from "../shared/types";
import {
  localDeepResearchMemoryStatus,
  localDeepResearchStatusSnapshot,
  localDeepResearchToolUpdate,
} from "./localDeepResearchStatus";

describe("localDeepResearchStatus", () => {
  it("builds renderer-safe tool updates with memory policy context", () => {
    const memory = localDeepResearchMemoryStatus(registry(), ["Projected local-model launch over policy."], {
      swapUsedBytes: 3 * 1024 ** 3,
      compressedMemoryBytes: 512 * 1024 ** 2,
    });
    const snapshot = localDeepResearchStatusSnapshot({
      stage: "model-turn",
      message: "LiteResearcher model turn 2/6 is running.",
      startedAtMs: 1_000,
      nowMs: 13_500,
      heartbeatCount: 4,
      turn: {
        turn: 2,
        maxTurns: 6,
        toolCalls: 3,
        maxToolCalls: 6,
      },
      memory,
    });

    const update = localDeepResearchToolUpdate("ambient_local_deep_research_run", snapshot);

    expect(update.content).toEqual([{ type: "text", text: "LiteResearcher model turn 2/6 is running." }]);
    expect(update.details).toMatchObject({
      runtime: "ambient-local-deep-research",
      toolName: "ambient_local_deep_research_run",
      status: "running",
      stage: "model-turn",
      elapsedMs: 12_500,
      heartbeatCount: 4,
      waitingOn: "llama.cpp",
      localDeepResearchStatus: {
        stage: "model-turn",
        memory: {
          policyOutcome: "warn",
          swapUsedBytes: 3 * 1024 ** 3,
          compressedMemoryBytes: 512 * 1024 ** 2,
          warnings: ["Projected local-model launch over policy."],
        },
      },
    });
  });
});

function registry(): LocalModelResourceRegistrySnapshot {
  return {
    schemaVersion: "ambient-local-model-resource-registry-v1",
    capturedAt: "2026-06-16T00:00:00.000Z",
    settings: {
      schemaVersion: "ambient-local-model-resource-settings-v1",
      memoryLimitBehavior: "warn",
      maxProjectedMemoryUtilization: 0.8,
    },
    entries: [],
    hostMemory: {
      schemaVersion: "ambient-local-model-host-memory-v1",
      sampledAt: "2026-06-16T00:00:00.000Z",
      totalMemoryBytes: 32 * 1024 ** 3,
      freeMemoryBytes: 4 * 1024 ** 3,
    },
    activeCount: 2,
    activeEstimatedResidentMemoryBytes: 15 * 1024 ** 3,
    activeActualResidentMemoryBytes: 8 * 1024 ** 3,
    policyDecision: {
      outcome: "warn",
      reason: "Projected local-model launch over policy.",
      activeEstimatedResidentMemoryBytes: 15 * 1024 ** 3,
      activeActualResidentMemoryBytes: 8 * 1024 ** 3,
      activeResidentMemoryBasis: "actual-rss",
      projectedEstimatedResidentMemoryBytes: 24 * 1024 ** 3,
      projectedResidentMemoryBytes: 24 * 1024 ** 3,
      projectedSystemMemoryUtilization: 0.95,
      maxProjectedMemoryUtilization: 0.8,
      projectedFreeMemoryBytes: 512 * 1024 ** 2,
      projectedFreeMemoryRatio: 0.015,
      unloadCandidateIds: [],
    },
  };
}
