import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSubagentBatchJobPlan,
  createSubagentBatchResultReport,
  type SubagentBatchJobRecord,
} from "../subagents/subagentBatchJobs";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import { ProjectStoreSubagentBatchRepository } from "./subagentBatchRepository";

describe("ProjectStoreSubagentBatchRepository", () => {
  let db: Database.Database;
  let progressCalls: Array<{ record: SubagentBatchJobRecord; createdAt: string }>;
  let repository: ProjectStoreSubagentBatchRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE subagent_batch_jobs (
        id TEXT PRIMARY KEY,
        parent_thread_id TEXT NOT NULL,
        parent_run_id TEXT NOT NULL,
        canonical_task_path TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        ledger_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE subagent_batch_result_reports (
        job_id TEXT NOT NULL,
        report_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        child_run_id TEXT NOT NULL,
        report_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(job_id, report_id)
      );
    `);
    progressCalls = [];
    repository = new ProjectStoreSubagentBatchRepository(db, {
      upsertProgressNotification: (record, createdAt) => {
        progressCalls.push({ record, createdAt });
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("upserts batch job plans with initial ledgers and ordered reads", () => {
    const plan = batchPlan({ jobId: "batch-1", createdAt: "2026-06-16T02:00:00.000Z" });
    const other = batchPlan({ jobId: "batch-2", createdAt: "2026-06-16T02:01:00.000Z" });

    const first = repository.upsertSubagentBatchJobPlan(plan);
    const second = repository.upsertSubagentBatchJobPlan(other);
    const repeated = repository.upsertSubagentBatchJobPlan(plan);

    expect(first).toMatchObject({
      plan,
      ledger: {
        jobId: plan.jobId,
        itemCount: 2,
        acceptedReportCount: 0,
        completedItemIds: [],
        pendingItemIds: ["lint", "test"],
      },
      createdAt: plan.createdAt,
      updatedAt: plan.createdAt,
    });
    expect(repeated).toEqual(first);
    expect(repository.getSubagentBatchJob(plan.jobId)).toEqual(first);
    expect(repository.listSubagentBatchJobsForParentRun("parent-run").map((record) => record.plan.jobId)).toEqual([
      first.plan.jobId,
      second.plan.jobId,
    ]);
    expect(progressCalls).toEqual([
      { record: first, createdAt: plan.createdAt },
      { record: second, createdAt: other.createdAt },
      { record: first, createdAt: first.updatedAt },
    ]);
  });

  it("rejects an existing batch job id with a different plan", () => {
    const plan = batchPlan({ jobId: "batch-1" });
    repository.upsertSubagentBatchJobPlan(plan);

    expect(() => repository.upsertSubagentBatchJobPlan({
      ...plan,
      maxConcurrency: 2,
    })).toThrow("already exists with a different plan");
  });

  it("applies accepted result reports and persists report rows", () => {
    const plan = batchPlan({ jobId: "batch-1" });
    repository.upsertSubagentBatchJobPlan(plan);
    progressCalls = [];
    const report = resultReport(plan, {
      itemIndex: 0,
      childRunId: "child-run-lint",
      summary: "Lint finished.",
      createdAt: "2026-06-16T02:03:00.000Z",
    });

    const accepted = repository.applySubagentBatchResultReport(report);

    expect(accepted).toMatchObject({
      outcome: "accepted",
      ledger: {
        acceptedReportCount: 1,
        completedItemIds: ["lint"],
        pendingItemIds: ["test"],
      },
      acceptedReport: expect.objectContaining({
        reportId: report.reportId,
        itemId: "lint",
        childRunId: "child-run-lint",
      }),
    });
    expect(repository.listSubagentBatchResultReports(plan.jobId)).toEqual([report]);
    expect(repository.getSubagentBatchJob(plan.jobId)).toMatchObject({
      ledger: accepted.ledger,
      updatedAt: report.createdAt,
    });
    expect(progressCalls).toEqual([
      {
        record: expect.objectContaining({
          plan,
          ledger: accepted.ledger,
          updatedAt: report.createdAt,
        }),
        createdAt: report.createdAt,
      },
    ]);
  });

  it("does not persist duplicate or rejected result reports", () => {
    const plan = batchPlan({ jobId: "batch-1" });
    repository.upsertSubagentBatchJobPlan(plan);
    const report = resultReport(plan, { itemIndex: 0, reportId: "report-1" });
    repository.applySubagentBatchResultReport(report);
    progressCalls = [];

    const duplicate = repository.applySubagentBatchResultReport(report);
    const conflict = repository.applySubagentBatchResultReport(resultReport(plan, {
      itemIndex: 0,
      reportId: "report-2",
      summary: "Conflicting replay.",
    }));

    expect(duplicate).toMatchObject({
      outcome: "duplicate",
      existingReport: expect.objectContaining({ reportId: report.reportId }),
    });
    expect(conflict).toMatchObject({
      outcome: "rejected",
      reason: "item_already_reported",
    });
    expect(repository.listSubagentBatchResultReports(plan.jobId)).toEqual([report]);
    expect(progressCalls).toEqual([]);
  });

  it("throws when applying a report for a missing batch job", () => {
    const plan = batchPlan({ jobId: "missing-job" });
    const report = resultReport(plan, { itemIndex: 0 });

    expect(() => repository.applySubagentBatchResultReport(report))
      .toThrow("Sub-agent batch job not found: missing-job");
  });
});

function batchPlan(overrides: Partial<Parameters<typeof createSubagentBatchJobPlan>[0]> = {}) {
  return createSubagentBatchJobPlan({
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    canonicalTaskPath: "root/4:worker-batch",
    jobId: "batch-1",
    createdAt: "2026-06-16T02:00:00.000Z",
    maxConcurrency: 1,
    items: [
      { itemId: "lint", roleId: "worker", task: "Run lint and fix scoped findings." },
      { itemId: "test", roleId: "reviewer", task: "Review test failures." },
    ],
    ...overrides,
  });
}

function resultReport(
  plan: ReturnType<typeof batchPlan>,
  overrides: {
    itemIndex?: number;
    childRunId?: string;
    reportId?: string;
    summary?: string;
    createdAt?: string;
  } = {},
) {
  const item = plan.items[overrides.itemIndex ?? 0];
  if (!item) throw new Error("Missing subagent batch fixture item.");
  return createSubagentBatchResultReport({
    plan,
    item,
    childRunId: overrides.childRunId ?? "child-run-lint",
    status: "completed",
    summary: overrides.summary ?? "Completed.",
    reportId: overrides.reportId,
    createdAt: overrides.createdAt ?? "2026-06-16T02:02:00.000Z",
    resultArtifact: resultArtifact(overrides.childRunId ?? "child-run-lint", overrides.summary ?? "Completed."),
  });
}

function resultArtifact(childRunId: string, summary: string): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId: childRunId,
    status: "completed",
    partial: false,
    summary,
    childThreadId: `${childRunId}-thread`,
  };
}
