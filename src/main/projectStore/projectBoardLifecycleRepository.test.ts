import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  ProjectStoreProjectBoardLifecycleRepository,
  type ProjectBoardLifecycleEventInput,
} from "./projectBoardLifecycleRepository";
import type { ProjectBoardCharterStoreRow, ProjectBoardStoreRow } from "./projectBoardMappers";

describe("ProjectStoreProjectBoardLifecycleRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardLifecycleEventInput[];
  let ensuredQuestions: string[];
  let repository: ProjectStoreProjectBoardLifecycleRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    events = [];
    ensuredQuestions = [];
    repository = new ProjectStoreProjectBoardLifecycleRepository(db, {
      getWorkspace: () => ({ name: "Ambient", path: "/workspace" }),
      getActiveProjectBoard: (sourceThreadId) => findActiveBoard(db, sourceThreadId),
      getProjectBoardForPath: (projectPath, sourceThreadId) => findActiveBoard(db, sourceThreadId, projectPath),
      mapProjectBoard: mapBoard,
      ensureProjectBoardQuestions: (boardId) => {
        ensuredQuestions.push(boardId);
      },
      appendProjectBoardEvent: (event) => {
        events.push(event);
        db.prepare(
          `INSERT INTO project_board_events
            (id, board_id, event_kind, title, summary, entity_kind, entity_id, metadata_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `event-${events.length}`,
          event.boardId,
          event.kind,
          event.title,
          event.summary,
          event.entityKind ?? null,
          event.entityId ?? null,
          JSON.stringify(event.metadata ?? {}),
          event.createdAt ?? "2026-06-16T00:00:00.000Z",
        );
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates, replaces, updates status, and resets project boards", () => {
    const created = repository.createProjectBoard({
      title: "  Lifecycle board  ",
      summary: "  Coordinate work.  ",
    });

    expect(created).toMatchObject({
      projectPath: "/workspace",
      status: "draft",
      title: "Lifecycle board",
      summary: "Coordinate work.",
    });
    expect(created.charterId).toEqual(expect.any(String));
    expect(ensuredQuestions).toEqual([created.id]);
    expect(events[0]).toMatchObject({
      boardId: created.id,
      kind: "board_created",
      metadata: expect.objectContaining({ status: "draft", charterId: created.charterId }),
    });
    expect(getCharter(db, created.charterId!)).toMatchObject({ board_id: created.id, version: 1, status: "draft" });

    const duplicate = repository.createProjectBoard({ title: "Ignored duplicate" });
    expect(duplicate.id).toBe(created.id);
    expect(countRows(db, "project_boards")).toBe(1);

    const replacement = repository.createProjectBoard({
      title: "Replacement board",
      replaceActive: true,
    });
    expect(replacement.id).not.toBe(created.id);
    expect(boardStatus(db, created.id)).toBe("archived");
    expect(replacement).toMatchObject({ status: "draft", title: "Replacement board" });

    const active = repository.updateProjectBoardStatus(replacement.id, "active");
    expect(active.status).toBe("active");
    expect(events.at(-1)).toMatchObject({
      kind: "status_changed",
      metadata: expect.objectContaining({ from: "draft", to: "active" }),
    });

    const unchanged = repository.updateProjectBoardStatus(replacement.id, "active");
    expect(unchanged.status).toBe("active");
    expect(events.filter((event) => event.kind === "status_changed")).toHaveLength(1);

    repository.resetProjectBoard(replacement.id);
    expect(findBoardRow(db, replacement.id)).toBeUndefined();
    expect(() => repository.resetProjectBoard(replacement.id)).toThrow(`Project board not found: ${replacement.id}`);
  });

  it("starts and cancels board revisions with persisted charter history", () => {
    const board = repository.createProjectBoard({ title: "Revision board" });
    const active = repository.updateProjectBoardStatus(board.id, "active");
    const originalCharterId = active.charterId!;
    db.prepare("UPDATE project_board_charters SET goal = ? WHERE id = ?").run("Original goal", originalCharterId);

    const revision = repository.startProjectBoardRevision({
      boardId: board.id,
      reason: "  Reframe the project scope.  ",
    });

    expect(revision).toMatchObject({
      id: board.id,
      status: "draft",
      summary: "Reframe the project scope.",
    });
    expect(revision.charterId).not.toBe(originalCharterId);
    expect(ensuredQuestions).toEqual([board.id, board.id]);
    expect(listCharterVersions(db, board.id)).toEqual([
      { id: originalCharterId, version: 1, status: "superseded" },
      { id: revision.charterId!, version: 2, status: "draft" },
    ]);
    expect(events.at(-1)).toMatchObject({
      kind: "board_revision_started",
      entityId: revision.charterId,
      metadata: expect.objectContaining({ previousCharterId: originalCharterId, version: 2 }),
    });

    const canceled = repository.cancelProjectBoardRevision(board.id);

    expect(canceled).toMatchObject({
      id: board.id,
      status: "active",
      charterId: originalCharterId,
      summary: "Original goal",
    });
    expect(listCharterVersions(db, board.id)).toEqual([
      { id: originalCharterId, version: 1, status: "active" },
      { id: revision.charterId!, version: 2, status: "superseded" },
    ]);
    expect(events.at(-1)).toMatchObject({
      title: "Board revision canceled",
      entityId: originalCharterId,
      metadata: expect.objectContaining({ restoredCharterId: originalCharterId, canceledCharterId: revision.charterId }),
    });
  });
});

function mapBoard(row: ProjectBoardStoreRow): ProjectBoardSummary {
  return {
    id: row.id,
    projectPath: row.project_path,
    sourceThreadId: row.source_thread_id ?? undefined,
    status: row.status,
    title: row.title,
    summary: row.summary,
    charterId: row.charter_id ?? undefined,
    activeDraftId: row.active_draft_id ?? undefined,
    cards: [],
    sources: [],
    questions: [],
    proposals: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    claims: { active: [], expired: [], conflicts: [] },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function findActiveBoard(db: Database.Database, sourceThreadId?: string, projectPath = "/workspace"): ProjectBoardSummary | undefined {
  const row = db
    .prepare(
      `SELECT * FROM project_boards
       WHERE project_path = ?
         AND status IN ('draft', 'active', 'paused')
         AND (? IS NULL OR source_thread_id = ?)
       ORDER BY updated_at DESC, rowid DESC
       LIMIT 1`,
    )
    .get(projectPath, sourceThreadId ?? null, sourceThreadId ?? null) as ProjectBoardStoreRow | undefined;
  return row ? mapBoard(row) : undefined;
}

function findBoardRow(db: Database.Database, boardId: string): ProjectBoardStoreRow | undefined {
  return db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
}

function getCharter(db: Database.Database, charterId: string): ProjectBoardCharterStoreRow | undefined {
  return db.prepare("SELECT * FROM project_board_charters WHERE id = ?").get(charterId) as ProjectBoardCharterStoreRow | undefined;
}

function boardStatus(db: Database.Database, boardId: string): string | undefined {
  return (db.prepare("SELECT status FROM project_boards WHERE id = ?").get(boardId) as { status: string } | undefined)?.status;
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

function listCharterVersions(db: Database.Database, boardId: string): Array<{ id: string; version: number; status: string }> {
  return db
    .prepare("SELECT id, version, status FROM project_board_charters WHERE board_id = ? ORDER BY version ASC")
    .all(boardId) as Array<{ id: string; version: number; status: string }>;
}
