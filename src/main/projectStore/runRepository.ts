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

export const RUN_DIAGNOSTICS_HOT_ROW_MAX_JSON_CHARS = 8_192;
const RUN_DIAGNOSTICS_SUMMARY_MAX_STRING_CHARS = 512;
const RUN_DIAGNOSTICS_SUMMARY_MAX_ARRAY_ITEMS = 8;
const RUN_DIAGNOSTICS_SUMMARY_MAX_OBJECT_KEYS = 32;
const RUN_DIAGNOSTICS_SUMMARY_MAX_DEPTH = 4;

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
    const now = new Date().toISOString();
    const detailJson = JSON.stringify(nextDiagnostics);
    const summaryJson = JSON.stringify(summaryRunDiagnostics(nextDiagnostics));
    this.db.transaction(() => {
      this.db
        .prepare("UPDATE runs SET diagnostics_json = ?, updated_at = ? WHERE id = ?")
        .run(summaryJson, now, runId);
      this.db
        .prepare(`
          INSERT INTO run_diagnostic_payloads (run_id, diagnostics_json, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(run_id) DO UPDATE SET
            diagnostics_json = excluded.diagnostics_json,
            updated_at = excluded.updated_at
        `)
        .run(runId, detailJson, now);
    })();
    return this.getRun(runId);
  }

  getRun(runId: string): RunRecord {
    const row = this.db
      .prepare(`
        SELECT
          runs.*,
          run_diagnostic_payloads.diagnostics_json AS diagnostics_detail_json
        FROM runs
        LEFT JOIN run_diagnostic_payloads ON run_diagnostic_payloads.run_id = runs.id
        WHERE runs.id = ?
      `)
      .get(runId) as RunRow | undefined;
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
      .prepare(`
        SELECT id, thread_id, assistant_message_id, status, started_at, updated_at, completed_at, error_message, diagnostics_json
        FROM runs
        WHERE completed_at IS NULL
          AND status IN ('starting', 'streaming', 'tool')
        ORDER BY updated_at DESC
      `)
      .all() as RunRow[];
    return rows.map(mapRunRow);
  }
}

export function summaryRunDiagnostics(diagnostics: RunDiagnostics): RunDiagnostics {
  const summary = summarizeDiagnosticValue(diagnostics, 0) as RunDiagnostics;
  const json = JSON.stringify(summary);
  if (json.length <= RUN_DIAGNOSTICS_HOT_ROW_MAX_JSON_CHARS) return summary;
  return {
    summary: "Run diagnostics detail is stored outside the hot run row.",
    detailAvailable: true,
    detailJsonChars: JSON.stringify(diagnostics).length,
    topLevelKeys: Object.keys(diagnostics).slice(0, RUN_DIAGNOSTICS_SUMMARY_MAX_ARRAY_ITEMS),
  };
}

function summarizeDiagnosticValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === "string") return summarizeDiagnosticString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return summarizeDiagnosticArray(value, depth);
  if (typeof value === "object") return summarizeDiagnosticObject(value as Record<string, unknown>, depth);
  return String(value);
}

function summarizeDiagnosticString(value: string): string | { preview: string; chars: number; truncated: true } {
  if (value.length <= RUN_DIAGNOSTICS_SUMMARY_MAX_STRING_CHARS) return value;
  return {
    preview: value.slice(0, RUN_DIAGNOSTICS_SUMMARY_MAX_STRING_CHARS),
    chars: value.length,
    truncated: true,
  };
}

function summarizeDiagnosticArray(value: unknown[], depth: number): unknown[] | Record<string, unknown> {
  if (depth >= RUN_DIAGNOSTICS_SUMMARY_MAX_DEPTH) {
    return {
      summary: "Nested diagnostics array omitted from hot-row summary.",
      count: value.length,
    };
  }
  const items = value
    .slice(0, RUN_DIAGNOSTICS_SUMMARY_MAX_ARRAY_ITEMS)
    .map((item) => summarizeDiagnosticValue(item, depth + 1));
  if (value.length <= RUN_DIAGNOSTICS_SUMMARY_MAX_ARRAY_ITEMS) return items;
  return [
    ...items,
    {
      summary: "Additional diagnostics items stored in detail payload.",
      omittedCount: value.length - RUN_DIAGNOSTICS_SUMMARY_MAX_ARRAY_ITEMS,
    },
  ];
}

function summarizeDiagnosticObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  if (depth >= RUN_DIAGNOSTICS_SUMMARY_MAX_DEPTH) {
    return {
      summary: "Nested diagnostics object omitted from hot-row summary.",
      keyCount: Object.keys(value).length,
    };
  }
  const entries = Object.entries(value);
  const summary: Record<string, unknown> = {};
  for (const [key, entryValue] of entries.slice(0, RUN_DIAGNOSTICS_SUMMARY_MAX_OBJECT_KEYS)) {
    summary[key] = summarizeDiagnosticValue(entryValue, depth + 1);
  }
  if (entries.length > RUN_DIAGNOSTICS_SUMMARY_MAX_OBJECT_KEYS) {
    summary.omittedDiagnosticKeyCount = entries.length - RUN_DIAGNOSTICS_SUMMARY_MAX_OBJECT_KEYS;
  }
  return summary;
}
