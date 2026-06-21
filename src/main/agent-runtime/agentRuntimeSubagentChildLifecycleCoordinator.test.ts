import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { PermissionRequest } from "../../shared/permissionTypes";
import { getDefaultSubagentRoleProfile, type SubagentRoleProfile } from "../../shared/subagentRoles";
import { resolveSubagentToolScope } from "../../shared/subagentToolScope";
import { resolveSubagentTurnBudgetPolicy } from "../../shared/subagentTurnBudget";
import type { SubagentRunSummary } from "../../shared/subagentTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import { ProjectStore } from "./agentRuntimeProjectStoreFacade";
import {
  AgentRuntimeSubagentChildLifecycleCoordinator,
  type AgentRuntimeSubagentChildLifecycleCoordinatorOptions,
  type SubagentChildExecutionRecord,
} from "./agentRuntimeSubagentChildLifecycleCoordinator";
import type { SubagentRuntimeEventEmitter } from "./agentRuntimePiFacade";
import type { RuntimeSendMessageInput } from "./agentRuntimeSendPreparationController";
import { appendMappedSubagentRuntimeEvent } from "./agentRuntimeSubagentsFacade";

type LifecycleStore = AgentRuntimeSubagentChildLifecycleCoordinatorOptions["store"];
type RuntimeEvent = Parameters<SubagentRuntimeEventEmitter>[0];

describe("AgentRuntimeSubagentChildLifecycleCoordinator", () => {
  it("starts a default child Pi session through the injected send callback", async () => {
    const fixture = await runtimeFixture("ambient-child-lifecycle-start-");
    try {
      const executions = new Map<string, SubagentChildExecutionRecord>();
      const send = vi.fn(async (input: RuntimeSendMessageInput) => {
        fixture.store.addMessage({
          threadId: input.threadId,
          role: "assistant",
          content: "Child completed.",
          metadata: { status: "done", runtime: "pi" },
        });
      });
      const completeTurnAfterSend = vi.fn((): { status: "terminal" } => ({ status: "terminal" }));
      const coordinator = lifecycleCoordinator({
        store: fixture.store,
        executions,
        send,
        completeTurnAfterSend,
      });
      const { toolScope, toolScopeSnapshot } = recordToolScopeSnapshot(fixture.store, fixture.run);

      const started = coordinator.startChildRun({
        parentThread: fixture.parent,
        run: fixture.run,
        task: "Summarize the test fixture.",
        role: fixture.role,
        dependencyMode: "required",
        forkMode: "recent_turns",
        promptMode: "fresh",
        toolScope,
        toolScopeSnapshot,
        turnBudgetPolicy: resolveSubagentTurnBudgetPolicy(fixture.role),
        idempotencyKey: "start-child",
        emitEvent: emitRuntimeEvent(fixture.store, fixture.run, "child_runtime"),
      });

      expect(started).toMatchObject({
        started: true,
        run: {
          id: fixture.run.id,
          status: "running",
        },
        message: "Child Pi session started in the visible child thread.",
      });
      expect(executions.has(fixture.run.id)).toBe(true);
      await executions.get(fixture.run.id)?.promise;
      expect(executions.has(fixture.run.id)).toBe(false);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          threadId: fixture.run.childThreadId,
          visibleUserContent: "Sub-agent task: Summarize the test fixture.",
          model: fixture.run.modelRuntimeSnapshot.profile.modelId,
          delivery: "prompt",
          preserveActiveThread: true,
          internal: true,
        }),
        { awaitInternalRetryCompletion: true },
      );
      expect(completeTurnAfterSend).toHaveBeenCalledWith(expect.objectContaining({
        run: expect.objectContaining({ id: fixture.run.id }),
        role: fixture.role,
      }));
      expect(fixture.store.listSubagentRunEvents(fixture.run.id)).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "subagent.child_session_starting" }),
        expect.objectContaining({ type: "subagent.child_session_started" }),
      ]));
    } finally {
      await fixture.close();
    }
  });

  it("surfaces pending child permission prompts as approval waits", async () => {
    const fixture = await runtimeFixture("ambient-child-lifecycle-approval-");
    try {
      const running = fixture.store.markSubagentRunStatus(fixture.run.id, "running");
      const executions = new Map<string, SubagentChildExecutionRecord>([
        [running.id, {
          childThreadId: running.childThreadId,
          promise: new Promise<void>(() => undefined),
          startedAt: "2026-06-21T00:00:00.000Z",
        }],
      ]);
      const pending: PermissionRequest = {
        id: "approval-1",
        threadId: running.childThreadId,
        toolName: "write",
        title: "Allow child write?",
        message: "The child wants to write a file.",
        detail: "Target path: /tmp/out.txt",
        risk: "outside-workspace",
        reusableScopes: ["thread", "project"],
        grantActionKind: "local_file_write",
        grantTargetKind: "path",
        grantTargetLabel: "/tmp/out.txt",
        grantTargetHash: "approval-hash",
      };
      const coordinator = lifecycleCoordinator({
        store: fixture.store,
        executions,
        permissions: { listPending: () => [pending] },
      });
      const emitted: RuntimeEvent[] = [];

      const waited = await coordinator.waitForChildRun({
        run: running,
        timeoutMs: 60_000,
        emitEvent: (event) => {
          emitted.push(event);
          return emitRuntimeEvent(fixture.store, running, "wait_agent")(event);
        },
      });

      expect(waited).toMatchObject({
        timedOut: false,
        outcome: { kind: "approval_wait" },
        run: {
          id: running.id,
          status: "needs_attention",
        },
        approvalRequests: [
          expect.objectContaining({
            approvalId: "approval-1",
            title: "Allow child write?",
            requestedToolId: "write",
          }),
        ],
      });
      expect(emitted).toEqual([
        expect.objectContaining({
          type: "status",
          status: "needs_attention",
          message: "Child runtime is waiting for parent approval.",
        }),
      ]);
    } finally {
      await fixture.close();
    }
  });

  it("cancels active default child execution and records a child-to-parent mailbox event", async () => {
    const fixture = await runtimeFixture("ambient-child-lifecycle-cancel-");
    try {
      const running = fixture.store.markSubagentRunStatus(fixture.run.id, "running");
      const executions = new Map<string, SubagentChildExecutionRecord>([
        [running.id, {
          childThreadId: running.childThreadId,
          promise: new Promise<void>(() => undefined),
          startedAt: "2026-06-21T00:00:00.000Z",
        }],
      ]);
      const abortChildThread = vi.fn(async () => undefined);
      const emitted: RuntimeEvent[] = [];
      const coordinator = lifecycleCoordinator({
        store: fixture.store,
        executions,
        abortChildThread,
      });

      const cancelled = await coordinator.cancelChildRun({
        run: running,
        reason: "Parent cancelled the child.",
        idempotencyKey: "cancel-child",
        emitEvent: (event) => {
          emitted.push(event);
          return emitRuntimeEvent(fixture.store, running, "cancel_agent")(event);
        },
      });

      expect(cancelled).toMatchObject({
        cancelled: true,
        run: {
          id: running.id,
          status: "cancelled",
        },
      });
      expect(abortChildThread).toHaveBeenCalledWith(running.childThreadId, { skipSubagentChildCancellation: true });
      expect(emitted).toEqual([
        expect.objectContaining({
          type: "cancelled",
          status: "cancelled",
          message: "Parent cancelled the child.",
        }),
      ]);
      expect(fixture.store.listSubagentMailboxEvents(running.id)).toEqual([
        expect.objectContaining({
          direction: "child_to_parent",
          type: "subagent.cancelled",
          payload: expect.objectContaining({
            status: "cancelled",
            reason: "Parent cancelled the child.",
            idempotencyKey: "cancel-child",
          }),
        }),
      ]);
    } finally {
      await fixture.close();
    }
  });
});

