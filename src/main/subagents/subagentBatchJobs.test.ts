import { describe, expect, it } from "vitest";
import type { SubagentResultArtifact } from "../../shared/subagentProtocol";
import {
  applySubagentBatchResultReport,
  createSubagentBatchProgressParentMailboxPayload,
  createSubagentBatchJobPlan,
  createSubagentBatchResultLedger,
  createSubagentBatchResultReport,
  summarizeSubagentBatchJobProgress,
  validateSubagentBatchResultLedgerExactlyOnce,
} from "./subagentBatchJobs";

describe("sub-agent batch jobs", () => {
  it("materializes stable per-item canonical paths and spawn idempotency keys", () => {
    const a = plan();
    const b = plan();

    expect(a).toMatchObject({
      schemaVersion: "ambient-subagent-batch-job-v1",
      jobId: b.jobId,
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      canonicalTaskPath: "root/4:worker-batch",
      maxConcurrency: 2,
      failurePolicy: "collect_all",
    });
    expect(a.items.map((item) => ({
      itemId: item.itemId,
      childIndex: item.childIndex,
      canonicalTaskPath: item.canonicalTaskPath,
      spawnIdempotencyKey: item.spawnIdempotencyKey,
    }))).toEqual([
      {
        itemId: "lint",
        childIndex: 0,
        canonicalTaskPath: "root/4:worker-batch/batch/0:worker",
        spawnIdempotencyKey: b.items[0].spawnIdempotencyKey,
      },
      {
        itemId: "test",
        childIndex: 1,
        canonicalTaskPath: "root/4:worker-batch/batch/1:reviewer",
        spawnIdempotencyKey: b.items[1].spawnIdempotencyKey,
      },
    ]);
    expect(new Set(a.items.map((item) => item.spawnIdempotencyKey)).size).toBe(2);
  });

  it("rejects duplicate batch item ids before any fanout can launch", () => {
    expect(() => createSubagentBatchJobPlan({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/0:batch",
      items: [
        { itemId: "same", roleId: "worker", task: "Do A." },
        { itemId: "same", roleId: "worker", task: "Do B." },
      ],
    })).toThrow(/Duplicate sub-agent batch itemId: same/);
  });

  it("accepts each item result exactly once and treats identical replay as a duplicate no-op", () => {
    const job = plan();
    const ledger = createSubagentBatchResultLedger(job);
    const report = resultReport(job, 0, "child-run-lint");

    const accepted = applySubagentBatchResultReport({ plan: job, ledger, report });
    expect(accepted.outcome).toBe("accepted");
    expect(accepted.ledger).toMatchObject({
      acceptedReportCount: 1,
      completedItemIds: ["lint"],
      pendingItemIds: ["test"],
      reportsByItemId: {
        lint: {
          reportId: report.reportId,
          childRunId: "child-run-lint",
          status: "completed",
        },
      },
    });

    const duplicate = applySubagentBatchResultReport({ plan: job, ledger: accepted.ledger, report });
    expect(duplicate.outcome).toBe("duplicate");
    expect(duplicate.ledger).toBe(accepted.ledger);
    expect(duplicate.existingReport).toEqual(accepted.acceptedReport);
  });

  it("validates exactly-once ledger invariants before accepting new reports", () => {
    const job = plan();
    const ledger = createSubagentBatchResultLedger(job);
    const first = applySubagentBatchResultReport({
      plan: job,
      ledger,
      report: resultReport(job, 0, "child-run-lint"),
    });
    expect(validateSubagentBatchResultLedgerExactlyOnce({ plan: job, ledger: first.ledger })).toMatchObject({
      schemaVersion: "ambient-subagent-batch-result-ledger-validation-v1",
      valid: true,
      acceptedItemIds: ["lint"],
      pendingItemIds: ["test"],
      reportIds: [first.acceptedReport?.reportId],
    });

    const corruptedLedger = {
      ...first.ledger,
      acceptedReportCount: 2,
      pendingItemIds: ["lint", "test"],
      completedItemIds: ["lint", "lint"],
    };

    expect(validateSubagentBatchResultLedgerExactlyOnce({ plan: job, ledger: corruptedLedger })).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        "acceptedReportCount 2 does not match reportsByItemId count 1.",
        "completedItemIds contains duplicate item lint.",
        "pending item lint already has an accepted report.",
        "item lint appears in both completedItemIds and pendingItemIds.",
      ]),
    });
    expect(applySubagentBatchResultReport({
      plan: job,
      ledger: corruptedLedger,
      report: resultReport(job, 1, "child-run-test"),
    })).toMatchObject({
      outcome: "rejected",
      reason: "invalid_ledger",
      message: expect.stringContaining("exactly-once result reporting"),
    });
  });

  it("projects bounded parent-facing batch progress without exposing full large summaries", () => {
    const job = plan();
    const ledger = createSubagentBatchResultLedger(job);
    const report = resultReport(job, 0, "child-run-lint", {
      summary: "Lint finished with a deliberately long implementation note that should stay artifact-backed.",
      artifactPath: "/tmp/ambient-batch/lint-result.json",
    });
    const accepted = applySubagentBatchResultReport({ plan: job, ledger, report });
    const record = {
      plan: job,
      ledger: accepted.ledger,
      createdAt: job.createdAt,
      updatedAt: report.createdAt,
    };

    const summary = summarizeSubagentBatchJobProgress(record, { maxItems: 1, maxSummaryChars: 28 });

    expect(summary).toMatchObject({
      schemaVersion: "ambient-subagent-batch-progress-v1",
      jobId: job.jobId,
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      itemCount: 2,
      acceptedReportCount: 1,
      pendingCount: 1,
      statusCounts: {
        pending: 1,
        completed: 1,
        failed: 0,
        cancelled: 0,
        timed_out: 0,
        aborted_partial: 0,
      },
      itemPreviewCount: 1,
      omittedItemCount: 1,
      itemPreviews: [
        expect.objectContaining({
          itemId: "lint",
          status: "completed",
          childRunId: "child-run-lint",
          artifactPath: "/tmp/ambient-batch/lint-result.json",
          resultArtifactStatus: "completed",
          summaryTruncated: true,
        }),
      ],
    });
    expect(summary.itemPreviews[0].summaryPreview?.length).toBeLessThanOrEqual(28);
    expect(createSubagentBatchProgressParentMailboxPayload(record)).toMatchObject({
      schemaVersion: "ambient-subagent-batch-progress-mailbox-v1",
      summary: expect.objectContaining({ jobId: job.jobId, parentMessageId: "parent-message" }),
    });
  });

  it("rejects conflicting reports for an already reported item", () => {
    const job = plan();
    const first = resultReport(job, 0, "child-run-lint");
    const accepted = applySubagentBatchResultReport({
      plan: job,
      ledger: createSubagentBatchResultLedger(job),
      report: first,
    });
    const conflict = resultReport(job, 0, "child-run-lint", { reportId: "different-report", summary: "Conflicting result." });

    const rejected = applySubagentBatchResultReport({ plan: job, ledger: accepted.ledger, report: conflict });

    expect(rejected).toMatchObject({
      outcome: "rejected",
      reason: "item_already_reported",
      message: "Batch item lint already has an accepted result report.",
    });
    expect(rejected.ledger).toBe(accepted.ledger);
  });

  it("rejects unknown items, reused report ids, child-run mismatches, and invalid artifacts", () => {
    const job = plan();
    const ledger = createSubagentBatchResultLedger(job);
    const first = resultReport(job, 0, "child-run-lint", { reportId: "shared-report-id" });
    const accepted = applySubagentBatchResultReport({ plan: job, ledger, report: first });

    expect(applySubagentBatchResultReport({
      plan: job,
      ledger,
      report: {
        ...first,
        itemId: "unknown",
        reportId: "unknown-report",
      },
    })).toMatchObject({ outcome: "rejected", reason: "unknown_item" });

    expect(applySubagentBatchResultReport({
      plan: job,
      ledger: accepted.ledger,
      report: resultReport(job, 1, "child-run-test", { reportId: "shared-report-id" }),
    })).toMatchObject({ outcome: "rejected", reason: "report_id_reused" });

    const childBoundPlan = createSubagentBatchJobPlan({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      canonicalTaskPath: "root/5:child-bound",
      items: [{ itemId: "fixed", roleId: "worker", task: "Use a known child.", childRunId: "expected-child" }],
    });
    expect(applySubagentBatchResultReport({
      plan: childBoundPlan,
      ledger: createSubagentBatchResultLedger(childBoundPlan),
      report: resultReport(childBoundPlan, 0, "wrong-child"),
    })).toMatchObject({ outcome: "rejected", reason: "child_run_mismatch" });

    expect(applySubagentBatchResultReport({
      plan: job,
      ledger,
      report: resultReport(job, 0, "child-run-lint", {
        resultArtifact: artifact("other-child", "completed"),
      }),
    })).toMatchObject({ outcome: "rejected", reason: "invalid_result_artifact" });
  });
});

