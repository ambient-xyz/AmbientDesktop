import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardQuestion,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposalCard,
} from "../../shared/projectBoardTypes";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  ProjectStoreProjectBoardSynthesisApplyRepository,
  type ProjectBoardSynthesisApplyEventInput,
} from "./projectBoardSynthesisApplyRepository";

describe("ProjectStoreProjectBoardSynthesisApplyRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardSynthesisApplyEventInput[];
  let snapshots: Array<{ runId: string; kind: ProjectBoardPlanningSnapshotKind }>;
  let repository: ProjectStoreProjectBoardSynthesisApplyRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    events = [];
    snapshots = [];
    repository = new ProjectStoreProjectBoardSynthesisApplyRepository(db, {
      ensureProjectBoardQuestions: () => [],
      listProjectBoardEvents: () => [],
      listProjectBoardSources: () => [],
      listProjectBoardQuestions: (boardId) => listQuestions(db, boardId),
      mapProjectBoard: (row) => projectBoardSummary(db, row.id),
      getProjectBoard: (boardId) => projectBoardSummary(db, boardId),
      appendProjectBoardPlanningSnapshotForRun: (runId, kind) => appendSnapshot(db, snapshots, runId, kind ?? "manual"),
      appendProjectBoardEvent: (event) => events.push(event),
    });
  });

  afterEach(() => {
    db.close();
  });

  it("applies synthesis drafts through the repository owner", () => {
    const summary = repository.applyProjectBoardSynthesis("board-1", synthesisDraft(), { insertQuestions: true });

    expect(summary).toMatchObject({
      id: "board-1",
      summary: "Apply repository synthesis.",
    });
    const cards = db
      .prepare("SELECT * FROM project_board_cards WHERE board_id = ? AND source_kind = 'board_synthesis'")
      .all("board-1") as Array<Record<string, unknown>>;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "Create repository-owned apply path",
      source_id: "synthesis:apply-owner",
      candidate_status: "ready_to_create",
      source_refs_json: JSON.stringify(["simplificationV3.html"]),
    });
    expect(listQuestions(db, "board-1").map((question) => question.question)).toEqual(["Should apply stay behavior-preserving?"]);
    expect(events.at(-1)).toMatchObject({
      kind: "board_synthesized",
      title: "Board synthesis applied",
      metadata: expect.objectContaining({
        cardIds: [cards[0].id],
        questionIds: expect.any(Array),
        appliedCardIds: [cards[0].id],
      }),
    });
  });

  it("applies reviewed proposal cards and records the proposal planning snapshot", () => {
    insertSynthesisProposal(db, "proposal-1", {
      boardId: "board-1",
      cards: acceptedProposalCards(),
    });
    insertSynthesisRun(db, {
      id: "run-1",
      boardId: "board-1",
      proposalId: "proposal-1",
    });

    const summary = repository.applyProjectBoardSynthesisProposal({ proposalId: "proposal-1" });

    expect(summary).toMatchObject({
      id: "board-1",
      summary: "Apply repository synthesis.",
    });
    expect(readProposal(db, "proposal-1")).toMatchObject({
      status: "applied",
    });
    const cards = db
      .prepare("SELECT * FROM project_board_cards WHERE board_id = ? AND source_kind = 'board_synthesis'")
      .all("board-1") as Array<Record<string, string>>;
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      title: "Create repository-owned apply path",
      source_id: "synthesis:apply-owner",
      candidate_status: "ready_to_create",
    });
    expect(snapshots).toEqual([{ runId: "run-1", kind: "final" }]);
    expect(events.at(-1)).toMatchObject({
      kind: "synthesis_proposal_applied",
      entityKind: "project_board_synthesis_proposal",
      entityId: "proposal-1",
      metadata: expect.objectContaining({
        proposalId: "proposal-1",
        acceptedSourceIds: ["synthesis:apply-owner"],
        mergedSourceIds: [],
        mergedCardIds: [],
        planningSnapshotRunId: "run-1",
        planningSnapshotKind: "final",
        planningSnapshotCardIds: [cards[0].id],
      }),
    });
  });

});

function synthesisDraft(): ProjectBoardSynthesisDraft {
  return {
    summary: "Apply repository synthesis.",
    goal: "Move apply persistence behind the synthesis-apply repository.",
    currentState: "ProjectStore still exposes the facade method.",
    targetUser: "Ambient developers",
    qualityBar: "Behavior is preserved by focused persistence tests.",
    assumptions: ["The first pass is move-only."],
    questions: ["Should apply stay behavior-preserving?"],
    sourceNotes: ["Use the V3 plan as the source of truth."],
    cards: [
      {
        sourceId: "synthesis:apply-owner",
        title: "Create repository-owned apply path",
        description: "Move the board synthesis apply SQL behind a repository owner.",
        candidateStatus: "ready_to_create",
        priority: 1,
        phase: "Phase 5",
        labels: ["project-store"],
        blockedBy: [],
        acceptanceCriteria: ["ProjectStore remains a stable facade."],
        testPlan: { unit: ["repository test"], integration: [], visual: [], manual: [] },
        sourceRefs: ["simplificationV3.html"],
      },
    ],
  };
}

