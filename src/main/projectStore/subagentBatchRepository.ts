import type Database from "better-sqlite3";
import {
  applySubagentBatchResultReport as applySubagentBatchResultReportToLedger,
  createSubagentBatchResultLedger,
  type SubagentBatchJobPlan,
  type SubagentBatchJobRecord,
  type SubagentBatchReportApplyResult,
  type SubagentBatchResultReport,
} from "../subagents/subagentBatchJobs";
import {
  mapSubagentBatchJobRow,
  mapSubagentBatchResultReportRow,
  type SubagentBatchJobRow,
  type SubagentBatchResultReportRow,
} from "../projectStoreSubagentMappers";

export interface ProjectStoreSubagentBatchRepositoryDependencies {
  upsertProgressNotification(record: SubagentBatchJobRecord, createdAt: string): void;
}

export class ProjectStoreSubagentBatchRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly dependencies: Partial<ProjectStoreSubagentBatchRepositoryDependencies> = {},
  ) {}

  upsertSubagentBatchJobPlan(plan: SubagentBatchJobPlan): SubagentBatchJobRecord {
    const existing = this.getSubagentBatchJob(plan.jobId);
    if (existing) {
      if (JSON.stringify(existing.plan) !== JSON.stringify(plan)) {
        throw new Error(`Sub-agent batch job ${plan.jobId} already exists with a different plan.`);
      }
      this.dependencies.upsertProgressNotification?.(existing, existing.updatedAt);
      return existing;
    }
    const ledger = createSubagentBatchResultLedger(plan);
    this.db
      .prepare(
        `INSERT INTO subagent_batch_jobs
        (id, parent_thread_id, parent_run_id, canonical_task_path, plan_json, ledger_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        plan.jobId,
        plan.parentThreadId,
        plan.parentRunId,
        plan.canonicalTaskPath,
        JSON.stringify(plan),
        JSON.stringify(ledger),
        plan.createdAt,
        plan.createdAt,
      );
    const record = this.getSubagentBatchJob(plan.jobId);
    if (!record) throw new Error(`Sub-agent batch job not found: ${plan.jobId}`);
    this.dependencies.upsertProgressNotification?.(record, plan.createdAt);
    return record;
  }

  getSubagentBatchJob(jobId: string): SubagentBatchJobRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM subagent_batch_jobs WHERE id = ?")
      .get(jobId) as SubagentBatchJobRow | undefined;
    return row ? mapSubagentBatchJobRow(row) : undefined;
  }

  listSubagentBatchJobsForParentRun(parentRunId: string): SubagentBatchJobRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_batch_jobs WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as SubagentBatchJobRow[];
    return rows.map(mapSubagentBatchJobRow);
  }

  listSubagentBatchResultReports(jobId: string): SubagentBatchResultReport[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_batch_result_reports WHERE job_id = ? ORDER BY created_at ASC, report_id ASC")
      .all(jobId) as SubagentBatchResultReportRow[];
    return rows.map(mapSubagentBatchResultReportRow);
  }

  applySubagentBatchResultReport(report: SubagentBatchResultReport): SubagentBatchReportApplyResult {
    const apply = this.db.transaction(() => {
      const row = this.db.prepare("SELECT * FROM subagent_batch_jobs WHERE id = ?").get(report.jobId) as SubagentBatchJobRow | undefined;
      if (!row) throw new Error(`Sub-agent batch job not found: ${report.jobId}`);
      const record = mapSubagentBatchJobRow(row);
      const result = applySubagentBatchResultReportToLedger({
        plan: record.plan,
        ledger: record.ledger,
        report,
      });
      if (result.outcome !== "accepted") return result;
      this.db.prepare("UPDATE subagent_batch_jobs SET ledger_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(result.ledger), report.createdAt, report.jobId);
      this.db.prepare(
        `INSERT INTO subagent_batch_result_reports
        (job_id, report_id, item_id, child_run_id, report_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        report.jobId,
        report.reportId,
        report.itemId,
        report.childRunId,
        JSON.stringify(report),
        report.createdAt,
      );
      this.dependencies.upsertProgressNotification?.({
        ...record,
        ledger: result.ledger,
        updatedAt: report.createdAt,
      }, report.createdAt);
      return result;
    });
    return apply();
  }
}
