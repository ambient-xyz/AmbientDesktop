import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ContextUsageSnapshot } from "../../shared/types";
import type { ContextUsageSnapshotInput } from "../projectStoreFacadeHelpers";
import { mapContextUsageSnapshotRow, type ContextUsageSnapshotRow } from "./contextUsageMappers";

export class ProjectStoreContextUsageRepository {
  constructor(private readonly db: Database.Database) {}

  recordContextUsageSnapshot(input: ContextUsageSnapshotInput): ContextUsageSnapshot {
    const now = input.updatedAt ?? new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO context_usage_snapshots
        (id, thread_id, source, tokens, context_window, percent, latest_compaction_at, compaction_count, updated_at, diagnostics_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.threadId,
        input.source,
        input.tokens ?? null,
        input.contextWindow ?? null,
        input.percent ?? null,
        input.latestCompactionAt ?? null,
        input.compactionCount,
        now,
        input.diagnostics ? JSON.stringify(input.diagnostics) : null,
      );
    return this.getContextUsageSnapshot(id);
  }

  getLatestContextUsageSnapshot(threadId: string): ContextUsageSnapshot | undefined {
    const row = this.db
      .prepare("SELECT * FROM context_usage_snapshots WHERE thread_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1")
      .get(threadId) as ContextUsageSnapshotRow | undefined;
    return row ? mapContextUsageSnapshotRow(row) : undefined;
  }

  listContextUsageSnapshots(limit = 100): ContextUsageSnapshot[] {
    const boundedLimit = Math.max(1, Math.min(limit, 500));
    const rows = this.db
      .prepare("SELECT * FROM context_usage_snapshots ORDER BY updated_at DESC, rowid DESC LIMIT ?")
      .all(boundedLimit) as ContextUsageSnapshotRow[];
    return rows.map(mapContextUsageSnapshotRow);
  }

  private getContextUsageSnapshot(id: string): ContextUsageSnapshot {
    const row = this.db.prepare("SELECT * FROM context_usage_snapshots WHERE id = ?").get(id) as
      | ContextUsageSnapshotRow
      | undefined;
    if (!row) throw new Error(`Context usage snapshot not found: ${id}`);
    return mapContextUsageSnapshotRow(row);
  }
}
