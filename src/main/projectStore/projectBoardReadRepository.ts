import type Database from "better-sqlite3";
import {
  mapProjectBoardCardRow,
  mapProjectBoardEventRow,
  mapProjectBoardExecutionArtifactRow,
  mapProjectBoardQuestionRow,
  mapProjectBoardRow,
  mapProjectBoardSourceRow,
  mapProjectBoardSynthesisProposalRow,
  mapProjectBoardSynthesisRunRow,
  projectBoardCardsWithClaimSummaries,
  projectBoardClaimSummaryFromEvents,
  type OrchestrationTask,
  type ProjectBoardCard,
  type ProjectBoardCardStoreRow,
  type ProjectBoardCharter,
  type ProjectBoardEvent,
  type ProjectBoardEventStoreRow,
  type ProjectBoardExecutionArtifact,
  type ProjectBoardExecutionArtifactStoreRow,
  type ProjectBoardQuestion,
  type ProjectBoardQuestionStoreRow,
  type ProjectBoardSource,
  type ProjectBoardSourceStoreRow,
  type ProjectBoardStoreRow,
  type ProjectBoardSummary,
  type ProjectBoardSynthesisProposal,
  type ProjectBoardSynthesisProposalStoreRow,
  type ProjectBoardSynthesisRun,
  type ProjectBoardSynthesisRunStoreRow,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardReadRepositoryDeps {
  getProjectBoardCharter(charterId: string): ProjectBoardCharter;
  listOrchestrationTasks(): OrchestrationTask[];
}

export class ProjectStoreProjectBoardReadRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardReadRepositoryDeps,
  ) {}

  findActiveProjectBoardRow(projectPath: string, sourceThreadId?: string): ProjectBoardStoreRow | undefined {
    const trimmedThreadId = sourceThreadId?.trim();
    let row = trimmedThreadId
      ? (this.db
          .prepare(
            `SELECT * FROM project_boards
             WHERE project_path = ?
               AND source_thread_id = ?
               AND status IN ('draft', 'active', 'paused')
             ORDER BY updated_at DESC, rowid DESC
             LIMIT 1`,
          )
          .get(projectPath, trimmedThreadId) as ProjectBoardStoreRow | undefined)
      : undefined;
    row ??= this.db
      .prepare(
        `SELECT * FROM project_boards
         WHERE project_path = ?
           AND status IN ('draft', 'active', 'paused')
           AND (? IS NULL OR source_thread_id IS NULL)
         ORDER BY updated_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(projectPath, trimmedThreadId ?? null) as ProjectBoardStoreRow | undefined;
    return row;
  }

  getProjectBoardRow(boardId: string): ProjectBoardStoreRow | undefined {
    return this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
  }

  mapProjectBoard(row: ProjectBoardStoreRow): ProjectBoardSummary {
    const events = this.listProjectBoardEvents(row.id);
    const claims = projectBoardClaimSummaryFromEvents(events);
    const cards = projectBoardCardsWithClaimSummaries(this.listProjectBoardCards(row.id), claims);
    return mapProjectBoardRow({
      row,
      charter: row.charter_id ? this.deps.getProjectBoardCharter(row.charter_id) : undefined,
      cards,
      sources: this.listProjectBoardSources(row.id),
      questions: this.listProjectBoardQuestions(row.id),
      proposals: this.listProjectBoardSynthesisProposals(row.id),
      synthesisRuns: this.listProjectBoardSynthesisRuns(row.id),
      executionArtifacts: this.listProjectBoardExecutionArtifacts(row.id),
      events,
      claims,
    });
  }

  listProjectBoardCards(boardId: string): ProjectBoardCard[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ? AND status != 'archived'
         ORDER BY
           CASE status
             WHEN 'blocked' THEN 0
             WHEN 'draft' THEN 1
             WHEN 'ready' THEN 2
             WHEN 'in_progress' THEN 3
             WHEN 'review' THEN 4
             WHEN 'done' THEN 5
             ELSE 6
           END,
           priority IS NULL,
           priority ASC,
           updated_at DESC`,
      )
      .all(boardId) as ProjectBoardCardStoreRow[];
    const tasks = rows.some((row) => row.orchestration_task_id) ? this.deps.listOrchestrationTasks() : [];
    return rows.map((row) => this.mapProjectBoardCard(row, tasks));
  }

  mapProjectBoardCard(row: ProjectBoardCardStoreRow, tasks: OrchestrationTask[] = []): ProjectBoardCard {
    return mapProjectBoardCardRow(row, tasks);
  }

  getProjectBoardCard(cardId: string): ProjectBoardCard {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as
      | ProjectBoardCardStoreRow
      | undefined;
    if (!row) throw new Error(`Project board card not found: ${cardId}`);
    return this.mapProjectBoardCard(row, this.deps.listOrchestrationTasks());
  }

  tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as
      | ProjectBoardCardStoreRow
      | undefined;
    return row ? this.mapProjectBoardCard(row, this.deps.listOrchestrationTasks()) : undefined;
  }

  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined {
    const row = this.db
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(taskId) as ProjectBoardCardStoreRow | undefined;
    return row ? this.mapProjectBoardCard(row, this.deps.listOrchestrationTasks()) : undefined;
  }

  getProjectBoardCardForExecutionThread(threadId: string): ProjectBoardCard | undefined {
    const row = this.db
      .prepare("SELECT * FROM project_board_cards WHERE execution_thread_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(threadId) as ProjectBoardCardStoreRow | undefined;
    return row ? this.mapProjectBoardCard(row, this.deps.listOrchestrationTasks()) : undefined;
  }

  listProjectBoardSources(boardId: string): ProjectBoardSource[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_sources
         WHERE board_id = ?
         ORDER BY relevance DESC, updated_at DESC, title ASC`,
      )
      .all(boardId) as ProjectBoardSourceStoreRow[];
    return rows.map(mapProjectBoardSourceRow);
  }

  listProjectBoardQuestions(boardId: string): ProjectBoardQuestion[] {
    const rows = this.db
      .prepare("SELECT * FROM project_board_questions WHERE board_id = ? ORDER BY question_order ASC, rowid ASC")
      .all(boardId) as ProjectBoardQuestionStoreRow[];
    const sources = rows.some((row) => row.suggestion_context_fingerprint) ? this.listProjectBoardSources(boardId) : undefined;
    return rows.map((row) => mapProjectBoardQuestionRow(row, sources));
  }

  listProjectBoardEvents(boardId: string, limit = 80): ProjectBoardEvent[] {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const rows = this.db
      .prepare("SELECT * FROM project_board_events WHERE board_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?")
      .all(boardId, boundedLimit) as ProjectBoardEventStoreRow[];
    return rows.map(mapProjectBoardEventRow);
  }

  listProjectBoardSynthesisProposals(boardId: string, limit = 20): ProjectBoardSynthesisProposal[] {
    const boundedLimit = Math.max(1, Math.min(limit, 50));
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_synthesis_proposals
         WHERE board_id = ?
         ORDER BY
           CASE status
             WHEN 'pending' THEN 0
             WHEN 'applied' THEN 1
             WHEN 'superseded' THEN 2
             ELSE 3
           END,
           created_at DESC,
           rowid DESC
         LIMIT ?`,
      )
      .all(boardId, boundedLimit) as ProjectBoardSynthesisProposalStoreRow[];
    return rows.map(this.mapProjectBoardSynthesisProposal);
  }

  mapProjectBoardSynthesisProposal(row: ProjectBoardSynthesisProposalStoreRow): ProjectBoardSynthesisProposal {
    return mapProjectBoardSynthesisProposalRow(row);
  }

  listProjectBoardSynthesisRuns(boardId: string, limit = 10): ProjectBoardSynthesisRun[] {
    const boundedLimit = Math.max(1, Math.min(limit, 30));
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_synthesis_runs
         WHERE board_id = ?
         ORDER BY started_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(boardId, boundedLimit) as ProjectBoardSynthesisRunStoreRow[];
    return rows.map(this.mapProjectBoardSynthesisRun);
  }

  mapProjectBoardSynthesisRun(row: ProjectBoardSynthesisRunStoreRow): ProjectBoardSynthesisRun {
    return mapProjectBoardSynthesisRunRow(row);
  }

  listProjectBoardExecutionArtifacts(boardId: string, limit = 40): ProjectBoardExecutionArtifact[] {
    const boundedLimit = Math.max(1, Math.min(limit, 200));
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_execution_artifacts
         WHERE board_id = ?
         ORDER BY updated_at DESC, rowid DESC
         LIMIT ?`,
      )
      .all(boardId, boundedLimit) as ProjectBoardExecutionArtifactStoreRow[];
    return rows.map(mapProjectBoardExecutionArtifactRow);
  }
}
