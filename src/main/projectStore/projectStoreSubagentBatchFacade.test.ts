import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AMBIENT_SUBAGENTS_FEATURE_FLAG, resolveAmbientFeatureFlags } from "../../shared/featureFlags";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import { ProjectStore } from "./projectStore";
import { createSubagentBatchJobPlan, createSubagentBatchResultReport, type SubagentBatchJobPlan } from "./projectStoreSubagentsFacade";

const roots: string[] = [];

afterEach(async () => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) await rm(root, { recursive: true, force: true });
  }
});

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "ambient-store-subagent-batch-facade-"));
  roots.push(root);
  return join(root, "workspace");
}

function batchPlan(parentThreadId: string): SubagentBatchJobPlan {
  return createSubagentBatchJobPlan({
    parentThreadId,
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    canonicalTaskPath: "root/9:batch",
    createdAt: "2026-06-05T00:00:00.000Z",
    maxConcurrency: 2,
    items: [
      { itemId: "lint", roleId: "worker", task: "Run lint and fix scoped findings." },
      { itemId: "test", roleId: "reviewer", task: "Review test output." },
    ],
  });
}

function enabledSubagentFeatureFlags(generatedAt = "2026-06-05T00:00:00.000Z") {
  return resolveAmbientFeatureFlags({
    startup: { enabled: [AMBIENT_SUBAGENTS_FEATURE_FLAG], disabled: [] },
    generatedAt,
  });
}

