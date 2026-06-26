import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { ProjectStore } from "./subagentProjectStoreFacade";
import { createSubagentPiToolDefinitions } from "./subagentPiTools";
import { cleanupTempWorkspaces, enabledFlags, executeTool, explorerResultArtifact, tempWorkspace } from "./subagentPiToolsTestSupport";

afterEach(cleanupTempWorkspaces);
describe("ambient_subagent Pi tool wait-barrier policy", () => {
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
});
