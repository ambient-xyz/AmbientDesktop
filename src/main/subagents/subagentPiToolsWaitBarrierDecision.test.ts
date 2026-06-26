import { afterEach, describe, expect, it, vi } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { ProjectStore } from "./subagentProjectStoreFacade";
import { createSubagentPiToolDefinitions } from "./subagentPiTools";
import { cleanupTempWorkspaces, enabledFlags, executeTool, tempWorkspace } from "./subagentPiToolsTestSupport";

afterEach(cleanupTempWorkspaces);
describe("ambient_subagent Pi tool wait-barrier decisions", () => {
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
});
