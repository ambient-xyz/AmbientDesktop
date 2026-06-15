import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshotFromProfile } from "../shared/ambientModels";
import {
  resolveSubagentCapacityLease,
  type SubagentCapacityLeaseSnapshot,
} from "../shared/subagentCapacity";
import type {
  SubagentMailboxEventSummary,
  SubagentParentMailboxEventSummary,
  SubagentRunEventSummary,
  SubagentRunStatus,
  SubagentRunSummary,
  SubagentToolScopeSnapshotSummary,
  SubagentWaitBarrierSummary,
  ThreadSummary,
  ThreadWorktreeSummary,
} from "../shared/types";
import { getDefaultSubagentRoleProfile, type SubagentRoleProfile } from "../shared/subagentRoles";
import { createDefaultModelRuntimeRegistry } from "./modelRuntimeRegistry";
import { resolveSubagentModelScope, type SubagentModelScopeResolution } from "./modelScopeResolver";
import {
  executeSubagentSpawnLaunch,
  SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION,
  type SubagentSpawnLaunchExecutorStore,
} from "./subagentSpawnLaunchExecutor";

describe("subagentSpawnLaunchExecutor", () => {
  it("materializes successful required launches with snapshots, mailbox work, wait barrier, and runtime start", async () => {
    const role = getDefaultSubagentRoleProfile("explorer");
    const model = createDefaultModelRuntimeRegistry().resolveProfile(role.defaultModelId);
    const modelScope = modelScopeFor(role);
    const run = childRun({ role, model });
    const store = new FakeSpawnLaunchStore(run);
    const startedRun = { ...run, status: "running" as const, startedAt: "2026-06-06T00:00:10.000Z" };
    const startChildRun = vi.fn(async () => {
      store.setRun(startedRun);
      return { started: true, run: startedRun, message: "started" };
    });

    const result = await executeSubagentSpawnLaunch({
      store,
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      parentThread: parentThread(),
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      run,
      task: "Research the launch contract.",
      toolCallId: "tool-call",
      requestedRoleId: "explorer",
      roleId: "explorer",
      role,
      modelId: model.modelId,
      model,
      modelScope,
      dependencyMode: "required",
      forkMode: "recent_turns",
      promptMode: role.promptMode,
      retentionPolicy: role.retentionDefault,
      idempotencyKey: "spawn:key",
      requestedToolScope: {
        childAuthority: {
          taskIntent: "file_read",
          rationale: "Read only the launch notes.",
          readRoots: ["/repo/notes/launch.md"],
          writeRoots: ["/repo/Downloads"],
          mutation: "deny",
          network: "deny",
          nestedFanout: "deny",
        },
      },
      startChildRun,
      createRuntimeSpawnEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(run.id, { type: "runtime", preview: event }),
    });

    expect(SUBAGENT_SPAWN_LAUNCH_EXECUTOR_SCHEMA_VERSION).toBe("ambient-subagent-spawn-launch-executor-v1");
    expect(result.spawnBlockDecision.blocked).toBe(false);
    expect(result.currentRun.status).toBe("running");
    expect(result.orchestrationStarted).toBe(true);
    expect(result.toolScopeSnapshot.scope.piVisibleCategories).toEqual(["workspace.read", "artifact.read", "long-context.read"]);
    expect(result.toolScopeSnapshot.resolverInputs).toMatchObject({
      requestedChildAuthority: {
        taskIntent: "file_read",
        readRoots: ["/repo/notes/launch.md"],
        writeRoots: ["/repo/Downloads"],
        mutation: "deny",
      },
      childAuthorityProfile: {
        schemaVersion: "ambient-subagent-child-authority-profile-v1",
        taskIntent: "file_read",
        resourceScopes: {
          filesystem: {
            readRoots: ["/repo/notes/launch.md"],
            writeRoots: [],
            deniedWriteRoots: ["/repo/Downloads"],
            writeDecision: "deny",
          },
          browser: {
            networkDecision: "deny",
          },
          nestedFanout: {
            decision: "deny",
          },
        },
        approvalRouting: {
          route: "parent",
          childThreadId: run.childThreadId,
        },
      },
    });
    expect(result.waitBarrier).toMatchObject({
      childRunIds: [run.id],
      dependencyMode: "required_all",
      failurePolicy: "degrade_partial",
    });
    expect(result.turnBudgetPolicy).toMatchObject({
      roleId: "explorer",
      maxTurns: 8,
      wrapUpAtTurn: 7,
      graceTurns: 1,
      terminalStatusOnExhaustion: "aborted_partial",
      partialAllowed: true,
    });
    expect(result.taskMailboxEvent).toMatchObject({
      runId: run.id,
      direction: "parent_to_child",
      type: "subagent.task",
      payload: expect.objectContaining({
        idempotencyKey: "spawn:key",
        childRunId: run.id,
        waitBarrier: expect.objectContaining({ id: "barrier-1" }),
        turnBudgetPolicy: expect.objectContaining({
          maxTurns: 8,
          wrapUpAtTurn: 7,
          terminalStatusOnExhaustion: "aborted_partial",
        }),
      }),
    });
    expect(store.messages).toEqual([
      expect.objectContaining({
        threadId: run.childThreadId,
        role: "system",
        metadata: expect.objectContaining({
          runtime: "ambient-subagents",
          phase: "phase-2-pi-tool-surface",
          status: "reserved",
          subagentRunId: run.id,
        }),
      }),
    ]);
    expect(startChildRun).toHaveBeenCalledWith(expect.objectContaining({
      parentThread: expect.objectContaining({ id: "parent-thread" }),
      run,
      task: "Research the launch contract.",
      role,
      toolScopeSnapshot: result.toolScopeSnapshot,
      turnBudgetPolicy: result.turnBudgetPolicy,
      idempotencyKey: "spawn:key",
      emitEvent: expect.any(Function),
    }));
    expect(store.runEventsFor(run.id).map((event) => event.type)).toContain("subagent.spawn_requested");
  });

  it("records blocked post-reservation launches without creating required wait barriers", async () => {
    const role = getDefaultSubagentRoleProfile("worker");
    const model = createDefaultModelRuntimeRegistry().resolveProfile(role.defaultModelId);
    const modelScope = modelScopeFor(role);
    const run = childRun({ role, model });
    const store = new FakeSpawnLaunchStore(run);

    const result = await executeSubagentSpawnLaunch({
      store,
      runtime: "ambient-subagents",
      phase: "phase-2-pi-tool-surface",
      parentThread: parentThread(),
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      run,
      task: "Implement a scoped change.",
      toolCallId: "tool-call",
      requestedRoleId: "worker",
      roleId: "worker",
      role,
      modelId: model.modelId,
      model,
      modelScope,
      dependencyMode: "required",
      forkMode: "recent_turns",
      promptMode: role.promptMode,
      retentionPolicy: role.retentionDefault,
      idempotencyKey: "spawn:key",
      requestedToolScope: { requestedCategories: ["workspace.write"] },
      startChildRun: vi.fn(),
      createRuntimeSpawnEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(run.id, { type: "runtime", preview: event }),
    });

    expect(result.spawnBlockDecision).toMatchObject({
      blocked: true,
      failureStage: "tool_scope",
      toolScopeBlocked: true,
      launchDenialKind: "phase4_isolation_required",
    });
    expect(result.currentRun.status).toBe("failed");
    expect(result.waitBarrier).toBeUndefined();
    expect(result.blockedWaitBarrier).toBeUndefined();
    expect(store.waitBarriers.size).toBe(0);
    expect(result.spawnFailureParentMailbox).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "subagent.spawn_failed",
      deliveryState: "queued",
    });
    expect(result.taskMailboxEvent).toBeUndefined();
    expect(store.messages).toEqual([
      expect.objectContaining({
        threadId: run.childThreadId,
        role: "system",
        metadata: expect.objectContaining({
          status: "failed",
          subagentRunId: run.id,
        }),
      }),
    ]);
    expect(store.runEventsFor(run.id).map((event) => event.type)).toContain("subagent.spawn_rejected");
  });

  it("blocks worker launches when an active worktree belongs to a different child thread", async () => {
    const role = getDefaultSubagentRoleProfile("worker");
    const model = createDefaultModelRuntimeRegistry().resolveProfile(role.defaultModelId);
    const modelScope = modelScopeFor(role);
    const run = childRun({ role, model });
    const store = new FakeSpawnLaunchStore(run);
    const startChildRun = vi.fn();

    const result = await executeSubagentSpawnLaunch({
      store,
      runtime: "ambient-subagents",
      phase: "phase-4-mutating-workers",
      parentThread: parentThread(),
      parentRun: { id: "parent-run", assistantMessageId: "assistant-message" },
      run,
      task: "Implement a scoped change.",
      toolCallId: "tool-call",
      requestedRoleId: "worker",
      roleId: "worker",
      role,
      modelId: model.modelId,
      model,
      modelScope,
      dependencyMode: "required",
      forkMode: "recent_turns",
      promptMode: role.promptMode,
      retentionPolicy: role.retentionDefault,
      idempotencyKey: "spawn:key",
      requestedToolScope: { requestedCategories: ["workspace.write"] },
      childWorktree: childWorktree({ threadId: "other-child" }),
      startChildRun,
      createRuntimeSpawnEventEmitter: () => (event) =>
        store.appendSubagentRunEvent(run.id, { type: "runtime", preview: event }),
    });

    expect(startChildRun).not.toHaveBeenCalled();
    expect(result.spawnBlockDecision).toMatchObject({
      blocked: true,
      failureStage: "tool_scope",
      toolScopeBlocked: true,
      launchDenialKind: "phase4_isolation_required",
    });
    expect(result.workspacePolicy).toMatchObject({
      worktreeIsolated: false,
      worktreeIsolationStatus: "mismatched_child_thread",
      worktreeIsolationReason: "Active worktree belongs to thread other-child, not expected child thread child-thread.",
      expectedChildThreadId: "child-thread",
      worktreeThreadId: "other-child",
    });
    expect(result.toolScopeSnapshot.scope).toMatchObject({
      worktreeIsolated: false,
      deniedCategories: expect.arrayContaining([
        expect.objectContaining({
          id: "workspace.write",
          reason: "Mutating child requires an approved isolated worktree.",
        }),
      ]),
    });
    expect(result.toolScopeSnapshot.resolverInputs).toMatchObject({
      workspacePolicy: {
        worktreeIsolationStatus: "mismatched_child_thread",
        expectedChildThreadId: "child-thread",
        worktreeThreadId: "other-child",
      },
      childWorktree: {
        threadId: "other-child",
        status: "active",
      },
    });
    expect(result.currentRun.status).toBe("failed");
    expect(result.taskMailboxEvent).toBeUndefined();
  });
});

