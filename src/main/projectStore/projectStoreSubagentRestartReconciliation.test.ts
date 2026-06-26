import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import { ProjectStore } from "./projectStore";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-store-subagent-restart-"));
  roots.push(root);
  return join(root, "workspace");
}

function batchArtifact(runId: string, status: SubagentResultArtifact["status"], childThreadId = `${runId}-thread`): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status,
    partial: false,
    summary: `Result artifact for ${runId}.`,
    childThreadId,
  };
}

function waitBarrierResolutionArtifact(input: {
  childRunIds: string[];
  childStatuses?: Array<{ childRunId: string; status: string }>;
  synthesisAllowed: boolean;
  transitionKind: string;
  transitionSource?: string;
  reason?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    schemaVersion: "ambient-subagent-wait-barrier-resolution-v1",
    childRunIds: input.childRunIds,
    ...(input.childStatuses ? { childStatuses: input.childStatuses } : {}),
    synthesisAllowed: input.synthesisAllowed,
    transitionEvidence: {
      schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
      kind: input.transitionKind,
      source: input.transitionSource ?? "wait_agent",
      childRunIds: input.childRunIds,
      ...(input.childRunIds.length === 1 ? { childRunId: input.childRunIds[0] } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
    },
    ...(input.extra ?? {}),
  };
}

describe("ProjectStore sub-agent restart reconciliation", () => {
  it("reconciles active sub-agent runs after restart", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "running", {
        now: "2026-06-05T00:00:10.000Z",
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        timeoutMs: 30_000,
        createdAt: "2026-06-05T00:00:11.000Z",
      });

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(summary).toMatchObject({
        repairedRunIds: [run.id],
        repairedBarrierIds: [barrier.id],
      });
      expect(summary.issues.map((issue) => issue.kind)).toContain("active_run_interrupted");
      expect(store.getSubagentRun(run.id)).toMatchObject({
        status: "needs_attention",
      });
      expect(store.getSubagentRun(run.id).completedAt).toBeUndefined();
      expect(store.getSubagentRun(run.id).resultArtifact).toBeUndefined();
      expect(store.getThread(run.childThreadId).childStatus).toBe("needs_attention");
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "waiting_on_children",
        childRunIds: [run.id],
      });
      expect(store.getSubagentWaitBarrier(barrier.id).resolvedAt).toBeUndefined();
      expect(store.getSubagentWaitBarrier(barrier.id).resolutionArtifact).toBeUndefined();
      expect(store.listSubagentRunEvents(run.id).map((event) => event.type)).toEqual([
        "subagent.reserved",
        "subagent.lifecycle_started",
        "subagent.status_changed",
        "subagent.status_changed",
        "subagent.restart_reconciled",
      ]);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          parentMessageId: "parent-message",
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            parentMessageId: "parent-message",
            childRunId: run.id,
            childThreadId: run.childThreadId,
            previousStatus: "running",
            status: "needs_attention",
            source: "desktop_restart",
            waitBarrierIds: [barrier.id],
          }),
        }),
      ]);

      const replay = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:45.000Z",
      });
      expect(replay.repairedRunIds).toEqual([]);
      expect(replay.repairedBarrierIds).toEqual([]);
      expect(store.listSubagentRunEvents(run.id).filter((event) => event.type === "subagent.restart_reconciled")).toHaveLength(1);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toHaveLength(1);
      expect(store.getSubagentRun(run.id).resultArtifact).toBeUndefined();

      expect(() =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          parentMessageId: "parent-message",
          title: "Duplicate explorer child",
          roleId: "explorer",
          canonicalTaskPath: "root/0:explorer",
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:45.000Z"),
          dependencyMode: "required",
        }),
      ).toThrow(`Sub-agent canonical task path root/0:explorer is already owned by child run ${run.id}.`);
      expect(
        store
          .listSubagentRunsForParentThread(parent.id)
          .filter((item) => item.canonicalTaskPath === "root/0:explorer")
          .map((item) => item.id),
      ).toEqual([run.id]);
    } finally {
      store.close();
    }
  });

  it("recreates missing required wait barriers for interrupted reserved children after restart", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Explorer child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      expect(store.listSubagentWaitBarriersForParentRun("parent-run")).toEqual([]);

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      const recreatedBarrier = store.listSubagentWaitBarriersForParentRun("parent-run")[0];
      expect(recreatedBarrier).toMatchObject({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [run.id],
        dependencyMode: "required_all",
        failurePolicy: "degrade_partial",
        timeoutMs: 600_000,
        status: "waiting_on_children",
        resolvedAt: undefined,
        resolutionArtifact: undefined,
      });
      expect(summary).toMatchObject({
        repairedRunIds: [run.id],
        repairedBarrierIds: [recreatedBarrier.id],
      });
      expect(store.getSubagentRun(run.id)).toMatchObject({
        status: "needs_attention",
        completedAt: undefined,
        resultArtifact: undefined,
      });
      expect(store.listSubagentRunEvents(run.id).at(-1)).toMatchObject({
        type: "subagent.restart_reconciled",
        preview: expect.objectContaining({
          previousStatus: "reserved",
          status: "needs_attention",
          parentBlockingState: "needs_reconciliation",
          waitBarrierIds: [recreatedBarrier.id],
          recreatedWaitBarrier: expect.objectContaining({
            id: recreatedBarrier.id,
            dependencyMode: "required_all",
            failurePolicy: "degrade_partial",
            timeoutMs: 600_000,
          }),
        }),
      });
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          parentMessageId: "parent-message",
          type: "subagent.lifecycle_interrupted",
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-lifecycle-interruption-v1",
            childRunId: run.id,
            source: "desktop_restart",
            waitBarrierIds: [recreatedBarrier.id],
          }),
        }),
      ]);
      expect(() =>
        store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          parentMessageId: "parent-message",
          title: "Duplicate explorer child",
          roleId: "explorer",
          canonicalTaskPath: "root/0:explorer",
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:45.000Z"),
          dependencyMode: "required",
        }),
      ).toThrow(`Sub-agent canonical task path root/0:explorer is already owned by child run ${run.id}.`);

      const replay = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:45.000Z",
      });
      expect(replay.repairedRunIds).toEqual([]);
      expect(replay.repairedBarrierIds).toEqual([]);
      expect(store.listSubagentWaitBarriersForParentRun("parent-run").map((barrier) => barrier.id)).toEqual([recreatedBarrier.id]);
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("reconciles persisted parent-cancel barrier controls idempotently after restart", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const assistant = store.addMessage({ threadId: parent.id, role: "assistant", content: "" });
      const parentRun = store.startRun({ threadId: parent.id, assistantMessageId: assistant.id });
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        parentMessageId: assistant.id,
        title: "Cancelled child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "cancelled", {
        now: "2026-06-05T00:00:10.000Z",
        resultArtifact: batchArtifact(child.id, "cancelled", child.childThreadId),
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: parentRun.id,
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:11.000Z",
      });
      store.updateSubagentWaitBarrierStatus(barrier.id, "cancelled", {
        now: "2026-06-05T00:00:12.000Z",
        resolutionArtifact: waitBarrierResolutionArtifact({
          childRunIds: [child.id],
          childStatuses: [{ childRunId: child.id, status: "cancelled" }],
          synthesisAllowed: false,
          transitionKind: "child_cancelled",
          transitionSource: "barrier_controller",
          reason: "Stop the parent task.",
          extra: {
            parentCancellationRequested: true,
            userDecision: {
              schemaVersion: "ambient-subagent-user-decision-v1",
              decision: "cancel_parent",
              userDecision: "Stop the parent task.",
              decidedAt: "2026-06-05T00:00:12.000Z",
              idempotencyKey: "barrier:cancel-parent",
            },
          },
        }),
      });

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(summary.repairedRunIds).toEqual([]);
      expect(summary.repairedBarrierIds).toEqual([]);
      expect(summary.repairedParentControlBarrierIds).toEqual([barrier.id]);
      expect(summary.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "parent_cancel_control_unreconciled",
            barrierId: barrier.id,
            parentRunId: parentRun.id,
          }),
        ]),
      );
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolvedAt: "2026-06-05T00:00:12.000Z",
        resolutionArtifact: expect.objectContaining({
          parentCancellationRequested: true,
          parentControlReconciledAt: "2026-06-05T00:00:30.000Z",
          parentControlReconciledSource: "desktop_restart",
          parentControlReconciliation: expect.objectContaining({
            schemaVersion: "ambient-subagent-parent-control-reconciliation-v1",
            action: "cancel_parent",
            source: "desktop_restart",
            reconciledAt: "2026-06-05T00:00:30.000Z",
            waitBarrierId: barrier.id,
            parentThreadId: parent.id,
            parentRunId: parentRun.id,
            barrierStatus: "cancelled",
            childRunIds: [child.id],
            parentCancellationRequested: true,
            idempotencyKey: `parent-control-reconcile:desktop_restart:${barrier.id}`,
          }),
          synthesisAllowed: false,
        }),
      });
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toEqual([
        expect.objectContaining({
          parentMessageId: assistant.id,
          type: "subagent.parent_control_reconciled",
          idempotencyKey: `desktop_restart_parent_control:${barrier.id}`,
          payload: expect.objectContaining({
            schemaVersion: "ambient-subagent-parent-control-reconciled-v1",
            waitBarrierId: barrier.id,
            action: "cancel_parent",
            source: "desktop_restart",
            synthesisAllowed: false,
          }),
        }),
      ]);
      expect(store.getSubagentObservabilitySummary({ parentRunId: parentRun.id })).toMatchObject({
        restartReconciliations: 1,
      });

      const replay = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:45.000Z",
      });
      expect(replay.repairedParentControlBarrierIds).toEqual([]);
      expect(store.listSubagentParentMailboxEventsForParentRun(parentRun.id)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("repairs missing and mismatched spawn edges while pruning dangling edges", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const disabledFlags = resolveAmbientFeatureFlags({
      generatedAt: "2026-06-05T00:00:35.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const missingEdge = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Missing edge child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(missingEdge.id, "completed", {
        now: "2026-06-05T00:00:10.000Z",
        resultArtifact: batchArtifact(missingEdge.id, "completed", missingEdge.childThreadId),
      });
      const mismatchedEdge = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Mismatched edge child",
        roleId: "reviewer",
        canonicalTaskPath: "root/1:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(mismatchedEdge.id, "completed", {
        now: "2026-06-05T00:00:11.000Z",
        resultArtifact: batchArtifact(mismatchedEdge.id, "completed", mismatchedEdge.childThreadId),
      });
      store.closeSubagentRun(mismatchedEdge.id, "2026-06-05T00:00:12.000Z");
      const db = (store as unknown as { requireDb(): { prepare(sql: string): { run(...values: unknown[]): unknown } } }).requireDb();
      db.prepare("DELETE FROM subagent_spawn_edges WHERE child_run_id = ?").run(missingEdge.id);
      db.prepare(
        "UPDATE subagent_spawn_edges SET status = ?, canonical_task_path = ?, capacity_released_at = NULL WHERE child_run_id = ?",
      ).run("running", "root/wrong:reviewer", mismatchedEdge.id);
      db.prepare("PRAGMA foreign_keys = OFF").run();
      try {
        db.prepare(
          `INSERT INTO subagent_spawn_edges
             (parent_run_id, child_run_id, parent_thread_id, child_thread_id, canonical_task_path, depth, status, capacity_released_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          "parent-run",
          "missing-run",
          parent.id,
          "dangling-child",
          "root/9:missing",
          1,
          "reserved",
          null,
          "2026-06-05T00:00:00.000Z",
          "2026-06-05T00:00:00.000Z",
        );
      } finally {
        db.prepare("PRAGMA foreign_keys = ON").run();
      }

      const summary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:00:30.000Z",
      });

      expect(summary.repairedRunIds).toEqual([]);
      expect(summary.repairedBarrierIds).toEqual([]);
      expect(summary.repairableSpawnEdgeRunIds).toEqual([missingEdge.id, mismatchedEdge.id]);
      expect(summary.danglingSpawnEdgeRunIds).toEqual(["missing-run"]);
      expect(summary.diagnosticRunIds).toEqual([missingEdge.id, mismatchedEdge.id]);
      expect(summary.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "missing_spawn_edge",
            runId: missingEdge.id,
          }),
          expect.objectContaining({
            kind: "spawn_edge_mismatch",
            runId: mismatchedEdge.id,
            message: expect.stringContaining("edge status running does not match run status completed"),
          }),
          expect.objectContaining({
            kind: "dangling_spawn_edge",
            runId: "missing-run",
          }),
        ]),
      );
      expect(store.getSubagentRun(missingEdge.id).status).toBe("completed");
      expect(store.getSubagentRun(mismatchedEdge.id).status).toBe("completed");
      expect(store.listSubagentRunEvents(missingEdge.id).at(-1)).toMatchObject({
        type: "subagent.restart_diagnostic",
        preview: expect.objectContaining({
          schemaVersion: "ambient-subagent-restart-diagnostic-v1",
          issueCount: 1,
          issues: [expect.objectContaining({ kind: "missing_spawn_edge" })],
        }),
      });
      expect(store.listSubagentRunEvents(mismatchedEdge.id).at(-1)).toMatchObject({
        type: "subagent.restart_diagnostic",
        preview: expect.objectContaining({
          issues: [expect.objectContaining({ kind: "spawn_edge_mismatch" })],
        }),
      });

      const missingRepairEventsBefore = store
        .listSubagentRunEvents(missingEdge.id)
        .filter((event) => event.type === "subagent.spawn_edge_repaired");
      const mismatchedRepairEventsBefore = store
        .listSubagentRunEvents(mismatchedEdge.id)
        .filter((event) => event.type === "subagent.spawn_edge_repaired");
      const dryRun = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:35.000Z",
        dryRun: true,
      });
      expect(dryRun).toMatchObject({
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: "2026-06-05T00:00:35.000Z",
        dryRun: true,
        requestedActions: ["reconstruct_missing_spawn_edge", "realign_spawn_edge", "prune_dangling_spawn_edge"],
        beforeIssueCount: 3,
        reconstructedMissingSpawnEdgeRunIds: [missingEdge.id],
        realignedSpawnEdgeRunIds: [mismatchedEdge.id],
        prunedDanglingSpawnEdgeRunIds: ["missing-run"],
        skippedIssueIds: [],
      });
      expect(dryRun).not.toHaveProperty("afterIssueCount");
      expect(dryRun).not.toHaveProperty("remainingIssues");
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(
        missingRepairEventsBefore,
      );
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(
        mismatchedRepairEventsBefore,
      );

      const disabledRepair = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:37.000Z",
        featureFlagSnapshot: disabledFlags,
      });
      expect(disabledRepair).toMatchObject({
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: "2026-06-05T00:00:37.000Z",
        dryRun: false,
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        requestedActions: ["reconstruct_missing_spawn_edge", "realign_spawn_edge", "prune_dangling_spawn_edge"],
        beforeIssueCount: 3,
        reconstructedMissingSpawnEdgeRunIds: [missingEdge.id],
        realignedSpawnEdgeRunIds: [mismatchedEdge.id],
        prunedDanglingSpawnEdgeRunIds: ["missing-run"],
        skippedIssueIds: [],
        featureFlagSnapshot: expect.objectContaining({
          flags: expect.objectContaining({
            "ambient.subagents": expect.objectContaining({ enabled: false }),
          }),
        }),
      });
      expect(disabledRepair).not.toHaveProperty("afterIssueCount");
      expect(disabledRepair).not.toHaveProperty("remainingIssues");
      const edgesAfterDisabledRepair = new Map(store.listSubagentSpawnEdges().map((edge) => [edge.childRunId, edge]));
      expect(edgesAfterDisabledRepair.has(missingEdge.id)).toBe(false);
      expect(edgesAfterDisabledRepair.get(mismatchedEdge.id)).toMatchObject({
        canonicalTaskPath: "root/wrong:reviewer",
        status: "running",
        capacityReleasedAt: undefined,
      });
      expect(edgesAfterDisabledRepair.has("missing-run")).toBe(true);
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(
        missingRepairEventsBefore,
      );
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual(
        mismatchedRepairEventsBefore,
      );

      const repair = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:40.000Z",
        featureFlagSnapshot: enabledFlags,
      });
      expect(repair).toMatchObject({
        schemaVersion: "ambient-subagent-persisted-child-tree-repair-v1",
        createdAt: "2026-06-05T00:00:40.000Z",
        dryRun: false,
        requestedActions: ["reconstruct_missing_spawn_edge", "realign_spawn_edge", "prune_dangling_spawn_edge"],
        beforeIssueCount: 3,
        afterIssueCount: 0,
        reconstructedMissingSpawnEdgeRunIds: [missingEdge.id],
        realignedSpawnEdgeRunIds: [mismatchedEdge.id],
        prunedDanglingSpawnEdgeRunIds: ["missing-run"],
        skippedIssueIds: [],
        remainingIssues: [],
      });
      const repairedEdges = new Map(store.listSubagentSpawnEdges().map((edge) => [edge.childRunId, edge]));
      expect(repairedEdges.get(missingEdge.id)).toMatchObject({
        parentRunId: "parent-run",
        parentThreadId: parent.id,
        childThreadId: missingEdge.childThreadId,
        canonicalTaskPath: "root/0:explorer",
        status: "completed",
        capacityReleasedAt: undefined,
      });
      expect(repairedEdges.get(mismatchedEdge.id)).toMatchObject({
        parentRunId: "parent-run",
        parentThreadId: parent.id,
        childThreadId: mismatchedEdge.childThreadId,
        canonicalTaskPath: "root/1:reviewer",
        status: "completed",
        capacityReleasedAt: "2026-06-05T00:00:12.000Z",
      });
      expect(repairedEdges.has("missing-run")).toBe(false);
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual([
        expect.objectContaining({
          preview: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
            action: "reconstruct_missing_spawn_edge",
            childRunId: missingEdge.id,
          }),
        }),
      ]);
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toEqual([
        expect.objectContaining({
          preview: expect.objectContaining({
            schemaVersion: "ambient-subagent-spawn-edge-repair-v1",
            action: "realign_spawn_edge",
            childRunId: mismatchedEdge.id,
            previousEdge: expect.objectContaining({
              canonicalTaskPath: "root/wrong:reviewer",
              status: "running",
            }),
          }),
        }),
      ]);

      const secondRepair = store.repairSubagentSpawnEdges({
        now: "2026-06-05T00:00:45.000Z",
        featureFlagSnapshot: enabledFlags,
      });
      expect(secondRepair).toMatchObject({
        dryRun: false,
        requestedActions: [],
        beforeIssueCount: 0,
        afterIssueCount: 0,
        reconstructedMissingSpawnEdgeRunIds: [],
        realignedSpawnEdgeRunIds: [],
        prunedDanglingSpawnEdgeRunIds: [],
        skippedIssueIds: [],
        remainingIssues: [],
      });
      expect(store.listSubagentRunEvents(missingEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toHaveLength(1);
      expect(store.listSubagentRunEvents(mismatchedEdge.id).filter((event) => event.type === "subagent.spawn_edge_repaired")).toHaveLength(
        1,
      );
    } finally {
      store.close();
    }
  });
});
