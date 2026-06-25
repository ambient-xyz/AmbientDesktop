import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUN_DIAGNOSTICS_HOT_ROW_MAX_JSON_CHARS, ProjectStoreRunRepository } from "./runRepository";

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
      CREATE TABLE run_diagnostic_payloads (
        run_id TEXT PRIMARY KEY,
        diagnostics_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
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

  it("keeps run rows bounded while retaining exact diagnostics in the detail payload", () => {
    const run = repository.startRun({ threadId: "thread-1", assistantMessageId: "message-1" });
    const largePreview = "x".repeat(RUN_DIAGNOSTICS_HOT_ROW_MAX_JSON_CHARS * 2);

    const updated = repository.updateRunDiagnostics(run.id, {
      providerContinuationState: {
        version: 1,
        stateId: "state-1",
        createdAt: "2026-06-16T00:00:00.000Z",
        runId: run.id,
        threadId: "thread-1",
        assistantMessageId: "message-1",
        provider: "ambient",
        model: "moonshotai/kimi-k2.7-code",
        failure: { kind: "stream-stall", message: largePreview },
        retry: { scheduled: false, replaySafe: true },
        stream: {
          eventCount: 1,
          approximatePayloadBytes: largePreview.length,
          preStreamTimeoutMs: 30_000,
          streamIdleTimeoutMs: 30_000,
          assistantOutputChars: 0,
          thinkingOutputChars: 0,
          currentAssistantFinalTextChars: 0,
          semanticOutputSeen: false,
          receivedAnyText: false,
        },
        assistant: {
          messageId: "message-1",
          hasVisibleOutput: false,
          outputChars: 0,
          thinkingChars: 0,
        },
        tools: {
          all: [],
          open: [],
          completed: [],
          interrupted: [],
          mayHaveSideEffects: [],
          completedToolMessageCount: 0,
        },
      },
    });

    const hotRow = db.prepare("SELECT diagnostics_json FROM runs WHERE id = ?").get(run.id) as { diagnostics_json: string };
    const detailRow = db.prepare("SELECT diagnostics_json FROM run_diagnostic_payloads WHERE run_id = ?").get(run.id) as {
      diagnostics_json: string;
    };

    expect(hotRow.diagnostics_json.length).toBeLessThan(RUN_DIAGNOSTICS_HOT_ROW_MAX_JSON_CHARS);
    expect(hotRow.diagnostics_json).not.toContain(largePreview);
    expect(detailRow.diagnostics_json).toContain(largePreview);
    expect(updated.diagnostics?.providerContinuationState?.failure.message).toBe(largePreview);
    expect(repository.getRun(run.id).diagnostics?.providerContinuationState?.failure.message).toBe(largePreview);
    expect(repository.listActiveRuns()[0]?.diagnostics?.providerContinuationState?.failure.message).not.toBe(largePreview);
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
