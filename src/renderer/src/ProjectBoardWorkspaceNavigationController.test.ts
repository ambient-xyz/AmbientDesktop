import { describe, expect, it } from "vitest";

import type {
  ProjectBoardCard,
  ProjectBoardQuestion,
  ProjectBoardSummary,
  ProjectBoardSynthesisProposal,
} from "../../shared/types";
import {
  projectBoardActiveCardInspectorRequest,
  projectBoardCardNavigationTarget,
  projectBoardDraftKickoffComplete,
  projectBoardPendingProposalId,
  projectBoardSelectedActiveCard,
  projectBoardSelectedDraftCard,
} from "./ProjectBoardWorkspaceNavigationController";

describe("ProjectBoardWorkspaceNavigationController", () => {
  it("derives pending proposal and draft kickoff state from board data", () => {
    expect(
      projectBoardPendingProposalId(
        projectBoard({
          proposals: [projectBoardProposal({ id: "proposal-1", status: "pending" })],
        }),
      ),
    ).toBe("proposal-1");
    expect(projectBoardDraftKickoffComplete(projectBoard({ status: "draft", questions: [projectBoardQuestion({ answer: "Ship it" })] }))).toBe(true);
    expect(projectBoardDraftKickoffComplete(projectBoard({ status: "draft", questions: [projectBoardQuestion({ answer: "" })] }))).toBe(false);
    expect(projectBoardDraftKickoffComplete(projectBoard({ status: "active", questions: [projectBoardQuestion({ answer: "" })] }))).toBe(false);
  });

  it("routes active cards to the board inspector and draft candidates to Draft Inbox", () => {
    const activeCard = projectBoardCard({
      id: "active-card",
      orchestrationTaskId: "task-1",
      status: "ready",
    });
    const draftCard = projectBoardCard({
      id: "draft-card",
      orchestrationTaskId: undefined,
      status: "draft",
    });
    const board = projectBoard({ cards: [activeCard, draftCard] });

    expect(projectBoardCardNavigationTarget(board, "active-card", { tab: "proof" })).toEqual({
      kind: "active",
      cardId: "active-card",
      options: { tab: "proof" },
      tab: "board",
    });
    expect(projectBoardCardNavigationTarget(board, "draft-card")).toEqual({
      kind: "draft",
      cardId: "draft-card",
      draftInspectorMode: "candidate",
      tab: "draft_inbox",
    });
    expect(projectBoardCardNavigationTarget(board, "missing-card")).toBeUndefined();
  });

  it("keeps selected-card lookup parity with the workspace filters", () => {
    const activeDraft = projectBoardCard({ id: "active-draft", status: "draft", orchestrationTaskId: "task-1" });
    const draftCandidate = projectBoardCard({ id: "draft-candidate", status: "draft", orchestrationTaskId: undefined });
    const board = projectBoard({ cards: [activeDraft, draftCandidate] });

    expect(projectBoardSelectedDraftCard(board, "draft-candidate")).toBe(draftCandidate);
    expect(projectBoardSelectedActiveCard(board, "active-draft")).toBe(activeDraft);
    expect(projectBoardSelectedActiveCard(board, "draft-candidate")).toBeUndefined();
  });

  it("increments inspector requests only when tab or scroll focus is requested", () => {
    const current = { requestId: 3 };
    expect(projectBoardActiveCardInspectorRequest(current, {})).toBe(current);
    expect(projectBoardActiveCardInspectorRequest(current, { tab: "dependencies" })).toEqual({
      requestId: 4,
      tab: "dependencies",
      scroll: true,
    });
    expect(projectBoardActiveCardInspectorRequest(current, { scroll: false })).toBe(current);
    expect(projectBoardActiveCardInspectorRequest(current, { scroll: true })).toEqual({
      requestId: 4,
      scroll: true,
      tab: undefined,
    });
  });
});

function projectBoard(input: Partial<ProjectBoardSummary> = {}): ProjectBoardSummary {
  return {
    id: "board-1",
    projectPath: "/workspace/project",
    status: "active",
    title: "Project board",
    summary: "Board summary",
    cards: [],
    questions: [],
    proposals: [],
    sources: [],
    synthesisRuns: [],
    executionArtifacts: [],
    events: [],
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardSummary;
}

function projectBoardCard(input: Partial<ProjectBoardCard> = {}): ProjectBoardCard {
  return {
    id: "card-1",
    boardId: "board-1",
    title: "Card",
    description: "Card description",
    status: "draft",
    candidateStatus: "ready_to_create",
    priority: 1,
    phase: "implementation",
    labels: [],
    blockedBy: [],
    acceptanceCriteria: [],
    testPlan: {
      unit: [],
      integration: [],
      visual: [],
      manual: [],
    },
    sourceRefs: [],
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardCard;
}

function projectBoardProposal(input: Partial<ProjectBoardSynthesisProposal> = {}): ProjectBoardSynthesisProposal {
  return {
    id: "proposal-1",
    boardId: "board-1",
    status: "pending",
    summary: "Proposal summary",
    goal: "Simplify the board.",
    currentState: "Navigation state is local.",
    proposedChange: "Extract a controller.",
    rationale: "Owner boundaries make the workspace easier to change.",
    risks: [],
    cardChanges: [],
    questions: [],
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardSynthesisProposal;
}

function projectBoardQuestion(input: Partial<ProjectBoardQuestion> = {}): ProjectBoardQuestion {
  return {
    id: "question-1",
    boardId: "board-1",
    question: "What outcome should this board reach?",
    required: true,
    section: "goal",
    createdAt: "2026-06-15T00:00:00Z",
    updatedAt: "2026-06-15T00:00:00Z",
    ...input,
  } as ProjectBoardQuestion;
}
