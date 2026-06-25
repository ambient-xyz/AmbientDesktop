import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { getDefaultSubagentRoleProfile } from "../../shared/subagentRoles";
import { AgentRuntime } from "./agentRuntime";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import { appendMappedSubagentRuntimeEvent } from "./agentRuntimeSubagentsFacade";

async function agentRuntimeBudgetOverrunFixture(input: { roleId: "explorer" | "reviewer"; allowPartialResult: boolean }) {
  const workspacePath = await mkdtemp(
    join(tmpdir(), `ambient-runtime-subagent-budget-${input.allowPartialResult ? "partial" : "failed"}-`),
  );
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  store.setFeatureFlagSettings({ subagents: true });
  const parent = store.createThread("parent with budgeted child");
  const assistant = store.addMessage({
    threadId: parent.id,
    role: "assistant",
    content: "",
    metadata: { status: "streaming", runtime: "pi" },
  });
  const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
  const featureFlags = resolveAmbientFeatureFlags({
    settings: store.getFeatureFlagSettings(),
    generatedAt: "2026-06-05T00:00:00.000Z",
  });
  const baseRoleProfile = getDefaultSubagentRoleProfile(input.roleId);
  const roleProfileSnapshot = {
    ...baseRoleProfile,
    guardPolicy: {
      ...baseRoleProfile.guardPolicy,
      maxRuntimeMs: 0,
      allowPartialResult: input.allowPartialResult,
    },
  };
  const created = store.createSubagentRun({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    parentMessageId: assistant.id,
    title: "Budgeted child",
    roleId: input.roleId,
    roleProfileSnapshot,
    canonicalTaskPath: `root/0:${input.roleId}`,
    featureFlagSnapshot: featureFlags,
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
    dependencyMode: "required",
  });
  const running = store.markSubagentRunStatus(created.id, "running");
  const waitBarrier = store.createSubagentWaitBarrier({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    childRunIds: [running.id],
    dependencyMode: "required_all",
    failurePolicy: input.allowPartialResult ? "degrade_partial" : "ask_user",
    timeoutMs: 60_000,
  });
  const abort = vi.fn(async () => undefined);
  const emitted: any[] = [];
  const runtimeEvents: any[] = [];
  const runtime = new AgentRuntime(
    store,
    {} as any,
    {} as any,
    () =>
      ({
        isDestroyed: () => false,
        webContents: {
          isDestroyed: () => false,
          isCrashed: () => false,
          send: (_channel: string, event: any) => emitted.push(event),
        },
      }) as any,
    {
      request: vi.fn(),
      denyThread: () => undefined,
    },
  );
  (runtime as any).activeRuns.set(running.childThreadId, {
    abort,
    detach: vi.fn(),
    queue: vi.fn(),
  });
  (runtime as any).subagentChildExecutions.set(running.id, {
    childThreadId: running.childThreadId,
    promise: new Promise<void>(() => undefined),
    startedAt: new Date().toISOString(),
  });

  const waited = await (runtime as any).controllers.subagentToolExtensions.waitForResolvedChildRun({
    run: running,
    timeoutMs: 1,
    emitEvent: (event: any) => {
      const persisted = appendMappedSubagentRuntimeEvent(store, {
        run: running,
        source: "wait_agent",
        event,
      });
      runtimeEvents.push(persisted.runtimeEvent);
      return persisted.runEvent;
    },
  });

  return {
    workspacePath,
    store,
    assistant,
    waitBarrier,
    running,
    waited,
    run: store.getSubagentRun(running.id),
    abort,
    emitted,
    runtime,
    runtimeEvents,
    close: async () => {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}

describe("AgentRuntime sub-agent wait liveness", () => {
  it("does not abort an active child only because the role runtime budget elapsed when partial output is allowed", async () => {
    const fixture = await agentRuntimeBudgetOverrunFixture({ roleId: "explorer", allowPartialResult: true });
    try {
      expect(fixture.waited).toMatchObject({
        timedOut: false,
        outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        run: {
          status: "running",
        },
      });
      expect(fixture.run).toMatchObject({
        status: "running",
      });
      expect(fixture.run.resultArtifact).toBeUndefined();
      expect(fixture.abort).not.toHaveBeenCalled();
      expect((fixture.runtime as any).activeRuns.has(fixture.running.childThreadId)).toBe(true);
      expect(fixture.runtimeEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
            details: expect.objectContaining({
              childRunId: fixture.running.id,
              childThreadId: fixture.running.childThreadId,
              waitTimeoutMs: 1,
              childIdleTimeoutMs: 600_000,
              childHardTimeoutMs: 600_000,
              lastChildActivityAt: expect.any(String),
              lastChildActivitySource: expect.any(String),
            }),
          }),
        ]),
      );
      expect(fixture.store.listSubagentMailboxEvents(fixture.running.id)).toEqual([]);
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.running.parentRunId)).toEqual([]);
      expect(fixture.emitted).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "subagent-parent-mailbox-event-updated" }),
          expect.objectContaining({ type: "run-status", threadId: fixture.running.childThreadId, status: "idle" }),
        ]),
      );
    } finally {
      await fixture.close();
    }
  });

  it("emits wait heartbeats while a live child runtime is still pending", async () => {
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-wait-heartbeat-"));
    const store = new ProjectStore();
    store.openWorkspace(workspacePath);
    try {
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent waiting on child heartbeat");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const baseRoleProfile = getDefaultSubagentRoleProfile("explorer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 120_000,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Heartbeat child",
        roleId: "explorer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
      try {
        (runtime as any).subagentChildExecutions.set(running.id, {
          childThreadId: running.childThreadId,
          promise: new Promise<void>(() => undefined),
          startedAt: "2026-06-05T00:00:00.000Z",
        });

        const waitedPromise = (runtime as any).controllers.subagentToolExtensions.waitForResolvedChildRun({
          run: running,
          timeoutMs: 35_000,
          emitEvent: (event: any) => {
            const persisted = appendMappedSubagentRuntimeEvent(store, {
              run: store.getSubagentRun(running.id),
              source: "wait_agent",
              event,
            });
            runtimeEvents.push(persisted.runtimeEvent);
            return persisted.runEvent;
          },
        });

        await vi.advanceTimersByTimeAsync(15_000);
        await vi.advanceTimersByTimeAsync(15_000);
        await vi.advanceTimersByTimeAsync(5_000);
        const waited = await waitedPromise;

        expect(waited).toMatchObject({
          timedOut: false,
          outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
          run: {
            id: running.id,
            status: "running",
          },
        });
        expect(runtimeEvents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: "status",
              source: "wait_agent",
              status: "running",
              message: "wait_agent is still waiting on the live child runtime.",
              details: expect.objectContaining({
                childRunId: running.id,
                childThreadId: running.childThreadId,
                waitElapsedMs: 15_000,
              }),
            }),
            expect.objectContaining({
              type: "status",
              source: "wait_agent",
              status: "running",
              message: "wait_agent is still waiting on the live child runtime.",
              details: expect.objectContaining({
                waitElapsedMs: 30_000,
              }),
            }),
            expect.objectContaining({
              type: "status",
              source: "wait_agent",
              status: "running",
              message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
            }),
          ]),
        );
      } finally {
        vi.useRealTimers();
      }
    } finally {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("does not abort an active child only because the role runtime budget elapsed when partial output is forbidden", async () => {
    const fixture = await agentRuntimeBudgetOverrunFixture({ roleId: "reviewer", allowPartialResult: false });
    try {
      expect(fixture.waited).toMatchObject({
        timedOut: false,
        outcome: { kind: "progress_return", reason: "parent_wait_window_elapsed" },
        run: {
          status: "running",
        },
      });
      expect(fixture.run).toMatchObject({
        status: "running",
      });
      expect(fixture.run.resultArtifact).toBeUndefined();
      expect(fixture.abort).not.toHaveBeenCalled();
      expect((fixture.runtime as any).activeRuns.has(fixture.running.childThreadId)).toBe(true);
      expect(fixture.runtimeEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "status",
            source: "wait_agent",
            status: "running",
            message: "wait_agent timed out before the child run reached a terminal status; child runtime remains active.",
            details: expect.objectContaining({
              childRunId: fixture.running.id,
              childThreadId: fixture.running.childThreadId,
              waitTimeoutMs: 1,
              childIdleTimeoutMs: 600_000,
              childHardTimeoutMs: 600_000,
              lastChildActivityAt: expect.any(String),
              lastChildActivitySource: expect.any(String),
            }),
          }),
        ]),
      );
      expect(fixture.store.listSubagentMailboxEvents(fixture.running.id)).toEqual([]);
      expect(fixture.store.listSubagentParentMailboxEventsForParentRun(fixture.running.parentRunId)).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it("settles a child only after the child activity idle timeout elapses with liveness evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-idle-timeout-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with idle child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const baseRoleProfile = getDefaultSubagentRoleProfile("reviewer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 20 * 60_000,
          allowPartialResult: false,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Idle child",
        roleId: "reviewer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [running.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 12 * 60_000,
      });
      const abort = vi.fn(async () => undefined);
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      (runtime as any).activeRuns.set(running.childThreadId, {
        abort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-05T00:00:00.000Z",
      });

      const waitedPromise = (runtime as any).controllers.subagentToolExtensions.waitForResolvedChildRun({
        run: running,
        timeoutMs: 12 * 60_000,
        emitEvent: (event: any) => {
          const persisted = appendMappedSubagentRuntimeEvent(store, {
            run: store.getSubagentRun(running.id),
            source: "wait_agent",
            event,
          });
          runtimeEvents.push(persisted.runtimeEvent);
          return persisted.runEvent;
        },
      });

      await vi.advanceTimersByTimeAsync(10 * 60_000);
      const waited = await waitedPromise;

      expect(waited).toMatchObject({
        timedOut: true,
        outcome: { kind: "child_runtime_timeout", reason: "runtime_idle_timeout" },
        run: {
          id: running.id,
          status: "timed_out",
          resultArtifact: expect.objectContaining({
            status: "timed_out",
            partial: false,
          }),
        },
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(runtimeEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "error",
            source: "child_runtime",
            status: "timed_out",
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
            details: expect.objectContaining({
              reason: "runtime_idle_timeout",
              maxRuntimeMs: 600_000,
              idleElapsedMs: 600_000,
              elapsedMs: 600_000,
              lastChildActivityAt: "2026-06-05T00:00:00.000Z",
              lastChildActivitySource: expect.any(String),
            }),
          }),
        ]),
      );
      expect(store.listSubagentMailboxEvents(running.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_idle_timeout",
            idleElapsedMs: 600_000,
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(running.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.runtime_idle_timeout",
            preview: expect.objectContaining({
              status: "timed_out",
              partial: false,
              reason: "runtime_idle_timeout",
              maxRuntimeMs: 600_000,
              idleElapsedMs: 600_000,
              artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
            }),
          }),
        ]),
      );
      expect(store.listSubagentParentMailboxEventsForParentRun(running.parentRunId)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: running.id,
            childThreadId: running.childThreadId,
            previousStatus: "running",
            status: "timed_out",
            source: "runtime_idle_timeout",
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });

  it("settles an active child at the hard cap even when recent activity prevents idle timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00.000Z"));
    const workspacePath = await mkdtemp(join(tmpdir(), "ambient-runtime-subagent-hard-cap-"));
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      store.setFeatureFlagSettings({ subagents: true });
      const parent = store.createThread("parent with hard-cap child");
      const assistant = store.addMessage({
        threadId: parent.id,
        role: "assistant",
        content: "",
        metadata: { status: "streaming", runtime: "pi" },
      });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const featureFlags = resolveAmbientFeatureFlags({
        settings: store.getFeatureFlagSettings(),
        generatedAt: "2026-06-05T00:00:00.000Z",
      });
      const baseRoleProfile = getDefaultSubagentRoleProfile("reviewer");
      const roleProfileSnapshot = {
        ...baseRoleProfile,
        guardPolicy: {
          ...baseRoleProfile.guardPolicy,
          maxRuntimeMs: 10 * 60_000,
          allowPartialResult: false,
        },
      };
      const created = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Hard cap child",
        roleId: "reviewer",
        roleProfileSnapshot,
        canonicalTaskPath: "root/0:reviewer",
        featureFlagSnapshot: featureFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const running = store.markSubagentRunStatus(created.id, "running");
      store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [running.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 12 * 60_000,
      });
      const abort = vi.fn(async () => undefined);
      const runtimeEvents: any[] = [];
      const runtime = new AgentRuntime(store, {} as any, {} as any, () => undefined, {
        request: vi.fn(),
        denyThread: () => undefined,
      });
      (runtime as any).activeRuns.set(running.childThreadId, {
        abort,
        detach: vi.fn(),
        queue: vi.fn(),
      });
      (runtime as any).subagentChildExecutions.set(running.id, {
        childThreadId: running.childThreadId,
        promise: new Promise<void>(() => undefined),
        startedAt: "2026-06-05T00:00:00.000Z",
      });

      vi.setSystemTime(new Date("2026-06-05T00:09:59.000Z"));
      const activityMessage = store.addMessage({
        threadId: running.childThreadId,
        role: "assistant",
        content: "Still working with fresh activity before the hard cap.",
      });

      const waitedPromise = (runtime as any).controllers.subagentToolExtensions.waitForResolvedChildRun({
        run: running,
        timeoutMs: 12 * 60_000,
        emitEvent: (event: any) => {
          const persisted = appendMappedSubagentRuntimeEvent(store, {
            run: store.getSubagentRun(running.id),
            source: "wait_agent",
            event,
          });
          runtimeEvents.push(persisted.runtimeEvent);
          return persisted.runEvent;
        },
      });

      await vi.advanceTimersByTimeAsync(1_000);
      const waited = await waitedPromise;

      expect(waited).toMatchObject({
        timedOut: true,
        outcome: { kind: "child_runtime_timeout", reason: "runtime_hard_cap_exceeded" },
        run: {
          id: running.id,
          status: "timed_out",
          resultArtifact: expect.objectContaining({
            status: "timed_out",
            partial: false,
          }),
        },
      });
      expect(abort).toHaveBeenCalledTimes(1);
      expect(runtimeEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "error",
            source: "child_runtime",
            status: "timed_out",
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
            details: expect.objectContaining({
              reason: "runtime_hard_cap_exceeded",
              maxRuntimeMs: 600_000,
              elapsedMs: 600_000,
              idleElapsedMs: 1_000,
              lastChildActivityAt: "2026-06-05T00:09:59.000Z",
              lastChildActivitySource: "message:assistant",
              lastChildActivityDetail: `message ${activityMessage.id}`,
            }),
          }),
        ]),
      );
      expect(store.listSubagentMailboxEvents(running.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.failed",
          payload: expect.objectContaining({
            status: "timed_out",
            partial: false,
            reason: "runtime_hard_cap_exceeded",
            elapsedMs: 600_000,
            idleElapsedMs: 1_000,
            lastChildActivityAt: "2026-06-05T00:09:59.000Z",
            lastChildActivitySource: "message:assistant",
            artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(running.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.runtime_hard_cap_exceeded",
            preview: expect.objectContaining({
              status: "timed_out",
              partial: false,
              reason: "runtime_hard_cap_exceeded",
              maxRuntimeMs: 600_000,
              elapsedMs: 600_000,
              idleElapsedMs: 1_000,
              lastChildActivityAt: "2026-06-05T00:09:59.000Z",
              lastChildActivitySource: "message:assistant",
              artifactPath: `ambient://threads/${running.childThreadId}/transcript`,
            }),
          }),
        ]),
      );
      expect(store.listSubagentParentMailboxEventsForParentRun(running.parentRunId)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: running.id,
            childThreadId: running.childThreadId,
            previousStatus: "running",
            status: "timed_out",
            source: "runtime_hard_cap_exceeded",
          }),
        }),
      ]);
    } finally {
      vi.useRealTimers();
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    }
  });
});
