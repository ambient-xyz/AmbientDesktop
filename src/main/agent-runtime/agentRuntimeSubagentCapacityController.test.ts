import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  AMBIENT_LOCAL_TEXT_MODEL,
  resolveAmbientModelRuntimeProfile,
  type AmbientModelRuntimeProfile,
} from "../../shared/ambientModels";
import type { LocalModelHostMemorySnapshot } from "../../shared/localRuntimeTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { AgentRuntimeSubagentCapacityController } from "./agentRuntimeSubagentCapacityController";

const gib = 1024 ** 3;

describe("AgentRuntimeSubagentCapacityController", () => {
  it("resolves local model memory capacity through the local resource registry", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-subagent-capacity-"));
    try {
      const activeRuntimeLeases = vi.fn(() => []);
      const localModelHostMemory = vi.fn((): LocalModelHostMemorySnapshot => ({
        schemaVersion: "ambient-local-model-host-memory-v1",
        sampledAt: "2026-06-21T00:00:00.000Z",
        totalMemoryBytes: 64 * gib,
        freeMemoryBytes: 48 * gib,
        availableMemoryBytes: 48 * gib,
      }));
      const controller = new AgentRuntimeSubagentCapacityController({
        store: {
          getThread: () => ({
            id: "parent-thread",
            workspacePath,
          } as unknown as ThreadSummary),
        },
        runtimeManager: {
          acquire: vi.fn(async () => {
            throw new Error("Local runtime acquisition should not be used by this capacity test.");
          }),
          activeRuntimeLeases,
        },
        localModelHostMemory,
      });

      const lease = await controller.resolveCapacityLease({
        parentThreadId: "parent-thread",
        parentRunId: "parent-run",
        canonicalTaskPath: "root/worker",
        roleId: "worker",
        model: localTextProfile(),
      });

      expect(activeRuntimeLeases).toHaveBeenCalledTimes(1);
      expect(localModelHostMemory).toHaveBeenCalledTimes(1);
      expect(lease.localMemory.outcome).not.toBe("not_applicable");
      expect(lease.localMemory.projectedEstimatedResidentMemoryBytes).toBeGreaterThan(0);
    } finally {
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});

function localTextProfile(): AmbientModelRuntimeProfile {
  return {
    ...resolveAmbientModelRuntimeProfile(AMBIENT_LOCAL_TEXT_MODEL),
    profileId: `local:${AMBIENT_LOCAL_TEXT_MODEL}:configured`,
    selectableAsSubagent: true,
    available: true,
    unavailableReason: undefined,
    estimatedResidentMemoryBytes: 4 * gib,
    contextWindowTokens: 8_192,
  };
}
