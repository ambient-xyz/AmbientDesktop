import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardSource } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import { mapProjectBoardSourceRow, type ProjectBoardSourceClassificationInput, type ProjectBoardSourceStoreRow } from "./projectBoardMappers";
import {
  ProjectStoreProjectBoardSourceRepository,
  type ProjectBoardSourceEventInput,
  type ProjectBoardSourceInput,
} from "./projectBoardSourceRepository";

describe("ProjectStoreProjectBoardSourceRepository", () => {
  let db: Database.Database;
  let cards: ProjectBoardCard[];
  let events: ProjectBoardSourceEventInput[];
  let repository: ProjectStoreProjectBoardSourceRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    cards = [];
    events = [];
    repository = new ProjectStoreProjectBoardSourceRepository(db, {
      listProjectBoardSources: (boardId) => listSources(db, boardId),
      listProjectBoardCards: () => cards,
      appendProjectBoardEvent: (event) => {
        events.push(event);
      },
    });
  });

  afterEach(() => {
    db.close();
  });

  it("replaces board sources, preserves matching source ids, and records refresh metadata", () => {
    const sources = repository.replaceProjectBoardSources("board-1", [
      sourceInput({
        kind: "thread",
        title: "Kickoff thread",
        summary: "Stakeholder notes.",
        threadId: "thread-1",
        relevance: 70,
      }),
      sourceInput({
        kind: "implementation_plan",
        title: "Migration plan",
        summary: "Plan of record.",
        threadId: "plan-thread",
        path: "docs/plan.md",
        relevance: 90,
      }),
    ]);

    expect(sources).toHaveLength(2);
    expect(boardSourceThreadId(db, "board-1")).toBe("plan-thread");
    expect(events[0]).toMatchObject({
      boardId: "board-1",
      kind: "sources_refreshed",
      metadata: expect.objectContaining({ nextCount: 2, newCount: 2, unchangedCount: 0, removedCount: 0 }),
    });

    const idsByTitle = new Map(sources.map((source) => [source.title, source.id]));
    events = [];
    const refreshed = repository.replaceProjectBoardSources("board-1", [
      sourceInput({
        kind: "thread",
        title: "Kickoff thread",
        summary: "Stakeholder notes.",
        threadId: "thread-1",
        relevance: 70,
      }),
      sourceInput({
        kind: "implementation_plan",
        title: "Migration plan",
        summary: "Plan of record.",
        threadId: "plan-thread",
        path: "docs/plan.md",
        relevance: 90,
      }),
    ]);

    expect(new Map(refreshed.map((source) => [source.title, source.id]))).toEqual(idsByTitle);
    expect(events[0]).toMatchObject({
      kind: "sources_refreshed",
      metadata: expect.objectContaining({ newCount: 0, unchangedCount: 2, removedCount: 0 }),
    });
  });

  it("updates user source classification and includes source-impact metadata", () => {
    const [source] = repository.replaceProjectBoardSources("board-1", [
      sourceInput({
        kind: "thread",
        title: "Kickoff thread",
        summary: "Stakeholder notes.",
        threadId: "thread-1",
        relevance: 70,
      }),
    ]);
    cards = [
      projectCard({
        id: "card-1",
        boardId: "board-1",
        status: "draft",
        sourceId: "manual:card-1",
        sourceRefs: [source.sourceKey ?? source.id],
      }),
    ];
    events = [];

    const updated = repository.updateProjectBoardSource({
      sourceId: source.id,
      kind: "ignored",
      includeInSynthesis: false,
    });

    expect(updated).toMatchObject({
      id: source.id,
      kind: "ignored",
      relevance: 0,
      classifiedBy: "user",
      includeInSynthesis: false,
      authorityRole: "ignored",
    });
    expect(repository.getProjectBoardSource(source.id)).toMatchObject({ id: source.id, kind: "ignored" });
    expect(events[0]).toMatchObject({
      kind: "source_updated",
      title: "Source reclassified",
      entityId: source.id,
      metadata: expect.objectContaining({
        from: "thread",
        to: "ignored",
        includeInSynthesis: false,
        sourceImpact: expect.objectContaining({
          sourceId: source.id,
          affectedDraftCount: 1,
          targetedRefreshOptional: true,
          existingCardsRewritten: false,
          modelCallRequired: false,
        }),
      }),
    });
  });

  it("applies Ambient/Pi classifications while preserving user-classified sources", () => {
    const sources = repository.replaceProjectBoardSources("board-1", [
      sourceInput({
        kind: "thread",
        title: "User controlled thread",
        summary: "Do not overwrite.",
        threadId: "thread-1",
        relevance: 60,
      }),
      sourceInput({
        kind: "markdown",
        title: "Spec note",
        summary: "Candidate spec.",
        path: "notes/spec.md",
        relevance: 55,
      }),
    ]);
    const userControlled = sources.find((source) => source.title === "User controlled thread")!;
    const piControlled = sources.find((source) => source.title === "Spec note")!;
    repository.updateProjectBoardSource({ sourceId: userControlled.id, kind: "ignored", includeInSynthesis: false });
    events = [];

    const inputs: ProjectBoardSourceClassificationInput[] = [
      {
        sourceId: userControlled.id,
        kind: "plan_artifact",
        classificationReason: "Looks like the plan.",
        classificationConfidence: 0.99,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "kimi",
      },
      {
        sourceKey: piControlled.sourceKey,
        kind: "functional_spec",
        classificationReason: "Describes product behavior.",
        classificationConfidence: 0.72,
        authorityRole: "primary",
        includeInSynthesis: true,
        model: "kimi",
      },
    ];

    const classified = repository.applyProjectBoardSourceClassifications("board-1", inputs);
    const preserved = classified.find((source) => source.id === userControlled.id)!;
    const updated = classified.find((source) => source.id === piControlled.id)!;

    expect(preserved).toMatchObject({
      kind: "ignored",
      classifiedBy: "user",
      includeInSynthesis: false,
    });
    expect(updated).toMatchObject({
      kind: "functional_spec",
      classifiedBy: "ambient_pi",
      classificationConfidence: 0.72,
      authorityRole: "primary",
      includeInSynthesis: true,
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "source_updated",
      title: "Sources classified by Pi",
      metadata: expect.objectContaining({
        classifiedBy: "ambient_pi",
        classificationCount: 1,
        sourceIds: [piControlled.id],
        sourceKinds: { functional_spec: 1 },
        model: "kimi",
      }),
    });
  });
});