function lifecycleCoordinator(overrides: Partial<AgentRuntimeSubagentChildLifecycleCoordinatorOptions> & {
  store: LifecycleStore;
  executions: Map<string, SubagentChildExecutionRecord>;
}): AgentRuntimeSubagentChildLifecycleCoordinator {
  return new AgentRuntimeSubagentChildLifecycleCoordinator({
    permissions: {},
    send: vi.fn(async () => undefined),
    abortChildThread: vi.fn(async () => undefined),
    emit: vi.fn(),
    emitSubagentParentMailboxEventUpdated: vi.fn(),
    resolveTerminalChildWaitBarriers: vi.fn(),
    completeTurnAfterSend: vi.fn((): { status: "terminal" } => ({ status: "terminal" })),
    recordFollowupExhausted: vi.fn(),
    recordGroupedCompletionIfNeeded: vi.fn(),
    ...overrides,
  });
}

async function runtimeFixture(prefix: string): Promise<{
  workspacePath: string;
  store: ProjectStore;
  parent: ThreadSummary;
  run: SubagentRunSummary;
  role: SubagentRoleProfile;
  close: () => Promise<void>;
}> {
  const workspacePath = await mkdtemp(join(tmpdir(), prefix));
  const store = new ProjectStore();
  store.openWorkspace(workspacePath);
  store.setFeatureFlagSettings({ subagents: true });
  const parent = store.createThread("parent");
  const assistant = store.addMessage({
    threadId: parent.id,
    role: "assistant",
    content: "",
    metadata: { status: "streaming", runtime: "pi" },
  });
  const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
  const role = getDefaultSubagentRoleProfile("worker");
  const run = store.createSubagentRun({
    parentThreadId: parent.id,
    parentRunId: parentRun.id,
    parentMessageId: assistant.id,
    title: "Worker child",
    roleId: "worker",
    roleProfileSnapshot: role,
    canonicalTaskPath: "root/0:worker",
    featureFlagSnapshot: resolveAmbientFeatureFlags({
      settings: store.getFeatureFlagSettings(),
      generatedAt: "2026-06-21T00:00:00.000Z",
    }),
    modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-21T00:00:00.000Z"),
    dependencyMode: "required",
  });
  return {
    workspacePath,
    store,
    parent,
    run,
    role,
    close: async () => {
      store.close();
      await rm(workspacePath, { recursive: true, force: true });
    },
  };
}

function recordToolScopeSnapshot(store: ProjectStore, run: SubagentRunSummary) {
  const toolScope = resolveSubagentToolScope({
    role: run.roleProfileSnapshot,
    model: run.modelRuntimeSnapshot.profile,
    workspacePolicy: {
      hardDeniedCategories: [],
      approvalMode: "interactive",
      worktreeIsolated: false,
      allowNestedFanout: true,
    },
  });
  const toolScopeSnapshot = store.recordSubagentToolScopeSnapshot(run.id, {
    scope: toolScope,
    resolverInputs: { test: "child-lifecycle" },
  });
  return { toolScope, toolScopeSnapshot };
}

function emitRuntimeEvent(
  store: ProjectStore,
  run: SubagentRunSummary,
  source: "child_runtime" | "wait_agent" | "cancel_agent",
): SubagentRuntimeEventEmitter {
  return (event) => appendMappedSubagentRuntimeEvent(store, {
    run: store.getSubagentRun(run.id),
    source,
    event,
  }).runEvent;
}
