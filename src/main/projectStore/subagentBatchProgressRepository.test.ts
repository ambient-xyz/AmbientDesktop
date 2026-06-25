import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSubagentBatchJobPlan,
  createSubagentBatchProgressParentMailboxIdempotencyKey,
  createSubagentBatchResultLedger,
  type SubagentBatchJobRecord,
} from "./projectStoreSubagentsFacade";
import { ProjectStoreSubagentBatchProgressRepository } from "./subagentBatchProgressRepository";

describe("ProjectStoreSubagentBatchProgressRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSubagentBatchProgressRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE subagent_parent_mailbox_events (
        id TEXT PRIMARY KEY,
        parent_thread_id TEXT NOT NULL,
        parent_run_id TEXT NOT NULL,
        parent_message_id TEXT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        delivery_state TEXT NOT NULL,
        idempotency_key TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        delivered_at TEXT
      );
    `);
    repository = new ProjectStoreSubagentBatchProgressRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates a queued batch-progress parent mailbox notification", () => {
    const record = batchRecord();

    const event = repository.upsertSubagentBatchProgressNotificationForRecord(record, "2026-06-16T02:00:00.000Z");

    expect(event).toMatchObject({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      type: "subagent.batch_progress",
      idempotencyKey: createSubagentBatchProgressParentMailboxIdempotencyKey("batch-1"),
      deliveryState: "queued",
      createdAt: "2026-06-16T02:00:00.000Z",
      updatedAt: "2026-06-16T02:00:00.000Z",
    });
    expect(event.payload).toMatchObject({
      schemaVersion: "ambient-subagent-batch-progress-mailbox-v1",
      summary: {
        jobId: "batch-1",
        acceptedReportCount: 0,
        pendingCount: 2,
        pendingItemIds: ["lint", "test"],
      },
    });
  });

  it("requeues an existing batch-progress notification with the latest payload", () => {
    const created = repository.upsertSubagentBatchProgressNotificationForRecord(batchRecord(), "2026-06-16T02:00:00.000Z");
    db.prepare("UPDATE subagent_parent_mailbox_events SET delivery_state = 'delivered', delivered_at = ? WHERE id = ?").run(
      "2026-06-16T02:00:30.000Z",
      created.id,
    );

    const updated = repository.upsertSubagentBatchProgressNotificationForRecord(
      batchRecord({
        acceptedReportCount: 1,
        pendingItemIds: ["test"],
        completedItemIds: ["lint"],
        updatedAt: "2026-06-16T02:01:00.000Z",
      }),
      "2026-06-16T02:01:00.000Z",
    );

    expect(updated).toMatchObject({
      id: created.id,
      deliveryState: "queued",
      deliveredAt: undefined,
      updatedAt: "2026-06-16T02:01:00.000Z",
    });
    expect(updated.payload).toMatchObject({
      summary: {
        acceptedReportCount: 1,
        completedItemIds: ["lint"],
        pendingItemIds: ["test"],
      },
    });
  });
});

function batchRecord(
  input: {
    acceptedReportCount?: number;
    completedItemIds?: string[];
    pendingItemIds?: string[];
    updatedAt?: string;
  } = {},
): SubagentBatchJobRecord {
  const plan = createSubagentBatchJobPlan({
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
  });
  return {
    plan,
    ledger: {
      ...createSubagentBatchResultLedger(plan),
      acceptedReportCount: input.acceptedReportCount ?? 0,
      completedItemIds: input.completedItemIds ?? [],
      pendingItemIds: input.pendingItemIds ?? ["lint", "test"],
    },
    createdAt: plan.createdAt,
    updatedAt: input.updatedAt ?? plan.createdAt,
  };
}
