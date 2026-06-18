import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { RunDiagnostics } from "../../shared/threadTypes";
import {
  mapRunRow,
  type ActivePersistedRunStatus,
  type RunRecord,
  type RunRow,
  type TerminalPersistedRunStatus,
} from "./runMappers";

export class ProjectStoreRunRepository {
  constructor(private readonly db: Database.Database) {}

  startRun(input: { threadId: string; assistantMessageId: string }): RunRecord {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO runs
        (id, thread_id, assistant_message_id, status, started_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.threadId, input.assistantMessageId, "starting", now, now);
    return this.getRun(id);
  }

  updateRunStatus(runId: string, status: ActivePersistedRunStatus): RunRecord {
    this.db
      .prepare("UPDATE runs SET status = ?, updated_at = ? WHERE id = ? AND completed_at IS NULL")
      .run(status, new Date().toISOString(), runId);
    return this.getRun(runId);
  }

  updateRunDiagnostics(runId: string, diagnostics: RunDiagnostics): RunRecord {
    const current = this.getRun(runId);
    const nextDiagnostics: RunDiagnostics = { ...(current.diagnostics ?? {}), ...diagnostics };
    this.db
      .prepare("UPDATE runs SET diagnostics_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(nextDiagnostics), new Date().toISOString(), runId);
    return this.getRun(runId);
  }

  getRun(runId: string): RunRecord {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
    if (!row) throw new Error(`Run not found: ${runId}`);
    return mapRunRow(row);
  }

  finishRun(runId: string, status: TerminalPersistedRunStatus, errorMessage?: string): RunRecord {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE runs SET status = ?, updated_at = ?, completed_at = ?, error_message = ? WHERE id = ?")
      .run(status, now, now, errorMessage ?? null, runId);
    return this.getRun(runId);
  }

  listActiveRuns(): RunRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM runs WHERE completed_at IS NULL AND status IN ('starting', 'streaming', 'tool') ORDER BY updated_at DESC")
      .all() as RunRow[];
    return rows.map(mapRunRow);
  }
}
