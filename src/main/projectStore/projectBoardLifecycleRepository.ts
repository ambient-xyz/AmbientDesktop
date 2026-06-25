import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardCharterProjectSummary,
  ProjectBoardEvent,
  ProjectBoardQuestion,
  ProjectBoardSource,
  ProjectBoardStatus,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { WorkspaceState } from "../../shared/workspaceTypes";
import { parseJsonObject, parseStringList } from "./projectStoreJson";
import type { ProjectBoardCharterStoreRow, ProjectBoardStoreRow } from "./projectBoardMappers";
import { buildProjectBoardCharterProjectSummary, compileProjectBoardCharter } from "./projectBoardMappers";
import { ProjectStoreProjectBoardLifecycleRevisionRepository } from "./projectBoardLifecycleRevisionRepository";

export type ProjectBoardLifecycleEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardLifecycleRepositoryDeps {
  getWorkspace(): Pick<WorkspaceState, "name" | "path">;
  getActiveProjectBoard(sourceThreadId?: string): ProjectBoardSummary | undefined;
  getProjectBoardForPath(projectPath: string, sourceThreadId?: string): ProjectBoardSummary | undefined;
  mapProjectBoard(row: ProjectBoardStoreRow): ProjectBoardSummary;
  ensureProjectBoardQuestions(boardId: string): void;
  listProjectBoardQuestions(boardId: string): ProjectBoardQuestion[];
  listProjectBoardSources(boardId: string): ProjectBoardSource[];
  appendProjectBoardEvent(input: ProjectBoardLifecycleEventInput): void;
}

export class ProjectStoreProjectBoardLifecycleRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardLifecycleRepositoryDeps,
  ) {}

  createProjectBoard(
    input: { title?: string; summary?: string; replaceActive?: boolean; sourceThreadId?: string } = {},
  ): ProjectBoardSummary {
    const project = this.deps.getWorkspace();
    const sourceThreadId = input.sourceThreadId?.trim() || undefined;
    const existing = this.deps.getActiveProjectBoard(sourceThreadId);
    if (existing && !input.replaceActive) return existing;

    const now = new Date().toISOString();
    const boardId = randomUUID();
    const charterId = randomUUID();
    const title = input.title?.trim() || `${project.name} board`;
    const summary = input.summary?.trim() || "Project board kickoff draft.";
    const markdown = [
      `# ${title}`,
      "",
      "## Vision",
      "",
      "Draft charter created by Build Board. The kickoff interview will fill this in before cards are executed.",
      "",
      "## Scope",
      "",
      "- Confirm project goal",
      "- Identify background artifacts and plans",
      "- Ticketize validated work with dependencies and test expectations",
    ].join("\n");

    try {
      const transaction = this.db.transaction(() => {
        if (existing && input.replaceActive) {
          this.db.prepare("UPDATE project_boards SET status = 'archived', updated_at = ? WHERE id = ?").run(now, existing.id);
        }
        this.db
          .prepare(
            `INSERT INTO project_boards
            (id, project_path, source_thread_id, status, title, summary, charter_id, active_draft_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(boardId, project.path, sourceThreadId ?? null, "draft", title, summary, charterId, null, now, now);
        this.db
          .prepare(
            `INSERT INTO project_board_charters
            (id, board_id, version, status, goal, current_state, target_user, non_goals_json, quality_bar,
             test_policy_json, decision_policy_json, dependency_policy_json, budget_policy_json, source_policy_json,
             markdown, project_summary_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            charterId,
            boardId,
            1,
            "draft",
            "",
            "",
            "",
            JSON.stringify([]),
            "",
            JSON.stringify({ unit: true, integration: true, visual: true, liveSmoke: "recommended" }),
            JSON.stringify({ default: "ask_when_ambiguous", fallback: "document_assumption" }),
            JSON.stringify({ ordering: "blockers_first", parallelism: "safe_independent_cards" }),
            JSON.stringify({ maxPassesPerCard: 6, maxRuntimeMsPerCard: 1_200_000, pauseOnTerminalBlocker: true }),
            JSON.stringify({ includeThreads: true, includeMarkdown: true, requireUserApproval: true }),
            markdown,
            null,
            now,
            now,
          );
        this.deps.appendProjectBoardEvent({
          boardId,
          kind: "board_created",
          title: "Board created",
          summary: `Created kickoff draft for ${title}.`,
          entityKind: "project_board",
          entityId: boardId,
          metadata: { status: "draft", charterId },
          createdAt: now,
        });
      });
      transaction();
      this.deps.ensureProjectBoardQuestions(boardId);
    } catch (error) {
      const raced = this.deps.getActiveProjectBoard(sourceThreadId);
      if (raced && !input.replaceActive) return raced;
      throw error;
    }

    const created = this.deps.getProjectBoardForPath(project.path, sourceThreadId);
    if (!created) throw new Error("Project board was not created.");
    return created;
  }

  updateProjectBoardStatus(boardId: string, status: ProjectBoardStatus): ProjectBoardSummary {
    const current = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!current) throw new Error(`Project board not found: ${boardId}`);
    const now = new Date().toISOString();
    const result = this.db.prepare("UPDATE project_boards SET status = ?, updated_at = ? WHERE id = ?").run(status, now, boardId);
    if (result.changes === 0) throw new Error(`Project board not found: ${boardId}`);
    if (current.status !== status) {
      this.deps.appendProjectBoardEvent({
        boardId,
        kind: "status_changed",
        title: "Board status changed",
        summary: `Board moved from ${current.status} to ${status}.`,
        entityKind: "project_board",
        entityId: boardId,
        metadata: { from: current.status, to: status },
        createdAt: now,
      });
    }
    const row = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!row) throw new Error(`Project board not found: ${boardId}`);
    return this.deps.mapProjectBoard(row);
  }

  finalizeProjectBoardKickoff(boardId: string): ProjectBoardSummary {
    const boardRow = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!boardRow) throw new Error(`Project board not found: ${boardId}`);
    const questions = this.deps.listProjectBoardQuestions(boardId);
    const unanswered = questions.filter((question) => question.required && !question.answer?.trim());
    if (unanswered.length > 0) throw new Error("Answer required kickoff questions before finalizing the project board.");
    const charterId = boardRow.charter_id;
    if (!charterId) throw new Error("Project board has no charter to finalize.");
    const charterRow = this.db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(charterId) as
      | ProjectBoardCharterStoreRow
      | undefined;
    if (!charterRow) throw new Error(`Project board charter not found: ${charterId}`);
    const sources = this.deps.listProjectBoardSources(boardId);
    const now = new Date().toISOString();
    const compiled = compileProjectBoardCharter(boardRow, questions, sources);
    const projectSummary = buildProjectBoardCharterProjectSummary({
      board: boardRow,
      questions,
      sources,
      compiled,
      generatedAt: now,
    });
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE project_board_charters SET status = 'superseded', updated_at = ? WHERE board_id = ? AND id != ? AND status IN ('active', 'draft')",
        )
        .run(now, boardId, charterId);
      this.db
        .prepare(
          `UPDATE project_board_charters
           SET status = 'active',
               goal = ?,
               current_state = ?,
               target_user = ?,
               non_goals_json = ?,
               quality_bar = ?,
               test_policy_json = ?,
               decision_policy_json = ?,
               dependency_policy_json = ?,
               budget_policy_json = ?,
               source_policy_json = ?,
               markdown = ?,
               project_summary_json = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(
          compiled.goal,
          compiled.currentState,
          compiled.targetUser,
          JSON.stringify(compiled.nonGoals),
          compiled.qualityBar,
          JSON.stringify(compiled.testPolicy),
          JSON.stringify(compiled.decisionPolicy),
          JSON.stringify(compiled.dependencyPolicy),
          JSON.stringify(compiled.budgetPolicy),
          JSON.stringify(compiled.sourcePolicy),
          compiled.markdown,
          JSON.stringify(projectSummary),
          now,
          charterId,
        );
      this.db
        .prepare("UPDATE project_boards SET status = 'active', summary = ?, updated_at = ? WHERE id = ?")
        .run(compiled.summary, now, boardId);
      this.deps.appendProjectBoardEvent({
        boardId,
        kind: "charter_finalized",
        title: "Charter finalized",
        summary: compiled.goal,
        entityKind: "project_board_charter",
        entityId: charterId,
        metadata: {
          charterId,
          version: charterRow.version,
          sourceCount: sources.length,
          projectSummaryGenerator: projectSummary.generator,
        },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!updated) throw new Error(`Project board not found after finalization: ${boardId}`);
    return this.deps.mapProjectBoard(updated);
  }

  buildActiveProjectBoardCharterProjectSummary(boardId: string, generatedAt = new Date().toISOString()): ProjectBoardCharterProjectSummary {
    const boardRow = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!boardRow) throw new Error(`Project board not found: ${boardId}`);
    const charterId = boardRow.charter_id;
    if (!charterId) throw new Error("Project board has no active charter.");
    const charterRow = this.db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(charterId) as
      | ProjectBoardCharterStoreRow
      | undefined;
    if (!charterRow) throw new Error(`Project board charter not found: ${charterId}`);
    const questions = this.deps.listProjectBoardQuestions(boardId);
    const sources = this.deps.listProjectBoardSources(boardId);
    return buildProjectBoardCharterProjectSummary({
      board: boardRow,
      questions,
      sources,
      compiled: {
        goal: charterRow.goal,
        currentState: charterRow.current_state,
        targetUser: charterRow.target_user,
        nonGoals: parseStringList(charterRow.non_goals_json),
        qualityBar: charterRow.quality_bar,
        testPolicy: parseJsonObject<Record<string, unknown>>(charterRow.test_policy_json, {}),
        decisionPolicy: parseJsonObject<Record<string, unknown>>(charterRow.decision_policy_json, {}),
        dependencyPolicy: parseJsonObject<Record<string, unknown>>(charterRow.dependency_policy_json, {}),
        budgetPolicy: parseJsonObject<Record<string, unknown>>(charterRow.budget_policy_json, {}),
        sourcePolicy: parseJsonObject<Record<string, unknown>>(charterRow.source_policy_json, {}),
        summary: charterRow.goal.slice(0, 500),
        markdown: charterRow.markdown,
      },
      generatedAt,
    });
  }

  updateProjectBoardCharterProjectSummary(input: {
    boardId: string;
    summary: ProjectBoardCharterProjectSummary;
    title?: string;
    eventSummary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): ProjectBoardSummary {
    const boardRow = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!boardRow) throw new Error(`Project board not found: ${input.boardId}`);
    const charterId = boardRow.charter_id;
    if (!charterId) throw new Error("Project board has no active charter.");
    const now = input.createdAt ?? new Date().toISOString();
    const transaction = this.db.transaction(() => {
      const result = this.db
        .prepare("UPDATE project_board_charters SET project_summary_json = ?, updated_at = ? WHERE id = ?")
        .run(JSON.stringify(input.summary), now, charterId);
      if (result.changes <= 0) throw new Error(`Project board charter not found: ${charterId}`);
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "charter_summary_refreshed",
        title: input.title?.trim() || "Charter project summary refreshed",
        summary: input.eventSummary?.trim() || `Updated active charter project summary using ${input.summary.generator}.`,
        entityKind: "project_board_charter",
        entityId: charterId,
        metadata: {
          generator: input.summary.generator,
          sourceChecksumCount: input.summary.sourceChecksumSet.length,
          charterAnswerChecksum: input.summary.charterAnswerChecksum,
          ...(input.metadata ?? {}),
        },
        createdAt: now,
      });
    });
    transaction();
    const updated = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!updated) throw new Error(`Project board not found after charter summary update: ${input.boardId}`);
    return this.deps.mapProjectBoard(updated);
  }

  resetProjectBoard(boardId: string): void {
    const board = this.db.prepare("SELECT id FROM project_boards WHERE id = ?").get(boardId) as { id: string } | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);

    const transaction = this.db.transaction(() => {
      for (const table of [
        "project_board_synthesis_runs",
        "project_board_synthesis_proposals",
        "project_board_execution_artifacts",
        "project_board_events",
        "project_board_questions",
        "project_board_sources",
        "project_board_cards",
        "project_board_charters",
      ]) {
        this.db.prepare(`DELETE FROM ${table} WHERE board_id = ?`).run(boardId);
      }
      const result = this.db.prepare("DELETE FROM project_boards WHERE id = ?").run(boardId);
      if (result.changes === 0) throw new Error(`Project board not found: ${boardId}`);
    });
    transaction();
  }

  startProjectBoardRevision(input: { boardId: string; reason?: string }): ProjectBoardSummary {
    return this.revisions().startProjectBoardRevision(input);
  }

  cancelProjectBoardRevision(boardId: string): ProjectBoardSummary {
    return this.revisions().cancelProjectBoardRevision(boardId);
  }

  private revisions(): ProjectStoreProjectBoardLifecycleRevisionRepository {
    return new ProjectStoreProjectBoardLifecycleRevisionRepository(this.db, this.deps);
  }
}
