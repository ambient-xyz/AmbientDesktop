import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  AMBIENT_LOCAL_TEXT_MODEL,
  createAmbientModelRuntimeSnapshot,
} from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { LocalRuntimeLeaseRecord } from "../../shared/localRuntimeTypes";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { AgentRuntime } from "./agentRuntime";
import { detectLocalLlamaResidentProcesses } from "./agentRuntimeLocalLlamaFacade";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";

const gib = 1024 ** 3;

describe("AgentRuntime Local Deep Research ownership tools", () => {
  it("cancels owning sub-agents when resolving forced local runtime ownership", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-ownership-resolver-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("Parent with local runtime child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Local review worker",
        roleId: "reviewer",
        roleProfileSnapshot: getDefaultSubagentRoleProfile("reviewer"),
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-06T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const result = await (runtime as any).resolveLocalRuntimeOwnershipForForcedAction({
        schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        entryId: "local-text:local-text-runtime:5001",
        modelRuntimeId: "local-text-runtime",
        modelProfileId: "local-text-4b-q4",
        modelId: "local/text-4b",
        providerId: "local",
        capabilityKind: "local-text",
        blockerLeaseIds: ["lease-review"],
        affectedSubagents: [{
          leaseId: "lease-review",
          parentThreadId: parent.id,
          subagentThreadId: running.childThreadId,
          subagentRunId: running.id,
          displayName: "sub-agent Review worker",
          status: "running",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
        }],
        activeLeases: [{
          schemaVersion: "ambient-local-runtime-lease-v1",
          leaseId: "lease-review",
          parentThreadId: parent.id,
          subagentThreadId: running.childThreadId,
          subagentRunId: running.id,
          ownerDisplayName: "Review worker",
          modelRuntimeId: "local-text-runtime",
          modelProfileId: "local-text-4b-q4",
          modelId: "local/text-4b",
          providerId: "local",
          capabilityKind: "local-text",
          estimatedResidentMemoryBytes: 6 * gib,
          pid: process.pid,
          endpoint: "http://127.0.0.1:43123/health",
          acquiredAt: "2026-06-06T00:00:00.000Z",
          lastHeartbeatAt: "2026-06-06T00:01:00.000Z",
          status: "running",
        }],
        reason: "In use by sub-agent Review worker.",
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "resolved",
        resolvedLeaseIds: ["lease-review"],
        resolvedChildRunIds: [running.id],
      });
      expect(store.getSubagentRun(running.id).status).toBe("cancelled");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            childRunId: running.id,
            childThreadId: running.childThreadId,
            status: "cancelled",
            source: "parent_cancel_request",
            toolCallId: "local-runtime-stop-ownership",
          }),
        }),
      ]));
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks forced local runtime ownership resolution when the lease cannot be mapped to a child run", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-local-ownership-blocked-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      const result = await (runtime as any).resolveLocalRuntimeOwnershipForForcedAction({
        schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
        action: "restart",
        runtimeId: "local-text-runtime",
        entryId: "local-text:local-text-runtime:5001",
        modelRuntimeId: "local-text-runtime",
        capabilityKind: "local-text",
        blockerLeaseIds: ["lease-missing"],
        affectedSubagents: [{
          leaseId: "lease-missing",
          subagentThreadId: "missing-child-thread",
          displayName: "sub-agent Missing worker",
          status: "running",
          capabilityKind: "local-text",
        }],
        activeLeases: [],
        reason: "In use by sub-agent Missing worker.",
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: "restart",
        runtimeId: "local-text-runtime",
        status: "blocked",
        resolvedLeaseIds: [],
        resolvedChildRunIds: [],
        blockedLeaseIds: ["lease-missing"],
      });
      expect(result.reason).toContain("No active sub-agent run maps to child thread missing-child-thread.");
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("blocks forced local runtime ownership resolution when exact lease run metadata mismatches the child thread", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-ownership-run-mismatch-");
    try {
      const result = await (fixture.runtime as any).resolveLocalRuntimeOwnershipForForcedAction({
        schemaVersion: "ambient-local-runtime-ownership-resolution-request-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        entryId: "local-text:local-text-runtime:5001",
        modelRuntimeId: "local-text-runtime",
        capabilityKind: "local-text",
        blockerLeaseIds: ["lease-review"],
        affectedSubagents: [{
          leaseId: "lease-review",
          parentThreadId: fixture.childRun.parentThreadId,
          subagentThreadId: fixture.childRun.childThreadId,
          subagentRunId: "wrong-run",
          displayName: "sub-agent Review worker",
          status: "running",
          capabilityKind: "local-text",
        }],
        activeLeases: [{
          ...fixture.activeLeases()[0]!,
          subagentRunId: "wrong-run",
        }],
        reason: "In use by sub-agent Review worker.",
      });

      expect(result).toMatchObject({
        schemaVersion: "ambient-local-runtime-ownership-resolution-result-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "blocked",
        resolvedLeaseIds: [],
        resolvedChildRunIds: [],
        blockedLeaseIds: ["lease-review"],
      });
      expect(result.reason).toContain(`No active sub-agent run maps to run wrong-run / child thread ${fixture.childRun.childThreadId}.`);
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("running");
    } finally {
      await fixture.cleanup();
    }
  });

  it("forces Stop by cancelling the owning sub-agent before the managed local runtime action", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-action-stop-");
    try {
      const stopRuntime = vi.fn(async (input: any) => {
        await writeAgentRuntimeLocalTextRuntimeState(fixture.workspacePath, { status: "stopped" });
        return {
          schemaVersion: "ambient-local-model-runtime-stop-v1" as const,
          status: "stopped" as const,
          runtimeId: input.runtimeId,
          forceRequested: input.force === true,
          pid: process.pid,
          stoppedAt: "2026-06-06T00:02:00.000Z",
        };
      });
      (fixture.runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => fixture.activeLeases(),
        stopRuntime,
      };

      const result = await fixture.runtime.runLocalModelRuntimeLifecycleAction({
        action: "stop",
        runtimeId: "local-text-runtime",
        force: true,
      });

      expect(stopRuntime).toHaveBeenCalledTimes(1);
      expect(stopRuntime).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        force: true,
      }));
      expect(result).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "stopped",
        forceRequested: true,
        before: {
          inventory: {
            activeLeases: [
              expect.objectContaining({ leaseId: "lease-review" }),
            ],
          },
        },
        after: {
          inventory: {
            activeLeases: [],
          },
        },
      });
      expect(result.message).toContain("Ownership resolution resolved");
      expect(result.message).toContain("Cancelled 1 sub-agent run before forced local runtime Stop");
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("cancelled");
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            childRunId: fixture.childRun.id,
            childThreadId: fixture.childRun.childThreadId,
            source: "parent_cancel_request",
            toolCallId: "local-runtime-stop-ownership",
          }),
        }),
      ]));
    } finally {
      await fixture.cleanup();
    }
  });

  it("keeps forced Stop blocked when the owning sub-agent is cancelled but its local runtime lease remains active", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-action-stop-retained-lease-");
    try {
      const retainedLease = fixture.activeLeases()[0]!;
      const stopRuntime = vi.fn(async () => {
        throw new Error("Stop should not run while the resolved lease remains active.");
      });
      (fixture.runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => [retainedLease],
        stopRuntime,
      };

      const result = await fixture.runtime.runLocalModelRuntimeLifecycleAction({
        action: "stop",
        runtimeId: "local-text-runtime",
        force: true,
      });

      expect(stopRuntime).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
        action: "stop",
        runtimeId: "local-text-runtime",
        status: "blocked",
        forceRequested: true,
      });
      expect(result.message).toContain("Ownership resolution blocked");
      expect(result.message).toContain("lease lease-review still active");
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("cancelled");
    } finally {
      await fixture.cleanup();
    }
  });

  it("forces Restart by cancelling the owning sub-agent before the managed local runtime action", async () => {
    const fixture = await createAgentRuntimeLocalRuntimeOwnershipFixture("ambient-runtime-local-action-restart-");
    try {
      const restartRuntime = vi.fn(async (input: any) => ({
        schemaVersion: "ambient-local-model-runtime-restart-v1" as const,
        status: "restarted" as const,
        runtimeId: input.runtimeId,
        forceRequested: input.force === true,
        previousPid: process.pid,
        pid: process.pid,
        restartedAt: "2026-06-06T00:02:00.000Z",
      }));
      (fixture.runtime as any).localModelRuntimeManager = {
        activeRuntimeLeases: () => fixture.activeLeases(),
        restartRuntime,
      };

      const result = await fixture.runtime.runLocalModelRuntimeLifecycleAction({
        action: "restart",
        runtimeId: "local-text-runtime",
        force: true,
      });

      expect(restartRuntime).toHaveBeenCalledTimes(1);
      expect(restartRuntime).toHaveBeenCalledWith(expect.objectContaining({
        runtimeId: "local-text-runtime",
        force: true,
      }));
      expect(result).toMatchObject({
        schemaVersion: "ambient-local-model-runtime-lifecycle-action-v1",
        action: "restart",
        runtimeId: "local-text-runtime",
        status: "restarted",
        forceRequested: true,
        before: {
          inventory: {
            activeLeases: [
              expect.objectContaining({ leaseId: "lease-review" }),
            ],
          },
        },
        after: {
          inventory: {
            activeLeases: [],
          },
        },
      });
      expect(result.message).toContain("Ownership resolution resolved");
      expect(result.message).toContain("Cancelled 1 sub-agent run before forced local runtime Restart");
      expect(fixture.store.getSubagentRun(fixture.childRun.id).status).toBe("cancelled");
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.parentRun.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            childRunId: fixture.childRun.id,
            childThreadId: fixture.childRun.childThreadId,
            source: "parent_cancel_request",
            toolCallId: "local-runtime-restart-ownership",
          }),
        }),
      ]));
    } finally {
      await fixture.cleanup();
    }
  });

});