function acceptedProposalCards(): ProjectBoardSynthesisProposalCard[] {
  return synthesisDraft().cards.map((card) => ({
    ...card,
    reviewStatus: "accepted",
  }));
}

function insertSynthesisProposal(
  db: Database.Database,
  id: string,
  input: {
    boardId: string;
    cards: ProjectBoardSynthesisProposalCard[];
  },
): void {
  const draft = synthesisDraft();
  db.prepare(
    `INSERT INTO project_board_synthesis_proposals
      (id, board_id, status, summary, goal, current_state, target_user, quality_bar,
       assumptions_json, questions_json, answers_json, source_notes_json, cards_json,
       review_report_json, model, duration_ms, created_at, updated_at, applied_at)
     VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, NULL, 'kimi', 123,
       '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z', NULL)`,
  ).run(
    id,
    input.boardId,
    draft.summary,
    draft.goal,
    draft.currentState,
    draft.targetUser,
    draft.qualityBar,
    JSON.stringify(draft.assumptions),
    JSON.stringify(draft.questions),
    JSON.stringify(draft.sourceNotes),
    JSON.stringify(input.cards),
  );
}

function insertSynthesisRun(
  db: Database.Database,
  input: {
    id: string;
    boardId: string;
    proposalId: string;
  },
): void {
  db.prepare(
    `INSERT INTO project_board_synthesis_runs
      (id, board_id, proposal_id, retry_of_run_id, status, stage, model, source_count,
       included_source_count, source_char_count, prompt_char_count, response_char_count,
       card_count, question_count, warning_count, error, events_json, progressive_records_json,
       planning_snapshots_json, started_at, updated_at, completed_at)
     VALUES (?, ?, ?, NULL, 'succeeded', 'proposal_created', 'kimi', 0, 0, 0, NULL, NULL,
       1, 1, 0, NULL, '[]', '[]', '[]',
       '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:01.000Z')`,
  ).run(input.id, input.boardId, input.proposalId);
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
  const cardRows = db
    .prepare(
      `SELECT id, source_id, title, status, candidate_status, source_refs_json, blocked_by_json
       FROM project_board_cards
       WHERE board_id = ? AND source_kind = 'board_synthesis' AND status != 'archived'
       ORDER BY source_id ASC, id ASC`,
    )
    .all(row.board_id) as Array<{
    id: string;
    source_id: string;
    title: string;
    status: ProjectBoardPlanningSnapshot["cards"][number]["status"];
    candidate_status: ProjectBoardPlanningSnapshot["cards"][number]["candidateStatus"];
    source_refs_json: string | null;
    blocked_by_json: string | null;
  }>;
  const snapshotCards: ProjectBoardPlanningSnapshot["cards"] = cardRows.map((card) => ({
    cardId: card.id,
    sourceId: card.source_id,
    sourceKind: "board_synthesis",
    title: card.title,
    status: card.status,
    candidateStatus: card.candidate_status,
    sourceRefs: JSON.parse(card.source_refs_json ?? "[]") as string[],
    blockedBy: JSON.parse(card.blocked_by_json ?? "[]") as string[],
    renderFingerprint: `card:${card.id}`,
  }));
  const snapshot: ProjectBoardPlanningSnapshot = {
    id: `snapshot-${snapshots.length}`,
    boardId: row.board_id,
    runId,
    kind,
    planningStatus: row.status,
    planningStage: row.stage,
    createdAt: "2026-06-16T00:00:00.000Z",
    cardCount: snapshotCards.length,
    readyCandidateCount: snapshotCards.filter((card) => card.status === "draft" && card.candidateStatus === "ready_to_create").length,
    ticketizedCount: 0,
    sourceHashes: [],
    cardIds: snapshotCards.map((card) => card.cardId),
    cards: snapshotCards,
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

function listQuestions(db: Database.Database, boardId: string): ProjectBoardQuestion[] {
  const rows = db
    .prepare("SELECT * FROM project_board_questions WHERE board_id = ? ORDER BY question_order ASC, created_at ASC, rowid ASC")
    .all(boardId) as Array<{ id: string; question: string; required: number; created_at: string; updated_at: string; answer: string | null; answered_at: string | null }>;
  return rows.map((row) => ({
    id: row.id,
    boardId,
    question: row.question,
    required: row.required === 1,
    answer: row.answer ?? undefined,
    answeredAt: row.answered_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function projectBoardSummary(db: Database.Database, id: string): ProjectBoardSummary {
  const row = db.prepare("SELECT * FROM project_boards WHERE id = ?").get(id) as
    | { id: string; project_path: string; title: string; summary: string; status: ProjectBoardSummary["status"]; created_at: string; updated_at: string }
    | undefined;
  if (!row) throw new Error(`Project board not found: ${id}`);
  return {
    id: row.id,
    projectPath: row.project_path,
    title: row.title,
    summary: row.summary,
    status: row.status,
    cards: [],
    sources: [],
    questions: listQuestions(db, id),
    proposals: [],
    events: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function readProposal(db: Database.Database, id: string): Record<string, unknown> {
  const row = db.prepare("SELECT * FROM project_board_synthesis_proposals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) throw new Error(`Proposal not found: ${id}`);
  return row;
}
