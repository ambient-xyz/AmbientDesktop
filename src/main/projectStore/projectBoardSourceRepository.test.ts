import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardCard, ProjectBoardCardRunFeedback, ProjectBoardEvent, ProjectBoardSource, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import { applyProjectStoreBootstrapSchema } from "./projectStoreSchema";
import {
  mapProjectBoardCardRow,
  mapProjectBoardSourceRow,
  type ProjectBoardCardStoreRow,
  type ProjectBoardSourceClassificationInput,
  type ProjectBoardSourceStoreRow,
} from "./projectBoardMappers";
import {
  ProjectStoreProjectBoardSourceRepository,
  type ProjectBoardSourceInput,
} from "./projectBoardSourceRepository";

describe("ProjectStoreProjectBoardSourceRepository", () => {
  let db: Database.Database;
  let cards: ProjectBoardCard[];
  let events: ProjectBoardEvent[];
  let repository: ProjectStoreProjectBoardSourceRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    cards = [];
    events = [];
    repository = new ProjectStoreProjectBoardSourceRepository(db, {
      getProjectBoard: (boardId) => projectBoardSummary(db, boardId, events),
      getProjectBoardCard: (cardId) => getCard(db, cardId),
      listProjectBoardEvents: (boardId, limit = 80) => events.filter((event) => event.boardId === boardId).slice(0, limit),
      listProjectBoardSources: (boardId) => listSources(db, boardId),
      listProjectBoardCards: (boardId) => [...cards.filter((card) => card.boardId === boardId), ...listCards(db, boardId)],
      addProjectBoardCardRunFeedback: (input) => addRunFeedback(db, input),
      appendProjectBoardEvent: (event) => {
        events.push({
          id: `event-${events.length + 1}`,
          createdAt: event.createdAt ?? `2026-06-16T00:00:0${events.length}.000Z`,
          ...event,
        });
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

  it("owns source draft Pi refresh proposal persistence", () => {
    const sources = repository.replaceProjectBoardSources("board-1", [
      sourceInput({
        kind: "plan_artifact",
        title: "Tiny Animation Durable Plan",
        summary: "Durable source of truth for a tiny animated hello-world app.",
        path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
        relevance: 98,
        authorityRole: "primary",
        includeInSynthesis: true,
      }),
      sourceInput({
        kind: "thread",
        title: "Animation color chat",
        summary: "Chat says the animation should use a calm blue pulse.",
        threadId: "thread-blue-pulse",
        relevance: 65,
        authorityRole: "ignored",
        includeInSynthesis: false,
      }),
    ]);
    const chat = sources.find((source) => source.threadId === "thread-blue-pulse")!;
    const animationDraft = insertCard(db, {
      id: "card-animation",
      title: "Animate hello-world hero",
      description: "Create the draft animation task from the durable plan.",
      sourceRefs: [chat.id],
      labels: ["html"],
      acceptanceCriteria: ["Animation copy and motion are clear."],
      testPlan: { unit: [], integration: [], visual: ["Capture animated hero at desktop width."], manual: [] },
    });
    const styleDraft = insertCard(db, {
      id: "card-style",
      title: "Tune animation color system",
      description: "Tune the colors after the animation exists.",
      sourceRefs: [chat.id],
      labels: ["color"],
      acceptanceCriteria: ["Color treatment is intentional."],
      testPlan: { unit: [], integration: [], visual: ["Capture the color treatment."], manual: [] },
    });
    const approved = insertCard(db, {
      id: "card-approved",
      title: "Wire local task scaffold",
      description: "Approved Local Task card that also cites the chat.",
      status: "ready",
      sourceRefs: [chat.id],
      acceptanceCriteria: ["Local Task scaffold is ready."],
    });

    repository.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = events.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      affectedDraftCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
      affectedExecutableCardIds: expect.arrayContaining([approved.id]),
      existingCardsRewritten: false,
      modelCallRequired: false,
    });

    const refreshedBoard = repository.stageProjectBoardSourceDraftPiUpdates({
      boardId: "board-1",
      sourceImpactEventId: sourceEvent!.id,
      model: "kimi-test-model",
      telemetry: { promptCharCount: 1100, responseCharCount: 420, requestDurationMs: 1900 },
      suggestions: [
        {
          cardId: animationDraft.id,
          description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
          labels: ["html", "animation", "source-refresh"],
          acceptanceCriteria: ["Animation copy and motion are clear.", "Calm blue pulse is visible without confetti."],
          testPlan: {
            unit: [],
            integration: [],
            visual: ["Capture desktop and mobile screenshots showing the calm blue pulse."],
            manual: [],
          },
          clarificationQuestions: [],
          rationale: "The included chat adds a color and motion constraint.",
          confidence: "high",
        },
        {
          cardId: styleDraft.id,
          description: "Tune the animation color system around a calm blue pulse treatment.",
          labels: ["color", "animation"],
          acceptanceCriteria: ["Color treatment is calm and consistent."],
          testPlan: { unit: [], integration: [], visual: ["Capture the blue pulse treatment."], manual: [] },
          clarificationQuestions: [],
          rationale: "The included chat narrows the animation color direction.",
          confidence: "high",
        },
      ],
    });

    const stagedAnimation = refreshedBoard.cards.find((card) => card.id === animationDraft.id)!;
    const stagedStyle = refreshedBoard.cards.find((card) => card.id === styleDraft.id)!;
    const untouchedApproved = refreshedBoard.cards.find((card) => card.id === approved.id)!;
    expect(stagedAnimation.description).toBe("Create the draft animation task from the durable plan.");
    expect(stagedAnimation.pendingPiUpdate).toMatchObject({
      description: "Create the draft animation task with a calm blue pulse from the included chat notes.",
      labels: ["html", "animation", "source-refresh"],
      changedFields: expect.arrayContaining(["description", "labels", "acceptanceCriteria", "testPlan"]),
      clarificationQuestions: [],
    });
    expect(stagedStyle.pendingPiUpdate).toMatchObject({
      description: "Tune the animation color system around a calm blue pulse treatment.",
      clarificationQuestions: [],
    });
    expect(untouchedApproved.pendingPiUpdate).toBeUndefined();

    const event = events.find((candidate) => candidate.title === "Source draft Pi refresh proposed");
    expect(event?.metadata).toMatchObject({
      sourceImpact: expect.objectContaining({
        appliedAction: "propose_targeted_draft_refresh",
        sourceImpactEventIds: [sourceEvent!.id],
        sourceIds: expect.arrayContaining([chat.id]),
        affectedDraftCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
        affectedExecutableCardIds: expect.arrayContaining([approved.id]),
        pendingPiUpdateCardIds: expect.arrayContaining([animationDraft.id, styleDraft.id]),
        existingCardsRewritten: false,
        modelCallRequired: true,
        model: "kimi-test-model",
        telemetry: {
          promptCharCount: 1100,
          responseCharCount: 420,
          requestDurationMs: 1900,
        },
      }),
    });
  });

  it("owns source draft refresh persistence without rewriting executable cards", () => {
    const sources = repository.replaceProjectBoardSources("board-1", [
      sourceInput({
        kind: "plan_artifact",
        title: "Tiny Animation Durable Plan",
        summary: "Durable source of truth for a tiny animated hello-world app.",
        path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
        relevance: 98,
        authorityRole: "primary",
        includeInSynthesis: true,
      }),
      sourceInput({
        kind: "thread",
        title: "Brainstorm chat",
        summary: "Earlier chat asks for an animated gradient greeting.",
        threadId: "thread-animated-hello",
        relevance: 65,
        authorityRole: "ignored",
        includeInSynthesis: false,
      }),
    ]);
    const chat = sources.find((source) => source.threadId === "thread-animated-hello")!;
    const draft = insertCard(db, {
      id: "card-draft-refresh",
      title: "Animate hello-world hero",
      description: "Create the draft animation task from the durable plan.",
      sourceRefs: [chat.id],
      acceptanceCriteria: ["Animation copy and motion are clear."],
      testPlan: { unit: [], integration: [], visual: ["Capture animated hero at desktop width."], manual: [] },
    });
    const executable = insertCard(db, {
      id: "card-executable",
      title: "Wire local task scaffold",
      description: "Approved Local Task card that also cites the chat.",
      status: "ready",
      sourceRefs: [chat.id],
      acceptanceCriteria: ["Local Task scaffold is ready."],
      testPlan: { unit: ["Check generated files exist."], integration: [], visual: [], manual: [] },
    });

    repository.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = events.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      targetedRefreshOptional: true,
      nextRunFeedbackRecommended: true,
      affectedDraftCardIds: expect.arrayContaining([draft.id]),
      affectedExecutableCardIds: expect.arrayContaining([executable.id]),
      modelCallRequired: false,
    });

    const refreshedBoard = repository.refreshProjectBoardSourceDrafts({ boardId: "board-1", sourceImpactEventId: sourceEvent!.id });
    const refreshedDraft = refreshedBoard.cards.find((card) => card.id === draft.id)!;
    const untouchedExecutable = refreshedBoard.cards.find((card) => card.id === executable.id)!;

    expect(refreshedDraft.description).toContain("## Source impact refresh");
    expect(refreshedDraft.description).toContain("Source authority was refreshed from 1 source-impact record.");
    expect(refreshedDraft.description).toContain("Brainstorm chat");
    expect(refreshedDraft.description).toContain("Existing draft text was not rewritten by Pi");
    expect(untouchedExecutable.description).toBe("Approved Local Task card that also cites the chat.");
    expect(untouchedExecutable.pendingPiUpdate).toBeUndefined();

    const refreshEvent = events.find((event) => event.title === "Source drafts refreshed");
    expect(refreshEvent?.metadata).toMatchObject({
      sourceImpact: {
        appliedAction: "refresh_affected_drafts",
        sourceImpactEventIds: [sourceEvent!.id],
        affectedDraftCardIds: expect.arrayContaining([draft.id]),
        affectedExecutableCardIds: expect.arrayContaining([executable.id]),
        appliedCardIds: [draft.id],
        existingCardsRewritten: false,
        modelCallRequired: false,
      },
    });

    repository.refreshProjectBoardSourceDrafts({ boardId: "board-1", sourceImpactEventId: sourceEvent!.id });
    const refreshedAgain = getCard(db, draft.id);
    expect(refreshedAgain.description.match(/## Source impact refresh/g)).toHaveLength(1);
    expect(events.filter((event) => event.title === "Source drafts refreshed")).toHaveLength(1);
  });

  it("owns source impact feedback persistence for ticketized cards", () => {
    const sources = repository.replaceProjectBoardSources("board-1", [
      sourceInput({
        kind: "plan_artifact",
        title: "Tiny Animation Durable Plan",
        summary: "Durable source of truth for a tiny animated hello-world app.",
        path: ".ambient/board/plans/Tiny-Hello-DurablePlan.html",
        relevance: 98,
        authorityRole: "primary",
        includeInSynthesis: true,
      }),
      sourceInput({
        kind: "thread",
        title: "Brainstorm chat",
        summary: "Earlier chat asks for an animated gradient greeting.",
        threadId: "thread-animated-hello",
        relevance: 65,
        authorityRole: "ignored",
        includeInSynthesis: false,
      }),
    ]);
    const chat = sources.find((source) => source.threadId === "thread-animated-hello")!;
    const draft = insertCard(db, {
      id: "card-draft-feedback",
      title: "Animate hello-world hero",
      description: "Create the draft animation task from the durable plan.",
      sourceRefs: [chat.id],
    });
    const ticketized = insertCard(db, {
      id: "card-ticketized-feedback",
      title: "Wire local task scaffold",
      description: "Approved Local Task card that also cites the chat.",
      status: "ready",
      sourceRefs: [chat.id],
      acceptanceCriteria: ["Local Task scaffold is ready."],
      orchestrationTaskId: "task-feedback",
    });

    repository.updateProjectBoardSource({ sourceId: chat.id, kind: "thread", includeInSynthesis: true });
    const sourceEvent = events.find((event) => event.kind === "source_updated");
    expect(sourceEvent?.metadata.sourceImpact).toMatchObject({
      nextRunFeedbackRecommended: true,
      affectedDraftCardIds: expect.arrayContaining([draft.id]),
      affectedExecutableCardIds: expect.arrayContaining([ticketized.id]),
      modelCallRequired: false,
    });

    const feedbackBoard = repository.applyProjectBoardSourceImpactFeedback({ boardId: "board-1", sourceImpactEventId: sourceEvent!.id });
    const feedbackCard = feedbackBoard.cards.find((card) => card.id === ticketized.id)!;
    expect(feedbackCard.description).toBe("Approved Local Task card that also cites the chat.");
    expect(feedbackCard.runFeedback).toEqual([
      expect.objectContaining({
        source: "source_impact",
        sourceImpactEventId: sourceEvent!.id,
        sourceIds: expect.arrayContaining([chat.id]),
      }),
    ]);

    const feedbackEvent = events.find((event) => event.title === "Source impact feedback added");
    expect(feedbackEvent?.metadata).toMatchObject({
      sourceImpact: {
        appliedAction: "create_next_run_feedback",
        sourceImpactEventIds: [sourceEvent!.id],
        affectedDraftCardIds: expect.arrayContaining([draft.id]),
        affectedExecutableCardIds: expect.arrayContaining([ticketized.id]),
        appliedCardIds: [ticketized.id],
        existingCardsRewritten: false,
        modelCallRequired: false,
      },
    });

    repository.applyProjectBoardSourceImpactFeedback({ boardId: "board-1", sourceImpactEventId: sourceEvent!.id });
    expect(getCard(db, ticketized.id).runFeedback).toHaveLength(1);
    expect(events.filter((event) => event.title === "Source impact feedback added")).toHaveLength(1);
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

function listCards(db: Database.Database, boardId: string): ProjectBoardCard[] {
  const rows = db
    .prepare("SELECT * FROM project_board_cards WHERE board_id = ? ORDER BY created_at ASC, rowid ASC")
    .all(boardId) as ProjectBoardCardStoreRow[];
  return rows.map((row) => mapProjectBoardCardRow(row));
}

function getCard(db: Database.Database, cardId: string): ProjectBoardCard {
  const row = db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
  if (!row) throw new Error(`Project board card not found: ${cardId}`);
  return mapProjectBoardCardRow(row);
}

function projectBoardSummary(db: Database.Database, boardId: string, events: ProjectBoardEvent[]): ProjectBoardSummary | undefined {
  const row = db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as
    | {
        id: string;
        project_path: string;
        source_thread_id: string | null;
        status: ProjectBoardSummary["status"];
        title: string;
        summary: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    projectPath: row.project_path,
    sourceThreadId: row.source_thread_id ?? undefined,
    status: row.status,
    title: row.title,
    summary: row.summary,
    cards: listCards(db, boardId),
    sources: listSources(db, boardId),
    questions: [],
    proposals: [],
    events: events.filter((event) => event.boardId === boardId),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function insertCard(
  db: Database.Database,
  input: {
    id: string;
    title: string;
    description?: string;
    status?: ProjectBoardCard["status"];
    sourceRefs?: string[];
    labels?: string[];
    acceptanceCriteria?: string[];
    testPlan?: ProjectBoardCard["testPlan"];
    orchestrationTaskId?: string;
  },
): ProjectBoardCard {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, description, status, candidate_status, labels_json, blocked_by_json,
       acceptance_criteria_json, test_plan_json, source_refs_json, source_kind, source_id, orchestration_task_id, created_at, updated_at)
     VALUES (?, 'board-1', ?, ?, ?, 'ready_to_create', ?, '[]', ?, ?, ?, 'manual', ?, ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(
    input.id,
    input.title,
    input.description ?? "",
    input.status ?? "draft",
    JSON.stringify(input.labels ?? []),
    JSON.stringify(input.acceptanceCriteria ?? []),
    JSON.stringify(input.testPlan ?? { unit: [], integration: [], visual: [], manual: [] }),
    JSON.stringify(input.sourceRefs ?? []),
    `manual:${input.id}`,
    input.orchestrationTaskId ?? null,
  );
  return getCard(db, input.id);
}

function addRunFeedback(
  db: Database.Database,
  input: {
    cardId: string;
    feedback: string;
    source?: ProjectBoardCardRunFeedback["source"];
    sourceImpactEventId?: string;
    sourceImpactEventIds?: string[];
    sourceIds?: string[];
  },
): ProjectBoardCard {
  const card = getCard(db, input.cardId);
  if (!card.orchestrationTaskId || card.status === "draft") throw new Error("Run feedback can only be added after ticketization.");
  const feedback: ProjectBoardCardRunFeedback = {
    id: `feedback-${(card.runFeedback ?? []).length + 1}`,
    feedback: input.feedback,
    source: input.source ?? "manual",
    sourceImpactEventId: input.sourceImpactEventId,
    sourceImpactEventIds: input.sourceImpactEventIds ?? [],
    sourceIds: input.sourceIds ?? [],
    createdAt: "2026-06-16T00:00:00.000Z",
    createdBy: "ambient-desktop",
  };
  db.prepare("UPDATE project_board_cards SET run_feedback_json = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify([...(card.runFeedback ?? []), feedback]),
    "2026-06-16T00:00:00.000Z",
    card.id,
  );
  return getCard(db, card.id);
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