async function createAgentRuntimeLocalRuntimeOwnershipFixture(prefix: string) {
  const workspacePath = await mkdtemp(join(tmpdir(), prefix));
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  await writeAgentRuntimeLocalTextRuntimeState(workspacePath);
  store.setFeatureFlagSettings({ subagents: true });
  const parent = store.createThread("Parent with local runtime lifecycle child");
  const assistant = store.addMessage({
    threadId: parent.id,
    role: "assistant",
    content: "",
    metadata: { status: "streaming", runtime: "pi" },
  });
  const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
  const featureFlags = resolveAmbientFeatureFlags({
    settings: store.getFeatureFlagSettings(),
    generatedAt: "2026-06-06T00:00:00.000Z",
  });
  const created = store.createSubagentRun({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    parentMessageId: assistant.id,
    title: "Local review worker",
    roleId: "reviewer",
    roleProfileSnapshot: getDefaultSubagentRoleProfile("reviewer"),
    canonicalTaskPath: "root/0:reviewer",
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(AMBIENT_LOCAL_TEXT_MODEL, "2026-06-06T00:00:00.000Z"),
    dependencyMode: "required",
  });
  const childRun = store.markSubagentRunStatus(created.id, "running");
  const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
    request: vi.fn(),
    denyThread: () => undefined,
  }, {
    localModelResidentProcesses: (targetWorkspacePath) => detectLocalLlamaResidentProcesses(targetWorkspacePath, {
      includeUntracked: false,
      sampleProcessMemory: false,
    }),
  });
  const lease = (): LocalRuntimeLeaseRecord => ({
    schemaVersion: "ambient-local-runtime-lease-v1",
    leaseId: "lease-review",
    parentThreadId: parent.id,
    subagentThreadId: childRun.childThreadId,
    subagentRunId: childRun.id,
    ownerDisplayName: "Review worker",
    modelRuntimeId: "local-text-runtime",
    modelProfileId: "local-text-4b-q4",
    modelId: "local/text-4b",
    providerId: "local",
    capabilityKind: "local-text",
    estimatedResidentMemoryBytes: 6 * gib,
    pid: process.pid,
    endpoint: "http://127.0.0.1:43123/health",
    acquiredAt: "2026-06-06T00:00:00.000Z",
    lastHeartbeatAt: new Date().toISOString(),
    status: "running",
  });
  return {
    workspacePath,
    store,
    runtime,
    parentRun,
    childRun,
    activeLeases: () => store.getSubagentRun(childRun.id).status === "cancelled" ? [] : [lease()],
    cleanup: async () => {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}
async function writeAgentRuntimeLocalTextRuntimeState(
  workspacePath: string,
  input: { status?: "running" | "stopped" } = {},
): Promise<void> {
  const stateDir = join(workspacePath, ".ambient/local-model-runtime/local-text-runtime");
  await mkdir(stateDir, { recursive: true });
  const status = input.status ?? "running";
  await writeFile(join(stateDir, "runtime-state.json"), JSON.stringify({
    schemaVersion: "ambient-local-model-runtime-state-v1",
    runtimeId: "local-text-runtime",
    providerId: "local",
    modelId: "local/text-4b",
    profileId: "local-text-4b-q4",
    pid: process.pid,
    status,
    command: ["/runtime/local-text", "serve"],
    cwd: workspacePath,
    stateDir,
    stdoutPath: join(stateDir, "runtime.stdout.log"),
    stderrPath: join(stateDir, "runtime.stderr.log"),
    startedAt: "2026-06-06T00:00:00.000Z",
    lastUsedAt: "2026-06-06T00:00:00.000Z",
    ...(status === "stopped" ? { stoppedAt: "2026-06-06T00:02:00.000Z" } : {}),
    idleTimeoutMs: 300000,
    healthUrl: "http://127.0.0.1:43123/health",
    estimatedResidentMemoryBytes: 6 * gib,
  }, null, 2), "utf8");
}
