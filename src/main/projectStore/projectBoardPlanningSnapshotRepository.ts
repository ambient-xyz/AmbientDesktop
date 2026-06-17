import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardPlanningSnapshot,
  ProjectBoardPlanningSnapshotCard,
  ProjectBoardPlanningSnapshotKind,
  ProjectBoardPlanningSnapshotSourceHash,
  ProjectBoardSynthesisRunEvent,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import { parseJsonArray } from "./projectStoreJson";
import { projectBoardPlanningScopeFromRunEvents } from "./projectStoreFacadeHelpers";
import {
  normalizeProjectBoardPlanningSnapshot,
  projectBoardPlanningStableHash,
  type ProjectBoardSynthesisRunStoreRow,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardPlanningSnapshotRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
}

export class ProjectStoreProjectBoardPlanningSnapshotRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardPlanningSnapshotRepositoryDeps,
  ) {}

  recordProjectBoardPlanningSnapshotForRun(
    runId: string,
    kind: ProjectBoardPlanningSnapshotKind = "manual",
  ): ProjectBoardPlanningSnapshot | undefined {
    return this.appendProjectBoardPlanningSnapshotForRun(runId, kind);
  }

  appendProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind): ProjectBoardPlanningSnapshot | undefined {
    const row = this.db.prepare("SELECT * FROM project_board_synthesis_runs WHERE id = ?").get(runId) as
      | ProjectBoardSynthesisRunStoreRow
      | undefined;
    if (!row) throw new Error(`Project board synthesis run not found: ${runId}`);
    const board = this.deps.getProjectBoard(row.board_id);
    if (!board) throw new Error(`Project board not found for synthesis run: ${row.board_id}`);
    const cards = board.cards
      .filter((card) => card.sourceKind === "board_synthesis" && card.status !== "archived")
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.id.localeCompare(right.id));
    if (cards.length === 0) return undefined;
    const sourceHashes: ProjectBoardPlanningSnapshotSourceHash[] = board.sources
      .map((source) => ({
        sourceId: source.id,
        kind: source.kind,
        ...(source.sourceKey ? { sourceKey: source.sourceKey } : {}),
        ...(source.path ? { path: source.path } : {}),
        ...(source.contentHash ? { contentHash: source.contentHash } : {}),
        ...(source.changeState ? { changeState: source.changeState } : {}),
        ...(typeof source.includeInSynthesis === "boolean" ? { includeInSynthesis: source.includeInSynthesis } : {}),
      }))
      .sort(
        (left, right) =>
          (left.path ?? "").localeCompare(right.path ?? "") ||
          (left.sourceKey ?? "").localeCompare(right.sourceKey ?? "") ||
          left.sourceId.localeCompare(right.sourceId),
      );
    const snapshotCards: ProjectBoardPlanningSnapshotCard[] = cards.map((card) => {
      const basis = {
        cardId: card.id,
        sourceId: card.sourceId,
        sourceKind: card.sourceKind,
        title: card.title,
        description: card.description,
        status: card.status,
        candidateStatus: card.candidateStatus,
        labels: card.labels,
        blockedBy: card.blockedBy,
        acceptanceCriteria: card.acceptanceCriteria,
        testPlan: card.testPlan,
        sourceRefs: card.sourceRefs ?? [],
        clarificationQuestionCount: card.clarificationQuestions?.length ?? 0,
        orchestrationTaskId: card.orchestrationTaskId ?? null,
      };
      return {
        cardId: card.id,
        sourceId: card.sourceId,
        sourceKind: card.sourceKind,
        title: card.title,
        status: card.status,
        candidateStatus: card.candidateStatus,
        sourceRefs: card.sourceRefs ?? [],
        blockedBy: card.blockedBy,
        renderFingerprint: projectBoardPlanningStableHash("planning-card", basis),
        ...(card.orchestrationTaskId ? { orchestrationTaskId: card.orchestrationTaskId } : {}),
      };
    });
    const now = new Date().toISOString();
    const runEvents = parseJsonArray<ProjectBoardSynthesisRunEvent>(row.events_json);
    const planningScope = projectBoardPlanningScopeFromRunEvents(runEvents);
    const snapshotBasis = {
      boardId: row.board_id,
      runId,
      planningStatus: row.status,
      planningStage: row.stage,
      sourceHashes,
      cards: snapshotCards,
      scopeContract: planningScope.scopeContract,
      planningDepth: planningScope.planningDepth,
    };
    const snapshot: ProjectBoardPlanningSnapshot = {
      id: randomUUID(),
      boardId: row.board_id,
      runId,
      kind,
      planningStatus: row.status,
      planningStage: row.stage,
      createdAt: now,
      cardCount: snapshotCards.length,
      readyCandidateCount: cards.filter((card) => card.status === "draft" && !card.orchestrationTaskId && card.candidateStatus === "ready_to_create").length,
      ticketizedCount: cards.filter((card) => Boolean(card.orchestrationTaskId)).length,
      sourceHashes,
      ...(planningScope.scopeContract ? { scopeContract: planningScope.scopeContract } : {}),
      ...(planningScope.planningDepth ? { planningDepth: planningScope.planningDepth } : {}),
      cardIds: snapshotCards.map((card) => card.cardId),
      cards: snapshotCards,
      renderFingerprint: projectBoardPlanningStableHash("planning-snapshot", snapshotBasis),
    };
    const existing = parseJsonArray<ProjectBoardPlanningSnapshot>(row.planning_snapshots_json ?? "[]").flatMap((entry) =>
      normalizeProjectBoardPlanningSnapshot(entry, row.updated_at),
    );
    const latest = existing.at(-1);
    if (
      latest &&
      latest.kind === snapshot.kind &&
      latest.planningStatus === snapshot.planningStatus &&
      latest.renderFingerprint === snapshot.renderFingerprint
    ) {
      return latest;
    }
    const next = [...existing, snapshot].slice(-50);
    this.db
      .prepare("UPDATE project_board_synthesis_runs SET planning_snapshots_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(next), now, runId);
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    return snapshot;
  }

  latestStableProjectBoardPlanningSnapshot(boardId: string): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ? AND status IN ('paused', 'succeeded')
         ORDER BY updated_at DESC, started_at DESC, rowid DESC
         LIMIT 20`,
      )
      .all(boardId) as ProjectBoardSynthesisRunStoreRow[];
    for (const row of rows) {
      const snapshots = parseJsonArray<ProjectBoardPlanningSnapshot>(row.planning_snapshots_json ?? "[]").flatMap((entry) =>
        normalizeProjectBoardPlanningSnapshot(entry, row.updated_at),
      );
      const stable = [...snapshots]
        .reverse()
        .find((snapshot) => snapshot.planningStatus === "paused" || snapshot.planningStatus === "succeeded");
      if (stable) return { runId: row.id, snapshot: stable };
    }
    return undefined;
  }
}
