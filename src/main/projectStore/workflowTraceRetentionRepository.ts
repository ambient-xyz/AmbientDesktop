import type Database from "better-sqlite3";
import { WORKFLOW_DEBUG_TRACE_RETENTION_DAYS } from "./projectStoreFacadeHelpers";

export interface CompactExpiredWorkflowTraceDataInput {
  now?: string;
  debugRetentionDays?: number;
}

export interface WorkflowTraceRetentionCompactionSummary {
  cutoff: string;
  eventsCompacted: number;
  modelCallsCompacted: number;
}

export class ProjectStoreWorkflowTraceRetentionRepository {
  constructor(private readonly db: Database.Database) {}

  compactExpiredWorkflowTraceData(input: CompactExpiredWorkflowTraceDataInput = {}): WorkflowTraceRetentionCompactionSummary {
    const now = input.now ?? new Date().toISOString();
    const retentionDays = Math.max(1, Math.floor(input.debugRetentionDays ?? WORKFLOW_DEBUG_TRACE_RETENTION_DAYS));
    const cutoffDate = new Date(Date.parse(now) - retentionDays * 24 * 60 * 60 * 1000);
    const cutoff = Number.isFinite(cutoffDate.getTime())
      ? cutoffDate.toISOString()
      : new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
    const marker = JSON.stringify({
      retention: "compacted",
      compactedAt: now,
      reason: "workflow_trace_retention_expired",
    });

    const eventResult = this.db
      .prepare(
        `UPDATE workflow_run_events
         SET data_json = ?
         WHERE data_json IS NOT NULL
           AND created_at < ?
           AND id IN (
             SELECT event.id
             FROM workflow_run_events event
             JOIN workflow_runs run ON run.id = event.run_id
             JOIN workflow_artifacts artifact ON artifact.id = run.artifact_id
             LEFT JOIN workflow_agent_threads thread ON thread.id = artifact.workflow_thread_id
             WHERE thread.trace_mode = 'debug' OR event.item_key IS NOT NULL
           )`,
      )
      .run(marker, cutoff);

    const modelCallResult = this.db
      .prepare(
        `UPDATE workflow_model_calls
         SET input_json = ?,
             output_json = CASE WHEN output_json IS NULL THEN NULL ELSE ? END
         WHERE started_at < ?
           AND id IN (
             SELECT model_call.id
             FROM workflow_model_calls model_call
             JOIN workflow_artifacts artifact ON artifact.id = model_call.artifact_id
             LEFT JOIN workflow_agent_threads thread ON thread.id = artifact.workflow_thread_id
             WHERE thread.trace_mode = 'debug'
           )`,
      )
      .run(marker, marker, cutoff);

    return {
      cutoff,
      eventsCompacted: eventResult.changes,
      modelCallsCompacted: modelCallResult.changes,
    };
  }
}
