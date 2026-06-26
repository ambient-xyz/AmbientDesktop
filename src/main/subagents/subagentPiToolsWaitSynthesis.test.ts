import { afterEach, describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { ProjectStore } from "./subagentProjectStoreFacade";
import { createSubagentPiToolDefinitions } from "./subagentPiTools";
import {
  cleanupTempWorkspaces,
  completedWorkerRun,
  enabledFlags,
  executeTool,
  structuredResult,
  tempWorkspace,
} from "./subagentPiToolsTestSupport";

afterEach(cleanupTempWorkspaces);

describe("ambient_subagent Pi tool wait and synthesis safety", () => {
  it("surfaces turn-budget wrap-up state in status_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 7; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "started",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const status = await executeTool(tool, "status-turn-budget", {
        action: "status_agent",
        childRunId: run.id,
      });

      expect(status.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("turnBudgetAction: steer_wrap_up"),
      });
      expect((status.details as any).turnBudgetState).toMatchObject({
        state: "wrap_up_due",
        startedTurnCount: 7,
        observedTurnCount: 7,
        shouldSteerWrapUp: true,
        exhausted: false,
        reason: "wrap_up_turn_reached",
        policy: {
          maxTurns: 8,
          wrapUpAtTurn: 7,
          terminalStatusOnExhaustion: "aborted_partial",
        },
      });
    } finally {
      store.close();
    }
  });

  it("surfaces turn-budget wrap-up steering evidence in wait_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 7; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "started",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const waited = await executeTool(tool, "wait-turn-budget-wrap-up", {
        action: "wait_agent",
        childRunId: run.id,
        wait: { timeoutMs: 1 },
      });

      expect(waited.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("a wrap-up follow-up is queued for the child"),
      });
      expect((waited.details as any).turnBudgetWrapUpSteering).toMatchObject({
        schemaVersion: "ambient-subagent-turn-budget-wrap-up-recorder-v1",
        replay: false,
        mailboxEvent: {
          runId: run.id,
          direction: "parent_to_child",
          type: "subagent.followup",
          deliveryState: "queued",
        },
        runEvent: {
          runId: run.id,
          type: "subagent.followup_agent.queued",
        },
      });
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([
        expect.objectContaining({
          type: "subagent.followup",
          payload: expect.objectContaining({
            steeringReason: "turn_budget_wrap_up",
            turnBudgetState: expect.objectContaining({ state: "wrap_up_due" }),
          }),
        }),
      ]);

      const replay = await executeTool(tool, "wait-turn-budget-wrap-up-replay", {
        action: "wait_agent",
        childRunId: run.id,
        wait: { timeoutMs: 1 },
      });

      expect((replay.details as any).turnBudgetWrapUpSteering).toMatchObject({
        replay: true,
        mailboxEvent: { id: (waited.details as any).turnBudgetWrapUpSteering.mailboxEvent.id },
      });
      expect(store.listSubagentMailboxEvents(run.id).filter((event) => event.type === "subagent.followup")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("surfaces turn-budget exhaustion settlement evidence in wait_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 8; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "completed",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const waited = await executeTool(tool, "wait-turn-budget-exhaustion", {
        action: "wait_agent",
        childRunId: run.id,
        wait: { timeoutMs: 1 },
      });

      expect(waited.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("settled as aborted_partial"),
      });
      expect((waited.details as any).status).toBe("aborted_partial");
      expect((waited.details as any).turnBudgetState).toMatchObject({
        state: "exhausted",
        completedTurnCount: 8,
        exhausted: true,
        reason: "max_turns_exceeded",
      });
      expect((waited.details as any).turnBudgetExhaustionSettlement).toMatchObject({
        schemaVersion: "ambient-subagent-turn-budget-exhaustion-recorder-v1",
        replay: false,
        status: "aborted_partial",
        partial: true,
        artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
        mailboxEvent: {
          runId: run.id,
          direction: "child_to_parent",
          type: "subagent.result",
          deliveryState: "delivered",
        },
        parentMailboxEvent: {
          type: "subagent.lifecycle_interrupted",
        },
        runEvent: {
          runId: run.id,
          type: "subagent.turn_budget_exhausted",
          artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
        },
      });
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect(store.getSubagentRun(run.id)).toMatchObject({
        status: "aborted_partial",
        resultArtifact: expect.objectContaining({
          status: "aborted_partial",
          partial: true,
          artifactPath: `ambient://threads/${run.childThreadId}/transcript`,
        }),
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.lifecycle_interrupted",
            payload: expect.objectContaining({
              source: "max_turns_exceeded",
              childRunId: run.id,
              status: "aborted_partial",
            }),
          }),
        ]),
      );
    } finally {
      store.close();
    }
  });

  it("surfaces turn-budget wrap-up runtime delivery evidence in wait_agent details", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const runtimeUpdates: unknown[] = [];
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
      });
      for (let index = 0; index < 7; index += 1) {
        store.appendSubagentRunEvent(run.id, {
          type: "subagent.runtime_event",
          preview: {
            schemaVersion: "ambient-subagent-runtime-event-v1",
            type: "started",
            source: "child_runtime",
            runId: run.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            childThreadId: run.childThreadId,
            canonicalTaskPath: run.canonicalTaskPath,
            createdAt: "2026-06-07T00:00:00.000Z",
          },
        });
      }
      const followupChildRun = vi.fn(({ run: childRun, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent }) => {
        markMailboxDelivered("2026-06-07T00:01:10.000Z");
        emitEvent({
          type: "status",
          source: "followup_agent",
          status: childRun.status,
          message: `Delivered wrap-up through ${mailboxEvent.id}.`,
        });
        const consumed = markMailboxConsumed("2026-06-07T00:01:11.000Z");
        return {
          accepted: true,
          run: store.getSubagentRun(childRun.id),
          mailboxEvent: consumed,
          message: "Runtime accepted automatic wrap-up follow-up.",
        };
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          followupChildRun,
        },
      });

      const waited = await executeTool(
        tool,
        "wait-turn-budget-wrap-up-delivery",
        {
          action: "wait_agent",
          childRunId: run.id,
          wait: { timeoutMs: 1 },
        },
        (update) => runtimeUpdates.push(update),
      );

      expect(followupChildRun).toHaveBeenCalledTimes(1);
      expect(waited.content[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining("the wrap-up follow-up was delivered to the child runtime"),
      });
      expect((waited.details as any).turnBudgetWrapUpSteering).toMatchObject({
        mailboxEvent: {
          type: "subagent.followup",
          deliveryState: "consumed",
          deliveredAt: "2026-06-07T00:01:10.000Z",
        },
      });
      expect((waited.details as any).turnBudgetWrapUpDelivery).toMatchObject({
        accepted: true,
        message: "Runtime accepted automatic wrap-up follow-up.",
        run: { id: run.id },
        mailboxEvent: {
          type: "subagent.followup",
          deliveryState: "consumed",
          deliveredAt: "2026-06-07T00:01:10.000Z",
        },
      });
      expect(store.listSubagentMailboxEvents(run.id)).toEqual([
        expect.objectContaining({
          type: "subagent.followup",
          deliveryState: "consumed",
          deliveredAt: "2026-06-07T00:01:10.000Z",
        }),
      ]);
      expect(runtimeUpdates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            details: expect.objectContaining({
              type: "subagent.runtime_event",
              event: expect.objectContaining({
                type: "status",
                source: "followup_agent",
                message: expect.stringContaining("Delivered wrap-up through"),
              }),
            }),
          }),
        ]),
      );
    } finally {
      store.close();
    }
  });

  it("persists runtime events when Pi update callbacks are no longer active", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run, emitEvent }) => {
            emitEvent({
              type: "started",
              source: "child_runtime",
              status: "running",
              message: "Runtime accepted child execution.",
            });
            return { started: true, run: store.markSubagentRunStatus(run.id, "running") };
          },
        },
      });

      const spawned = await executeTool(
        tool,
        "spawn-stale-update",
        {
          action: "spawn_agent",
          task: "Start a child whose update listener has gone stale.",
          idempotencyKey: "spawn:stale-update",
        },
        (update) => {
          if ((update.details as any)?.type === "subagent.runtime_event") {
            return Promise.reject(new Error("Agent listener invoked outside active run"));
          }
        },
      );
      const runId = (spawned.details as any).run.id as string;
      await Promise.resolve();

      expect(store.listSubagentRunEvents(runId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.runtime_event",
            preview: expect.objectContaining({
              type: "started",
              status: "running",
            }),
          }),
        ]),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Agent listener invoked outside active run"));
    } finally {
      warn.mockRestore();
      store.close();
    }
  });

  it("keeps failed child waits out of parent synthesis", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const runtimeWaitTimeouts: number[] = [];
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "running") }),
          waitForChildRun: ({ run, timeoutMs }) => {
            runtimeWaitTimeouts.push(timeoutMs);
            return {
              timedOut: false,
              run: store.markSubagentRunStatus(run.id, "failed", {
                resultArtifact: {
                  schemaVersion: "ambient-subagent-result-artifact-v1",
                  runId: run.id,
                  status: "failed",
                  partial: false,
                  summary: "child failed",
                  childThreadId: run.childThreadId,
                },
              }),
            };
          },
        },
      });

      const spawned = await executeTool(tool, "spawn-failing-runtime", {
        action: "spawn_agent",
        task: "Check a failing branch.",
        dependencyMode: "required",
        idempotencyKey: "spawn:failing-runtime",
      });
      const runId = (spawned.details as any).run.id as string;

      const waited = await executeTool(tool, "wait-failing-runtime", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });
      expect(runtimeWaitTimeouts).toEqual([600_000]);

      expect((waited.details as any).status).toBe("failed");
      expect((waited.details as any).waitSatisfied).toBe(true);
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).parentResolution).toMatchObject({
        schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: true,
        failurePolicy: "degrade_partial",
        barrierStatus: "failed",
      });
      expect((waited.content[0] as any).text).toContain("parentAction: ask_user");
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [runId],
        dependencyMode: "required_all",
        status: "failed",
      });
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("reports terminal barriers without reattaching wait_agent to the child runtime", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "running");
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "timed_out", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "running" }],
          synthesisAllowed: false,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_runtime_timeout",
            source: "child_runtime",
            childRunId: child.id,
          },
        },
      });
      const waitForChildRun = vi.fn(({ run }) => ({ run, timedOut: false }));
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: { waitForChildRun },
      });

      const status = await executeTool(tool, "status-terminal-barrier", {
        action: "status_agent",
        waitBarrierId: barrier.id,
      });
      expect((status.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        status: "timed_out",
        childRunIds: [child.id],
      });
      expect((status.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        barrierStatus: "timed_out",
      });
      expect((status.content[0] as any).text).toContain("waitBarrierRecovery: This barrier is terminal.");
      expect(waitForChildRun).not.toHaveBeenCalled();

      const waited = await executeTool(tool, "wait-terminal-barrier", {
        action: "wait_agent",
        childRunId: child.id,
      });
      expect(waitForChildRun).not.toHaveBeenCalled();
      expect(waited.details as any).toMatchObject({
        waitBarrierTerminalInspection: true,
        waitTimedOut: false,
        waitSessionExpired: false,
        waitSatisfied: true,
        synthesisAllowed: false,
        waitBarrier: {
          id: barrier.id,
          status: "timed_out",
          childRunIds: [child.id],
        },
        parentResolution: {
          status: "blocked",
          action: "ask_user",
          canSynthesize: false,
          barrierStatus: "timed_out",
        },
      });
      expect((waited.details as any).waitNotice).toContain("already-terminal wait barrier");
      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toHaveLength(1);
      expect(store.getSubagentWaitBarrier(barrier.id).status).toBe("timed_out");
    } finally {
      store.close();
    }
  });

  it("surfaces child approval-response delivery evidence from wait_agent", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const resolveChildApprovalResponse = vi.fn(({ run, mailboxEvent, markMailboxDelivered, markMailboxConsumed, emitEvent }) => {
        markMailboxDelivered("2026-06-06T00:01:00.000Z");
        emitEvent({
          type: "status",
          source: "approval_response",
          status: "running",
          message: `Delivered approval response ${mailboxEvent.id}.`,
        });
        const consumed = markMailboxConsumed("2026-06-06T00:01:01.000Z");
        const running = store.markSubagentRunStatus(run.id, "running");
        return {
          run: running,
          accepted: true,
          mailboxEvent: consumed,
          message: "Runtime resumed child approval waiter.",
        };
      });
      const waitForChildRun = vi.fn(({ run }) => ({ run, timedOut: false }));
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "needs_attention") }),
          waitForChildRun,
          resolveChildApprovalResponse,
        },
      });

      const spawned = await executeTool(tool, "spawn-approval-response", {
        action: "spawn_agent",
        task: "Attempt a write that needs parent approval.",
        idempotencyKey: "spawn:approval-response",
      });
      const runId = (spawned.details as any).run.id as string;
      store.appendSubagentMailboxEvent(runId, {
        direction: "parent_to_child",
        type: "subagent.approval_response",
        payload: {
          schemaVersion: "ambient-subagent-approval-bridge-v1",
          idempotencyKey: "approval-response:key",
          childRunId: runId,
          childThreadId: store.getSubagentRun(runId).childThreadId,
          approvalId: "approval-child-write",
          decision: "approved",
          effectiveScope: "this_child_thread",
          resumeParentBlocking: true,
        },
      });

      const waited = await executeTool(tool, "wait-approval-response", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect(resolveChildApprovalResponse).toHaveBeenCalledTimes(1);
      expect(waitForChildRun).toHaveBeenCalledWith(
        expect.objectContaining({
          run: expect.objectContaining({ id: runId, status: "running" }),
        }),
      );
      expect(waited.details as any).toMatchObject({
        status: "running",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice:
          "Child approval response was delivered to the child runtime; the parent remains blocked until the child reaches a synthesis-safe result.",
        approvalResponseDeliveries: [
          {
            accepted: true,
            message: "Runtime resumed child approval waiter.",
            mailboxEvent: {
              type: "subagent.approval_response",
              deliveryState: "consumed",
              deliveredAt: "2026-06-06T00:01:00.000Z",
            },
          },
        ],
      });
      expect((waited.details as any).approvalResponsePendingEvents).toBeUndefined();
      expect(store.listSubagentMailboxEvents(runId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.approval_response",
            deliveryState: "consumed",
            deliveredAt: "2026-06-06T00:01:00.000Z",
          }),
        ]),
      );
    } finally {
      store.close();
    }
  });

  it("does not allow synthesis for completed children without a valid result artifact", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "running") }),
          waitForChildRun: ({ run }) => ({
            timedOut: false,
            run: store.markSubagentRunStatus(run.id, "completed"),
          }),
        },
      });

      const spawned = await executeTool(tool, "spawn-missing-artifact", {
        action: "spawn_agent",
        task: "Complete without an artifact.",
        dependencyMode: "required",
        idempotencyKey: "spawn:missing-artifact",
      });
      const runId = (spawned.details as any).run.id as string;

      const waited = await executeTool(tool, "wait-missing-artifact", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any).status).toBe("completed");
      expect((waited.details as any).waitSatisfied).toBe(true);
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).resultValidation).toMatchObject({
        valid: false,
        synthesisAllowed: false,
        reason: "Missing sub-agent result artifact.",
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [runId],
        dependencyMode: "required_all",
        status: "failed",
      });
    } finally {
      store.close();
    }
  });

  it("routes child supervisor requests to parent user steering without synthesis", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Explorer needs steering",
        roleId: "explorer",
        canonicalTaskPath: "root/needs-attention:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const structuredOutput = {
        ...structuredResult("explorer", "Need the parent to choose an approved fixture."),
        status: "needs_attention",
        evidence: [],
        risks: ["Cannot proceed safely until the parent/user chooses the fixture."],
        nextActions: ["Ask the user which fixture to inspect, then send that decision to the child."],
        roleOutput: { findings: [], openQuestions: ["Which fixture should be inspected?"] },
      };
      const waitingChild = store.markSubagentRunStatus(child.id, "needs_attention");
      store.appendSubagentMailboxEvent(child.id, {
        direction: "child_to_parent",
        type: "subagent.needs_attention",
        payload: {
          status: "needs_attention",
          summary: structuredOutput.summary,
          childThreadId: waitingChild.childThreadId,
          structuredOutput,
        },
      });

      const waited = await executeTool(tool, "wait-needs-attention", {
        action: "wait_agent",
        childRunId: child.id,
      });

      expect((waited.details as any).status).toBe("needs_attention");
      expect((waited.details as any).waitSatisfied).toBe(false);
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: false,
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [child.id],
        dependencyMode: "required_all",
        status: "waiting_on_children",
      });
      expect((waited.details as any).resultValidation).toMatchObject({
        valid: false,
        synthesisAllowed: false,
        reason: "Missing sub-agent result artifact.",
      });
      expect((waited.content[0] as any).text).toContain("parentAction: ask_user");
      expect((waited.content[0] as any).text).toContain("send_agent or followup_agent");
      expect((waited.details as any).waitCompletionMailbox).toMatchObject({
        runId: child.id,
        direction: "child_to_parent",
        type: "subagent.wait_completed",
      });
      expect((waited.details as any).waitBarrierAttentionParentMailbox).toMatchObject({
        type: "subagent.wait_barrier_attention",
        parentMessageId: assistant.id,
        childRunIds: [child.id],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.wait_barrier_attention",
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            barrierStatus: "waiting_on_children",
            parentResolution: expect.objectContaining({ action: "ask_user" }),
            allowedUserChoices: expect.arrayContaining([
              expect.objectContaining({ id: "send_child_steering" }),
              expect.objectContaining({ id: "retry_child" }),
              expect.objectContaining({ id: "cancel_parent" }),
            ]),
          }),
        }),
      ]);
      expect(store.listSubagentMailboxEvents(child.id)).toEqual([
        expect.objectContaining({
          type: "subagent.needs_attention",
          payload: expect.objectContaining({
            status: "needs_attention",
            summary: structuredOutput.summary,
          }),
        }),
        expect.objectContaining({
          type: "subagent.wait_completed",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-completion-v1",
            status: "needs_attention",
            synthesisAllowed: false,
          }),
        }),
      ]);
    } finally {
      store.close();
    }
  });

  it("exposes child supervisor request records from wait_agent as compact Pi-visible handles", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({
            started: true,
            run: store.markSubagentRunStatus(run.id, "running"),
          }),
          waitForChildRun: ({ run }) => {
            const needsAttention = store.markSubagentRunStatus(run.id, "needs_attention");
            return {
              run: needsAttention,
              timedOut: false,
              supervisorRequests: [
                {
                  kind: "need_decision",
                  title: "Choose source strategy",
                  message: "The child can continue with docs only or inspect source before summarizing.",
                  requestedChoices: [
                    { id: "docs-only", label: "Docs only" },
                    { id: "inspect-source", label: "Inspect source" },
                  ],
                  createdAt: "2026-06-06T00:02:00.000Z",
                },
              ],
            };
          },
        },
      });

      const spawned = await executeTool(tool, "spawn-supervisor-request", {
        action: "spawn_agent",
        task: "Compare source strategies before summarizing.",
        dependencyMode: "required",
        idempotencyKey: "spawn:supervisor-request",
      });
      const runId = (spawned.details as any).run.id as string;
      const waited = await executeTool(tool, "wait-supervisor-request", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect(waited.details as any).toMatchObject({
        status: "needs_attention",
        waitSatisfied: false,
        synthesisAllowed: false,
        waitNotice:
          "Child requested supervisor attention; parent mailbox records the request and the parent remains blocked until the child is synthesis-safe.",
        supervisorRequestRecords: [
          {
            schemaVersion: "ambient-subagent-supervisor-request-v1",
            replay: false,
            kind: "need_decision",
            title: "Choose source strategy",
            parentRequiresAttention: true,
            childMailboxEvent: {
              runId,
              direction: "child_to_parent",
              type: "subagent.supervisor_request",
              deliveryState: "delivered",
            },
            parentMailboxEvent: {
              parentRunId: parentRun.id,
              parentMessageId: assistant.id,
              type: "subagent.child_supervisor_request",
              deliveryState: "queued",
              childRunIds: [runId],
            },
            runEvent: {
              type: "subagent.supervisor_request",
              preview: expect.objectContaining({
                kind: "need_decision",
                completionStatus: "not_complete",
              }),
            },
          },
        ],
      });
      expect((waited.details as any).supervisorRequestRecords[0].childMailboxEvent).not.toHaveProperty("payload");
      expect((waited.details as any).supervisorRequestRecords[0].parentMailboxEvent).not.toHaveProperty("payload");
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.child_supervisor_request",
            deliveryState: "queued",
            parentMessageId: assistant.id,
            payload: expect.objectContaining({
              childRunId: runId,
              kind: "need_decision",
              parentRequiresAttention: true,
              marksChildComplete: false,
            }),
          }),
        ]),
      );

      const supervisorRequestParentMailboxEventId = (waited.details as any).supervisorRequestRecords[0].parentMailboxEvent.id as string;
      const followed = await executeTool(tool, "follow-supervisor-request", {
        action: "followup_agent",
        childRunId: runId,
        message: "Use docs only for the first pass.",
        supervisorRequestParentMailboxEventId,
        supervisorChoiceId: "docs-only",
        idempotencyKey: "follow:docs-only-supervisor-request",
      });

      expect(followed.details as any).toMatchObject({
        status: "queued",
        supervisorChoiceId: "docs-only",
        supervisorRequestAcknowledgement: {
          id: supervisorRequestParentMailboxEventId,
          type: "subagent.child_supervisor_request",
          deliveryState: "consumed",
          childRunIds: [runId],
        },
        mailboxEvent: {
          type: "subagent.followup",
          deliveryState: "queued",
        },
      });
      expect(store.getSubagentParentMailboxEvent(supervisorRequestParentMailboxEventId)).toMatchObject({
        type: "subagent.child_supervisor_request",
        deliveryState: "consumed",
        deliveredAt: expect.any(String),
      });
      expect(store.listSubagentMailboxEvents(runId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.followup",
            payload: expect.objectContaining({
              supervisorRequestParentMailboxEventId,
              supervisorChoiceId: "docs-only",
            }),
          }),
        ]),
      );
    } finally {
      store.close();
    }
  });

  it("blocks synthesis when a structured-output role completes with prose-only output", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          startChildRun: ({ run }) => ({ started: true, run: store.markSubagentRunStatus(run.id, "running") }),
          waitForChildRun: ({ run }) => ({
            timedOut: false,
            run: store.markSubagentRunStatus(run.id, "completed", {
              resultArtifact: {
                schemaVersion: "ambient-subagent-result-artifact-v1",
                runId: run.id,
                status: "completed",
                partial: false,
                summary: "prose-only child result",
                childThreadId: run.childThreadId,
              },
            }),
          }),
        },
      });

      const spawned = await executeTool(tool, "spawn-prose-only", {
        action: "spawn_agent",
        task: "Complete without the structured result envelope.",
        dependencyMode: "required",
        idempotencyKey: "spawn:prose-only",
      });
      const runId = (spawned.details as any).run.id as string;

      const waited = await executeTool(tool, "wait-prose-only", {
        action: "wait_agent",
        childRunId: runId,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any).status).toBe("completed");
      expect((waited.details as any).synthesisAllowed).toBe(false);
      expect((waited.details as any).resultValidation).toMatchObject({
        valid: false,
        synthesisAllowed: false,
        reason: "Structured sub-agent result JSON is missing or not an object.",
        structuredOutputValidation: {
          valid: false,
          synthesisAllowed: false,
        },
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        childRunIds: [runId],
        dependencyMode: "required_all",
        status: "failed",
      });
      expect(store.getSubagentWaitBarrier((waited.details as any).waitBarrier.id)).toMatchObject({
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: false,
        }),
      });
    } finally {
      store.close();
    }
  });

  it("requires Ambient-side mutation evidence before synthesizing completed implementation roles", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });
      const missingAmbientEvidence = completedWorkerRun(
        store,
        parent.id,
        parentRun.id,
        assistant.id,
        "root/worker-missing",
        "worker-missing",
      );
      const withAmbientEvidence = completedWorkerRun(
        store,
        parent.id,
        parentRun.id,
        assistant.id,
        "root/worker-evidence",
        "worker-evidence",
      );
      const optionalMissingAmbientEvidence = completedWorkerRun(
        store,
        parent.id,
        parentRun.id,
        assistant.id,
        "root/worker-optional-missing",
        "worker-optional-missing",
        "optional_background",
      );
      store.appendSubagentRunEvent(withAmbientEvidence.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "tool_result",
          source: "child_runtime",
          runId: withAmbientEvidence.id,
          parentThreadId: withAmbientEvidence.parentThreadId,
          parentRunId: withAmbientEvidence.parentRunId,
          childThreadId: withAmbientEvidence.childThreadId,
          canonicalTaskPath: withAmbientEvidence.canonicalTaskPath,
          createdAt: "2026-06-05T00:00:00.000Z",
          toolName: "write",
          details: {
            toolCallId: "tool-call-worker-evidence",
            category: "workspace.write",
            path: "src/worker.ts",
            worktreeIsolated: true,
            worktreePath: `${workspacePath}/.ambient-codex/worktrees/${withAmbientEvidence.childThreadId}`,
            approvalId: "approval-worker-evidence",
            approvalSource: "permission_grant",
          },
        },
      });

      const blocked = await executeTool(tool, "wait-worker-missing", {
        action: "wait_agent",
        childRunId: missingAmbientEvidence.id,
      });
      expect((blocked.details as any).synthesisAllowed).toBe(false);
      expect((blocked.details as any).resultValidation).toMatchObject({
        valid: false,
        reason: "Implementation roles require Ambient-recorded mutation evidence before completed synthesis.",
        completionGuardValidation: {
          valid: false,
          required: true,
          structuredEvidenceCount: 1,
          ambientEvidenceCount: 0,
        },
      });
      expect((blocked.details as any).waitBarrier).toMatchObject({
        status: "failed",
      });

      const optionalBlocked = await executeTool(tool, "wait-worker-optional-missing", {
        action: "wait_agent",
        childRunId: optionalMissingAmbientEvidence.id,
      });
      expect((optionalBlocked.details as any).synthesisAllowed).toBe(false);
      expect((optionalBlocked.details as any).groupedCompletionNotification).toBeUndefined();
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.grouped_completion"),
      ).toEqual([]);
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.wait_barrier_attention"),
      ).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-attention-v1",
            barrierStatus: "failed",
            parentResolution: expect.objectContaining({ action: "ask_user" }),
          }),
        }),
      ]);

      const allowed = await executeTool(tool, "wait-worker-evidence", {
        action: "wait_agent",
        childRunId: withAmbientEvidence.id,
      });
      expect((allowed.details as any).synthesisAllowed).toBe(true);
      expect((allowed.details as any).resultValidation).toMatchObject({
        valid: true,
        completionGuardValidation: {
          valid: true,
          required: true,
          structuredEvidenceCount: 1,
          ambientEvidenceCount: 1,
          isolatedWorktreeEvidenceCount: 1,
          approvalEvidenceCount: 1,
        },
      });
      expect((allowed.details as any).waitBarrier).toMatchObject({
        status: "satisfied",
      });
    } finally {
      store.close();
    }
  });
});
