import type { ChildProcess, SpawnOptions } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  LocalModelRuntimeManager,
  LocalModelRuntimeStartupError,
  isLocalModelRuntimeStartupError,
  probeLocalModelRuntimeHealth,
  readLocalModelRuntimeLeaseJournal,
  readLocalModelRuntimeLeaseJournals,
  readRepairedLocalModelRuntimeLeaseJournalWithRecovery,
  readLocalModelRuntimeState,
} from "./localModelRuntimeManager";

describe("LocalModelRuntimeManager", () => {
  it("starts a local text runtime, writes state, samples memory, and stops on final idle release", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 0,
        ownerThreadId: "thread-1",
        parentThreadId: "parent-thread-1",
        subagentThreadId: "thread-1",
        subagentRunId: "run-1",
        ownerDisplayName: "Review worker",
      }));

      expect(lease.state).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-state-v1",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 5001,
        ownerThreadId: "thread-1",
        parentThreadId: "parent-thread-1",
        subagentThreadId: "thread-1",
        subagentRunId: "run-1",
        ownerDisplayName: "Review worker",
        estimatedResidentMemoryBytes: 6 * gib,
        actualResidentMemoryBytes: 4 * gib,
        memorySampledAt: "2026-06-05T00:00:00.000Z",
      });
      expect(lease.acquisition).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-acquisition-v1",
        source: "started",
        leaseId: lease.leaseId,
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 5001,
        acquiredAt: "2026-06-05T00:00:00.000Z",
        activeLeases: 1,
        runtimeLease: {
          schemaVersion: "ambient-local-runtime-lease-v1",
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread-1",
          subagentThreadId: "thread-1",
          subagentRunId: "run-1",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          estimatedResidentMemoryBytes: 6 * gib,
          actualResidentMemoryBytes: 4 * gib,
          pid: 5001,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-05T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
          status: "running",
        },
      });
      expect(lease.runtimeLease).toEqual(lease.acquisition.runtimeLease);
      expect(fixture.spawnCalls).toEqual([
        expect.objectContaining({
          command: fixture.runtimePath,
          args: ["serve", "--port", "43123"],
          pid: 5001,
        }),
      ]);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        command: [fixture.runtimePath, "serve", "--port", "43123"],
        healthUrl: "http://127.0.0.1:43123/health",
        subagentRunId: "run-1",
        actualResidentMemoryBytes: 4 * gib,
      });

      await expect(lease.release()).resolves.toMatchObject({
        status: "stopped",
        leaseId: lease.leaseId,
        pid: 5001,
        remainingLeases: 0,
        runtimeLease: {
          schemaVersion: "ambient-local-runtime-lease-v1",
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread-1",
          subagentThreadId: "thread-1",
          subagentRunId: "run-1",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          estimatedResidentMemoryBytes: 6 * gib,
          actualResidentMemoryBytes: 4 * gib,
          pid: 5001,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-05T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
          status: "released",
        },
      });
      expect(fixture.alive.has(5001)).toBe(false);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        status: "stopped",
        stoppedAt: "2026-06-05T00:00:00.000Z",
        command: [fixture.runtimePath, "serve", "--port", "43123"],
        healthUrl: "http://127.0.0.1:43123/health",
        estimatedResidentMemoryBytes: 6 * gib,
      });
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.not.toHaveProperty("actualResidentMemoryBytes");
    } finally {
      await fixture.cleanup();
    }
  });

  it("reuses a healthy persisted runtime after manager recreation", async () => {
    const fixture = await runtimeFixture();
    try {
      const first = await fixture.manager.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));
      const replacement = fixture.newManager();
      const second = await replacement.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));

      expect(second.state.pid).toBe(first.state.pid);
      expect(second.acquisition).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-acquisition-v1",
        source: "persisted",
        leaseId: second.leaseId,
        runtimeId: "local-text-runtime",
        pid: first.state.pid,
        activeLeases: 1,
      });
      expect(fixture.spawnCalls).toHaveLength(1);

      await second.release();
      expect(fixture.alive.has(first.state.pid)).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns idle cleanup timing when the final lease is released but the runtime stays warm", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
      }));

      await expect(lease.release()).resolves.toMatchObject({
        status: "released",
        leaseId: lease.leaseId,
        pid: 5001,
        remainingLeases: 0,
        releasedAt: "2026-06-05T00:00:00.000Z",
        idleCleanupDueAt: "2026-06-05T00:00:01.000Z",
        runtimeLease: {
          leaseId: lease.leaseId,
          modelRuntimeId: "local-text-runtime",
          status: "released",
        },
      });
      expect(fixture.alive.has(5001)).toBe(true);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        idleTimeoutMs: 1000,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("journals a releasing lease while final stop-on-release is in progress", async () => {
    let unblockStop!: () => void;
    let stopStarted!: () => void;
    const stopStartedPromise = new Promise<void>((resolve) => {
      stopStarted = resolve;
    });
    const fixture = await runtimeFixture({
      sleep: async () => {
        stopStarted();
        await new Promise<void>((resolve) => {
          unblockStop = resolve;
        });
      },
    });
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 0,
        parentThreadId: "parent-thread-1",
        subagentThreadId: "thread-1",
        ownerDisplayName: "Review worker",
      }));

      const releasePromise = lease.release();
      await stopStartedPromise;

      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread-1",
          subagentThreadId: "thread-1",
          status: "releasing",
          lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
        }),
      ]);

      unblockStop();
      await expect(releasePromise).resolves.toMatchObject({
        status: "stopped",
        leaseId: lease.leaseId,
        runtimeLease: {
          leaseId: lease.leaseId,
          status: "released",
          actualResidentMemoryBytes: 4 * gib,
        },
      });
      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          status: "released",
          actualResidentMemoryBytes: 4 * gib,
        }),
      ]);
    } finally {
      unblockStop?.();
      await fixture.cleanup();
    }
  });

  it("journals an acquiring lease while startup health is pending", async () => {
    let unblockHealth!: () => void;
    let healthStarted!: () => void;
    const healthStartedPromise = new Promise<void>((resolve) => {
      healthStarted = resolve;
    });
    const healthUnblockedPromise = new Promise<void>((resolve) => {
      unblockHealth = resolve;
    });
    let called = false;
    const fixture = await runtimeFixture({
      beforeHealthResponse: async () => {
        if (!called) {
          called = true;
          healthStarted();
          await healthUnblockedPromise;
        }
      },
    });
    let acquirePromise: Promise<Awaited<ReturnType<LocalModelRuntimeManager["acquire"]>>> | undefined;
    try {
      acquirePromise = fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 0,
        parentThreadId: "parent-thread-1",
        subagentThreadId: "thread-1",
        ownerDisplayName: "Review worker",
      }));

      await healthStartedPromise;
      const acquiringLeases = await readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime");
      expect(acquiringLeases).toHaveLength(1);
      expect(acquiringLeases[0]).toMatchObject({
        schemaVersion: "ambient-local-runtime-lease-v1",
        parentThreadId: "parent-thread-1",
        subagentThreadId: "thread-1",
        ownerDisplayName: "Review worker",
        modelRuntimeId: "local-text-runtime",
        modelProfileId: "local-text-4b-q4",
        modelId: "local/text-4b",
        providerId: "local",
        capabilityKind: "local-text",
        estimatedResidentMemoryBytes: 6 * gib,
        endpoint: "http://127.0.0.1:43123/health",
        acquiredAt: "2026-06-05T00:00:00.000Z",
        lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
        status: "acquiring",
      });
      expect(acquiringLeases[0].pid).toBeUndefined();

      unblockHealth();
      const lease = await acquirePromise;
      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread-1",
          subagentThreadId: "thread-1",
          actualResidentMemoryBytes: 4 * gib,
          pid: 5001,
          status: "running",
        }),
      ]);
      await lease.release();
    } finally {
      unblockHealth?.();
      await acquirePromise?.catch(() => undefined);
      await fixture.cleanup();
    }
  });

  it("keeps a reused local runtime alive until the final lease is released", async () => {
    const fixture = await runtimeFixture();
    try {
      const first = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
      }));
      const second = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
      }));

      expect(second.state.pid).toBe(first.state.pid);
      expect(first.acquisition).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-acquisition-v1",
        source: "started",
        activeLeases: 1,
      });
      expect(second.acquisition).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-acquisition-v1",
        source: "active",
        leaseId: second.leaseId,
        runtimeId: "local-text-runtime",
        pid: first.state.pid,
        activeLeases: 2,
      });
      expect(fixture.spawnCalls).toHaveLength(1);
      await expect(first.release()).resolves.toMatchObject({
        status: "still-leased",
        leaseId: first.leaseId,
        pid: 5001,
        remainingLeases: 1,
        releasedAt: "2026-06-05T00:00:00.000Z",
        runtimeLease: {
          leaseId: first.leaseId,
          modelRuntimeId: "local-text-runtime",
          status: "released",
        },
      });
      expect(fixture.alive.has(5001)).toBe(true);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        idleTimeoutMs: 1000,
      });

      await expect(second.release()).resolves.toMatchObject({
        status: "released",
        leaseId: second.leaseId,
        pid: 5001,
        remainingLeases: 0,
        releasedAt: "2026-06-05T00:00:00.000Z",
        idleCleanupDueAt: "2026-06-05T00:00:01.000Z",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks managed Stop while active leases own the runtime", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));

      await expect(fixture.manager.stopRuntime({
        runtimeId: "local-text-runtime",
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "blocked",
        runtimeId: "local-text-runtime",
        forceRequested: false,
        pid: 5001,
        activeLeaseIds: [lease.leaseId],
        activeLeases: [
          expect.objectContaining({
            leaseId: lease.leaseId,
            parentThreadId: "parent-thread",
            subagentThreadId: "child-thread",
            ownerDisplayName: "Review worker",
            modelRuntimeId: "local-text-runtime",
            modelProfileId: "local-text-4b-q4",
            modelId: "local/text-4b",
            providerId: "local",
            capabilityKind: "local-text",
            estimatedResidentMemoryBytes: 6 * gib,
            actualResidentMemoryBytes: 4 * gib,
            pid: 5001,
            status: "running",
          }),
        ],
        reason: "Active local runtime leases block ordinary Stop.",
      });
      await expect(fixture.manager.stopRuntime({
        runtimeId: "local-text-runtime",
        force: true,
      })).resolves.toMatchObject({
        status: "blocked",
        forceRequested: true,
        activeLeaseIds: [lease.leaseId],
        activeLeases: [
          expect.objectContaining({
            leaseId: lease.leaseId,
            subagentThreadId: "child-thread",
            modelRuntimeId: "local-text-runtime",
          }),
        ],
        reason: expect.stringContaining("requires explicit cancellation"),
      });
      expect(fixture.alive.has(5001)).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks managed Restart while active leases own the runtime", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));

      await expect(fixture.manager.restartRuntime({
        runtimeId: "local-text-runtime",
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "blocked",
        runtimeId: "local-text-runtime",
        forceRequested: false,
        previousPid: 5001,
        activeLeaseIds: [lease.leaseId],
        activeLeases: [
          expect.objectContaining({
            leaseId: lease.leaseId,
            parentThreadId: "parent-thread",
            subagentThreadId: "child-thread",
            ownerDisplayName: "Review worker",
            modelRuntimeId: "local-text-runtime",
            modelProfileId: "local-text-4b-q4",
            modelId: "local/text-4b",
            providerId: "local",
            capabilityKind: "local-text",
            pid: 5001,
            status: "running",
          }),
        ],
        reason: "Active local runtime leases block ordinary Restart.",
      });
      await expect(fixture.manager.restartRuntime({
        runtimeId: "local-text-runtime",
        force: true,
      })).resolves.toMatchObject({
        status: "blocked",
        forceRequested: true,
        activeLeaseIds: [lease.leaseId],
        activeLeases: [
          expect.objectContaining({
            leaseId: lease.leaseId,
            subagentThreadId: "child-thread",
            modelRuntimeId: "local-text-runtime",
          }),
        ],
        reason: expect.stringContaining("requires explicit cancellation"),
      });
      expect(fixture.alive.has(5001)).toBe(true);
      expect(fixture.spawnCalls).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("stops a warm runtime after the final lease has been released", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
      }));
      await lease.release();

      await expect(fixture.manager.stopRuntime({
        runtimeId: "local-text-runtime",
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "stopped",
        runtimeId: "local-text-runtime",
        forceRequested: false,
        pid: 5001,
        stoppedAt: "2026-06-05T00:00:00.000Z",
      });
      expect(fixture.alive.has(5001)).toBe(false);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        status: "stopped",
        stoppedAt: "2026-06-05T00:00:00.000Z",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("restarts a warm runtime after the final lease has been released", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
      }));
      await lease.release();

      await expect(fixture.manager.restartRuntime({
        runtimeId: "local-text-runtime",
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "restarted",
        runtimeId: "local-text-runtime",
        forceRequested: false,
        previousPid: 5001,
        pid: 5002,
        restartedAt: "2026-06-05T00:00:00.000Z",
      });
      expect(fixture.alive.has(5001)).toBe(false);
      expect(fixture.alive.has(5002)).toBe(true);
      expect(fixture.spawnCalls).toHaveLength(2);
      expect(fixture.spawnCalls[1]).toMatchObject({
        command: fixture.runtimePath,
        args: ["serve", "--port", "43123"],
        pid: 5002,
      });
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5002,
        command: [fixture.runtimePath, "serve", "--port", "43123"],
        healthUrl: "http://127.0.0.1:43123/health",
        actualResidentMemoryBytes: 4 * gib,
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("stops a persisted managed runtime from state after manager recreation", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
      }));
      await lease.release();
      const replacement = fixture.newManager();

      await expect(replacement.stopRuntime({
        runtimeId: "local-text-runtime",
        stateRootPath: fixture.stateRootPath,
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "stopped",
        runtimeId: "local-text-runtime",
        pid: 5001,
      });
      expect(fixture.alive.has(5001)).toBe(false);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        status: "stopped",
        stoppedAt: "2026-06-05T00:00:00.000Z",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("restarts a persisted managed runtime from state after manager recreation", async () => {
    const fixture = await runtimeFixture();
    let replacement: LocalModelRuntimeManager | undefined;
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
      }));
      await lease.release();
      replacement = fixture.newManager();

      await expect(replacement.restartRuntime({
        runtimeId: "local-text-runtime",
        stateRootPath: fixture.stateRootPath,
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-restart-v1",
        status: "restarted",
        runtimeId: "local-text-runtime",
        previousPid: 5001,
        pid: 5002,
      });
      expect(fixture.alive.has(5001)).toBe(false);
      expect(fixture.alive.has(5002)).toBe(true);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5002,
      });
    } finally {
      await replacement?.stopAll().catch(() => undefined);
      await fixture.cleanup();
    }
  });

  it("starts a stopped persisted managed runtime from state after manager recreation", async () => {
    const fixture = await runtimeFixture();
    let replacement: LocalModelRuntimeManager | undefined;
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 0,
      }));
      await lease.release();
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        status: "stopped",
      });
      replacement = fixture.newManager();

      await expect(replacement.startRuntime({
        runtimeId: "local-text-runtime",
        stateRootPath: fixture.stateRootPath,
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "started",
        runtimeId: "local-text-runtime",
        previousPid: 5001,
        pid: 5002,
        startedAt: "2026-06-05T00:00:00.000Z",
      });
      expect(fixture.alive.has(5001)).toBe(false);
      expect(fixture.alive.has(5002)).toBe(true);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5002,
        status: "running",
        command: [fixture.runtimePath, "serve", "--port", "43123"],
      });
    } finally {
      await replacement?.stopAll().catch(() => undefined);
      await fixture.cleanup();
    }
  });

  it("blocks Start while active leases own the runtime", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));

      await expect(fixture.manager.startRuntime({
        runtimeId: "local-text-runtime",
        stateRootPath: fixture.stateRootPath,
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-start-v1",
        status: "blocked",
        runtimeId: "local-text-runtime",
        previousPid: 5001,
        activeLeaseIds: [lease.leaseId],
        activeLeases: [
          expect.objectContaining({
            leaseId: lease.leaseId,
            parentThreadId: "parent-thread",
            subagentThreadId: "child-thread",
            ownerDisplayName: "Review worker",
            modelRuntimeId: "local-text-runtime",
            modelProfileId: "local-text-4b-q4",
            modelId: "local/text-4b",
            providerId: "local",
            capabilityKind: "local-text",
            pid: 5001,
            status: "running",
          }),
        ],
        reason: "Active local runtime leases block ordinary Start.",
      });
      expect(fixture.alive.has(5001)).toBe(true);
      expect(fixture.spawnCalls).toHaveLength(1);
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns active runtime lease records for inventory joins", async () => {
    const fixture = await runtimeFixture();
    try {
      const first = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));
      const second = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));

      expect(fixture.manager.activeRuntimeLeases()).toEqual([
        expect.objectContaining({
          leaseId: first.leaseId,
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          status: "running",
        }),
        expect.objectContaining({
          leaseId: second.leaseId,
          subagentThreadId: "child-thread",
          status: "running",
        }),
      ]);

      await first.release();
      expect(fixture.manager.activeRuntimeLeases()).toEqual([
        expect.objectContaining({ leaseId: second.leaseId }),
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps owner metadata distinct for concurrent leases sharing one warm runtime", async () => {
    const fixture = await runtimeFixture();
    try {
      const reviewer = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-review",
        subagentThreadId: "child-review",
        subagentRunId: "run-review",
        ownerDisplayName: "Review worker",
      }));
      const summarizer = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-summary",
        subagentThreadId: "child-summary",
        subagentRunId: "run-summary",
        ownerDisplayName: "Summary worker",
      }));

      expect(summarizer.state.pid).toBe(reviewer.state.pid);
      expect(summarizer.acquisition.runtimeLease).toMatchObject({
        leaseId: summarizer.leaseId,
        parentThreadId: "parent-summary",
        subagentThreadId: "child-summary",
        subagentRunId: "run-summary",
        ownerDisplayName: "Summary worker",
        status: "running",
      });
      expect(fixture.manager.activeRuntimeLeases()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          leaseId: reviewer.leaseId,
          parentThreadId: "parent-review",
          subagentThreadId: "child-review",
          subagentRunId: "run-review",
          ownerDisplayName: "Review worker",
        }),
        expect.objectContaining({
          leaseId: summarizer.leaseId,
          parentThreadId: "parent-summary",
          subagentThreadId: "child-summary",
          subagentRunId: "run-summary",
          ownerDisplayName: "Summary worker",
        }),
      ]));

      await reviewer.release();
      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({
          leaseId: reviewer.leaseId,
          parentThreadId: "parent-review",
          subagentThreadId: "child-review",
          subagentRunId: "run-review",
          ownerDisplayName: "Review worker",
          status: "released",
        }),
        expect.objectContaining({
          leaseId: summarizer.leaseId,
          parentThreadId: "parent-summary",
          subagentThreadId: "child-summary",
          subagentRunId: "run-summary",
          ownerDisplayName: "Summary worker",
          status: "running",
        }),
      ]));

      await summarizer.release();
    } finally {
      await fixture.cleanup();
    }
  });

  it("persists local runtime lease ownership through acquire, heartbeat, and release", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));

      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          actualResidentMemoryBytes: 4 * gib,
          pid: 5001,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-05T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
          status: "running",
        }),
      ]);

      fixture.setNow("2026-06-05T00:02:00.000Z");
      await lease.touch();
      await expect(readLocalModelRuntimeLeaseJournals(fixture.stateRootPath)).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          lastHeartbeatAt: "2026-06-05T00:02:00.000Z",
          status: "running",
        }),
      ]);

      await lease.release();
      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          lastHeartbeatAt: "2026-06-05T00:02:00.000Z",
          status: "released",
        }),
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("blocks lifecycle actions from a fresh persisted lease journal after manager recreation", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));
      const replacement = fixture.newManager();

      await expect(replacement.stopRuntime({
        runtimeId: "local-text-runtime",
        stateRootPath: fixture.stateRootPath,
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "blocked",
        runtimeId: "local-text-runtime",
        pid: 5001,
        activeLeaseIds: [lease.leaseId],
        activeLeases: [
          expect.objectContaining({
            leaseId: lease.leaseId,
            parentThreadId: "parent-thread",
            subagentThreadId: "child-thread",
            ownerDisplayName: "Review worker",
            modelRuntimeId: "local-text-runtime",
            status: "running",
          }),
        ],
        reason: "Active local runtime leases block ordinary Stop.",
      });
      expect(fixture.alive.has(5001)).toBe(true);

      await lease.release();
    } finally {
      await fixture.cleanup();
    }
  });

  it("repairs fresh persisted active leases as crashed when the runtime pid is dead after manager recreation", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));
      fixture.alive.delete(lease.state.pid);
      fixture.setNow("2026-06-05T00:01:00.000Z");
      const replacement = fixture.newManager();

      await expect(replacement.stopRuntime({
        runtimeId: "local-text-runtime",
        stateRootPath: fixture.stateRootPath,
      })).resolves.toMatchObject({
        schemaVersion: "ambient-local-model-runtime-stop-v1",
        status: "stopped",
        runtimeId: "local-text-runtime",
        forceRequested: false,
        pid: 5001,
        stoppedAt: "2026-06-05T00:01:00.000Z",
      });

      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          pid: 5001,
          lastHeartbeatAt: "2026-06-05T00:01:00.000Z",
          status: "crashed",
        }),
      ]);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toMatchObject({
        pid: 5001,
        status: "stopped",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("reports stale persisted lease recovery when a dead runtime pid is repaired to crashed", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        subagentRunId: "child-run",
        ownerDisplayName: "Review worker",
      }));
      fixture.alive.delete(lease.state.pid);
      fixture.setNow("2026-06-05T00:10:00.000Z");

      const result = await readRepairedLocalModelRuntimeLeaseJournalWithRecovery(
        fixture.stateRootPath,
        "local-text-runtime",
        {
          processAlive: (pid) => fixture.alive.has(pid),
          now: () => new Date("2026-06-05T00:10:00.000Z"),
          staleMs: 5 * 60_000,
        },
      );

      expect(result.leases).toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          subagentRunId: "child-run",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          pid: 5001,
          lastHeartbeatAt: "2026-06-05T00:10:00.000Z",
          status: "crashed",
        }),
      ]);
      expect(result.recovery).toMatchObject({
        schemaVersion: "ambient-local-runtime-lease-recovery-v1",
        capturedAt: "2026-06-05T00:10:00.000Z",
        issueCount: 2,
        repairedLeaseIds: [lease.leaseId],
        staleLeaseIds: [lease.leaseId],
        crashedLeaseIds: [lease.leaseId],
        issues: [
          expect.objectContaining({
            schemaVersion: "ambient-local-runtime-lease-recovery-issue-v1",
            source: "lease_journal",
            kind: "stale_active_lease",
            leaseId: lease.leaseId,
            repaired: false,
            previousStatus: "running",
            status: "running",
            subagentRunId: "child-run",
          }),
          expect.objectContaining({
            schemaVersion: "ambient-local-runtime-lease-recovery-issue-v1",
            source: "lease_journal",
            kind: "dead_runtime_crashed",
            leaseId: lease.leaseId,
            repaired: true,
            previousStatus: "running",
            status: "crashed",
            subagentRunId: "child-run",
          }),
        ],
      });
      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          status: "crashed",
          lastHeartbeatAt: "2026-06-05T00:10:00.000Z",
        }),
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps lease acquisition time stable while heartbeat advances", async () => {
    const fixture = await runtimeFixture();
    try {
      const lease = await fixture.manager.acquire(fixture.acquireInput({
        idleTimeoutMs: 1000,
        parentThreadId: "parent-thread",
        subagentThreadId: "child-thread",
        ownerDisplayName: "Review worker",
      }));

      fixture.setNow("2026-06-05T00:02:00.000Z");
      await lease.touch();

      expect(fixture.manager.activeRuntimeLeases()).toEqual([
        expect.objectContaining({
          leaseId: lease.leaseId,
          parentThreadId: "parent-thread",
          subagentThreadId: "child-thread",
          ownerDisplayName: "Review worker",
          acquiredAt: "2026-06-05T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-05T00:02:00.000Z",
          status: "running",
        }),
      ]);
      expect(lease.acquisition.acquiredAt).toBe("2026-06-05T00:00:00.000Z");
      expect(lease.runtimeLease).toMatchObject({
        acquiredAt: "2026-06-05T00:00:00.000Z",
        lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
      });
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not reuse a persisted runtime when the launch command changes", async () => {
    const fixture = await runtimeFixture();
    try {
      const first = await fixture.manager.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));
      const replacement = fixture.newManager();
      const second = await replacement.acquire(fixture.acquireInput({
        idleTimeoutMs: 0,
        args: ["serve", "--port", "43124"],
        healthUrl: "http://127.0.0.1:43124/health",
      }));

      expect(second.state.pid).not.toBe(first.state.pid);
      expect(fixture.spawnCalls).toHaveLength(2);
      expect(fixture.alive.has(first.state.pid)).toBe(false);

      await second.release();
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not treat a stopped persisted runtime pid as live after pid reuse", async () => {
    const fixture = await runtimeFixture();
    try {
      const first = await fixture.manager.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));
      await first.release();
      expect(fixture.alive.has(5001)).toBe(false);

      fixture.alive.add(5001);
      const replacement = fixture.newManager();
      const second = await replacement.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }));

      expect(second.state.pid).toBe(5002);
      expect(second.acquisition.source).toBe("started");
      expect(fixture.alive.has(5001)).toBe(true);
      expect(fixture.alive.has(5002)).toBe(true);
      expect(fixture.spawnCalls).toHaveLength(2);

      await second.release();
    } finally {
      await fixture.cleanup();
    }
  });

  it("clears state and fails when launched process exits before health", async () => {
    const fixture = await runtimeFixture({ spawnAlive: false });
    try {
      await expect(fixture.manager.acquire(fixture.acquireInput({ idleTimeoutMs: 0 }))).rejects.toThrow(/exited during startup/);

      expect(fixture.spawnCalls).toHaveLength(1);
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toBeUndefined();
    } finally {
      await fixture.cleanup();
    }
  });

  it("throws structured startup failure evidence when health never becomes ready", async () => {
    const fixture = await runtimeFixture({
      healthStatus: 503,
      healthBody: "x".repeat(2100),
    });
    try {
      let thrown: unknown;
      try {
        await fixture.manager.acquire(fixture.acquireInput({
          idleTimeoutMs: 0,
          startupTimeoutMs: 1,
          parentThreadId: "parent-thread-1",
          subagentThreadId: "thread-1",
          ownerDisplayName: "Review worker",
        }));
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(LocalModelRuntimeStartupError);
      expect(isLocalModelRuntimeStartupError(thrown)).toBe(true);
      const failure = (thrown as LocalModelRuntimeStartupError).failure;
      expect(failure).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-startup-failure-v1",
        reason: "startup_timeout",
        runtimeId: "local-text-runtime",
        providerId: "local",
        modelId: "local/text-4b",
        profileId: "local-text-4b-q4",
        pid: 5001,
        startupTimeoutMs: 1,
        stdoutPath: expect.stringContaining("runtime.stdout.log"),
        stderrPath: expect.stringContaining("runtime.stderr.log"),
        health: {
          ok: false,
          statusCode: 503,
          timedOut: true,
          textPreview: `${"x".repeat(1997)}...`,
        },
      });
      expect(failure.message).toContain("Local model runtime did not become healthy");
      await expect(readLocalModelRuntimeState(fixture.stateRootPath, "local-text-runtime")).resolves.toBeUndefined();
      await expect(readLocalModelRuntimeLeaseJournal(fixture.stateRootPath, "local-text-runtime")).resolves.toEqual([
        expect.objectContaining({
          schemaVersion: "ambient-local-runtime-lease-v1",
          parentThreadId: "parent-thread-1",
          subagentThreadId: "thread-1",
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          estimatedResidentMemoryBytes: 6 * gib,
          pid: 5001,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-05T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-05T00:00:00.000Z",
          status: "crashed",
        }),
      ]);
      expect(fixture.alive.has(5001)).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("returns bounded health probe details for unhealthy runtimes", async () => {
    const health = await probeLocalModelRuntimeHealth("http://127.0.0.1:43123/health", {
      fetchImpl: async () => new Response("x".repeat(2100), { status: 503 }),
    });

    expect(health).toMatchObject({
      ok: false,
      statusCode: 503,
      textPreview: `${"x".repeat(1997)}...`,
    });
  });
});

