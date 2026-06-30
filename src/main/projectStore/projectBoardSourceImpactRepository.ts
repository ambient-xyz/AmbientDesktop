import type Database from "better-sqlite3";
import type {
  ApplyProjectBoardSourceImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardTouchedField,
  ProjectBoardSource,
  ProjectBoardSummary,
  RefreshProjectBoardSourceDraftsInput,
} from "../../shared/projectBoardTypes";
import type { StageProjectBoardSourceDraftPiUpdatesInput } from "./projectStoreFacadeHelpers";
import {
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeTaskLabels,
  projectBoardDescriptionWithSourceImpactRefresh,
  projectBoardHasSourceImpactFeedback,
  projectBoardSourceDraftRefreshEventMetadata,
  projectBoardSourceDraftRefreshNote,
  projectBoardSourceDraftRefreshRecordKey,
  projectBoardSourceImpactFeedbackText,
  projectBoardSourceImpactMetadataFromEvent,
  projectBoardSourceUpdateImpactMetadata,
  type ProjectBoardSourceDraftRefreshRecord,
  type ProjectBoardSourceUpdateImpactMetadata,
} from "./projectBoardMappers";
import type { ProjectStoreProjectBoardSourceRepositoryDeps } from "./projectBoardSourceRepositoryTypes";

type SourceImpactPredicate = (impact: ProjectBoardSourceUpdateImpactMetadata) => boolean;

export class ProjectStoreProjectBoardSourceImpactRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSourceRepositoryDeps,
  ) {}

  stageProjectBoardSourceDraftPiUpdates(input: StageProjectBoardSourceDraftPiUpdatesInput): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const records = this.matchingSourceImpactRecords(input, (impact) => impact.targetedRefreshOptional);
    if (records.length === 0) {
      throw new Error("No source impact records matched affected draft cards.");
    }

    const context = this.sourceImpactContext(input.boardId, records);
    const note = projectBoardSourceDraftRefreshNote({
      sources: context.sources.filter((source) => context.sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: context.selectedObservationCount,
    });
    const suggestionsByCardId = new Map(input.suggestions.map((suggestion) => [suggestion.cardId, suggestion]));
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const now = new Date().toISOString();
    const updatePendingPi = this.db.prepare(
      `UPDATE project_board_cards
       SET pending_pi_update_json = ?,
           updated_at = ?
       WHERE id = ?`,
    );

    for (const cardId of context.affectedDraftCardIds) {
      let card: ProjectBoardCard;
      try {
        card = this.deps.getProjectBoardCard(cardId);
      } catch {
        skippedCardIds.push(cardId);
        continue;
      }
      if (card.boardId !== input.boardId || card.status !== "draft" || card.orchestrationTaskId || card.pendingPiUpdate) {
        skippedCardIds.push(cardId);
        continue;
      }
      const suggestion = suggestionsByCardId.get(card.id);
      const nextDescription = (
        suggestion?.description?.trim()
          ? suggestion.description.trim()
          : projectBoardDescriptionWithSourceImpactRefresh(card.description, note)
      ).slice(0, 4000);
      const nextLabels = suggestion?.labels ? normalizeTaskLabels(suggestion.labels) : card.labels;
      const nextAcceptanceCriteria = suggestion?.acceptanceCriteria
        ? normalizeCardTextList(suggestion.acceptanceCriteria, 30)
        : card.acceptanceCriteria;
      const nextTestPlan = suggestion?.testPlan ? normalizeProjectBoardCardTestPlan(suggestion.testPlan) : card.testPlan;
      const nextQuestions = suggestion?.clarificationQuestions
        ? normalizeProjectBoardClarificationQuestions(suggestion.clarificationQuestions, 8)
        : (card.clarificationQuestions ?? []);
      const nextDecisions = normalizeProjectBoardClarificationDecisions(card.clarificationDecisions, {
        clarificationQuestions: nextQuestions,
        clarificationSuggestions: card.clarificationSuggestions,
        clarificationAnswers: card.clarificationAnswers,
        createdAt: card.createdAt,
        updatedAt: now,
      });
      const changedFields: ProjectBoardCardTouchedField[] = [
        nextDescription !== card.description ? "description" : undefined,
        JSON.stringify(nextLabels) !== JSON.stringify(card.labels) ? "labels" : undefined,
        JSON.stringify(nextAcceptanceCriteria) !== JSON.stringify(card.acceptanceCriteria) ? "acceptanceCriteria" : undefined,
        JSON.stringify(nextTestPlan) !== JSON.stringify(card.testPlan) ? "testPlan" : undefined,
        JSON.stringify(nextQuestions) !== JSON.stringify(card.clarificationQuestions ?? []) ? "clarificationQuestions" : undefined,
        JSON.stringify(nextDecisions) !== JSON.stringify(card.clarificationDecisions ?? []) ? "clarificationDecisions" : undefined,
      ].filter((field): field is ProjectBoardCardTouchedField => Boolean(field));

      if (changedFields.length === 0) {
        skippedCardIds.push(card.id);
        continue;
      }

      const pendingUpdate: ProjectBoardCardPendingPiUpdate = {
        sourceId: `source:${context.sourceIds.slice().sort().join("|") || "impact"}`,
        createdAt: now,
        changedFields,
        description: nextDescription,
        labels: nextLabels,
        acceptanceCriteria: nextAcceptanceCriteria,
        testPlan: nextTestPlan,
        clarificationQuestions: nextQuestions,
        clarificationDecisions: nextDecisions,
      };
      const result = updatePendingPi.run(JSON.stringify(pendingUpdate), now, card.id);
      if (result.changes <= 0) {
        skippedCardIds.push(card.id);
        continue;
      }
      appliedCardIds.push(card.id);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Source draft Pi update available",
        summary: `${card.title} received a reviewable Pi update from source impact (${changedFields.join(", ")}).`,
        entityKind: "project_board_card",
        entityId: card.id,
        metadata: {
          cardId: card.id,
          sourceId: pendingUpdate.sourceId,
          sourceImpactEventIds: context.sourceImpactEventIds,
          sourceIds: context.sourceIds,
          changedFields,
          protectedPiUpdate: true,
          modelCallRequired: true,
        },
        createdAt: now,
      });
    }

    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
    this.deps.appendProjectBoardEvent({
      boardId: input.boardId,
      kind: "card_updated",
      title: "Source draft Pi refresh proposed",
      summary: `Pi proposed reviewable source-impact updates for ${appliedCardIds.length} affected draft card${
        appliedCardIds.length === 1 ? "" : "s"
      }; ${skippedCardIds.length} skipped. Approved cards were not rewritten.`,
      entityKind: "project_board",
      entityId: input.boardId,
      metadata: {
        sourceImpact: {
          schemaVersion: 1,
          appliedAction: "propose_targeted_draft_refresh",
          sourceImpactEventIds: context.sourceImpactEventIds,
          sourceIds: context.sourceIds,
          affectedDraftCardIds: context.affectedDraftCardIds,
          affectedExecutableCardIds: context.affectedExecutableCardIds,
          appliedCardIds,
          skippedCardIds,
          pendingPiUpdateCardIds: appliedCardIds,
          existingCardsRewritten: false,
          modelCallRequired: true,
          fallbackUsed: Boolean(input.fallbackUsed),
          providerError: input.providerError,
          model: input.model,
          telemetry: input.telemetry,
        },
      },
      createdAt: now,
    });

    return this.deps.getProjectBoard(input.boardId) ?? board;
  }

  refreshProjectBoardSourceDrafts(input: RefreshProjectBoardSourceDraftsInput): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const events = this.deps.listProjectBoardEvents(input.boardId, 200);
    const refreshedByEventAndCard = new Set<string>();
    for (const event of events) {
      const refresh = projectBoardSourceDraftRefreshEventMetadata(event);
      if (!refresh) continue;
      for (const eventId of refresh.sourceImpactEventIds) {
        for (const cardId of refresh.appliedCardIds) refreshedByEventAndCard.add(`${eventId}:${cardId}`);
      }
    }

    const records = this.matchingSourceImpactRecords(input, (impact) => impact.targetedRefreshOptional, events);
    if (records.length === 0) {
      throw new Error("No source impact records matched affected draft cards.");
    }

    const context = this.sourceImpactContext(input.boardId, records);
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const note = projectBoardSourceDraftRefreshNote({
      sources: context.sources.filter((source) => context.sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: context.selectedObservationCount,
    });
    const now = new Date().toISOString();

    for (const cardId of context.affectedDraftCardIds) {
      let card: ProjectBoardCard;
      try {
        card = this.deps.getProjectBoardCard(cardId);
      } catch {
        skippedCardIds.push(cardId);
        continue;
      }
      if (card.boardId !== input.boardId || card.status !== "draft" || card.orchestrationTaskId) {
        skippedCardIds.push(cardId);
        continue;
      }
      if (
        context.sourceImpactEventIds.length > 0 &&
        context.sourceImpactEventIds.every((eventId) => refreshedByEventAndCard.has(`${eventId}:${card.id}`))
      ) {
        skippedCardIds.push(cardId);
        continue;
      }
      const description = projectBoardDescriptionWithSourceImpactRefresh(card.description, note).slice(0, 4000);
      if (description === card.description) {
        skippedCardIds.push(cardId);
        continue;
      }
      this.db
        .prepare(
          `UPDATE project_board_cards
           SET description = ?,
               updated_at = ?
           WHERE id = ?`,
        )
        .run(description, now, card.id);
      appliedCardIds.push(card.id);
    }

    if (appliedCardIds.length > 0) {
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Source drafts refreshed",
        summary: `Source impact notes refreshed on ${appliedCardIds.length} affected draft card${
          appliedCardIds.length === 1 ? "" : "s"
        }; ${skippedCardIds.length} skipped. 0 model calls.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          sourceImpact: {
            schemaVersion: 1,
            appliedAction: "refresh_affected_drafts",
            sourceImpactEventIds: context.sourceImpactEventIds,
            sourceIds: context.sourceIds,
            affectedDraftCardIds: context.affectedDraftCardIds,
            affectedExecutableCardIds: context.affectedExecutableCardIds,
            appliedCardIds,
            skippedCardIds,
            existingCardsRewritten: false,
            modelCallRequired: false,
          },
        },
        createdAt: now,
      });
    }

    return this.deps.getProjectBoard(input.boardId) ?? board;
  }

  applyProjectBoardSourceImpactFeedback(input: ApplyProjectBoardSourceImpactFeedbackInput): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const records = this.matchingSourceImpactRecords(input, (impact) => impact.nextRunFeedbackRecommended);
    if (records.length === 0) {
      throw new Error("No source impact records matched ticketized cards.");
    }

    const context = this.sourceImpactContext(input.boardId, records);
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const feedback = projectBoardSourceImpactFeedbackText({
      sources: context.sources.filter((source) => context.sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: context.selectedObservationCount,
    });
    const now = new Date().toISOString();

    for (const cardId of context.affectedExecutableCardIds) {
      let card: ProjectBoardCard;
      try {
        card = this.deps.getProjectBoardCard(cardId);
      } catch {
        skippedCardIds.push(cardId);
        continue;
      }
      if (
        card.boardId !== input.boardId ||
        !card.orchestrationTaskId ||
        card.status === "draft" ||
        card.status === "done" ||
        card.status === "archived" ||
        card.status === "in_progress" ||
        projectBoardHasSourceImpactFeedback(card, context.sourceImpactEventIds, context.sourceIds)
      ) {
        skippedCardIds.push(cardId);
        continue;
      }
      this.deps.addProjectBoardCardRunFeedback({
        cardId: card.id,
        feedback,
        source: "source_impact",
        sourceImpactEventId: context.sourceImpactEventIds.length === 1 ? context.sourceImpactEventIds[0] : undefined,
        sourceImpactEventIds: context.sourceImpactEventIds,
        sourceIds: context.sourceIds,
      });
      appliedCardIds.push(card.id);
    }

    if (appliedCardIds.length > 0) {
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "card_updated",
        title: "Source impact feedback added",
        summary: `Source impact created next-run feedback for ${appliedCardIds.length} ticketized card${
          appliedCardIds.length === 1 ? "" : "s"
        }; ${skippedCardIds.length} skipped. 0 model calls.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          sourceImpact: {
            schemaVersion: 1,
            appliedAction: "create_next_run_feedback",
            sourceImpactEventIds: context.sourceImpactEventIds,
            sourceIds: context.sourceIds,
            affectedDraftCardIds: context.affectedDraftCardIds,
            affectedExecutableCardIds: context.affectedExecutableCardIds,
            appliedCardIds,
            skippedCardIds,
            existingCardsRewritten: false,
            modelCallRequired: false,
          },
        },
        createdAt: now,
      });
    }

    return this.deps.getProjectBoard(input.boardId) ?? board;
  }

  private matchingSourceImpactRecords(
    input: {
      boardId: string;
      sourceId?: string;
      sourceIds?: string[];
      sourceImpactEventId?: string;
    },
    acceptsImpact: SourceImpactPredicate,
    events = this.deps.listProjectBoardEvents(input.boardId, 200),
  ): ProjectBoardSourceDraftRefreshRecord[] {
    const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
    const records: ProjectBoardSourceDraftRefreshRecord[] = [];
    const seenRecordKeys = new Set<string>();

    for (const event of events) {
      const impact = projectBoardSourceImpactMetadataFromEvent(event);
      if (!impact || !acceptsImpact(impact)) continue;
      if (input.sourceImpactEventId && event.id !== input.sourceImpactEventId) continue;
      if (selectedSourceIds.size > 0 && ![impact.sourceId, ...impact.groupSourceIds].some((id) => selectedSourceIds.has(id))) continue;
      const record: ProjectBoardSourceDraftRefreshRecord = { eventId: event.id, createdAt: event.createdAt, impact };
      const key = projectBoardSourceDraftRefreshRecordKey(record);
      if (!input.sourceImpactEventId && seenRecordKeys.has(key)) continue;
      seenRecordKeys.add(key);
      records.push(record);
    }

    if (records.length === 0 && selectedSourceIds.size > 0) {
      const sources = this.deps.listProjectBoardSources(input.boardId).filter((source) => selectedSourceIds.has(source.id));
      for (const source of sources) {
        const impact = this.projectBoardSourceUpdateImpact(source, source);
        if (!acceptsImpact(impact)) continue;
        const record: ProjectBoardSourceDraftRefreshRecord = { impact };
        const key = projectBoardSourceDraftRefreshRecordKey(record);
        if (seenRecordKeys.has(key)) continue;
        seenRecordKeys.add(key);
        records.push(record);
      }
    }

    return records;
  }

  private sourceImpactContext(boardId: string, records: ProjectBoardSourceDraftRefreshRecord[]) {
    const sources = this.deps.listProjectBoardSources(boardId);
    const sourceIds = [
      ...new Set(
        records.flatMap((record) => (record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId])),
      ),
    ];
    return {
      sources,
      sourceIds,
      affectedDraftCardIds: [...new Set(records.flatMap((record) => record.impact.affectedDraftCardIds))],
      affectedExecutableCardIds: [...new Set(records.flatMap((record) => record.impact.affectedExecutableCardIds))],
      sourceImpactEventIds: records.map((record) => record.eventId).filter((id): id is string => Boolean(id)),
      selectedObservationCount: records.reduce((total, record) => total + record.impact.selectedObservationCount, 0),
    };
  }

  private projectBoardSourceUpdateImpact(
    previousSource: ProjectBoardSource,
    nextSource: ProjectBoardSource,
  ): ProjectBoardSourceUpdateImpactMetadata {
    return projectBoardSourceUpdateImpactForRepository(this.deps, previousSource, nextSource);
  }
}

export function projectBoardSourceUpdateImpactForRepository(
  deps: ProjectStoreProjectBoardSourceRepositoryDeps,
  previousSource: ProjectBoardSource,
  nextSource: ProjectBoardSource,
): ProjectBoardSourceUpdateImpactMetadata {
  return projectBoardSourceUpdateImpactMetadata({
    previousSource,
    nextSource,
    sources: deps.listProjectBoardSources(nextSource.boardId),
    cards: deps.listProjectBoardCards(nextSource.boardId),
  });
}
