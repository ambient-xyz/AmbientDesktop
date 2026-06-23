import type Database from "better-sqlite3";
import {
  projectBoardLatestProofCoverageRecheckEvent,
  projectBoardProofCoverageDrift,
  projectBoardProofCoverageRecheck,
  type ProjectBoardProofSuggestionAppliedMetadata,
} from "../../shared/projectBoardProofImpact";
import type {
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardEvent,
  ProjectBoardSummary,
  RecomputeProjectBoardProofCoverageInput,
} from "../../shared/projectBoardTypes";
import { normalizeProjectBoardCardTestPlan, projectBoardCardProofCount } from "./projectBoardMappers";
import type { ProjectBoardProofSuggestion } from "./projectStoreProjectBoardFacade";

export type ProjectBoardProofSuggestionEventInput = Omit<ProjectBoardEvent, "id" | "createdAt" | "metadata"> & {
  metadata?: Record<string, unknown>;
  createdAt?: string;
};

export interface ProjectStoreProjectBoardProofSuggestionRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  appendProjectBoardEvent(input: ProjectBoardProofSuggestionEventInput): void;
}

export class ProjectStoreProjectBoardProofSuggestionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardProofSuggestionRepositoryDeps,
  ) {}

  recomputeProjectBoardProofCoverage(input: RecomputeProjectBoardProofCoverageInput): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const previousRecheck = projectBoardLatestProofCoverageRecheckEvent(board.events);
    const proofImpact = projectBoardProofCoverageRecheck(board);
    const proofDrift = projectBoardProofCoverageDrift(proofImpact, previousRecheck?.proofImpact);
    const proofImpactEventMetadata = {
      ...proofImpact,
      driftSchemaVersion: 1,
      driftBaselineEventId: previousRecheck?.event.id,
      staleSinceLastRecheck: proofDrift.stale,
      driftReasons: proofDrift.reasons,
      affectedCardIds: proofDrift.affectedCardIds,
      policyAffectedCardIds: proofDrift.policyAffectedCardIds,
      addedEligibleCardIds: proofDrift.addedEligibleCardIds,
      removedEligibleCardIds: proofDrift.removedEligibleCardIds,
      addedMissingProofCardIds: proofDrift.addedMissingProofCardIds,
      resolvedMissingProofCardIds: proofDrift.resolvedMissingProofCardIds,
      proofKindChangedCardIds: proofDrift.proofKindChangedCardIds,
      proofItemCountChangedCardIds: proofDrift.proofItemCountChangedCardIds,
    };
    const now = new Date().toISOString();
    const totalProofItems =
      proofImpact.unitProofItemCount + proofImpact.integrationProofItemCount + proofImpact.visualProofItemCount + proofImpact.manualProofItemCount;
    const driftSummary = previousRecheck
      ? proofDrift.stale
        ? ` ${proofDrift.affectedCardIds.length} affected card${proofDrift.affectedCardIds.length === 1 ? "" : "s"} since last recheck.`
        : " No proof drift since last recheck."
      : " First recorded proof baseline.";

    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    this.deps.appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_updated",
      title: "Proof coverage rechecked",
      summary: `${proofImpact.eligibleCardCount} proof-eligible card${proofImpact.eligibleCardCount === 1 ? "" : "s"} rechecked; ${
        proofImpact.missingProofCount
      } missing proof; ${totalProofItems} proof item${totalProofItems === 1 ? "" : "s"}. 0 model calls.${driftSummary}`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        proofImpact: proofImpactEventMetadata,
      },
      createdAt: now,
    });
    return this.deps.getProjectBoard(board.id) ?? board;
  }

  applyProjectBoardProofSuggestions(input: {
    boardId: string;
    suggestions: ProjectBoardProofSuggestion[];
    targetCardIds?: string[];
    model?: string;
    telemetry?: { promptCharCount?: number; responseCharCount?: number; requestDurationMs?: number };
    fallbackUsed?: boolean;
    providerError?: string;
  }): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const beforeImpact = projectBoardProofCoverageRecheck(board);
    const now = new Date().toISOString();
    const targetCardIds = [...new Set((input.targetCardIds?.length ? input.targetCardIds : input.suggestions.map((item) => item.cardId)).filter(Boolean))];
    const suggestionsByCardId = new Map(input.suggestions.map((suggestion) => [suggestion.cardId, suggestion]));
    const appliedCardIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    let appliedProofItemCount = 0;
    const updatePendingPi = this.db.prepare(
      `UPDATE project_board_cards
       SET pending_pi_update_json = ?,
           updated_at = ?
       WHERE id = ?`,
    );

    for (const cardId of targetCardIds) {
      const suggestion = suggestionsByCardId.get(cardId);
      const current = board.cards.find((card) => card.id === cardId);
      if (!current || current.boardId !== board.id) {
        skippedReasons[cardId] = "Card was not found on this board.";
        continue;
      }
      if (current.status !== "draft" || current.orchestrationTaskId) {
        skippedReasons[cardId] = "Card is already ticketized or no longer a draft; approved card specs were not rewritten.";
        continue;
      }
      if (current.candidateStatus === "duplicate" || current.candidateStatus === "rejected" || current.candidateStatus === "evidence") {
        skippedReasons[cardId] = `Card candidate status is ${current.candidateStatus}.`;
        continue;
      }
      if (projectBoardCardProofCount(current) > 0) {
        skippedReasons[cardId] = "Card already has proof expectations.";
        continue;
      }
      if (current.pendingPiUpdate) {
        skippedReasons[cardId] = "Card already has a pending Pi update; review or ignore it before asking for proof suggestions again.";
        continue;
      }
      if (!suggestion) {
        skippedReasons[cardId] = "Ambient/Pi did not return a proof suggestion for this card.";
        continue;
      }
      const testPlan = normalizeProjectBoardCardTestPlan(suggestion.testPlan);
      const proofItemCount = projectBoardCardProofCount({ testPlan });
      if (proofItemCount === 0) {
        skippedReasons[cardId] = "Proof suggestion did not contain a valid proof expectation.";
        continue;
      }
      const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
        sourceId: `proof:${input.model?.trim() || "suggestion"}`,
        createdAt: now,
        changedFields: ["testPlan"],
        testPlan,
      };
      const result = updatePendingPi.run(JSON.stringify(pendingUpdate), now, cardId);
      if (result.changes <= 0) {
        skippedReasons[cardId] = "Card could not be updated.";
        continue;
      }
      appliedCardIds.push(cardId);
      appliedProofItemCount += proofItemCount;
      this.deps.appendProjectBoardEvent({
        boardId: board.id,
        kind: "card_updated",
        title: "Proof Pi update available",
        summary: `${current.title} received reviewable proof expectations from Pi. Apply the update before ticketization.`,
        entityKind: "project_board_card",
        entityId: current.id,
        metadata: {
          cardId: current.id,
          sourceId: pendingUpdate.sourceId,
          changedFields: pendingUpdate.changedFields,
          proofOwnership: suggestion.proofOwnership,
          confidence: suggestion.confidence,
          protectedPiUpdate: true,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
    const afterBoard = this.deps.getProjectBoard(board.id) ?? board;
    const afterImpact = projectBoardProofCoverageRecheck(afterBoard);
    const skippedCardIds = targetCardIds.filter((cardId) => !appliedCardIds.includes(cardId));
    const proofImpact: ProjectBoardProofSuggestionAppliedMetadata = {
      schemaVersion: 1,
      appliedAction: "suggest_missing_proof",
      strict: beforeImpact.strict,
      targetCardIds,
      appliedCardIds,
      pendingPiUpdateCardIds: appliedCardIds,
      skippedCardIds,
      skippedReasons,
      appliedProofItemCount,
      suggestedProofItemCount: appliedProofItemCount,
      missingProofCountBefore: beforeImpact.missingProofCount,
      missingProofCountAfter: afterImpact.missingProofCount,
      existingCardsRewritten: false,
      modelCallRequired: true,
      ...(input.model ? { model: input.model } : {}),
      ...(typeof input.telemetry?.promptCharCount === "number" ? { promptCharCount: input.telemetry.promptCharCount } : {}),
      ...(typeof input.telemetry?.responseCharCount === "number" ? { responseCharCount: input.telemetry.responseCharCount } : {}),
      ...(typeof input.telemetry?.requestDurationMs === "number" ? { requestDurationMs: input.telemetry.requestDurationMs } : {}),
      ...(input.fallbackUsed ? { fallbackUsed: true } : {}),
      ...(input.providerError ? { providerError: input.providerError.slice(0, 500) } : {}),
    };
    this.deps.appendProjectBoardEvent({
      boardId: board.id,
      kind: "card_updated",
      title: "Proof expectations suggested",
      summary:
        appliedCardIds.length > 0
          ? `${input.fallbackUsed ? "Fallback proof rules staged" : "Ambient/Pi suggested"} ${appliedProofItemCount} proof expectation${
              appliedProofItemCount === 1 ? "" : "s"
            } for review on ${
              appliedCardIds.length
            } draft card${appliedCardIds.length === 1 ? "" : "s"}; ${skippedCardIds.length} card${
              skippedCardIds.length === 1 ? "" : "s"
            } skipped without rewriting card specs.`
          : `No proof expectations were staged; ${skippedCardIds.length} card${skippedCardIds.length === 1 ? "" : "s"} skipped without rewriting approved specs.`,
      entityKind: "project_board",
      entityId: board.id,
      metadata: {
        proofImpact,
        suggestions: input.suggestions.map((suggestion) => ({
          cardId: suggestion.cardId,
          proofOwnership: suggestion.proofOwnership,
          confidence: suggestion.confidence,
          testPlan: suggestion.testPlan,
          rationale: suggestion.rationale,
        })),
      },
      createdAt: now,
    });
    return this.deps.getProjectBoard(board.id) ?? afterBoard;
  }
}