function sourceInput(input: Partial<ProjectBoardSourceInput> & Pick<ProjectBoardSourceInput, "kind" | "title" | "summary">): ProjectBoardSourceInput {
  return {
    relevance: 50,
    ...input,
  };
}

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function listSources(db: Database.Database, boardId: string): ProjectBoardSource[] {
  const rows = db
    .prepare(
      `SELECT * FROM project_board_sources
       WHERE board_id = ?
       ORDER BY relevance DESC, updated_at DESC, title ASC`,
    )
    .all(boardId) as ProjectBoardSourceStoreRow[];
  return rows.map(mapProjectBoardSourceRow);
}

function boardSourceThreadId(db: Database.Database, boardId: string): string | undefined {
  return (db.prepare("SELECT source_thread_id FROM project_boards WHERE id = ?").get(boardId) as { source_thread_id: string | null } | undefined)
    ?.source_thread_id ?? undefined;
}

function projectCard(input: {
  id: string;
  boardId: string;
  status: ProjectBoardCard["status"];
  sourceId: string;
  sourceRefs: string[];
}): ProjectBoardCard {
  return {
    id: input.id,
    boardId: input.boardId,
    title: input.id,
    description: "",
    status: input.status,
    candidateStatus: "ready_to_create",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: { unit: [], integration: [], visual: [], manual: [] },
    sourceKind: "manual",
    sourceId: input.sourceId,
    sourceRefs: input.sourceRefs,
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
}
