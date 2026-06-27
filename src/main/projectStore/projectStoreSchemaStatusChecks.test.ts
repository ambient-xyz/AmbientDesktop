import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { ensureThreadGoalProviderStatusCheck, ensureThreadWakeContinuationStatusCheck } from "./projectStoreSchema";

describe("project store schema status checks", () => {
  it("rebuilds the thread goal status check for provider-unavailable goals", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`
        CREATE TABLE threads (
          id TEXT PRIMARY KEY
        );
        CREATE TABLE thread_goals (
          thread_id TEXT PRIMARY KEY,
          goal_id TEXT NOT NULL,
          objective TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN (
            'active', 'paused', 'blocked', 'usage_limited', 'budget_limited', 'complete'
          )),
          token_budget INTEGER,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          time_used_seconds INTEGER NOT NULL DEFAULT 0,
          continuation_turns INTEGER NOT NULL DEFAULT 0,
          no_progress_turns INTEGER NOT NULL DEFAULT 0,
          provider_infra_failures INTEGER NOT NULL DEFAULT 0,
          status_reason TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          last_continued_at TEXT,
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );
        INSERT INTO threads (id) VALUES ('thread-1');
        INSERT INTO thread_goals
          (thread_id, goal_id, objective, status, token_budget, tokens_used, time_used_seconds,
           continuation_turns, no_progress_turns, provider_infra_failures, status_reason, created_at, updated_at, completed_at, last_continued_at)
        VALUES
          ('thread-1', 'goal-1', 'Recover provider stalls', 'active', NULL, 11, 3, 2, 0, 3,
           'Provider recovery stopped without pausing the goal.', '2026-06-21T00:00:00.000Z',
           '2026-06-21T00:01:00.000Z', NULL, '2026-06-21T00:02:00.000Z');
      `);
      expect(() => {
        db.prepare("UPDATE thread_goals SET status = 'provider_unavailable' WHERE thread_id = 'thread-1'").run();
      }).toThrow();

      ensureThreadGoalProviderStatusCheck(db);
      ensureThreadGoalProviderStatusCheck(db);

      db.prepare("UPDATE thread_goals SET status = 'provider_unavailable' WHERE thread_id = 'thread-1'").run();
      expect(db.prepare("SELECT status, provider_infra_failures FROM thread_goals WHERE thread_id = 'thread-1'").get()).toEqual({
        status: "provider_unavailable",
        provider_infra_failures: 3,
      });
      const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'thread_goals'").get() as { sql: string };
      expect(schema.sql).toContain("'provider_unavailable'");
    } finally {
      db.close();
    }
  });

  it("rebuilds the thread wake continuation status check for resolved and superseded wakes", () => {
    const db = new Database(":memory:");
    try {
      db.exec(`
        CREATE TABLE threads (
          id TEXT PRIMARY KEY
        );
        CREATE TABLE thread_wake_continuations (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          due_at TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'delivered', 'cancelled', 'failed')),
          reason TEXT NOT NULL,
          job_id TEXT,
          operation_key TEXT,
          supersedes_wake_ids_json TEXT NOT NULL DEFAULT '[]',
          payload_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          delivered_at TEXT,
          resolved_at TEXT,
          resolution_reason TEXT,
          error TEXT,
          FOREIGN KEY(thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );
        INSERT INTO threads (id) VALUES ('thread-1');
        INSERT INTO thread_wake_continuations
          (id, thread_id, due_at, status, reason, job_id, operation_key, supersedes_wake_ids_json,
           payload_json, created_at, updated_at, delivered_at, resolved_at, resolution_reason, error)
        VALUES
          ('wake-1', 'thread-1', '2026-06-21T00:10:00.000Z', 'pending', 'Check job.',
           'job-1', 'bash:job-1', '[]', NULL, '2026-06-21T00:00:00.000Z',
           '2026-06-21T00:00:00.000Z', NULL, NULL, NULL, NULL);
      `);
      expect(() => {
        db.prepare("UPDATE thread_wake_continuations SET status = 'superseded' WHERE id = 'wake-1'").run();
      }).toThrow();

      ensureThreadWakeContinuationStatusCheck(db);
      ensureThreadWakeContinuationStatusCheck(db);

      db.prepare("UPDATE thread_wake_continuations SET status = 'superseded' WHERE id = 'wake-1'").run();
      expect(db.prepare("SELECT status, operation_key FROM thread_wake_continuations WHERE id = 'wake-1'").get()).toEqual({
        status: "superseded",
        operation_key: "bash:job-1",
      });
      const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'thread_wake_continuations'").get() as {
        sql: string;
      };
      expect(schema.sql).toContain("'superseded'");
      expect(schema.sql).toContain("'resolved'");
    } finally {
      db.close();
    }
  });
});
