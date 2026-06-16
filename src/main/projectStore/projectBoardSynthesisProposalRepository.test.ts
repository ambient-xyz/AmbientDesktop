import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectBoardSynthesisCardInput } from "../projectBoardSynthesis";
import type { ProjectBoardSynthesisDraft } from "../projectBoardSynthesis";
import { applyProjectStoreBootstrapSchema } from "../projectStoreSchema";
import {
  ProjectStoreProjectBoardSynthesisProposalRepository,
  type ProjectBoardSynthesisProposalEventInput,
} from "./projectBoardSynthesisProposalRepository";

describe("ProjectStoreProjectBoardSynthesisProposalRepository", () => {
  let db: Database.Database;
  let events: ProjectBoardSynthesisProposalEventInput[];
  let repository: ProjectStoreProjectBoardSynthesisProposalRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    applyProjectStoreBootstrapSchema(db);
    insertBoard(db, "board-1");
    events = [];
    repository = new ProjectStoreProjectBoardSynthesisProposalRepository(db, {
      appendProjectBoardEvent: (event) => events.push(event),
    });
  });

  afterEach(() => {
    db.close();
  });

  it("creates, supersedes, reads, and updates synthesis proposals", () => {
    const first = repository.createProjectBoardSynthesisProposal({
      boardId: "board-1",
      synthesis: synthesisDraft({ cardSourceIds: ["source:first"], questions: ["What is unclear?"] }),
      model: "kimi",
      durationMs: 123.4,
    });
    const second = repository.createProjectBoardSynthesisProposal({
      boardId: "board-1",
      synthesis: synthesisDraft({ cardSourceIds: ["source:second"], questions: ["What is next?"] }),
      model: "kimi-2",
    });

    expect(repository.getProjectBoardSynthesisProposal(first.id)?.status).toBe("superseded");
    expect(repository.getLatestPendingProjectBoardSynthesisProposal("board-1")?.id).toBe(second.id);
    expect(events).toEqual([
      expect.objectContaining({
        kind: "synthesis_proposal_created",
        entityId: first.id,
        metadata: expect.objectContaining({ cardCount: 1, questionCount: 1, model: "kimi" }),
      }),
      expect.objectContaining({
        kind: "synthesis_proposal_created",
        entityId: second.id,
        metadata: expect.objectContaining({ supersededPending: true }),
      }),
    ]);

    const updated = repository.updateProjectBoardSynthesisProposal({
      proposalId: second.id,
      synthesis: synthesisDraft({ cardSourceIds: ["source:second", "source:third"], questions: ["What is next?", "Any risk?"] }),
      durationMs: 250,
    });

    expect(updated).toMatchObject({
      id: second.id,
      status: "pending",
      durationMs: 250,
      cards: [{ sourceId: "source:second" }, { sourceId: "source:third" }],
      questions: ["What is next?", "Any risk?"],
    });
    expect(events.at(-1)).toMatchObject({
      title: "Pi synthesis proposal updated",
      metadata: expect.objectContaining({ progressiveUpdate: true, cardCount: 2, questionCount: 2 }),
    });
  });

  it("answers proposal questions and reviews proposal cards", () => {
    const proposal = repository.createProjectBoardSynthesisProposal({
      boardId: "board-1",
      synthesis: synthesisDraft({ cardSourceIds: ["source:accepted", "source:merged"], questions: ["Which release?", "What proof?"] }),
    });

    const answered = repository.answerProjectBoardSynthesisProposalQuestion({
      proposalId: proposal.id,
      questionIndex: 1,
      answer: "Use the local ProjectStore validation lane.",
    });

    expect(answered.answers).toEqual([
      expect.objectContaining({
        questionIndex: 1,
        question: "What proof?",
        answer: "Use the local ProjectStore validation lane.",
      }),
    ]);
    expect(events.at(-1)).toMatchObject({
      kind: "synthesis_proposal_answered",
      metadata: expect.objectContaining({ questionIndex: 1, question: "What proof?" }),
    });

    const accepted = repository.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "source:accepted",
      reviewStatus: "accepted",
      reason: "Ready to draft.",
    });
    expect(accepted.cards.find((card) => card.sourceId === "source:accepted")).toMatchObject({
      reviewStatus: "accepted",
      reviewReason: "Ready to draft.",
    });

    insertDraftCard(db, { id: "target-card", boardId: "board-1" });
    const merged = repository.reviewProjectBoardSynthesisProposalCard({
      proposalId: proposal.id,
      sourceId: "source:merged",
      reviewStatus: "merged",
      mergeTargetCardId: " target-card ",
    });
    expect(merged.cards.find((card) => card.sourceId === "source:merged")).toMatchObject({
      reviewStatus: "merged",
      mergeTargetCardId: "target-card",
    });
    expect(events.at(-1)).toMatchObject({
      kind: "synthesis_proposal_card_reviewed",
      metadata: expect.objectContaining({ sourceId: "source:merged", reviewStatus: "merged", mergeTargetCardId: "target-card" }),
    });
  });

  it("rejects merged proposal reviews without an unlinked draft target", () => {
    const proposal = repository.createProjectBoardSynthesisProposal({
      boardId: "board-1",
      synthesis: synthesisDraft({ cardSourceIds: ["source:merged"], questions: [] }),
    });

    expect(() =>
      repository.reviewProjectBoardSynthesisProposalCard({
        proposalId: proposal.id,
        sourceId: "source:merged",
        reviewStatus: "merged",
        mergeTargetCardId: "missing-card",
      }),
    ).toThrow("Merged proposal cards require an unlinked draft card on the same board.");
  });
});

function synthesisDraft(input: { cardSourceIds: string[]; questions: string[] }): ProjectBoardSynthesisDraft {
  return {
    summary: "Tighten ProjectStore proposal ownership.",
    goal: "Move proposal persistence behind a repository.",
    currentState: "ProjectStore still owns synthesis proposal SQL.",
    targetUser: "Ambient developers",
    qualityBar: "Behavior remains unchanged and covered by focused tests.",
    assumptions: ["Repository extraction is behavior-preserving."],
    questions: input.questions,
    sourceNotes: ["Use current ProjectStore behavior as the source of truth."],
    cards: input.cardSourceIds.map((sourceId, index) => proposalCard(sourceId, index + 1)),
  };
}

function proposalCard(sourceId: string, index: number): ProjectBoardSynthesisCardInput {
  return {
    sourceId,
    title: `Proposal card ${index}`,
    description: `Implement proposal card ${index}.`,
    candidateStatus: "ready_to_create",
    priority: index,
    phase: "Phase 5",
    labels: ["proposal"],
    blockedBy: [],
    acceptanceCriteria: ["The repository owns proposal persistence."],
    testPlan: { unit: ["repository test"], integration: [], visual: [], manual: [] },
    sourceRefs: [sourceId],
    clarificationQuestions: [],
  };
}

function insertBoard(db: Database.Database, id: string): void {
  db.prepare(
    `INSERT INTO project_boards
      (id, project_path, status, title, summary, created_at, updated_at)
     VALUES (?, '/workspace', 'active', 'Project board', '', '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(id);
}

function insertDraftCard(db: Database.Database, input: { id: string; boardId: string }): void {
  db.prepare(
    `INSERT INTO project_board_cards
      (id, board_id, title, status, source_kind, source_id, created_at, updated_at)
     VALUES (?, ?, 'Merge target', 'draft', 'manual', ?, '2026-06-16T00:00:00.000Z', '2026-06-16T00:00:00.000Z')`,
  ).run(input.id, input.boardId, `manual:${input.id}`);
}