function upsertBatchJobPlan(store: ProjectStore, plan: SubagentBatchJobPlan) {
  return store.upsertSubagentBatchJobPlan(plan, {
    featureFlagSnapshot: enabledSubagentFeatureFlags(plan.createdAt),
  });
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

describe("ProjectStore sub-agent batch facade", () => {
  it("persists sub-agent batch jobs and exactly-once result ledgers", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();
    const reopened = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Batch parent");
      const plan = batchPlan(parent.id);
      const created = upsertBatchJobPlan(store, plan);
      expect(created).toMatchObject({
        plan: expect.objectContaining({
          jobId: plan.jobId,
          parentThreadId: parent.id,
          parentRunId: "parent-run",
          parentMessageId: "parent-message",
        }),
        ledger: {
          schemaVersion: "ambient-subagent-batch-result-ledger-v1",
          jobId: plan.jobId,
          itemCount: 2,
          acceptedReportCount: 0,
          reportsByItemId: {},
          reportIds: {},
          completedItemIds: [],
          pendingItemIds: ["lint", "test"],
        },
      });
      expect(upsertBatchJobPlan(store, plan)).toEqual(created);
      const initialProgressEvents = store
        .listSubagentParentMailboxEventsForParentRun("parent-run")
        .filter((event) => event.type === "subagent.batch_progress");
      expect(initialProgressEvents).toHaveLength(1);
      const progressEventId = initialProgressEvents[0].id;
      expect(initialProgressEvents[0]).toMatchObject({
        parentThreadId: parent.id,
        parentRunId: "parent-run",
        parentMessageId: "parent-message",
        deliveryState: "queued",
        createdAt: "2026-06-05T00:00:00.000Z",
        updatedAt: "2026-06-05T00:00:00.000Z",
      });
      expect(initialProgressEvents[0].payload).toMatchObject({
        schemaVersion: "ambient-subagent-batch-progress-mailbox-v1",
        summary: {
          schemaVersion: "ambient-subagent-batch-progress-v1",
          jobId: plan.jobId,
          parentMessageId: "parent-message",
          acceptedReportCount: 0,
          pendingCount: 2,
          statusCounts: expect.objectContaining({ pending: 2 }),
          itemPreviews: [
            expect.objectContaining({ itemId: "lint", status: "pending" }),
            expect.objectContaining({ itemId: "test", status: "pending" }),
          ],
        },
      });

      const report = createSubagentBatchResultReport({
        plan,
        item: plan.items[0],
        childRunId: "child-run-lint",
        status: "completed",
        summary: "Lint worker finished.",
        createdAt: "2026-06-05T00:01:00.000Z",
        resultArtifact: batchArtifact("child-run-lint", "completed"),
      });
      const accepted = store.applySubagentBatchResultReport(report);
      expect(accepted).toMatchObject({
        outcome: "accepted",
        ledger: {
          acceptedReportCount: 1,
          completedItemIds: ["lint"],
          pendingItemIds: ["test"],
          reportsByItemId: {
            lint: expect.objectContaining({
              reportId: report.reportId,
              childRunId: "child-run-lint",
            }),
          },
        },
      });
      const acceptedProgressEvents = store
        .listSubagentParentMailboxEventsForParentRun("parent-run")
        .filter((event) => event.type === "subagent.batch_progress");
      expect(acceptedProgressEvents).toHaveLength(1);
      expect(acceptedProgressEvents[0].id).toBe(progressEventId);
      expect(acceptedProgressEvents[0]).toMatchObject({
        deliveryState: "queued",
        updatedAt: "2026-06-05T00:01:00.000Z",
      });
      expect(acceptedProgressEvents[0].payload).toMatchObject({
        schemaVersion: "ambient-subagent-batch-progress-mailbox-v1",
        summary: {
          jobId: plan.jobId,
          acceptedReportCount: 1,
          pendingCount: 1,
          completedItemIds: ["lint"],
          pendingItemIds: ["test"],
          statusCounts: expect.objectContaining({ completed: 1, pending: 1 }),
          itemPreviews: [
            expect.objectContaining({
              itemId: "lint",
              status: "completed",
              childRunId: "child-run-lint",
              resultArtifactStatus: "completed",
              summaryPreview: "Lint worker finished.",
            }),
            expect.objectContaining({ itemId: "test", status: "pending" }),
          ],
        },
      });
      expect(store.applySubagentBatchResultReport(report)).toMatchObject({
        outcome: "duplicate",
        existingReport: expect.objectContaining({ reportId: report.reportId }),
      });
      const conflict = createSubagentBatchResultReport({
        plan,
        item: plan.items[0],
        childRunId: "child-run-lint",
        status: "completed",
        summary: "Conflicting replay.",
        reportId: "different-report-id",
        createdAt: "2026-06-05T00:01:10.000Z",
        resultArtifact: batchArtifact("child-run-lint", "completed"),
      });
      expect(store.applySubagentBatchResultReport(conflict)).toMatchObject({
        outcome: "rejected",
        reason: "item_already_reported",
      });
      expect(
        store
          .listSubagentParentMailboxEventsForParentRun("parent-run")
          .filter((event) => event.type === "subagent.batch_progress")
          .map((event) => ({
            id: event.id,
            acceptedReportCount: (event.payload as { summary?: { acceptedReportCount?: number } }).summary?.acceptedReportCount,
          })),
      ).toEqual([{ id: progressEventId, acceptedReportCount: 1 }]);
      expect(store.listSubagentBatchResultReports(plan.jobId)).toEqual([report]);
      store.close();

      reopened.openWorkspace(workspacePath);
      expect(reopened.getSubagentBatchJob(plan.jobId)).toMatchObject({
        plan: expect.objectContaining({ jobId: plan.jobId }),
        ledger: expect.objectContaining({
          acceptedReportCount: 1,
          completedItemIds: ["lint"],
          pendingItemIds: ["test"],
        }),
        updatedAt: "2026-06-05T00:01:00.000Z",
      });
      expect(reopened.listSubagentBatchJobsForParentRun("parent-run").map((record) => record.plan.jobId)).toEqual([plan.jobId]);
      expect(reopened.listSubagentBatchResultReports(plan.jobId)).toEqual([report]);
      expect(
        reopened
          .listSubagentParentMailboxEventsForParentRun("parent-run")
          .filter((event) => event.type === "subagent.batch_progress")
          .map((event) => ({
            id: event.id,
            acceptedReportCount: (event.payload as { summary?: { acceptedReportCount?: number } }).summary?.acceptedReportCount,
            pendingItemIds: (event.payload as { summary?: { pendingItemIds?: string[] } }).summary?.pendingItemIds,
          })),
      ).toEqual([{ id: progressEventId, acceptedReportCount: 1, pendingItemIds: ["test"] }]);
    } finally {
      store.close();
      reopened.close();
    }
  });

  it("refuses new sub-agent batch jobs while ambient.subagents is disabled", async () => {
    const workspacePath = await tempWorkspace();
    const store = new ProjectStore();

    try {
      store.openWorkspace(workspacePath);
      const parent = store.createThread("Batch parent");
      const plan = batchPlan(parent.id);

      expect(() =>
        store.upsertSubagentBatchJobPlan(plan, {
          featureFlagSnapshot: resolveAmbientFeatureFlags({ generatedAt: "2026-06-05T00:00:00.000Z" }),
        }),
      ).toThrow("ambient.subagents is off");
      expect(store.getSubagentBatchJob(plan.jobId)).toBeUndefined();
      expect(store.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([]);
    } finally {
      store.close();
    }
  });
});
