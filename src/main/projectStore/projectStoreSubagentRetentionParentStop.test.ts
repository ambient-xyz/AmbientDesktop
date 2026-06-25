import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAmbientModelRuntimeSnapshot } from "../../shared/ambientModels";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import { ProjectStore } from "./projectStore";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-store-subagent-retention-parent-stop-"));
  roots.push(root);
  return join(root, "workspace");
}

describe("ProjectStore sub-agent retention and parent-stop safety", () => {
  it("plans sub-agent retention without deleting child thread state", async () => {
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
        title: "Completed child",
        roleId: "summarizer",
        canonicalTaskPath: "root/0:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "completed", { now: "2026-06-05T00:00:00.000Z" });
      store.closeSubagentRun(run.id, "2026-06-05T00:00:00.000Z");

      const plan = store.getSubagentRetentionPlan({
        now: "2026-06-05T00:10:00.000Z",
        cleanupWindowMs: 60_000,
      });

      expect(plan).toMatchObject({
        eligibleRunIds: [run.id],
        decisions: [
          expect.objectContaining({
            runId: run.id,
            action: "eligible_for_cleanup",
            summaryRetained: true,
          }),
        ],
      });
      expect(store.getThread(run.childThreadId)).toMatchObject({
        id: run.childThreadId,
        kind: "subagent_child",
      });
    } finally {
      store.close();
    }
  });

  it("archives cap-exceeded child threads before the cleanup window without touching protected children", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const createClosedRun = (input: { title: string; order: number; status?: "completed" | "failed"; closedAt: string }) => {
        const run = store.createSubagentRun({
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          title: input.title,
          roleId: "summarizer",
          canonicalTaskPath: `root/${input.order}:summarizer`,
          featureFlagSnapshot: enabledFlags,
          modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
          dependencyMode: "required",
        });
        store.markSubagentRunStatus(run.id, input.status ?? "completed", { now: input.closedAt });
        return store.closeSubagentRun(run.id, input.closedAt);
      };
      const oldest = createClosedRun({ title: "Oldest child", order: 0, closedAt: "2026-06-05T00:00:00.000Z" });
      const middle = createClosedRun({ title: "Middle child", order: 1, closedAt: "2026-06-05T00:01:00.000Z" });
      const newest = createClosedRun({ title: "Newest child", order: 2, closedAt: "2026-06-05T00:02:00.000Z" });
      const failed = createClosedRun({ title: "Failed child", order: 3, status: "failed", closedAt: "2026-06-05T00:03:00.000Z" });

      const cleanup = store.applySubagentRetentionCleanup({
        featureFlagSnapshot: enabledFlags,
        now: "2026-06-05T00:10:00.000Z",
        cleanupWindowMs: 60 * 60_000,
        maxRetainedChildrenPerParent: 2,
      });

      expect(cleanup).toMatchObject({
        schemaVersion: "ambient-subagent-retention-cleanup-v1",
        archivedRunIds: [oldest.id, middle.id],
        archivedThreadIds: [oldest.childThreadId, middle.childThreadId],
        skippedRunIds: [],
      });
      expect(cleanup.plan).toMatchObject({
        maxRetainedChildrenPerParent: 2,
        eligibleRunIds: [oldest.id, middle.id],
      });
      expect(cleanup.plan.decisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ runId: oldest.id, action: "eligible_for_cleanup", reason: "retention_cap_exceeded" }),
          expect.objectContaining({ runId: middle.id, action: "eligible_for_cleanup", reason: "retention_cap_exceeded" }),
          expect.objectContaining({ runId: newest.id, action: "retain", reason: "retention_window_active" }),
          expect.objectContaining({ runId: failed.id, action: "retain", reason: "failed_child" }),
        ]),
      );
      expect(store.getThread(oldest.childThreadId).archivedAt).toBe("2026-06-05T00:10:00.000Z");
      expect(store.getThread(middle.childThreadId).archivedAt).toBe("2026-06-05T00:10:00.000Z");
      expect(store.getThread(newest.childThreadId).archivedAt).toBeUndefined();
      expect(store.getThread(failed.childThreadId).archivedAt).toBeUndefined();
      expect(store.listSubagentRunEvents(oldest.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.retention_archived",
            preview: expect.objectContaining({
              reason: "retention_cap_exceeded",
              maxRetainedChildrenPerParent: 2,
              transcriptRetained: true,
              artifactsRetained: true,
            }),
          }),
        ]),
      );
    } finally {
      store.close();
    }
  });

  it("skips retention cleanup mutations while ambient.subagents is disabled", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const disabledFlags = resolveAmbientFeatureFlags({
      generatedAt: "2026-06-05T00:10:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const run = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Eligible child",
        roleId: "summarizer",
        canonicalTaskPath: "root/0:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(run.id, "completed", { now: "2026-06-05T00:00:00.000Z" });
      store.closeSubagentRun(run.id, "2026-06-05T00:00:00.000Z");

      const cleanup = store.applySubagentRetentionCleanup({
        featureFlagSnapshot: disabledFlags,
        now: "2026-06-05T00:10:00.000Z",
        cleanupWindowMs: 60_000,
      });

      expect(cleanup).toMatchObject({
        schemaVersion: "ambient-subagent-retention-cleanup-v1",
        mode: "archive_child_threads",
        skipped: true,
        skipReason: "ambient_subagents_disabled",
        archivedRunIds: [],
        archivedThreadIds: [],
        skippedRunIds: [run.id],
        featureFlagSnapshot: expect.objectContaining({
          flags: expect.objectContaining({
            "ambient.subagents": expect.objectContaining({ enabled: false }),
          }),
        }),
      });
      expect(cleanup.plan.eligibleRunIds).toEqual([run.id]);
      expect(store.getThread(run.childThreadId).archivedAt).toBeUndefined();
      expect(store.listSubagentRunEvents(run.id)).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ type: "subagent.retention_archived" })]),
      );
    } finally {
      store.close();
    }
  });

  it("archives only retention-eligible child threads and records cleanup audit events", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const eligible = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Eligible child",
        roleId: "summarizer",
        canonicalTaskPath: "root/0:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(eligible.id, "completed", { now: "2026-06-05T00:00:00.000Z" });
      store.closeSubagentRun(eligible.id, "2026-06-05T00:00:00.000Z");
      const keepUntilParentPruned = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Keep until parent child",
        roleId: "explorer",
        canonicalTaskPath: "root/1:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(keepUntilParentPruned.id, "completed", { now: "2026-06-05T00:00:00.000Z" });
      store.closeSubagentRun(keepUntilParentPruned.id, "2026-06-05T00:00:00.000Z");
      const protectedRun = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        title: "Needs attention child",
        roleId: "explorer",
        canonicalTaskPath: "root/2:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(protectedRun.id, "needs_attention", { now: "2026-06-05T00:00:00.000Z" });
      store.closeSubagentRun(protectedRun.id, "2026-06-05T00:00:00.000Z");

      const cleanup = store.applySubagentRetentionCleanup({
        featureFlagSnapshot: enabledFlags,
        now: "2026-06-05T00:10:00.000Z",
        cleanupWindowMs: 60_000,
      });

      expect(cleanup).toMatchObject({
        schemaVersion: "ambient-subagent-retention-cleanup-v1",
        mode: "archive_child_threads",
        archivedRunIds: [eligible.id],
        archivedThreadIds: [eligible.childThreadId],
        skippedRunIds: [],
      });
      expect(cleanup.plan.decisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: keepUntilParentPruned.id,
            action: "retain",
            reason: "parent_thread_active",
            retentionDefault: "keep_until_parent_pruned",
          }),
        ]),
      );
      expect(store.listThreads().map((thread) => thread.id)).not.toContain(eligible.childThreadId);
      expect(store.getThread(eligible.childThreadId)).toMatchObject({
        id: eligible.childThreadId,
        kind: "subagent_child",
        archivedAt: "2026-06-05T00:10:00.000Z",
      });
      expect(store.getThread(protectedRun.childThreadId).archivedAt).toBeUndefined();
      expect(store.listSubagentRunEvents(eligible.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.retention_archived",
            preview: expect.objectContaining({
              childThreadId: eligible.childThreadId,
              parentThreadId: parent.id,
              retentionDefault: "transient",
              parentArchived: false,
              transcriptRetained: true,
              artifactsRetained: true,
            }),
          }),
        ]),
      );

      store.archiveThread(parent.id);
      const secondCleanup = store.applySubagentRetentionCleanup({
        featureFlagSnapshot: enabledFlags,
        now: "2026-06-05T00:20:00.000Z",
        cleanupWindowMs: 60_000,
      });

      expect(secondCleanup.archivedRunIds).toEqual([keepUntilParentPruned.id]);
      expect(secondCleanup.archivedThreadIds).toEqual([keepUntilParentPruned.childThreadId]);
      expect(secondCleanup.skippedRunIds).toEqual([]);
      expect(store.getThread(keepUntilParentPruned.childThreadId)).toMatchObject({
        archivedAt: "2026-06-05T00:20:00.000Z",
      });
      expect(store.getThread(protectedRun.childThreadId).archivedAt).toBeUndefined();
      expect(
        store.getSubagentRetentionPlan({
          now: "2026-06-05T00:20:00.000Z",
          cleanupWindowMs: 60_000,
        }).decisions,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            runId: eligible.id,
            action: "retain",
            reason: "child_thread_archived",
          }),
          expect.objectContaining({
            runId: keepUntilParentPruned.id,
            action: "retain",
            reason: "child_thread_archived",
          }),
        ]),
      );
      const restartSummary = store.reconcileSubagentRestartState({
        now: "2026-06-05T00:21:00.000Z",
      });
      expect(restartSummary.issues).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "missing_child_thread",
            runId: eligible.id,
          }),
        ]),
      );
    } finally {
      store.close();
    }
  });

  it("cascades a stopped parent run across dependent child runs, wait barriers, and pending mailbox work", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const required = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Required child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      const background = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Background child",
        roleId: "summarizer",
        canonicalTaskPath: "root/1:summarizer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "optional_background",
      });
      const completed = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Completed child",
        roleId: "reviewer",
        canonicalTaskPath: "root/2:reviewer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(required.id, "running", { now: "2026-06-05T00:00:10.000Z" });
      store.markSubagentRunStatus(background.id, "running", { now: "2026-06-05T00:00:11.000Z" });
      store.markSubagentRunStatus(completed.id, "completed", {
        now: "2026-06-05T00:00:12.000Z",
        resultArtifact: {
          schemaVersion: "ambient-subagent-result-artifact-v1",
          runId: completed.id,
          status: "completed",
          partial: false,
          summary: "Already done",
          childThreadId: completed.childThreadId,
        },
      });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [required.id, completed.id],
        dependencyMode: "required_all",
        failurePolicy: "ask_user",
        createdAt: "2026-06-05T00:00:13.000Z",
      });
      const requiredTask = store.appendSubagentMailboxEvent(required.id, {
        direction: "parent_to_child",
        type: "subagent.task",
        payload: { task: "Inspect parent stop behavior." },
        createdAt: "2026-06-05T00:00:14.000Z",
      });
      const requiredFollowup = store.appendSubagentMailboxEvent(required.id, {
        direction: "parent_to_child",
        type: "subagent.followup",
        payload: { message: "Also check queued follow-up delivery." },
        deliveryState: "delivered",
        createdAt: "2026-06-05T00:00:15.000Z",
        deliveredAt: "2026-06-05T00:00:15.500Z",
      });
      const backgroundTask = store.appendSubagentMailboxEvent(background.id, {
        direction: "parent_to_child",
        type: "subagent.task",
        payload: { task: "Continue if the parent is stopped." },
        createdAt: "2026-06-05T00:00:16.000Z",
      });

      const cascade = store.cascadeSubagentParentRunStopped({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        reason: "User stopped the parent turn.",
        featureFlagSnapshot: enabledFlags,
        now: "2026-06-05T00:00:20.000Z",
      });

      expect(cascade).toEqual({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        featureFlagSnapshot: enabledFlags,
        subagentsDisabledSafetyCascade: false,
        parentCancellationRequested: true,
        cancelledRunIds: [required.id],
        detachedRunIds: [background.id],
        unchangedRunIds: [completed.id],
        cancelledWaitBarrierIds: [barrier.id],
        cancelledMailboxEventIds: [requiredTask.id, requiredFollowup.id],
        parentMailboxEventId: expect.any(String),
      });
      expect(store.getSubagentRun(required.id)).toMatchObject({
        status: "cancelled",
        completedAt: "2026-06-05T00:00:20.000Z",
        resultArtifact: expect.objectContaining({
          status: "cancelled",
          summary: expect.stringContaining("Parent run stopped"),
        }),
      });
      expect(store.getThread(required.childThreadId).childStatus).toBe("cancelled");
      expect(store.getSubagentRun(background.id)).toMatchObject({
        status: "detached",
        resultArtifact: expect.objectContaining({
          status: "detached",
        }),
      });
      expect(store.getThread(background.childThreadId).childStatus).toBe("detached");
      expect(store.getSubagentRun(completed.id).status).toBe("completed");
      expect(store.listSubagentMailboxEvents(required.id)).toEqual([
        expect.objectContaining({
          id: requiredTask.id,
          type: "subagent.task",
          direction: "parent_to_child",
          deliveryState: "cancelled",
          deliveredAt: undefined,
        }),
        expect.objectContaining({
          id: requiredFollowup.id,
          type: "subagent.followup",
          direction: "parent_to_child",
          deliveryState: "cancelled",
          deliveredAt: "2026-06-05T00:00:15.500Z",
        }),
      ]);
      expect(store.listSubagentMailboxEvents(background.id)).toEqual([
        expect.objectContaining({
          id: backgroundTask.id,
          type: "subagent.task",
          direction: "parent_to_child",
          deliveryState: "queued",
          deliveredAt: undefined,
        }),
      ]);
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolvedAt: "2026-06-05T00:00:20.000Z",
        resolutionArtifact: expect.objectContaining({
          parentStopped: true,
          synthesisAllowed: false,
          featureFlagSnapshot: enabledFlags,
          childStatuses: [
            { childRunId: required.id, status: "cancelled" },
            { childRunId: completed.id, status: "completed" },
          ],
          transitionEvidence: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "parent_stopped",
            source: "barrier_controller",
            childRunIds: [required.id, completed.id],
            reason: "User stopped the parent turn.",
            idempotencyKey: `parent-stop:parent-run:${barrier.id}`,
            details: expect.objectContaining({
              parentThreadId: parent.id,
              parentRunId: "parent-run",
              parentCancellationRequested: true,
              subagentsDisabledSafetyCascade: false,
              childStatuses: [
                { childRunId: required.id, status: "cancelled" },
                { childRunId: completed.id, status: "completed" },
              ],
            }),
          }),
        }),
      });
      expect(store.listSubagentRunEvents(required.id).map((event) => event.type)).toEqual([
        "subagent.reserved",
        "subagent.lifecycle_started",
        "subagent.status_changed",
        "subagent.status_changed",
        "subagent.lifecycle_stopped",
        "subagent.parent_stopped",
      ]);
      expect(store.listSubagentRunEvents(required.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.parent_stopped",
            preview: expect.objectContaining({
              previousStatus: "running",
              status: "cancelled",
              featureFlagSnapshot: enabledFlags,
              cancelledMailboxEvents: expect.arrayContaining([
                expect.objectContaining({
                  id: requiredTask.id,
                  type: "subagent.task",
                  direction: "parent_to_child",
                  deliveryState: "cancelled",
                }),
                expect.objectContaining({
                  id: requiredFollowup.id,
                  type: "subagent.followup",
                  direction: "parent_to_child",
                  deliveryState: "cancelled",
                }),
              ]),
            }),
          }),
        ]),
      );
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          parentMessageId: "parent-message",
          type: "subagent.cancellation_cascade",
          payload: expect.objectContaining({
            parentMessageId: "parent-message",
            parentStopped: true,
            parentCancellationRequested: true,
            cancelledRunIds: [required.id],
            detachedRunIds: [background.id],
            unchangedRunIds: [completed.id],
            cancelledMailboxEventIds: [requiredTask.id, requiredFollowup.id],
            featureFlagSnapshot: enabledFlags,
          }),
        }),
      ]);

      const replay = store.cascadeSubagentParentRunStopped({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        reason: "User stopped the parent turn.",
        featureFlagSnapshot: enabledFlags,
        now: "2026-06-05T00:00:21.000Z",
      });
      expect(replay).toEqual({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        featureFlagSnapshot: enabledFlags,
        subagentsDisabledSafetyCascade: false,
        parentCancellationRequested: true,
        cancelledRunIds: [],
        detachedRunIds: [],
        unchangedRunIds: [required.id, background.id, completed.id],
        cancelledWaitBarrierIds: [],
        cancelledMailboxEventIds: [],
      });
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("records disabled feature flag snapshots when parent-stop safety cascade cancels existing children", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const enabledFlags = resolveAmbientFeatureFlags({
      startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
      generatedAt: "2026-06-05T00:00:00.000Z",
    });
    const disabledFlags = resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:20.000Z" });

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Parent");
      const child = store.createSubagentRun({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        title: "Required child",
        roleId: "explorer",
        canonicalTaskPath: "root/0:explorer",
        featureFlagSnapshot: enabledFlags,
        modelRuntimeSnapshot: createAmbientModelRuntimeSnapshot(parent.model, "2026-06-05T00:00:00.000Z"),
        dependencyMode: "required",
      });
      store.markSubagentRunStatus(child.id, "running", { now: "2026-06-05T00:00:10.000Z" });
      const barrier = store.createSubagentWaitBarrier({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        childRunIds: [child.id],
        dependencyMode: "required_all",
        failurePolicy: "fail_parent",
        createdAt: "2026-06-05T00:00:11.000Z",
      });
      const pendingTask = store.appendSubagentMailboxEvent(child.id, {
        direction: "parent_to_child",
        type: "subagent.task",
        payload: { task: "This must not keep running after parent stop." },
        createdAt: "2026-06-05T00:00:12.000Z",
      });

      const cascade = store.cascadeSubagentParentRunStopped({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        reason: "Feature disabled after child launch; parent stop remains a safety cascade.",
        featureFlagSnapshot: disabledFlags,
        now: "2026-06-05T00:00:20.000Z",
      });

      expect(cascade).toEqual({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        featureFlagSnapshot: disabledFlags,
        subagentsDisabledSafetyCascade: true,
        parentCancellationRequested: true,
        cancelledRunIds: [child.id],
        detachedRunIds: [],
        unchangedRunIds: [],
        cancelledWaitBarrierIds: [barrier.id],
        cancelledMailboxEventIds: [pendingTask.id],
        parentMailboxEventId: expect.any(String),
      });
      expect(store.getSubagentRun(child.id)).toMatchObject({
        status: "cancelled",
        resultArtifact: expect.objectContaining({
          status: "cancelled",
          summary: expect.stringContaining("Parent run stopped"),
        }),
      });
      expect(store.getSubagentWaitBarrier(barrier.id)).toMatchObject({
        status: "cancelled",
        resolutionArtifact: expect.objectContaining({
          parentStopped: true,
          parentCancellationRequested: true,
          synthesisAllowed: false,
          subagentsDisabledSafetyCascade: true,
          featureFlagSnapshot: disabledFlags,
          transitionEvidence: expect.objectContaining({
            schemaVersion: "ambient-subagent-wait-barrier-transition-evidence-v1",
            kind: "parent_stopped",
            source: "barrier_controller",
            childRunIds: [child.id],
            reason: "Feature disabled after child launch; parent stop remains a safety cascade.",
            idempotencyKey: `parent-stop:parent-run:${barrier.id}`,
            details: expect.objectContaining({
              parentThreadId: parent.id,
              parentRunId: "parent-run",
              parentCancellationRequested: true,
              subagentsDisabledSafetyCascade: true,
              childStatuses: [{ childRunId: child.id, status: "cancelled" }],
            }),
          }),
        }),
      });
      expect(store.listSubagentRunEvents(child.id)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "subagent.parent_stopped",
            preview: expect.objectContaining({
              subagentsDisabledSafetyCascade: true,
              featureFlagSnapshot: disabledFlags,
            }),
          }),
        ]),
      );
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([
        expect.objectContaining({
          parentMessageId: "parent-message",
          type: "subagent.cancellation_cascade",
          payload: expect.objectContaining({
            parentStopped: true,
            parentCancellationRequested: true,
            cancelledRunIds: [child.id],
            cancelledMailboxEventIds: [pendingTask.id],
            subagentsDisabledSafetyCascade: true,
            featureFlagSnapshot: disabledFlags,
          }),
        }),
      ]);
    } finally {
      store.close();
    }
  });
});