const gib = 1024 ** 3;

async function runtimeFixture(options: {
  spawnAlive?: boolean;
  healthStatus?: number;
  healthBody?: string;
  beforeHealthResponse?: () => Promise<void>;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "ambient-local-model-runtime-"));
  const runtimePath = join(root, "local-text-runtime");
  const stateRootPath = join(root, "state");
  await writeFile(runtimePath, "synthetic local text runtime", "utf8");
  const alive = new Set<number>();
  const spawnCalls: Array<{ command: string; args: string[]; options: SpawnOptions; pid: number }> = [];
  let now = new Date("2026-06-05T00:00:00.000Z");
  let nextPid = 5000;
  const spawnProcess = vi.fn((command: string, args: string[], spawnOptions: SpawnOptions) => {
    const pid = nextPid += 1;
    if (options.spawnAlive !== false) alive.add(pid);
    spawnCalls.push({ command, args, options: spawnOptions, pid });
    return {
      pid,
      unref: vi.fn(),
    } as unknown as ChildProcess;
  });
  const processAlive = (pid: number) => alive.has(pid);
  const killProcess = (pid: number) => {
    alive.delete(pid);
  };
  const fetchImpl = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith("/health")) {
      await options.beforeHealthResponse?.();
      if (options.healthStatus && options.healthStatus !== 200) {
        return new Response(options.healthBody ?? "unhealthy", { status: options.healthStatus });
      }
      return jsonResponse({ status: "ok" });
    }
    return new Response("not found", { status: 404 });
  });
  const newManager = () => new LocalModelRuntimeManager({
    spawnProcess,
    processAlive,
    killProcess,
    fetchImpl: fetchImpl as typeof fetch,
    sampleMemory: async (pid) => processAlive(pid)
      ? { residentMemoryBytes: 4 * gib, sampledAt: "2026-06-05T00:00:00.000Z" }
      : undefined,
    sleep: options.sleep ?? (async () => undefined),
    now: () => now,
  });
  const manager = newManager();
  return {
    root,
    runtimePath,
    stateRootPath,
    alive,
    spawnCalls,
    manager,
    newManager,
    setNow: (value: string) => {
      now = new Date(value);
    },
    acquireInput: (overrides: Partial<Parameters<LocalModelRuntimeManager["acquire"]>[0]> = {}) => ({
      runtimeId: "local-text-runtime",
      modelId: "local/text-4b",
      profileId: "local-text-4b-q4",
      stateRootPath,
      command: runtimePath,
      args: ["serve", "--port", "43123"],
      cwd: root,
      healthUrl: "http://127.0.0.1:43123/health",
      estimatedResidentMemoryBytes: 6 * gib,
      ...overrides,
    }),
    cleanup: async () => {
      await manager.stopAll().catch(() => undefined);
      await rm(root, { recursive: true, force: true });
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
