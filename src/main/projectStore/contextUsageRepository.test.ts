import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreContextUsageRepository } from "./contextUsageRepository";

describe("ProjectStoreContextUsageRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreContextUsageRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE context_usage_snapshots (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        source TEXT NOT NULL,
        tokens INTEGER,
        context_window INTEGER,
        percent REAL,
        latest_compaction_at TEXT,
        compaction_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        diagnostics_json TEXT
      );
    `);
    repository = new ProjectStoreContextUsageRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("records and lists context usage snapshots with latest-first ordering", () => {
    repository.recordContextUsageSnapshot({
      threadId: "thread-1",
      source: "estimate",
      compactionCount: 0,
      updatedAt: "2026-06-16T00:00:00.000Z",
    });
    const latest = repository.recordContextUsageSnapshot({
      threadId: "thread-1",
      source: "provider-plus-estimate",
      tokens: 42_000,
      contextWindow: 200_000,
      percent: 21,
      latestCompactionAt: "2026-06-16T00:00:01.000Z",
      compactionCount: 1,
      updatedAt: "2026-06-16T00:00:02.000Z",
      diagnostics: { activeSession: true },
    });

    expect(latest).toMatchObject({
      threadId: "thread-1",
      source: "provider-plus-estimate",
      tokens: 42_000,
      contextWindow: 200_000,
      percent: 21,
      latestCompactionAt: "2026-06-16T00:00:01.000Z",
      compactionCount: 1,
      diagnostics: { activeSession: true },
    });
    expect(repository.getLatestContextUsageSnapshot("thread-1")).toMatchObject({ tokens: 42_000 });
    expect(repository.listContextUsageSnapshots().map((snapshot) => snapshot.updatedAt)).toEqual([
      "2026-06-16T00:00:02.000Z",
      "2026-06-16T00:00:00.000Z",
    ]);
  });

  it("bounds context snapshot listing limits", () => {
    repository.recordContextUsageSnapshot({
      threadId: "thread-1",
      source: "estimate",
      compactionCount: 0,
      updatedAt: "2026-06-16T00:00:00.000Z",
    });

    expect(repository.listContextUsageSnapshots(0)).toHaveLength(1);
    expect(repository.listContextUsageSnapshots(1_000)).toHaveLength(1);
  });
});
