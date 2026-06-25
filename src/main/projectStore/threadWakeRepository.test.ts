import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import { ProjectStoreThreadWakeRepository } from "./threadWakeRepository";

describe("ProjectStoreThreadWakeRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreThreadWakeRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    repository = new ProjectStoreThreadWakeRepository(db);
    db.prepare(
      "INSERT INTO threads (id, title, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).run("thread-1", "Thread 1", "/workspace", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  });

  afterEach(() => {
    db.close();
  });

  it("schedules, lists, and delivers pending wake continuations", () => {
    const wake = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:05.000Z",
      reason: "check async job",
      jobId: "job-1",
      payload: { next_since_seq: 4 },
    });

    expect(wake).toMatchObject({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:05.000Z",
      status: "pending",
      reason: "check async job",
      jobId: "job-1",
      supersedesWakeIds: [],
      payload: { next_since_seq: 4 },
    });
    expect(repository.listDueThreadWakeContinuations("2026-01-01T00:00:04.000Z")).toEqual([]);
    expect(repository.listDueThreadWakeContinuations("2026-01-01T00:00:05.000Z")).toHaveLength(1);

    const delivered = repository.markThreadWakeContinuationDelivered(wake.id);
    expect(delivered).toMatchObject({ id: wake.id, status: "delivered" });
    expect(repository.listPendingThreadWakeContinuations()).toEqual([]);
  });

  it("supersedes older pending wakes with the same operation key", () => {
    const first = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:05.000Z",
      reason: "first check",
      operationKey: "bash:job-1",
    });
    const second = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:10.000Z",
      reason: "second check",
      operationKey: "bash:job-1",
    });

    expect(second.supersedesWakeIds).toEqual([first.id]);
    expect(repository.getThreadWakeContinuation(first.id)).toMatchObject({
      status: "superseded",
      resolvedAt: expect.any(String),
      resolutionReason: `Superseded by wake ${second.id}.`,
    });
    expect(repository.listPendingThreadWakeContinuations().map((wake) => wake.id)).toEqual([second.id]);
  });

  it("keeps legacy wakes without operation keys independent", () => {
    const first = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:05.000Z",
      reason: "first check",
    });
    const second = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:10.000Z",
      reason: "second check",
    });

    expect(second.supersedesWakeIds).toEqual([]);
    expect(repository.listPendingThreadWakeContinuations().map((wake) => wake.id)).toEqual([first.id, second.id]);
  });

  it("cancels and resolves pending wakes before delivery", () => {
    const cancelWake = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:05.000Z",
      reason: "cancel me",
    });
    const resolveWake = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:10.000Z",
      reason: "resolve me",
    });

    expect(repository.cancelThreadWakeContinuation(cancelWake.id)).toMatchObject({
      id: cancelWake.id,
      status: "cancelled",
      resolvedAt: expect.any(String),
      resolutionReason: "Cancelled before delivery.",
    });
    expect(repository.resolveThreadWakeContinuation(resolveWake.id, "job already reported")).toMatchObject({
      id: resolveWake.id,
      status: "resolved",
      resolvedAt: expect.any(String),
      resolutionReason: "job already reported",
    });
    expect(repository.listPendingThreadWakeContinuations()).toEqual([]);
  });

  it("marks pending wake continuations failed with an error", () => {
    const wake = repository.scheduleThreadWakeContinuation({
      threadId: "thread-1",
      dueAt: "2026-01-01T00:00:05.000Z",
      reason: "check async job",
    });

    const failed = repository.markThreadWakeContinuationFailed(wake.id, "send failed");

    expect(failed).toMatchObject({
      id: wake.id,
      status: "failed",
      error: "send failed",
    });
  });
});