function plan() {
  return createSubagentBatchJobPlan({
    parentThreadId: "parent-thread",
    parentRunId: "parent-run",
    parentMessageId: "parent-message",
    canonicalTaskPath: "root/4:worker-batch",
    createdAt: "2026-06-05T00:00:00.000Z",
    maxConcurrency: 2,
    items: [
      { itemId: "lint", roleId: "worker", task: "Run lint and fix scoped findings." },
      { itemId: "test", roleId: "reviewer", task: "Review test failures." },
    ],
  });
}

function resultReport(
  job: ReturnType<typeof plan>,
  itemIndex: number,
  childRunId: string,
  overrides: Partial<Parameters<typeof createSubagentBatchResultReport>[0]> = {},
) {
  const item = job.items[itemIndex];
  return createSubagentBatchResultReport({
    plan: job,
    item,
    childRunId,
    status: "completed",
    summary: `Completed ${item.itemId}.`,
    createdAt: "2026-06-05T00:01:00.000Z",
    resultArtifact: artifact(childRunId, "completed"),
    ...overrides,
  });
}

function artifact(
  runId: string,
  status: SubagentResultArtifact["status"],
): SubagentResultArtifact {
  return {
    schemaVersion: "ambient-subagent-result-artifact-v1",
    runId,
    status,
    partial: false,
    summary: `Artifact for ${runId}.`,
    childThreadId: `${runId}-thread`,
  };
}
