import { afterEach, describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { ProjectStore } from "./subagentProjectStoreFacade";
import { createSubagentPiToolDefinitions } from "./subagentPiTools";
import {
  cleanupTempWorkspaces,
  completedWorkerRun,
  enabledFlags,
  executeTool,
  explorerResultArtifact,
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

  it("keeps required_all barriers blocked until every child has a synthesis-safe result", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const completed = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Completed child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const pending = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Pending child",
        roleId: "explorer",
        canonicalTaskPath: "root/1:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(completed.id, "completed", {
        resultArtifact: explorerResultArtifact(completed.id, completed.childThreadId, "Completed child result."),
      });
      store.markSubagentRunStatus(pending.id, "running");
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [completed.id, pending.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const firstWait = await executeTool(tool, "wait-required-all-one-complete", {
        action: "wait_agent",
        childRunId: completed.id,
      });

      expect((firstWait.details as any).synthesisAllowed).toBe(false);
      expect((firstWait.details as any).waitSatisfied).toBe(false);
      expect((firstWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "required_all",
        status: "waiting_on_children",
      });
      expect((firstWait.details as any).waitBarrierEvaluation).toMatchObject({
        schemaVersion: "ambient-subagent-wait-barrier-evaluation-v1",
        dependencyMode: "required_all",
        requiredSynthesisCount: 2,
        validSynthesisCount: 1,
        synthesisAllowed: false,
        activeChildRunIds: [pending.id],
      });
      expect((firstWait.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "wait_for_child",
        canSynthesize: false,
        reason: expect.stringContaining("required_all barrier is still waiting"),
      });
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "waiting_on_children",
      });

      store.markSubagentRunStatus(pending.id, "completed", {
        resultArtifact: explorerResultArtifact(pending.id, pending.childThreadId, "Pending child finished."),
      });
      const secondWait = await executeTool(tool, "wait-required-all-complete", {
        action: "wait_agent",
        childRunId: pending.id,
      });

      expect((secondWait.details as any).synthesisAllowed).toBe(true);
      expect((secondWait.details as any).waitSatisfied).toBe(true);
      expect((secondWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "required_all",
        status: "satisfied",
      });
      expect((secondWait.details as any).waitBarrierEvaluation).toMatchObject({
        requiredSynthesisCount: 2,
        validSynthesisCount: 2,
        synthesisAllowed: true,
        partial: false,
      });
      expect((secondWait.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "synthesize",
        canSynthesize: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: true,
        waitBarrierEvaluation: expect.objectContaining({
          requiredSynthesisCount: 2,
          validSynthesisCount: 2,
        }),
      });
    } finally {
      store.close();
    }
  });

  it("shows every active required_all blocker in Pi-visible wait text", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const completed = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Completed child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const runningA = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Route research",
        roleId: "explorer",
        canonicalTaskPath: "root/1:route",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const runningB = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Hotel research",
        roleId: "explorer",
        canonicalTaskPath: "root/2:hotel",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(completed.id, "completed", {
        now: "2026-06-06T00:00:04.000Z",
        resultArtifact: explorerResultArtifact(completed.id, completed.childThreadId, "Completed child result."),
      });
      store.markSubagentRunStatus(runningA.id, "running", { now: "2026-06-06T00:00:05.000Z" });
      store.markSubagentRunStatus(runningB.id, "running", { now: "2026-06-06T00:00:06.000Z" });
      store.appendSubagentRunEvent(runningA.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "assistant_delta",
          runId: runningA.id,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childThreadId: runningA.childThreadId,
          canonicalTaskPath: runningA.canonicalTaskPath,
          message: "Checking drive timing.",
        },
        createdAt: "2099-06-17T00:00:07.000Z",
      });
      store.appendSubagentRunEvent(runningB.id, {
        type: "subagent.runtime_event",
        preview: {
          schemaVersion: "ambient-subagent-runtime-event-v1",
          type: "tool_call",
          runId: runningB.id,
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childThreadId: runningB.childThreadId,
          canonicalTaskPath: runningB.canonicalTaskPath,
          message: "Checking lodging constraints.",
        },
        createdAt: "2099-06-17T00:00:08.000Z",
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [completed.id, runningA.id, runningB.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const waited = await executeTool(tool, "wait-required-all-visible-blockers", {
        action: "wait_agent",
        childRunId: completed.id,
        waitBarrierId: barrier.id,
      });
      const text = (waited.content[0] as any).text as string;

      expect(text).toContain("waitBarrierStatus: waiting_on_children");
      expect(text).toContain("waitBarrierState: still_waiting");
      expect(text).toContain("waitBarrierBlockers: 2");
      expect(text).toContain(`waitBarrierBlocker: root/1:route childRunId=${runningA.id}`);
      expect(text).toContain("lastActivityAt=2099-06-17T00:00:07.000Z");
      expect(text).toContain("lastActivitySource=run_event:subagent.runtime_event");
      expect(text).toContain("lastActivityDetail=run event 4");
      expect(text).toContain(`waitBarrierBlocker: root/2:hotel childRunId=${runningB.id}`);
      expect(text).toContain("lastActivityAt=2099-06-17T00:00:08.000Z");
      expect((waited.details as any).waitBarrierBlockers).toEqual([
        expect.objectContaining({
          childRunId: runningA.id,
          canonicalTaskPath: "root/1:route",
          blockingState: "active",
          lastActivityAt: "2099-06-17T00:00:07.000Z",
        }),
        expect.objectContaining({
          childRunId: runningB.id,
          canonicalTaskPath: "root/2:hotel",
          blockingState: "active",
          lastActivityAt: "2099-06-17T00:00:08.000Z",
        }),
      ]);
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "waiting_on_children",
        resolutionArtifact: undefined,
      });
    } finally {
      store.close();
    }
  });

  it("allows required_any barriers from one validated child while preserving unsafe sibling provenance", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const winner = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Winner child",
        roleId: "explorer",
        canonicalTaskPath: "root/winner:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      const failed = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Failed child",
        roleId: "explorer",
        canonicalTaskPath: "root/failed:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(winner.id, "completed", {
        resultArtifact: explorerResultArtifact(winner.id, winner.childThreadId, "Winner child result."),
      });
      store.markSubagentRunStatus(failed.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: failed.id,
          status: "failed",
          partial: false,
          summary: "Sibling failed.",
          childThreadId: failed.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [winner.id, failed.id],
        dependencyMode: "required_any",
        failurePolicy: "ask_user",
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const waited = await executeTool(tool, "wait-required-any-winner", {
        action: "wait_agent",
        childRunId: winner.id,
      });

      expect((waited.details as any).synthesisAllowed).toBe(true);
      expect((waited.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "required_any",
        status: "satisfied",
      });
      expect((waited.details as any).waitBarrierEvaluation).toMatchObject({
        dependencyMode: "required_any",
        requiredSynthesisCount: 1,
        validSynthesisCount: 1,
        terminalUnsafeChildRunIds: [failed.id],
        synthesisAllowed: true,
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "synthesize",
        canSynthesize: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
        childStatuses: [
          { childRunId: winner.id, status: "completed" },
          { childRunId: failed.id, status: "failed" },
        ],
        synthesisAllowed: true,
        waitBarrierEvaluation: expect.objectContaining({
          terminalUnsafeChildRunIds: [failed.id],
        }),
      });
    } finally {
      store.close();
    }
  });

  it("uses persisted quorum thresholds instead of implicit majority defaults", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const childRuns = ["one", "two", "three", "four"].map((label, index) =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Quorum child ${label}`,
          roleId: "explorer",
          canonicalTaskPath: `root/${index}:explorer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        }),
      );
      store.markSubagentRunStatus(childRuns[0].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[0].id, childRuns[0].childThreadId, "First valid child."),
      });
      store.markSubagentRunStatus(childRuns[1].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[1].id, childRuns[1].childThreadId, "Second valid child."),
      });
      store.markSubagentRunStatus(childRuns[2].id, "running");
      store.markSubagentRunStatus(childRuns[3].id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: childRuns[3].id,
          status: "failed",
          partial: false,
          summary: "Fourth child failed.",
          childThreadId: childRuns[3].childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "quorum",
        failurePolicy: "ask_user",
        quorumThreshold: 3,
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const firstWait = await executeTool(tool, "wait-quorum-two-of-three", {
        action: "wait_agent",
        childRunId: childRuns[0].id,
      });

      expect((firstWait.details as any).synthesisAllowed).toBe(false);
      expect((firstWait.details as any).waitSatisfied).toBe(false);
      expect((firstWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "quorum",
        quorumThreshold: 3,
        status: "waiting_on_children",
      });
      expect((firstWait.details as any).waitBarrierEvaluation).toMatchObject({
        dependencyMode: "quorum",
        quorumThreshold: 3,
        requiredSynthesisCount: 3,
        validSynthesisCount: 2,
        synthesisAllowed: false,
        activeChildRunIds: [childRuns[2].id],
        terminalUnsafeChildRunIds: [childRuns[3].id],
      });

      store.markSubagentRunStatus(childRuns[2].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[2].id, childRuns[2].childThreadId, "Third valid child."),
      });
      const secondWait = await executeTool(tool, "wait-quorum-three-of-three", {
        action: "wait_agent",
        childRunId: childRuns[2].id,
      });

      expect((secondWait.details as any).synthesisAllowed).toBe(true);
      expect((secondWait.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "quorum",
        quorumThreshold: 3,
        status: "satisfied",
      });
      expect((secondWait.details as any).waitBarrierEvaluation).toMatchObject({
        quorumThreshold: 3,
        requiredSynthesisCount: 3,
        validSynthesisCount: 3,
        terminalUnsafeChildRunIds: [childRuns[3].id],
        synthesisAllowed: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: true,
        waitBarrierEvaluation: expect.objectContaining({
          quorumThreshold: 3,
          requiredSynthesisCount: 3,
          validSynthesisCount: 3,
        }),
      });
    } finally {
      store.close();
    }
  });

  it("creates Pi-reachable aggregate wait barriers with explicit quorum thresholds", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const childRuns = ["first", "second", "third"].map((label, index) =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Aggregate ${label}`,
          roleId: "explorer",
          canonicalTaskPath: `root/${index}:explorer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        }),
      );
      store.markSubagentRunStatus(childRuns[0].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[0].id, childRuns[0].childThreadId, "First quorum result."),
      });
      store.markSubagentRunStatus(childRuns[1].id, "completed", {
        resultArtifact: explorerResultArtifact(childRuns[1].id, childRuns[1].childThreadId, "Second quorum result."),
      });
      store.markSubagentRunStatus(childRuns[2].id, "running");
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(
        executeTool(tool, "wait-quorum-missing-threshold", {
          action: "wait_agent",
          childRunIds: childRuns.map((run) => run.id),
          waitBarrierMode: "quorum",
        }),
      ).rejects.toThrow(/explicit integer quorumThreshold/);

      const waited = await executeTool(tool, "wait-quorum-from-pi", {
        action: "wait_agent",
        childRunIds: childRuns.map((run) => run.id),
        childRunId: childRuns[0].id,
        waitBarrierMode: "quorum",
        quorumThreshold: 2,
        failurePolicy: "ask_user",
      });

      const [barrier] = store.listSubagentWaitBarriersForParentRun(parentRun.id);
      expect(barrier).toMatchObject({
        childRunIds: childRuns.map((run) => run.id),
        dependencyMode: "quorum",
        quorumThreshold: 2,
        failurePolicy: "ask_user",
        status: "satisfied",
      });
      expect((waited.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        dependencyMode: "quorum",
        quorumThreshold: 2,
        status: "satisfied",
      });
      expect((waited.details as any).waitChildRuns).toHaveLength(3);
      expect((waited.details as any).waitBarrierEvaluation).toMatchObject({
        dependencyMode: "quorum",
        quorumThreshold: 2,
        requiredSynthesisCount: 2,
        validSynthesisCount: 2,
        activeChildRunIds: [childRuns[2].id],
        synthesisAllowed: true,
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "synthesize",
        canSynthesize: true,
      });

      const replay = await executeTool(tool, "wait-quorum-from-pi-replay", {
        action: "wait_agent",
        childRunIds: childRuns.map((run) => run.id),
        waitBarrierMode: "quorum",
        quorumThreshold: 2,
        failurePolicy: "ask_user",
      });

      expect(store.listSubagentWaitBarriersForParentRun(parentRun.id)).toHaveLength(1);
      expect((replay.details as any).waitBarrier).toMatchObject({ id: barrier.id, status: "satisfied" });
    } finally {
      store.close();
    }
  });

  it("maps required wait-barrier failure policies to deterministic parent resolutions", async () => {
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
      const cases = [
        { failurePolicy: "fail_parent", action: "fail_parent", requiresUserInput: false, requiresExplicitPartial: false },
        { failurePolicy: "retry_child", action: "retry_child", requiresUserInput: false, requiresExplicitPartial: false },
        { failurePolicy: "ask_user", action: "ask_user", requiresUserInput: true, requiresExplicitPartial: false },
        { failurePolicy: "degrade_partial", action: "ask_user", requiresUserInput: true, requiresExplicitPartial: true },
      ] as const;

      for (const policyCase of cases) {
        const child = store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Child ${policyCase.failurePolicy}`,
          roleId: "reviewer",
          canonicalTaskPath: `root/${policyCase.failurePolicy}:reviewer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        });
        store.markSubagentRunStatus(child.id, "failed", {
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: child.id,
            status: "failed",
            partial: false,
            summary: "child failed",
            childThreadId: child.childThreadId,
          },
        });
        store.createSubagentWaitBarrier({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childRunIds: [child.id],
          dependencyMode: "required_all",
          failurePolicy: policyCase.failurePolicy,
        });

        const waited = await executeTool(tool, `wait-${policyCase.failurePolicy}`, {
          action: "wait_agent",
          childRunId: child.id,
          wait: { timeoutMs: 1 },
        });

        expect((waited.details as any).parentResolution).toMatchObject({
          schemaVersion: "ambient-subagent-parent-policy-resolution-v1",
          status: "blocked",
          action: policyCase.action,
          canSynthesize: false,
          requiresUserInput: policyCase.requiresUserInput,
          requiresExplicitPartial: policyCase.requiresExplicitPartial,
          failurePolicy: policyCase.failurePolicy,
          barrierStatus: "failed",
          childRunId: child.id,
          childStatus: "failed",
        });
        expect((waited.content[0] as any).text).toContain(`parentAction: ${policyCase.action}`);
        expect((waited.content[0] as any).text).toContain("canSynthesize: false");
        expect((waited.details as any).waitBarrierAttentionParentMailbox).toMatchObject({
          type: "subagent.wait_barrier_attention",
          parentMessageId: assistant.id,
          childRunIds: [child.id],
        });
      }
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.wait_barrier_attention"),
      ).toHaveLength(cases.length);
    } finally {
      store.close();
    }
  });

  it("records timed-out required wait barriers in the parent mailbox idempotently", async () => {
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
        title: "Slow child",
        roleId: "reviewer",
        canonicalTaskPath: "root/slow:reviewer",
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
        failurePolicy: "degrade_partial",
        timeoutMs: 1,
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          waitForChildRun: ({ run }) => ({
            timedOut: true,
            run: store.markSubagentRunStatus(run.id, "timed_out"),
            outcome: { kind: "child_runtime_timeout", reason: "runtime_idle_timeout" },
          }),
        },
      });

      const waited = await executeTool(tool, "wait-slow-child", {
        action: "wait_agent",
        childRunId: child.id,
        wait: { timeoutMs: 1 },
      });

      expect((waited.details as any).waitTimedOut).toBe(true);
      expect((waited.details as any).waitBarrier).toMatchObject({
        id: barrier.id,
        status: "timed_out",
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "ask_user",
        canSynthesize: false,
        requiresUserInput: true,
        requiresExplicitPartial: true,
        barrierStatus: "timed_out",
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
            waitTimedOut: true,
            barrierStatus: "timed_out",
            failurePolicy: "degrade_partial",
            allowedUserChoices: expect.arrayContaining([
              expect.objectContaining({ id: "continue_with_partial", toolAction: "resolve_barrier" }),
              expect.objectContaining({ id: "retry_child", toolAction: "resolve_barrier" }),
              expect.objectContaining({ id: "cancel_parent", toolAction: "resolve_barrier" }),
            ]),
          }),
        }),
      ]);

      const replay = await executeTool(tool, "wait-slow-child-replay", {
        action: "wait_agent",
        childRunId: child.id,
        wait: { timeoutMs: 1 },
      });
      expect((replay.details as any).waitBarrierAttentionParentMailbox).toMatchObject({
        type: "subagent.wait_barrier_attention",
      });
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.wait_barrier_attention"),
      ).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records user-approved partial barrier decisions before allowing parent partial synthesis", async () => {
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
        title: "Failed child",
        roleId: "reviewer",
        canonicalTaskPath: "root/failed:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "failed",
          partial: false,
          summary: "child failed",
          childThreadId: child.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "degrade_partial",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "failed" }],
          synthesisAllowed: false,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_terminal",
            source: "wait_agent",
            childRunId: child.id,
            childRunIds: [child.id],
            reason: "child failed",
          },
        },
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      const resolved = await executeTool(tool, "resolve-partial", {
        action: "resolve_barrier",
        waitBarrierId: barrier.id,
        decision: "continue_with_partial",
        userDecision: "User approved continuing without the failed reviewer.",
        partialSummary: "Reviewer branch failed; parent may answer using only verified parent context.",
        idempotencyKey: "barrier:partial",
      });

      expect((resolved.details as any).status).toBe("satisfied");
      expect((resolved.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "continue_with_explicit_partial",
        canSynthesize: true,
        requiresExplicitPartial: true,
      });
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "satisfied",
        resolutionArtifact: expect.objectContaining({
          synthesisAllowed: true,
          explicitPartial: true,
          userDecision: expect.objectContaining({
            schemaVersion: "ambient-subagent-user-decision-v1",
            decision: "continue_with_partial",
            userDecision: "User approved continuing without the failed reviewer.",
          }),
        }),
      });
      expect(store.listSubagentRunEvents(child.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.barrier_decision",
            preview: expect.objectContaining({
              waitBarrierId: barrier.id,
              decision: "continue_with_partial",
              idempotencyKey: "barrier:partial",
            }),
          }),
        ]),
      );
      expect(store.listMessages(child.childThreadId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Parent recorded a wait-barrier decision: continue_with_partial."),
          }),
        ]),
      );
      expect((resolved.details as any).parentMailboxEvent).toMatchObject({
        type: "subagent.wait_barrier_decision",
        parentMessageId: assistant.id,
        childRunIds: [child.id],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          type: "subagent.wait_barrier_decision",
          parentMessageId: assistant.id,
          idempotencyKey: "barrier:partial",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-decision-v1",
            decision: "continue_with_partial",
            partialSummaryPreview: "Reviewer branch failed; parent may answer using only verified parent context.",
          }),
        }),
      ]);

      const waited = await executeTool(tool, "wait-after-partial", {
        action: "wait_agent",
        childRunId: child.id,
      });
      expect((waited.details as any).parentResolution).toMatchObject({
        status: "ready",
        action: "continue_with_explicit_partial",
        canSynthesize: true,
        requiresExplicitPartial: true,
      });
      expect((waited.content[0] as any).text).toContain("parentAction: continue_with_explicit_partial");

      const replay = await executeTool(tool, "resolve-partial-replay", {
        action: "resolve_barrier",
        waitBarrierId: barrier.id,
        decision: "continue_with_partial",
        userDecision: "User approved continuing without the failed reviewer.",
        partialSummary: "Reviewer branch failed; parent may answer using only verified parent context.",
        idempotencyKey: "barrier:partial",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(store.listSubagentRunEvents(child.id).filter((event) => event.type === "subagent.barrier_decision")).toHaveLength(1);
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.wait_barrier_decision"),
      ).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records retry and fail barrier decisions without satisfying the barrier", async () => {
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
      const cases = [
        { decision: "retry_child", status: "waiting_on_children", action: "retry_child" },
        { decision: "fail_parent", status: "failed", action: "fail_parent" },
      ] as const;

      for (const policyCase of cases) {
        const child = store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          parentMessageId: assistant.id,
          title: `Child ${policyCase.decision}`,
          roleId: "reviewer",
          canonicalTaskPath: `root/${policyCase.decision}:reviewer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
          dependencyMode: "required",
        });
        store.markSubagentRunStatus(child.id, "failed", {
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: child.id,
            status: "failed",
            partial: false,
            summary: "child failed",
            childThreadId: child.childThreadId,
          },
        });
        const barrier = store.createSubagentWaitBarrier({
          parentThreadId: parent.id,
          parentRunId: parentRun.id,
          childRunIds: [child.id],
          dependencyMode: "required_all",
          failurePolicy: policyCase.decision === "retry_child" ? "retry_child" : "fail_parent",
        });
        store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
          resolutionArtifact: {
            schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
            childRunIds: [child.id],
            childStatuses: [{ childRunId: child.id, status: "failed" }],
            synthesisAllowed: false,
            transitionEvidence: {
              schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
              kind: "child_terminal",
              source: "wait_agent",
              childRunId: child.id,
              childRunIds: [child.id],
              reason: "child failed",
            },
          },
        });

        const resolved = await executeTool(tool, `resolve-${policyCase.decision}`, {
          action: "resolve_barrier",
          waitBarrierId: barrier.id,
          decision: policyCase.decision,
          idempotencyKey: `barrier:${policyCase.decision}`,
        });

        expect((resolved.details as any).waitBarrier).toMatchObject({
          id: barrier.id,
          status: policyCase.status,
        });
        expect((resolved.details as any).parentResolution).toMatchObject({
          status: "blocked",
          action: policyCase.action,
          canSynthesize: false,
        });
        expect((resolved.details as any).parentMailboxEvent).toMatchObject({
          type: "subagent.wait_barrier_decision",
          parentMessageId: assistant.id,
          childRunIds: [child.id],
        });
        expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toMatchObject({
          synthesisAllowed: false,
          explicitPartial: false,
          userDecision: expect.objectContaining({
            decision: policyCase.decision,
          }),
        });
      }
    } finally {
      store.close();
    }
  });

  it("rejects cancel_parent barrier decisions whose stated intent is retrying replacement work", async () => {
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
        title: "Failed judge",
        roleId: "reviewer",
        canonicalTaskPath: "root/judge:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "failed", {
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: child.id,
          status: "failed",
          partial: false,
          summary: "judge failed",
          childThreadId: child.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "failed", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "failed" }],
          synthesisAllowed: false,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_terminal",
            source: "wait_agent",
            childRunId: child.id,
            childRunIds: [child.id],
            reason: "judge failed",
          },
        },
      });
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
      });

      await expect(
        executeTool(tool, "resolve-bad-cancel", {
          action: "resolve_barrier",
          waitBarrierId: barrier.id,
          decision: "cancel_parent",
          userDecision: "Cancelling this child to retry with a different role configuration.",
        }),
      ).rejects.toThrow("cancel_parent is only for actually stopping the parent run");

      expect(store.getSubagentWaitBarrier(barrier.id).status).toBe("failed");
      expect(store.getSubagentRun(child.id).status).toBe("failed");
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.wait_barrier_decision"),
      ).toHaveLength(0);
    } finally {
      store.close();
    }
  });

  it("records detach and parent-cancel barrier decisions with child state changes", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const runtimeCancel = vi.fn((input: any) => ({
        cancelled: true,
        run: store.markSubagentRunStatus(input.run.id, "cancelled", {
          resultArtifact: {
            schemaVersion: "ambient-subagent-result-artifact-v1",
            runId: input.run.id,
            status: "cancelled",
            partial: false,
            summary: input.reason,
            childThreadId: input.run.childThreadId,
          },
        }),
      }));
      const [tool] = createSubagentPiToolDefinitions({
        store,
        threadId: parent.id,
        getFeatureFlagSnapshot: () => enabledFlags,
        getParentRun: () => ({ id: parentRun.id, assistantMessageId: assistant.id }),
        runtime: {
          cancelChildRun: runtimeCancel,
        },
      });

      const detachedChild = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Detached child",
        roleId: "reviewer",
        canonicalTaskPath: "root/detach:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(detachedChild.id, "running");
      const detachedMailbox = store.appendSubagentMailboxEvent(detachedChild.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Keep working if detached." },
      });
      const detachBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [detachedChild.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      store.updateSubagentWaitBarrierStatus(detachBarrier.id, "timed_out", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [detachedChild.id],
          childStatuses: [{ childRunId: detachedChild.id, status: "running" }],
          timedOut: true,
          synthesisAllowed: false,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_runtime_timeout",
            source: "child_runtime",
            childRunId: detachedChild.id,
            childRunIds: [detachedChild.id],
            reason: "runtime_idle_timeout",
            timeoutKind: "idle",
          },
        },
      });

      const detached = await executeTool(tool, "resolve-detach", {
        action: "resolve_barrier",
        waitBarrierId: detachBarrier.id,
        decision: "detach_child",
        userDecision: "User wants this child to continue separately.",
        idempotencyKey: "barrier:detach",
      });

      expect((detached.details as any).waitBarrier).toMatchObject({
        id: detachBarrier.id,
        status: "failed",
      });
      expect((detached.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "detach_child",
        canSynthesize: false,
      });
      expect(store.getSubagentRun(detachedChild.id)).toMatchObject({
        status: "detached",
        resultArtifact: expect.objectContaining({
          status: "detached",
          summary: expect.stringContaining("User detached this required child"),
        }),
      });
      expect(store.listSubagentMailboxEvents(detachedChild.id)).toEqual([
        expect.objectContaining({
          id: detachedMailbox.id,
          type: "subagent.followup",
          deliveryState: "queued",
        }),
      ]);
      expect(store.getSubagentWaitBarrier(detachBarrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: false,
        detachedRunIds: [detachedChild.id],
        userDecision: expect.objectContaining({ decision: "detach_child" }),
      });

      const cancelledChild = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Cancelled child",
        roleId: "reviewer",
        canonicalTaskPath: "root/cancel-parent:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(cancelledChild.id, "running");
      const cancelledMailbox = store.appendSubagentMailboxEvent(cancelledChild.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "This will be cancelled." },
      });
      const cancelBarrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [cancelledChild.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
      });
      store.updateSubagentWaitBarrierStatus(cancelBarrier.id, "timed_out", {
        resolutionArtifact: {
          schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
          childRunIds: [cancelledChild.id],
          childStatuses: [{ childRunId: cancelledChild.id, status: "running" }],
          timedOut: true,
          synthesisAllowed: false,
          transitionEvidence: {
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "child_runtime_timeout",
            source: "child_runtime",
            childRunId: cancelledChild.id,
            childRunIds: [cancelledChild.id],
            reason: "runtime_idle_timeout",
            timeoutKind: "idle",
          },
        },
      });

      const cancelled = await executeTool(tool, "resolve-cancel-parent", {
        action: "resolve_barrier",
        waitBarrierId: cancelBarrier.id,
        decision: "cancel_parent",
        userDecision: "User chose to cancel the parent run instead of waiting.",
        idempotencyKey: "barrier:cancel-parent",
      });

      expect(runtimeCancel).toHaveBeenCalledTimes(1);
      expect(runtimeCancel).toHaveBeenCalledWith(
        expect.objectContaining({
          run: expect.objectContaining({ id: cancelledChild.id }),
          reason: expect.stringContaining("User cancelled the parent path"),
          idempotencyKey: expect.stringContaining("subagent:cancel:"),
        }),
      );
      expect((cancelled.details as any).waitBarrier).toMatchObject({
        id: cancelBarrier.id,
        status: "cancelled",
      });
      expect((cancelled.details as any).parentResolution).toMatchObject({
        status: "blocked",
        action: "cancel_parent",
        canSynthesize: false,
      });
      expect(store.getSubagentRun(cancelledChild.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: expect.objectContaining({
          status: "cancelled",
          summary: expect.stringContaining("User cancelled the parent path"),
        }),
      });
      expect(store.listSubagentMailboxEvents(cancelledChild.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: cancelledMailbox.id,
            type: "subagent.followup",
            deliveryState: "cancelled",
          }),
          expect.objectContaining({
            type: "subagent.cancelled",
            direction: "child_to_parent",
            deliveryState: "delivered",
          }),
        ]),
      );
      expect(store.getSubagentWaitBarrier(cancelBarrier.id).resolutionArtifact).toMatchObject({
        synthesisAllowed: false,
        parentCancellationRequested: true,
        cancelledRunIds: [cancelledChild.id],
        cancelledMailboxEventIds: [cancelledMailbox.id],
        userDecision: expect.objectContaining({ decision: "cancel_parent" }),
      });
      const barrierDecisionEvents = store
        .listSubagentParentMailboxEventsForParentRun(parentRun.id)
        .filter((event) => event.type === "subagent.wait_barrier_decision");
      expect(barrierDecisionEvents).toHaveLength(2);
      expect(barrierDecisionEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            parentMessageId: assistant.id,
            idempotencyKey: "barrier:detach",
            payload: expect.objectContaining({
              decision: "detach_child",
              detachedRunIds: [detachedChild.id],
            }),
          }),
          expect.objectContaining({
            parentMessageId: assistant.id,
            idempotencyKey: "barrier:cancel-parent",
            payload: expect.objectContaining({
              decision: "cancel_parent",
              parentCancellationRequested: true,
              cancelledRunIds: [cancelledChild.id],
              cancelledMailboxEventIds: [cancelledMailbox.id],
            }),
          }),
        ]),
      );

      const replay = await executeTool(tool, "resolve-cancel-parent-replay", {
        action: "resolve_barrier",
        waitBarrierId: cancelBarrier.id,
        decision: "cancel_parent",
        userDecision: "User chose to cancel the parent run instead of waiting.",
        idempotencyKey: "barrier:cancel-parent",
      });
      expect((replay.details as any).status).toBe("idempotent_replay");
      expect(
        store.listSubagentParentMailboxEventsForParentRun(parentRun.id).filter((event) => event.type === "subagent.wait_barrier_decision"),
      ).toHaveLength(2);
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
