import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardSynthesisRunProgressiveRecord,
} from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import { ProjectStoreProjectBoardSynthesisRunRepository } from "./projectBoardSynthesisRunRepository";

describe("ProjectStoreProjectBoardSynthesisRunRepository", () => {
  let db: Database.Database;
  let snapshots: Array<{ runId: string; kind: ProjectBoardPlanningSnapshotKind }>;
  let repository: ProjectStoreProjectBoardSynthesisRunRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    snapshots = [];
    repository = new ProjectStoreProjectBoardSynthesisRunRepository(db, {
      appendProjectBoardPlanningSnapshotForRun: (runId, kind) => appendSnapshot(db, snapshots, runId, kind),
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates, finds, and updates synthesis run progress", () => {
    const run = repository.createProjectBoardSynthesisRun({
      boardId: "board-1",
      model: " kimi ",
      retryOfRunId: " old-run ",
      initialStage: "charter_summary",
      initialTitle: " Start synthesis ",
      initialSummary: " Start from charter. ",
      sourceCount: 1.2,
      includedSourceCount: 2.6,
      sourceCharCount: 99.9,
    });

    expect(run).toMatchObject({
      boardId: "board-1",
      retryOfRunId: "old-run",
      status: "running",
      stage: "charter_summary",
      model: "kimi",
      sourceCount: 1,
      includedSourceCount: 3,
      sourceCharCount: 100,
    });
    expect(repository.getProjectBoardSynthesisRun(run.id)?.id).toBe(run.id);
    expect(repository.getRunningProjectBoardSynthesisRun("board-1", { excludeStages: ["source_scan"] })?.id).toBe(run.id);
    expect(repository.getRunningProjectBoardSynthesisRun("board-1", { excludeStages: ["charter_summary"] })).toBeUndefined();

    const progressed = repository.updateProjectBoardSynthesisRunProgress(run.id, {
      stage: "schema_validation",
      promptCharCount: 123.4,
      warningCount: 2.7,
    });

    expect(progressed).toMatchObject({
      stage: "schema_validation",
      promptCharCount: 123,
      warningCount: 3,
    });
  });

  it("records run events, pause snapshots, stale failures, and abandoned pauses", () => {
    const staleRun = repository.createProjectBoardSynthesisRun({ boardId: "board-1", initialStage: "source_scan" });
    db.prepare("UPDATE project_board_synthesis_runs SET updated_at = ? WHERE id = ?").run("2026-06-15T00:00:00.000Z", staleRun.id);

    const failed = repository.failStaleProjectBoardSynthesisRuns({
      boardId: "board-1",
      staleBefore: "2026-06-16T00:00:00.000Z",
      reason: "No stream activity.",
    });

    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      id: staleRun.id,
      status: "failed",
      stage: "failed",
      error: "No stream activity.",
    });
    expect(snapshots).toEqual([]);

    const run = repository.createProjectBoardSynthesisRun({ boardId: "board-1", initialStage: "model_response" });
    expect(repository.requestProjectBoardSynthesisRunPause({ boardId: "board-1", runId: run.id, reason: "User asked." })).toMatchObject({
      status: "pause_requested",
      stage: "model_response",
    });

    const paused = repository.markProjectBoardSynthesisRunPaused({
      boardId: "board-1",
      runId: run.id,
      metadata: { checkpoint: "section-1" },
    });
    expect(paused).toMatchObject({
      status: "paused",
      stage: "paused",
      planningSnapshots: [expect.objectContaining({ runId: run.id, kind: "paused" })],
    });
    expect(snapshots).toEqual([{ runId: run.id, kind: "paused" }]);

    expect(repository.abandonProjectBoardSynthesisRunPause({ boardId: "board-1", runId: run.id })).toMatchObject({
      status: "abandoned",
      stage: "paused",
    });
  });

  it("records terminal snapshots and progressive planning records", () => {
    const run = repository.createProjectBoardSynthesisRun({ boardId: "board-1", initialStage: "model_response" });

    const progressive = repository.recordProjectBoardSynthesisRunProgressiveRecords(
      run.id,
      [
        candidateCardRecord(),
        candidateCardRecord(),
        {
          type: "question",
          questionId: "question:scope",
          question: "Should the migration include apply surfaces?",
          required: true,
        },
        { type: "warning", message: "One source was skipped." },
        { invalid: "missing type" },
      ],
      { title: "Progressive records persisted" },
    );

    expect(progressive).toMatchObject({
      stage: "schema_validation",
      cardCount: 1,
      questionCount: 1,
      warningCount: 1,
      progressiveRecordCount: 3,
      progressiveSummary: expect.objectContaining({
        candidateCardCount: 1,
        questionCount: 1,
        warningCount: 1,
        latestCandidateCardTitle: "Extract synthesis run repository",
      }),
    });

    const succeeded = repository.recordProjectBoardSynthesisRunEvent(run.id, {
      stage: "proposal_created",
      title: "Proposal created",
      summary: "Run completed.",
      status: "succeeded",
      cardCount: 1,
      completedAt: "2026-06-16T00:00:00.000Z",
    });

    expect(succeeded).toMatchObject({
      status: "succeeded",
      stage: "proposal_created",
      planningSnapshots: [expect.objectContaining({ runId: run.id, kind: "final" })],
    });
    expect(snapshots).toEqual([{ runId: run.id, kind: "final" }]);
  });
});

function candidateCardRecord(): ProjectBoardSynthesisRunProgressiveRecord {
  return {
    type: "candidate_card",
    sourceId: "synthesis:run-repo",
    title: "Extract synthesis run repository",
    description: "Move synthesis run persistence behind a ProjectStore owner.",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Phase 5",
    labels: ["project-store"],
    blockedBy: [],
    sourceRefs: [{ sourceId: "source-plan", path: "simplificationV3.html" }],
    acceptanceCriteria: ["Facade behavior remains unchanged."],
    testPlan: { unit: ["repository parity test"], integration: [], visual: [], manual: [] },
  };
}

function appendSnapshot(
  db: Database.Database,
  snapshots: Array<{ runId: string; kind: ProjectBoardPlanningSnapshotKind }>,
  runId: string,
  kind: ProjectBoardPlanningSnapshotKind,
): ProjectBoardPlanningSnapshot {
  snapshots.push({ runId, kind });
  const row = db.prepare("SELECT board_id, status, stage, planning_snapshots_json FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
    | { board_id: string; status: ProjectBoardPlanningSnapshot["planningStatus"]; stage: ProjectBoardPlanningSnapshot["planningStage"]; planning_snapshots_json: string | null }
    | undefined;
  if (!row) throw new Error(`Project board synthesis run not found: ${runId}`);
  const createdAt = "2026-06-16T00:00:00.000Z";
  const snapshot: ProjectBoardPlanningSnapshot = {
    id: `snapshot-${snapshots.length}`,
    boardId: row.board_id,
    runId,
    kind,
    planningStatus: row.status,
    planningStage: row.stage,
    createdAt,
    cardCount: 0,
    readyCandidateCount: 0,
    ticketizedCount: 0,
    sourceHashes: [],
    cardIds: [],
    cards: [],
    renderFingerprint: `snapshot:${runId}:${kind}:${snapshots.length}`,
  };
  const previous = JSON.parse(row.planning_snapshots_json ?? "[]") as ProjectBoardPlanningSnapshot[];
  db.prepare("UPDATE project_board_synthesis_runs SET planning_snapshots_json = ? WHERE id = ?").run(JSON.stringify([...previous, snapshot]), runId);
  return snapshot;
}

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}
