import type Database from "better-sqlite3";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import { projectBoardOpenClarificationQuestions } from "../../shared/projectBoardClarificationDecisions";
import {
  normalizeProjectBoardClarificationQuestions,
  projectBoardCardMissingRequiredUxMockGate,
  projectBoardCardProofCount,
  projectBoardClosedParentForRunFollowUp,
  projectBoardOpenUxMockGateBlocker,
  projectBoardTestPolicyRequiresProofSpec,
} from "./projectBoardMappers";
import { parseJsonObject } from "./projectStoreJson";

export interface ProjectStoreProjectBoardCardReadinessGateRepositoryDeps {
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
}

export class ProjectStoreProjectBoardCardReadinessGateRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardReadinessGateRepositoryDeps,
  ) {}

  projectBoardRequiresProofSpec(boardId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT project_board_charters.test_policy_json AS test_policy_json
         FROM project_boards
         JOIN project_board_charters ON project_board_charters.id = project_boards.charter_id
         WHERE project_boards.id = ? AND project_board_charters.status = 'active'
         LIMIT 1`,
      )
      .get(boardId) as { test_policy_json: string } | undefined;
    if (!row) return false;
    const policy = parseJsonObject<Record<string, unknown>>(row.test_policy_json, {});
    return projectBoardTestPolicyRequiresProofSpec(policy);
  }

  assertProjectBoardCardProofReady(card: ProjectBoardCard): void {
    if (!this.projectBoardRequiresProofSpec(card.boardId) || projectBoardCardProofCount(card) > 0) return;
    throw new Error("Strict project board proof policy requires at least one proof expectation before a card can be marked ready.");
  }

  assertProjectBoardCardClarificationsResolved(card: ProjectBoardCard): void {
    const pending = projectBoardOpenClarificationQuestions({
      clarificationDecisions: card.clarificationDecisions,
      clarificationQuestions: normalizeProjectBoardClarificationQuestions(card.clarificationQuestions ?? [], 8),
      clarificationSuggestions: card.clarificationSuggestions,
      clarificationAnswers: card.clarificationAnswers,
      includeInlineQuestions: false,
      limit: 8,
    });
    if (pending.length === 0) return;
    throw new Error("Clarification questions must be answered before a card can be marked ready.");
  }

  assertProjectBoardRunFollowUpStillActionable(card: ProjectBoardCard): void {
    const parent = projectBoardClosedParentForRunFollowUp(card, this.deps.listProjectBoardCards(card.boardId));
    if (!parent) return;
    throw new Error(`Run follow-up cannot be marked ready because parent card "${parent.title}" is already done.`);
  }

  assertProjectBoardUxMockGateOpen(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): void {
    const blocker = projectBoardOpenUxMockGateBlocker(card, boardCards);
    if (blocker) throw new Error(`Approve the UX mock before creating UI implementation tasks: ${blocker.title}.`);
    if (projectBoardCardMissingRequiredUxMockGate(card, boardCards)) {
      throw new Error("Approve the UX mock before creating UI implementation tasks.");
    }
  }
}