class FakeSpawnLaunchStore implements SubagentSpawnLaunchExecutorStore {
  readonly runs = new Map<string, SubagentRunSummary>();
  readonly runEvents = new Map<string, SubagentRunEventSummary[]>();
  readonly mailboxEvents = new Map<string, SubagentMailboxEventSummary[]>();
  readonly parentMailboxEvents: SubagentParentMailboxEventSummary[] = [];
  readonly toolScopeSnapshots: SubagentToolScopeSnapshotSummary[] = [];
  readonly waitBarriers = new Map<string, SubagentWaitBarrierSummary>();
  readonly messages: Array<{
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }> = [];

  constructor(run: SubagentRunSummary) {
    this.setRun(run);
  }

  setRun(run: SubagentRunSummary): void {
    this.runs.set(run.id, run);
    if (!this.runEvents.has(run.id)) this.runEvents.set(run.id, []);
    if (!this.mailboxEvents.has(run.id)) this.mailboxEvents.set(run.id, []);
  }

  getSubagentRun(runId: string): SubagentRunSummary {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown run: ${runId}`);
    return run;
  }

  listSubagentRunEvents(runId: string): SubagentRunEventSummary[] {
    return this.runEventsFor(runId);
  }

  runEventsFor(runId: string): SubagentRunEventSummary[] {
    return [...(this.runEvents.get(runId) ?? [])];
  }

  appendSubagentRunEvent(
    runId: string,
    input: { type: string; preview?: unknown; artifactPath?: string; createdAt?: string },
  ): SubagentRunEventSummary {
    const events = this.runEvents.get(runId) ?? [];
    const event: SubagentRunEventSummary = {
      runId,
      sequence: events.length + 1,
      type: input.type,
      createdAt: input.createdAt ?? "2026-06-06T00:00:00.000Z",
      ...(input.preview !== undefined ? { preview: input.preview } : {}),
      ...(input.artifactPath ? { artifactPath: input.artifactPath } : {}),
    };
    events.push(event);
    this.runEvents.set(runId, events);
    return event;
  }

  recordSubagentToolScopeSnapshot(
    runId: string,
    input: { scope: SubagentToolScopeSnapshotSummary["scope"]; resolverInputs?: unknown; createdAt?: string },
  ): SubagentToolScopeSnapshotSummary {
    const snapshot: SubagentToolScopeSnapshotSummary = {
      runId,
      sequence: this.toolScopeSnapshots.length + 1,
      createdAt: input.createdAt ?? "2026-06-06T00:00:01.000Z",
      scope: input.scope,
      resolverInputs: input.resolverInputs,
    };
    this.toolScopeSnapshots.push(snapshot);
    return snapshot;
  }

  markSubagentRunStatus(
    runId: string,
    status: SubagentRunStatus,
    options?: { resultArtifact?: unknown; now?: string },
  ): SubagentRunSummary {
    const current = this.getSubagentRun(runId);
    const updated: SubagentRunSummary = {
      ...current,
      status,
      updatedAt: options?.now ?? "2026-06-06T00:00:02.000Z",
      ...(status === "failed" ? { completedAt: options?.now ?? "2026-06-06T00:00:02.000Z" } : {}),
      ...(options?.resultArtifact ? { resultArtifact: options.resultArtifact } : {}),
    };
    this.setRun(updated);
    return updated;
  }

  createSubagentWaitBarrier(input: {
    parentThreadId: string;
    parentRunId: string;
    childRunIds: string[];
    dependencyMode: "required_all" | "required_any" | "quorum" | "optional_background";
    failurePolicy: "fail_parent" | "ask_user" | "degrade_partial" | "retry_child";
    quorumThreshold?: number;
    timeoutMs?: number;
    createdAt?: string;
  }): SubagentWaitBarrierSummary {
    const barrier: SubagentWaitBarrierSummary = {
      id: `barrier-${this.waitBarriers.size + 1}`,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      childRunIds: input.childRunIds,
      dependencyMode: input.dependencyMode,
      status: "waiting_on_children",
      failurePolicy: input.failurePolicy,
      ...(input.quorumThreshold !== undefined ? { quorumThreshold: input.quorumThreshold } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      createdAt: input.createdAt ?? "2026-06-06T00:00:03.000Z",
      updatedAt: input.createdAt ?? "2026-06-06T00:00:03.000Z",
    };
    this.waitBarriers.set(barrier.id, barrier);
    return barrier;
  }

  updateSubagentWaitBarrierStatus(
    id: string,
    status: "failed",
    options?: { resolutionArtifact?: unknown; now?: string },
  ): SubagentWaitBarrierSummary {
    const current = this.waitBarriers.get(id);
    if (!current) throw new Error(`Unknown barrier: ${id}`);
    const updated: SubagentWaitBarrierSummary = {
      ...current,
      status,
      updatedAt: options?.now ?? "2026-06-06T00:00:04.000Z",
      resolvedAt: options?.now ?? "2026-06-06T00:00:04.000Z",
      ...(options?.resolutionArtifact ? { resolutionArtifact: options.resolutionArtifact } : {}),
    };
    this.waitBarriers.set(id, updated);
    return updated;
  }

  appendSubagentMailboxEvent(runId: string, input: {
    direction: "parent_to_child" | "child_to_parent";
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentMailboxEventSummary {
    const events = this.mailboxEvents.get(runId) ?? [];
    const event: SubagentMailboxEventSummary = {
      id: `mailbox-${events.length + 1}`,
      runId,
      direction: input.direction,
      type: input.type,
      payload: input.payload,
      deliveryState: input.deliveryState ?? "queued",
      createdAt: input.createdAt ?? "2026-06-06T00:00:05.000Z",
      ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    };
    events.push(event);
    this.mailboxEvents.set(runId, events);
    return event;
  }

  appendSubagentParentMailboxEvent(input: {
    parentThreadId: string;
    parentRunId: string;
    parentMessageId?: string;
    type: string;
    payload: unknown;
    deliveryState?: "queued" | "delivered" | "consumed" | "failed" | "cancelled";
    idempotencyKey?: string;
    createdAt?: string;
    deliveredAt?: string;
  }): SubagentParentMailboxEventSummary {
    const event: SubagentParentMailboxEventSummary = {
      id: `parent-mailbox-${this.parentMailboxEvents.length + 1}`,
      parentThreadId: input.parentThreadId,
      parentRunId: input.parentRunId,
      ...(input.parentMessageId ? { parentMessageId: input.parentMessageId } : {}),
      type: input.type,
      payload: input.payload,
      deliveryState: input.deliveryState ?? "queued",
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      createdAt: input.createdAt ?? "2026-06-06T00:00:06.000Z",
      updatedAt: input.createdAt ?? "2026-06-06T00:00:06.000Z",
      ...(input.deliveredAt ? { deliveredAt: input.deliveredAt } : {}),
    };
    this.parentMailboxEvents.push(event);
    return event;
  }

  addMessage(input: {
    threadId: string;
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    metadata?: Record<string, unknown>;
  }): unknown {
    this.messages.push(input);
    return { id: `message-${this.messages.length}`, ...input };
  }
}

function parentThread(): ThreadSummary {
  return {
    id: "parent-thread",
    title: "Parent",
    workspacePath: "/repo",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    model: "glm-5.1",
    permissionMode: "workspace",
    kind: "chat",
  } as ThreadSummary;
}

function childWorktree(overrides: Partial<ThreadWorktreeSummary> = {}): ThreadWorktreeSummary {
  return {
    threadId: "child-thread",
    projectRoot: "/repo",
    worktreePath: "/repo/.ambient-codex/worktrees/child-thread",
    branchName: "ambient/child-thread",
    baseRef: "abc1234",
    status: "active",
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  };
}

function modelScopeFor(role: SubagentRoleProfile): SubagentModelScopeResolution {
  return resolveSubagentModelScope({
    role,
    parentModelId: "glm-5.1",
    resolveModelRuntimeProfile: (modelId) => createDefaultModelRuntimeRegistry().resolveProfile(modelId),
  });
}

function childRun(input: {
  role: SubagentRoleProfile;
  model: ReturnType<ReturnType<typeof createDefaultModelRuntimeRegistry>["resolveProfile"]>;
  capacityLease?: SubagentCapacityLeaseSnapshot;
}): SubagentRunSummary {
  return {
    id: "child-run",
    protocolVersion: "ambient-subagent-v1",
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "assistant-message",
    childThreadId: "child-thread",
    canonicalTaskPath: `root/0:${input.role.id}`,
    roleId: input.role.id,
    roleProfileSnapshot: input.role,
    roleProfileSnapshotSource: "resolved",
    dependencyMode: "required",
    status: "reserved",
    featureFlagSnapshot: { subagents: true },
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshotFromProfile(input.model.modelId, input.model),
    capacityLeaseSnapshot: input.capacityLease ?? resolveSubagentCapacityLease({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: `root/0:${input.role.id}`,
      roleId: input.role.id,
      model: input.model,
      leaseId: "lease-1",
      now: "2026-06-06T00:00:00.000Z",
    }),
    createdAt: "2026-06-06T00:00:00.000Z",
    updatedAt: "2026-06-06T00:00:00.000Z",
  } as unknown as SubagentRunSummary;
}
