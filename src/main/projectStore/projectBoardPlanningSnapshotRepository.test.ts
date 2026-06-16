import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardPlanningSnapshot } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import { ProjectStoreProjectBoardPlanningSnapshotRepository } from "./projectBoardPlanningSnapshotRepository";
import { ProjectStoreProjectBoardReadRepository } from "./projectBoardReadRepository";

describe("ProjectStoreProjectBoardPlanningSnapshotRepository", () => {
  let db: Database.Database;
  let repository: ProjectStoreProjectBoardPlanningSnapshotRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    const readRepository = new ProjectStoreProjectBoardReadRepository(db, {
      getProjectBoardCharter: (charterId) => {
        throw new Error(`Unexpected charter lookup in planning snapshot test: ${charterId}`);
      },
      listOrchestrationTasks: () => [],
    });
    repository = new ProjectStoreProjectBoardPlanningSnapshotRepository(db, {
      getProjectBoard: (boardId) => {
        const row = readRepository.getProjectBoardRow(boardId);
        return row ? readRepository.mapProjectBoard(row) : undefined;
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("captures, deduplicates, and retrieves stable planning snapshots", () => {
    insertSource(db, "source-1", "board-1");
    insertSynthesisCard(db, {
      id: "card-ready",
      boardId: "board-1",
      title: "Ready synthesis card",
      sourceId: "synthesis:ready",
      candidateStatus: "ready_to_create",
    });
    insertSynthesisCard(db, {
      id: "card-ticketized",
      boardId: "board-1",
      title: "Ticketized synthesis card",
      sourceId: "synthesis:ticketized",
      candidateStatus: "needs_clarification",
      orchestrationTaskId: "task-1",
    });
    insertSynthesisCard(db, {
      id: "card-archived",
      boardId: "board-1",
      title: "Archived synthesis card",
      sourceId: "synthesis:archived",
      status: "archived",
      candidateStatus: "ready_to_create",
    });
    insertManualCard(db, "manual-card", "board-1");
    insertRun(db, {
      id: "run-final",
      boardId: "board-1",
      status: "succeeded",
      stage: "proposal_created",
    });

    const first = repository.recordProjectBoardPlanningSnapshotForRun("run-final", "final");
    const duplicate = repository.recordProjectBoardPlanningSnapshotForRun("run-final", "final");

    expect(first).toMatchObject({
      boardId: "board-1",
      runId: "run-final",
      kind: "final",
      planningStatus: "succeeded",
      planningStage: "proposal_created",
      cardCount: 2,
      readyCandidateCount: 1,
      ticketizedCount: 1,
      cardIds: ["card-ready", "card-ticketized"],
      planningDepth: expect.objectContaining({ level: "phased", score: 82 }),
    });
    expect(first?.sourceHashes).toEqual([
      expect.objectContaining({
        sourceId: "source-1",
        kind: "implementation_plan",
        sourceKey: "plan:simplification-v3",
        path: "simplificationV3.html",
        contentHash: "hash-1",
        includeInSynthesis: true,
      }),
    ]);
    expect(first?.cards).toEqual([
      expect.objectContaining({ cardId: "card-ready", sourceId: "synthesis:ready", candidateStatus: "ready_to_create" }),
      expect.objectContaining({ cardId: "card-ticketized", sourceId: "synthesis:ticketized", orchestrationTaskId: "task-1" }),
    ]);
    expect(duplicate?.id).toBe(first?.id);
    expect(readStoredSnapshots(db, "run-final")).toHaveLength(1);

    insertRun(db, {
      id: "run-paused",
      boardId: "board-1",
      status: "paused",
      stage: "paused",
    });
    const paused = repository.recordProjectBoardPlanningSnapshotForRun("run-paused", "paused");

    expect(repository.latestStableProjectBoardPlanningSnapshot("board-1")).toMatchObject({
      runId: "run-paused",
      snapshot: expect.objectContaining({
        id: paused?.id,
        kind: "paused",
        planningStatus: "paused",
      }),
    });
  });

  it("does not create a snapshot when no synthesis cards exist", () => {
    insertRun(db, {
      id: "run-empty",
      boardId: "board-1",
      status: "succeeded",
      stage: "proposal_created",
    });

    expect(repository.recordProjectBoardPlanningSnapshotForRun("run-empty", "final")).toBeUndefined();
    expect(readStoredSnapshots(db, "run-empty")).toEqual([]);
    expect(repository.latestStableProjectBoardPlanningSnapshot("board-1")).toBeUndefined();
  });
});

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function insertSource(db: Database.Database, id: string, boardId: string): void {
  db.prepare(
    `INSERT INTO project_board_sources
      (id, board_id, source_kind, source_key, content_hash, change_state, title, summary,
       excerpt, path, include_in_synthesis, created_at, updated_at)
     VALUES (?, ?, 'implementation_plan', 'plan:simplification-v3', 'hash-1', 'changed',
       'Simplification V3', 'Plan summary', 'Plan excerpt', 'simplificationV3.html', 1,
       '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id, boardId);
}

function insertSynthesisCard(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    title: string;
    sourceId: string;
    status?: string;
    candidateStatus: string;
    orchestrationTaskId?: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_refs_json, clarification_questions_json,
       source_kind, source_id, orchestration_task_id, created_at, updated_at)
     VALUES (?, ?, ?, 'Snapshot test card.', ?, ?, '["project-store"]', '[]',
       '["Snapshot records the card."]',
       '{"unit":["repository test"],"integration":[],"visual":[],"manual":[]}',
       '["simplificationV3.html"]', '["Any snapshot blockers?"]',
       'board_synthesis', ?, ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.boardId, input.title, input.status ?? "draft", input.candidateStatus, input.sourceId, input.orchestrationTaskId ?? null);
}

function insertManualCard(db: Database.Database, id: string, boardId: string): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, source_kind, source_id, created_at, updated_at)
     VALUES (?, ?, 'Manual card', '', 'draft', 'ready_to_create', 'manual', ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id, boardId, `manual:${id}`);
}

function insertRun(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    status: string;
    stage: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_synthesis_runs
      (id, board_id, proposal_id, retry_of_run_id, status, stage, model, source_count,
       included_source_count, source_char_count, prompt_char_count, response_char_count,
       card_count, question_count, warning_count, error, events_json, progressive_records_json,
       planning_snapshots_json, started_at, updated_at, completed_at)
     VALUES (?, ?, NULL, NULL, ?, ?, 'kimi', 1, 1, 100, NULL, NULL,
       2, 0, 0, NULL, ?, '[]', '[]',
       '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:01.000Z')`,
  ).run(input.id, input.boardId, input.status, input.stage, JSON.stringify(runEvents()));
}

function runEvents(): Array<Record<string, unknown>> {
  return [
    {
      stage: "proposal_created",
      title: "Planning depth captured",
      summary: "Snapshot should keep latest planning depth metadata.",
      metadata: {
        planningDepth: {
          level: "phased",
          score: 82,
          signals: ["multi-phase"],
          guidance: "Keep owner extraction broad and staged.",
        },
      },
      createdAt: "2026-06-16T00:00:00.000Z",
    },
  ];
}

function readStoredSnapshots(db: Database.Database, runId: string): ProjectBoardPlanningSnapshot[] {
  const row = db.prepare("SELECT planning_snapshots_json FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
    | { planning_snapshots_json: string | null }
    | undefined;
  if (!row) throw new Error(`Run not found: ${runId}`);
  return JSON.parse(row.planning_snapshots_json ?? "[]") as ProjectBoardPlanningSnapshot[];
}
