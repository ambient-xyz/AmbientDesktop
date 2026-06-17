import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreSubagentParentMailboxRepository } from "./subagentParentMailboxRepository";

describe("ProjectStoreSubagentParentMailboxRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSubagentParentMailboxRepository;

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
    repository = new ProjectStoreSubagentParentMailboxRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("appends, gets, finds, and lists parent mailbox events", () => {
    const second = repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "subagent.batch_progress",
      payload: { jobId: "job-1", completed: 1 },
      idempotencyKey: "progress:job-1",
      createdAt: "2026-06-16T00:02:00.000Z",
    });
    const first = repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      type: "subagent.parent_notice",
      payload: { message: "queued" },
      deliveryState: "delivered",
      createdAt: "2026-06-16T00:01:00.000Z",
      deliveredAt: "2026-06-16T00:01:30.000Z",
    });
    repository.appendSubagentParentMailboxEvent({
      parentThreadId: "other-thread",
      parentRunId: "other-run",
      type: "subagent.parent_notice",
      payload: null,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    expect(repository.getSubagentParentMailboxEvent(first.id)).toEqual(first);
    expect(repository.findSubagentParentMailboxEventByIdempotencyKey(
      "parent-run",
      "subagent.batch_progress",
      "progress:job-1",
    )).toEqual(second);
    expect(repository.listSubagentParentMailboxEventsForParentRun("parent-run")).toEqual([first, second]);
    expect(repository.listSubagentParentMailboxEventsForParentThread("parent-thread")).toEqual([first, second]);
  });

  it("reuses idempotent parent mailbox events and fills missing parent message ids", () => {
    const created = repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "subagent.batch_progress",
      payload: { jobId: "job-1", completed: 1 },
      idempotencyKey: "progress:job-1",
      createdAt: "2026-06-16T00:03:00.000Z",
    });

    const reused = repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "parent-message",
      type: "subagent.batch_progress",
      payload: { jobId: "job-1", completed: 2 },
      idempotencyKey: "progress:job-1",
      createdAt: "2026-06-16T00:04:00.000Z",
    });

    expect(reused).toEqual({
      ...created,
      parentMessageId: "parent-message",
      updatedAt: "2026-06-16T00:04:00.000Z",
    });
    expect(repository.listSubagentParentMailboxEventsForParentRun("parent-run")).toHaveLength(1);
  });

  it("updates grouped payloads and returns the latest queued parent mailbox event", () => {
    repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "subagent.grouped_completion",
      payload: { childRunId: "old-child" },
      deliveryState: "consumed",
      idempotencyKey: "grouped:old",
      createdAt: "2026-06-16T00:04:00.000Z",
    });
    const latest = repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "subagent.grouped_completion",
      payload: { childRunId: "child-a" },
      idempotencyKey: "grouped:a",
      createdAt: "2026-06-16T00:05:00.000Z",
    });

    const updated = repository.updateSubagentParentMailboxPayload({
      id: latest.id,
      parentMessageId: "parent-message",
      payload: { childRunIds: ["child-a", "child-b"] },
      idempotencyKey: "grouped:a,b",
      updatedAt: "2026-06-16T00:06:00.000Z",
    });

    expect(updated).toMatchObject({
      id: latest.id,
      parentMessageId: "parent-message",
      payload: { childRunIds: ["child-a", "child-b"] },
      idempotencyKey: "grouped:a,b",
      deliveryState: "queued",
      updatedAt: "2026-06-16T00:06:00.000Z",
    });
    expect(repository.latestQueuedSubagentParentMailboxEvent("parent-run", "subagent.grouped_completion")).toEqual(updated);
  });

  it("requeues existing payloads for batch progress updates", () => {
    const event = repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      parentMessageId: "original-message",
      type: "subagent.batch_progress",
      payload: { completed: 1 },
      deliveryState: "delivered",
      deliveredAt: "2026-06-16T00:06:30.000Z",
      idempotencyKey: "progress:job-1",
      createdAt: "2026-06-16T00:06:00.000Z",
    });

    const requeued = repository.requeueSubagentParentMailboxPayload({
      id: event.id,
      parentMessageId: "new-message",
      payload: { completed: 2 },
      updatedAt: "2026-06-16T00:07:00.000Z",
    });

    expect(requeued).toMatchObject({
      id: event.id,
      parentMessageId: "original-message",
      payload: { completed: 2 },
      deliveryState: "queued",
      deliveredAt: undefined,
      updatedAt: "2026-06-16T00:07:00.000Z",
    });
  });

  it("updates delivery state timestamps with existing ProjectStore semantics", () => {
    const event = repository.appendSubagentParentMailboxEvent({
      parentThreadId: "parent-thread",
      parentRunId: "parent-run",
      type: "subagent.parent_notice",
      payload: { message: "hello" },
      createdAt: "2026-06-16T00:08:00.000Z",
    });

    const delivered = repository.updateSubagentParentMailboxEventDeliveryState(event.id, "delivered", {
      now: "2026-06-16T00:09:00.000Z",
    });
    expect(delivered).toMatchObject({
      deliveryState: "delivered",
      deliveredAt: "2026-06-16T00:09:00.000Z",
      updatedAt: "2026-06-16T00:09:00.000Z",
    });

    const consumed = repository.updateSubagentParentMailboxEventDeliveryState(event.id, "consumed", {
      now: "2026-06-16T00:10:00.000Z",
    });
    expect(consumed).toMatchObject({
      deliveryState: "consumed",
      deliveredAt: "2026-06-16T00:09:00.000Z",
      updatedAt: "2026-06-16T00:10:00.000Z",
    });

    const queued = repository.updateSubagentParentMailboxEventDeliveryState(event.id, "queued", {
      now: "2026-06-16T00:11:00.000Z",
    });
    expect(queued).toMatchObject({
      deliveryState: "queued",
      deliveredAt: undefined,
      updatedAt: "2026-06-16T00:11:00.000Z",
    });

    const queuedAgain = repository.updateSubagentParentMailboxEventDeliveryState(event.id, "queued", {
      now: "2026-06-16T00:12:00.000Z",
    });
    expect(queuedAgain).toEqual(queued);
  });

  it("throws for missing parent mailbox events", () => {
    expect(() => repository.getSubagentParentMailboxEvent("missing-event")).toThrow(
      "Sub-agent parent mailbox event not found: missing-event",
    );
  });
});
