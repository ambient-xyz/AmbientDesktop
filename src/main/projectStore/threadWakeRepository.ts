import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export type ThreadWakeContinuationStatus = "pending" | "delivered" | "cancelled" | "failed";

export interface ThreadWakeContinuation {
  id: string;
  threadId: string;
  dueAt: string;
  status: ThreadWakeContinuationStatus;
  reason: string;
  jobId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
  error?: string;
}

export interface ScheduleThreadWakeContinuationInput {
  threadId: string;
  dueAt: string;
  reason: string;
  jobId?: string;
  payload?: Record<string, unknown>;
}

interface ThreadWakeContinuationRow {
  id: string;
  thread_id: string;
  due_at: string;
  status: ThreadWakeContinuationStatus;
  reason: string;
  job_id: string | null;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
  delivered_at: string | null;
  error: string | null;
}

export class ProjectStoreThreadWakeRepository {
  constructor(private readonly db: Database.Database) {}

  scheduleThreadWakeContinuation(input: ScheduleThreadWakeContinuationInput): ThreadWakeContinuation {
    this.requireThread(input.threadId);
    const reason = input.reason.trim();
    if (!reason) throw new Error("Thread wake reason is required.");
    const dueAt = normalizeIsoTime(input.dueAt, "Thread wake due_at must be a valid ISO timestamp.");
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO thread_wake_continuations
         (id, thread_id, due_at, status, reason, job_id, payload_json, created_at, updated_at, delivered_at, error)
         VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .run(
        id,
        input.threadId,
        dueAt,
        reason,
        normalizedOptionalString(input.jobId),
        input.payload ? JSON.stringify(input.payload) : null,
        now,
        now,
      );
    return this.getThreadWakeContinuation(id)!;
  }

  listPendingThreadWakeContinuations(): ThreadWakeContinuation[] {
    const rows = this.db
      .prepare("SELECT * FROM thread_wake_continuations WHERE status = 'pending' ORDER BY due_at ASC, created_at ASC")
      .all() as ThreadWakeContinuationRow[];
    return rows.map(mapThreadWakeContinuationRow);
  }

  listDueThreadWakeContinuations(nowIso: string, limit = 20): ThreadWakeContinuation[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM thread_wake_continuations
         WHERE status = 'pending' AND due_at <= ?
         ORDER BY due_at ASC, created_at ASC
         LIMIT ?`,
      )
      .all(normalizeIsoTime(nowIso, "nowIso must be a valid ISO timestamp."), Math.max(1, Math.floor(limit))) as ThreadWakeContinuationRow[];
    return rows.map(mapThreadWakeContinuationRow);
  }

  markThreadWakeContinuationDelivered(id: string): ThreadWakeContinuation | undefined {
    const current = this.getThreadWakeContinuation(id);
    if (!current || current.status !== "pending") return current;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE thread_wake_continuations
         SET status = 'delivered', updated_at = ?, delivered_at = ?, error = NULL
         WHERE id = ? AND status = 'pending'`,
      )
      .run(now, now, id);
    return this.getThreadWakeContinuation(id);
  }

  markThreadWakeContinuationFailed(id: string, error: string): ThreadWakeContinuation | undefined {
    const current = this.getThreadWakeContinuation(id);
    if (!current || current.status !== "pending") return current;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE thread_wake_continuations
         SET status = 'failed', updated_at = ?, error = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(now, error.trim().slice(0, 1000) || "Thread wake failed.", id);
    return this.getThreadWakeContinuation(id);
  }

  cancelThreadWakeContinuation(id: string): ThreadWakeContinuation | undefined {
    const current = this.getThreadWakeContinuation(id);
    if (!current || current.status !== "pending") return current;
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE thread_wake_continuations SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending'")
      .run(now, id);
    return this.getThreadWakeContinuation(id);
  }

  getThreadWakeContinuation(id: string): ThreadWakeContinuation | undefined {
    const row = this.db.prepare("SELECT * FROM thread_wake_continuations WHERE id = ?").get(id) as
      | ThreadWakeContinuationRow
      | undefined;
    return row ? mapThreadWakeContinuationRow(row) : undefined;
  }

  private requireThread(threadId: string): void {
    const row = this.db.prepare("SELECT id FROM threads WHERE id = ?").get(threadId) as { id: string } | undefined;
    if (!row) throw new Error(`Thread not found: ${threadId}`);
  }
}

function mapThreadWakeContinuationRow(row: ThreadWakeContinuationRow): ThreadWakeContinuation {
  return {
    id: row.id,
    threadId: row.thread_id,
    dueAt: row.due_at,
    status: normalizeStatus(row.status),
    reason: row.reason,
    ...(row.job_id ? { jobId: row.job_id } : {}),
    ...(row.payload_json ? { payload: parsePayload(row.payload_json) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.delivered_at ? { deliveredAt: row.delivered_at } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

function normalizeStatus(status: string): ThreadWakeContinuationStatus {
  return status === "pending" || status === "delivered" || status === "cancelled" || status === "failed"
    ? status
    : "failed";
}

function parsePayload(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

function normalizeIsoTime(value: string, message: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(message);
  return new Date(parsed).toISOString();
}

function normalizedOptionalString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
