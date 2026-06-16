import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectStoreRunRepository } from "./runRepository";

describe("ProjectStoreRunRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreRunRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE runs (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        assistant_message_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        diagnostics_json TEXT
      );
    `);
    repository = new ProjectStoreRunRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("persists active runs and merged diagnostics", () => {
    const run = repository.startRun({ threadId: "thread-1", assistantMessageId: "message-1" });

    repository.updateRunStatus(run.id, "streaming");
    repository.updateRunDiagnostics(run.id, {
      toolArgumentStreams: {
        version: 1,
        lastUpdatedAt: "2026-06-16T00:00:00.000Z",
        active: [],
        completed: [],
      },
    });
    const updated = repository.updateRunDiagnostics(run.id, {
      piStreamTrace: { artifactPath: "test-results/run-trace.json" },
    });

    expect(updated).toMatchObject({
      id: run.id,
      threadId: "thread-1",
      assistantMessageId: "message-1",
      status: "streaming",
      diagnostics: expect.objectContaining({
        piStreamTrace: { artifactPath: "test-results/run-trace.json" },
        toolArgumentStreams: expect.objectContaining({ version: 1 }),
      }),
    });
    expect(repository.listActiveRuns()).toEqual([expect.objectContaining({ id: run.id, status: "streaming" })]);
  });

  it("keeps terminal runs out of active results and ignores late status updates", () => {
    const run = repository.startRun({ threadId: "thread-1", assistantMessageId: "message-1" });

    const finished = repository.finishRun(run.id, "done");
    const lateStatus = repository.updateRunStatus(run.id, "tool");

    expect(finished.status).toBe("done");
    expect(lateStatus.status).toBe("done");
    expect(lateStatus.completedAt).toBeTruthy();
    expect(repository.listActiveRuns()).toEqual([]);
  });

  it("reports missing runs", () => {
    expect(() => repository.getRun("missing-run")).toThrow("Run not found: missing-run");
  });
});
