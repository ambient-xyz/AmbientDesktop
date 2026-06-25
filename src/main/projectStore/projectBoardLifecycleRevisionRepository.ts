import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { parseJsonObject } from "./projectStoreJson";
import type { ProjectBoardCharterStoreRow, ProjectBoardEventStoreRow, ProjectBoardStoreRow } from "./projectBoardMappers";

export type ProjectBoardLifecycleRevisionEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardLifecycleRevisionRepositoryDeps {
  mapProjectBoard(row: ProjectBoardStoreRow): ProjectBoardSummary;
  ensureProjectBoardQuestions(boardId: string): void;
  appendProjectBoardEvent(input: ProjectBoardLifecycleRevisionEventInput): void;
}

export class ProjectStoreProjectBoardLifecycleRevisionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardLifecycleRevisionRepositoryDeps,
  ) {}

  startProjectBoardRevision(input: { boardId: string; reason?: string }): ProjectBoardSummary {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(input.boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot be revised.");
    const currentCharter = board.charter_id
      ? (this.db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(board.charter_id) as
          | ProjectBoardCharterStoreRow
          | undefined)
      : undefined;
    if (board.status === "draft" && currentCharter?.status === "draft") {
      return this.deps.mapProjectBoard(board);
    }
    this.deps.ensureProjectBoardQuestions(board.id);
    const latest = this.db.prepare("SELECT MAX(version) AS version FROM project_board_charters WHERE board_id = ?").get(board.id) as
      | { version: number | null }
      | undefined;
    const version = (latest?.version ?? 0) + 1;
    const now = new Date().toISOString();
    const charterId = randomUUID();
    const reason = input.reason?.trim() || "Board revision started for major project changes.";
    const markdown = [
      `# ${board.title}`,
      "",
      `## Revision ${version}`,
      "",
      reason,
      "",
      currentCharter?.markdown || "Answer the kickoff interview to update the project charter.",
    ].join("\n");
    const transaction = this.db.transaction(() => {
      this.db
        .prepare(
          "UPDATE project_board_charters SET status = 'superseded', updated_at = ? WHERE board_id = ? AND status IN ('active', 'draft')",
        )
        .run(now, board.id);
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
          board.id,
          version,
          "draft",
          currentCharter?.goal ?? "",
          currentCharter?.current_state ?? "",
          currentCharter?.target_user ?? "",
          currentCharter?.non_goals_json ?? JSON.stringify([]),
          currentCharter?.quality_bar ?? "",
          currentCharter?.test_policy_json ??
            JSON.stringify({
              unit: true,
              integration: true,
              visual: true,
              liveSmoke: "recommended",
              proofScopeWarningPolicy: "advisory",
            }),
          currentCharter?.decision_policy_json ?? JSON.stringify({ default: "ask_when_ambiguous", fallback: "document_assumption" }),
          currentCharter?.dependency_policy_json ?? JSON.stringify({ ordering: "blockers_first", parallelism: "safe_independent_cards" }),
          currentCharter?.budget_policy_json ??
            JSON.stringify({ maxPassesPerCard: 6, maxRuntimeMsPerCard: 1_200_000, pauseOnTerminalBlocker: true }),
          currentCharter?.source_policy_json ?? JSON.stringify({ includeThreads: true, includeMarkdown: true, requireUserApproval: true }),
          markdown,
          null,
          now,
          now,
        );
      this.db
        .prepare("UPDATE project_boards SET status = 'draft', charter_id = ?, summary = ?, updated_at = ? WHERE id = ?")
        .run(charterId, reason.slice(0, 500), now, board.id);
      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "board_revision_started",
        title: "Board revision started",
        summary: reason.slice(0, 500),
        entityKind: "project_board_charter",
        entityId: charterId,
        metadata: { charterId, previousCharterId: currentCharter?.id, version },
        createdAt: now,
      });
    });
    transaction();
    const row = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(board.id) as ProjectBoardStoreRow | undefined;
    if (!row) throw new Error(`Project board not found after revision: ${board.id}`);
    return this.deps.mapProjectBoard(row);
  }

  cancelProjectBoardRevision(boardId: string): ProjectBoardSummary {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status !== "draft") return this.deps.mapProjectBoard(board);
    const draftCharter = board.charter_id
      ? (this.db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(board.charter_id) as
          | ProjectBoardCharterStoreRow
          | undefined)
      : undefined;
    if (!draftCharter || draftCharter.version <= 1) return this.deps.mapProjectBoard(board);
    const revisionEvent = this.db
      .prepare(
        `SELECT * FROM project_board_events
         WHERE board_id = ? AND event_kind = 'board_revision_started' AND entity_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT 1`,
      )
      .get(board.id, draftCharter.id) as ProjectBoardEventStoreRow | undefined;
    const previousCharterId = revisionEvent
      ? parseJsonObject<{ previousCharterId?: string }>(revisionEvent.metadata_json, {}).previousCharterId
      : undefined;
    const previousCharter = previousCharterId
      ? (this.db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(previousCharterId) as
          | ProjectBoardCharterStoreRow
          | undefined)
      : (this.db
          .prepare("SELECT * FROM project_board_charters WHERE board_id = ? AND id != ? ORDER BY version DESC, updated_at DESC")
          .get(board.id, draftCharter.id) as ProjectBoardCharterStoreRow | undefined);
    if (!previousCharter) return this.deps.mapProjectBoard(board);
    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE project_board_charters SET status = 'superseded', updated_at = ? WHERE id = ?").run(now, draftCharter.id);
      this.db.prepare("UPDATE project_board_charters SET status = 'active', updated_at = ? WHERE id = ?").run(now, previousCharter.id);
      this.db
        .prepare("UPDATE project_boards SET status = 'active', charter_id = ?, summary = ?, updated_at = ? WHERE id = ?")
        .run(previousCharter.id, previousCharter.goal || board.summary, now, board.id);
      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "board_revision_started",
        title: "Board revision canceled",
        summary: "Restored the previous active project charter.",
        entityKind: "project_board_charter",
        entityId: previousCharter.id,
        metadata: { restoredCharterId: previousCharter.id, canceledCharterId: draftCharter.id },
        createdAt: now,
      });
    });
    transaction();
    const row = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(board.id) as ProjectBoardStoreRow | undefined;
    if (!row) throw new Error(`Project board not found after canceling revision: ${board.id}`);
    return this.deps.mapProjectBoard(row);
  }
}
