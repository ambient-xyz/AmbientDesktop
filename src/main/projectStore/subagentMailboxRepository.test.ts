import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreSubagentMailboxRepository } from "./subagentMailboxRepository";

describe("ProjectStoreSubagentMailboxRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreSubagentMailboxRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE subagent_mailbox_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        delivery_state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        delivered_at TEXT
      );
    `);
    repository = new ProjectStoreSubagentMailboxRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("appends, gets, and lists child mailbox events for a run", () => {
    const second = repository.appendSubagentMailboxEvent("child-run", {
      direction: "parent_to_child",
      type: "subagent.deliverable_ready",
      payload: { path: "artifacts/result.json" },
      createdAt: "2026-06-16T00:02:00.000Z",
    });
    const first = repository.appendSubagentMailboxEvent("child-run", {
      direction: "child_to_parent",
      type: "subagent.progress",
      payload: { message: "working" },
      deliveryState: "delivered",
      createdAt: "2026-06-16T00:01:00.000Z",
      deliveredAt: "2026-06-16T00:01:30.000Z",
    });
    repository.appendSubagentMailboxEvent("other-run", {
      direction: "parent_to_child",
      type: "subagent.other",
      payload: null,
      createdAt: "2026-06-16T00:00:00.000Z",
    });

    expect(repository.getSubagentMailboxEvent(first.id)).toEqual(first);
    expect(repository.listSubagentMailboxEvents("child-run")).toEqual([first, second]);
    expect(second).toMatchObject({
      runId: "child-run",
      direction: "parent_to_child",
      type: "subagent.deliverable_ready",
      payload: { path: "artifacts/result.json" },
      deliveryState: "queued",
      createdAt: "2026-06-16T00:02:00.000Z",
      deliveredAt: undefined,
    });
  });

  it("updates delivery state timestamps with existing ProjectStore semantics", () => {
    const event = repository.appendSubagentMailboxEvent("child-run", {
      direction: "parent_to_child",
      type: "subagent.approval_response",
      payload: { approved: true },
      createdAt: "2026-06-16T00:03:00.000Z",
    });

    const delivered = repository.updateSubagentMailboxEventDeliveryState(event.id, "delivered", {
      now: "2026-06-16T00:04:00.000Z",
    });
    expect(delivered).toMatchObject({
      deliveryState: "delivered",
      deliveredAt: "2026-06-16T00:04:00.000Z",
    });

    const consumed = repository.updateSubagentMailboxEventDeliveryState(event.id, "consumed", {
      now: "2026-06-16T00:05:00.000Z",
    });
    expect(consumed).toMatchObject({
      deliveryState: "consumed",
      deliveredAt: "2026-06-16T00:04:00.000Z",
    });

    const queued = repository.updateSubagentMailboxEventDeliveryState(event.id, "queued", {
      now: "2026-06-16T00:06:00.000Z",
    });
    expect(queued).toMatchObject({
      deliveryState: "queued",
      deliveredAt: undefined,
    });

    const queuedAgain = repository.updateSubagentMailboxEventDeliveryState(event.id, "queued", {
      now: "2026-06-16T00:07:00.000Z",
    });
    expect(queuedAgain).toEqual(queued);
  });

  it("throws for missing mailbox events", () => {
    expect(() => repository.getSubagentMailboxEvent("missing-event")).toThrow("Sub-agent mailbox event not found: missing-event");
  });
});
