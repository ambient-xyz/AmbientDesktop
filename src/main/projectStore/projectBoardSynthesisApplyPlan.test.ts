import { describe, expect, it } from "vitest";
import type { ProjectBoardQuestion } from "../../shared/projectBoardTypes";
import type { ProjectBoardSynthesisDraft } from "./projectStoreProjectBoardFacade";
import {
  type ProjectBoardCardStoreRow,
  type ProjectBoardCharterStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";
import { buildProjectBoardSynthesisApplyPlan } from "./projectBoardSynthesisApplyPlan";

const now = "2026-06-22T00:00:00.000Z";

describe("buildProjectBoardSynthesisApplyPlan", () => {
  it("classifies synthesis cards, dedupes questions, and prepares charter policy inputs", () => {
    const plan = buildProjectBoardSynthesisApplyPlan({
      board: boardRow(),
      synthesis: synthesisDraft(),
      options: {
        replaceExistingDraft: true,
        sourceIdNamespace: "synthesis:",
      },
      now,
      existingSynthesisRows: [
        cardRow({ id: "old-card", sourceId: "synthesis:old" }),
        cardRow({ id: "stale-card", sourceId: "synthesis:stale" }),
        cardRow({ id: "protected-card", sourceId: "synthesis:protected", status: "ready" }),
      ],
      existingQuestions: [question("question-1", "What already exists?")],
      boardSources: [],
      boardEvents: [],
      activeCharterRow: charterRow({
        budget_policy_json: JSON.stringify({ maxPassesPerCard: 3, customBudget: true }),
      }),
    });

    expect(plan.synthesis.cards.map((card) => card.sourceId)).toEqual(["synthesis:old", "synthesis:new", "synthesis:protected"]);
    expect(plan.cardsToUpdate.map((entry) => entry.existing.id)).toEqual(["old-card"]);
    expect(plan.cardsToInsert.map((card) => card.sourceId)).toEqual(["synthesis:new"]);
    expect(plan.staleReplaceableDraftCardIds).toEqual(["stale-card"]);
    expect(plan.pendingPiUpdates).toHaveLength(1);
    expect(plan.pendingPiUpdates[0]).toMatchObject({
      cardId: "protected-card",
      update: {
        sourceId: "synthesis:protected",
        title: "Protected card update",
      },
    });
    expect(plan.pendingPiUpdates[0]?.update.changedFields).toContain("title");
    expect(plan.questionsToInsert).toEqual(["What new clarification is needed?"]);
    expect(plan.summaryQuestions.map((entry) => entry.question)).toEqual(["What already exists?", "What new clarification is needed?"]);
    expect(plan.boardSourceThreadId).toBe("thread-1");
    expect(plan.deleteStaleDraftCards).toBe(true);
    expect(plan.mergedBudgetPolicy).toMatchObject({
      maxPassesPerCard: 3,
      maxRuntimeMsPerCard: 1_200_000,
      pauseOnTerminalBlocker: true,
      customBudget: true,
    });
    expect(plan.synthesizedSourcePolicy).toMatchObject({
      includeThreads: true,
      includeMarkdown: true,
      requireUserApproval: true,
      synthesizedAt: now,
      sourceNotes: ["Source notes"],
    });
    expect(plan.synthesizedCharterSummary.summary).toContain("Ship the extraction");
    expect(plan.synthesizedCharterSummary.unresolvedDecisions).toEqual(["What already exists?", "What new clarification is needed?"]);
  });
});

function synthesisDraft(): ProjectBoardSynthesisDraft {
  return {
    summary: "Apply plan summary",
    goal: "Ship the extraction",
    currentState: "The repository owns planning and persistence.",
    targetUser: "Ambient developers",
    qualityBar: "Preserve behavior",
    assumptions: ["Pure planning stays outside SQL writes."],
    questions: ["What already exists?", "What new clarification is needed?"],
    sourceNotes: ["Source notes"],
    cards: [
      synthesisCard("old", "Existing card update"),
      synthesisCard("new", "New card"),
      synthesisCard("protected", "Protected card update"),
    ],
  };
}

function synthesisCard(sourceId: string, title: string): ProjectBoardSynthesisDraft["cards"][number] {
  return {
    sourceId,
    title,
    description: `${title} description`,
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "Phase 4",
    labels: ["project-board"],
    blockedBy: [],
    acceptanceCriteria: ["The board apply path remains unchanged."],
    testPlan: { unit: ["focused helper test"], integration: [], visual: [], manual: [] },
    sourceRefs: ["docs/archive/simplificationPlanV4-2026-06-26.html"],
  };
}

function boardRow(): ProjectBoardStoreRow {
  return {
    id: "board-1",
    project_path: "/workspace",
    status: "active",
    title: "Project board",
    summary: "Existing summary",
    source_thread_id: " thread-1 ",
    charter_id: "charter-1",
    created_at: now,
    updated_at: now,
  } as ProjectBoardStoreRow;
}

function charterRow(overrides: Partial<ProjectBoardCharterStoreRow> = {}): ProjectBoardCharterStoreRow {
  return {
    id: "charter-1",
    board_id: "board-1",
    goal: "Existing goal",
    current_state: "Existing state",
    target_user: "Existing user",
    non_goals_json: "[]",
    quality_bar: "Existing quality bar",
    test_policy_json: "{}",
    decision_policy_json: "{}",
    dependency_policy_json: "{}",
    budget_policy_json: "{}",
    source_policy_json: "{}",
    markdown: "",
    project_summary_json: "{}",
    created_at: now,
    updated_at: now,
    ...overrides,
  } as ProjectBoardCharterStoreRow;
}

function cardRow(input: {
  id: string;
  sourceId: string;
  status?: string;
}): ProjectBoardCardStoreRow {
  return {
    id: input.id,
    board_id: "board-1",
    title: input.id === "protected-card" ? "Old protected title" : input.id,
    description: "Existing description",
    status: input.status ?? "draft",
    candidate_status: "needs_clarification",
    priority: null,
    phase: null,
    labels_json: "[]",
    blocked_by_json: "[]",
    acceptance_criteria_json: "[]",
    test_plan_json: JSON.stringify({ unit: [], integration: [], visual: [], manual: [] }),
    source_refs_json: "[]",
    clarification_questions_json: "[]",
    clarification_suggestions_json: "[]",
    clarification_answers_json: "[]",
    clarification_decisions_json: "[]",
    source_kind: "board_synthesis",
    source_id: input.sourceId,
    source_thread_id: null,
    source_message_id: null,
    orchestration_task_id: null,
    objective_provenance_json: null,
    ui_mock_role: null,
    requires_ui_mock_approval: 0,
    pending_pi_update_json: null,
    user_touched_fields_json: "[]",
    created_at: now,
    updated_at: now,
  } as ProjectBoardCardStoreRow;
}

function question(id: string, text: string): ProjectBoardQuestion {
  return {
    id,
    boardId: "board-1",
    question: text,
    required: true,
    createdAt: now,
    updatedAt: now,
  };
}
