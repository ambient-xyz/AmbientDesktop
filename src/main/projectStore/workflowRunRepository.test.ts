import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mapWorkflowRunEventRow,
  mapWorkflowRunRow,
  mapWorkflowRunScheduleSummaryRow,
} from "./workflowRunMappers";
import { ProjectStoreWorkflowRunRepository } from "./workflowRunRepository";
import {
  mapWorkflowRunEventRow as legacyMapWorkflowRunEventRow,
  mapWorkflowRunRow as legacyMapWorkflowRunRow,
  mapWorkflowRunScheduleSummaryRow as legacyMapWorkflowRunScheduleSummaryRow,
} from "./projectStoreWorkflowMappers";

describe("ProjectStoreWorkflowRunRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreWorkflowRunRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE workflow_runs (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        error TEXT,
        report_path TEXT,
        graph_snapshot_id TEXT,
        provider_health_json TEXT,
        retry_metadata_json TEXT,
        recovery_context_json TEXT
      );
      CREATE TABLE workflow_run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        artifact_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        message TEXT,
        graph_node_id TEXT,
        graph_edge_id TEXT,
        item_key TEXT,
        data_json TEXT
      );
    `);
    repository = new ProjectStoreWorkflowRunRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("keeps the legacy workflow run mapper import path as re-exports", () => {
    expect(legacyMapWorkflowRunRow).toBe(mapWorkflowRunRow);
    expect(legacyMapWorkflowRunEventRow).toBe(mapWorkflowRunEventRow);
    expect(legacyMapWorkflowRunScheduleSummaryRow).toBe(mapWorkflowRunScheduleSummaryRow);
  });

  it("persists workflow runs, durability metadata, and ordered events", () => {
    const run = repository.startWorkflowRun({
      artifactId: "artifact-1",
      status: "running",
      graphSnapshotId: "graph-1",
      providerHealth: { status: "ok", providerEventCount: 1, providerProgressEventCount: 0, providerErrorEventCount: 0 },
      retryMetadata: { retryEventCount: 0, providerRetryEventCount: 0, recoveryAttemptCount: 0 },
      recoveryContext: {
        action: "retry_step",
        sourceRunId: "source-run-1",
        sourceEventId: "source-event-1",
        reason: "initial run",
        createdAt: "2026-06-06T20:10:00.000Z",
      },
    });

    const first = repository.appendWorkflowRunEvent({
      runId: run.id,
      type: "workflow.schedule.started",
      createdAt: "2026-06-06T20:11:00.000Z",
      data: {
        scheduleId: "schedule-1",
        targetKind: "workflow_artifact",
        targetId: "artifact-1",
        targetLabel: "Daily report workflow",
        versionId: "version-1",
      },
    });
    const second = repository.appendWorkflowRunEvent({
      runId: run.id,
      type: "step.end",
      message: "Step completed.",
      data: { graphNodeId: "node-1", usage: { tokens: 12 } },
    });

    expect(first.seq).toBe(1);
    expect(second).toMatchObject({ seq: 2, graphNodeId: "node-1", data: { graphNodeId: "node-1", usage: { tokens: 12 } } });
    expect(repository.listWorkflowRunEvents(run.id).map((event) => event.id)).toEqual([first.id, second.id]);

    const durable = repository.updateWorkflowRunDurability({
      id: run.id,
      graphSnapshotId: null,
      providerHealth: { status: "ok", providerEventCount: 2, providerProgressEventCount: 1, providerErrorEventCount: 0 },
      retryMetadata: { retryEventCount: 1, providerRetryEventCount: 0, recoveryAttemptCount: 1 },
      recoveryContext: null,
    });
    expect(durable).toMatchObject({
      graphSnapshotId: undefined,
      providerHealth: expect.objectContaining({ providerEventCount: 2 }),
      retryMetadata: expect.objectContaining({ retryEventCount: 1 }),
      recoveryContext: undefined,
      scheduledBy: {
        scheduleId: "schedule-1",
        outcome: "started",
        targetKind: "workflow_artifact",
        targetId: "artifact-1",
        targetLabel: "Daily report workflow",
        targetVersionId: "version-1",
      },
    });

    const completed = repository.updateWorkflowRun({
      id: run.id,
      status: "succeeded",
      reportPath: "reports/workflow-run.md",
    });
    expect(completed).toMatchObject({
      status: "succeeded",
      reportPath: "reports/workflow-run.md",
      completedAt: expect.any(String),
    });
  });

  it("preserves list ordering, limit bounds, and missing-run behavior", () => {
    const first = repository.startWorkflowRun({ artifactId: "artifact-1" });
    const second = repository.startWorkflowRun({ artifactId: "artifact-1", status: "running" });
    const third = repository.startWorkflowRun({ artifactId: "artifact-2" });

    expect(repository.listWorkflowRuns("artifact-1").map((run) => run.id)).toEqual([second.id, first.id]);
    expect(repository.listWorkflowRuns(undefined, 1).map((run) => run.id)).toEqual([third.id]);
    const expectedRestartOrder = [first, second, third]
      .slice()
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id))
      .map((run) => run.id);
    expect(repository.listWorkflowRunsForRestart().map((run) => run.id)).toEqual(expectedRestartOrder);
    expect(repository.tryGetWorkflowRun("missing-run")).toBeUndefined();
    expect(() => repository.getWorkflowRun("missing-run")).toThrow("Workflow run not found: missing-run");
    expect(() => repository.appendWorkflowRunEvent({ runId: "missing-run", type: "step.start" })).toThrow(
      "Workflow run not found: missing-run",
    );
  });
});
