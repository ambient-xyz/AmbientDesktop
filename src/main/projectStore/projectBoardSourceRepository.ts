import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  AddProjectBoardCardRunFeedbackInput,
  ApplyProjectBoardSourceImpactFeedbackInput,
  ProjectBoardCard,
  ProjectBoardCardPendingPiUpdate,
  ProjectBoardCardTouchedField,
  ProjectBoardEvent,
  ProjectBoardSource,
  ProjectBoardSourceKind,
  ProjectBoardSummary,
  RefreshProjectBoardSourceDraftsInput,
} from "../../shared/projectBoardTypes";
import type { StageProjectBoardSourceDraftPiUpdatesInput } from "./projectStoreFacadeHelpers";
import { projectBoardSourceKey } from "./projectStoreProjectBoardFacade";
import {
  mapProjectBoardSourceRow,
  normalizeCardTextList,
  normalizeProjectBoardCardTestPlan,
  normalizeProjectBoardClarificationDecisions,
  normalizeProjectBoardClarificationQuestions,
  normalizeProjectBoardSourceInputs,
  normalizeTaskLabels,
  projectBoardDescriptionWithSourceImpactRefresh,
  projectBoardHasSourceImpactFeedback,
  projectBoardSourceDraftRefreshNote,
  projectBoardSourceDraftRefreshEventMetadata,
  projectBoardSourceDraftRefreshRecordKey,
  projectBoardSourceImpactFeedbackText,
  projectBoardSourceClassificationUpdates,
  projectBoardSourceKindCounts,
  projectBoardSourceRefreshEventMetadata,
  projectBoardSourceRefreshSources,
  projectBoardSourceRefreshStats,
  projectBoardSourceRefreshStoreRow,
  projectBoardSourceRefreshSummary,
  projectBoardSourceUpdateImpactMetadata,
  projectBoardSourceUserClassificationUpdate,
  projectBoardSourceImpactMetadataFromEvent,
  type ProjectBoardSourceClassificationInput,
  type ProjectBoardSourceDraftRefreshRecord,
  type ProjectBoardSourceStoreRow,
  type ProjectBoardSourceUpdateImpactMetadata,
} from "./projectBoardMappers";

export type ProjectBoardSourceInput = Omit<ProjectBoardSource, "id" | "boardId" | "createdAt" | "updatedAt">;

export type ProjectBoardSourceEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardSourceRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  getProjectBoardCard(cardId: string): ProjectBoardCard;
  listProjectBoardEvents(boardId: string, limit?: number): ProjectBoardEvent[];
  listProjectBoardSources(boardId: string): ProjectBoardSource[];
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
  addProjectBoardCardRunFeedback(input: AddProjectBoardCardRunFeedbackInput): ProjectBoardCard;
  appendProjectBoardEvent(input: ProjectBoardSourceEventInput): void;
}

export class ProjectStoreProjectBoardSourceRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSourceRepositoryDeps,
  ) {}

  replaceProjectBoardSources(boardId: string, sources: ProjectBoardSourceInput[]): ProjectBoardSource[] {
    const board = this.db.prepare("SELECT id, source_thread_id FROM project_boards WHERE id = ?").get(boardId) as
      | { id: string; source_thread_id: string | null }
      | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    const now = new Date().toISOString();
    const bounded = normalizeProjectBoardSourceInputs(sources);
    const inferredSourceThreadId =
      bounded.find((source) => source.kind === "plan_artifact" && source.threadId?.trim())?.threadId?.trim() ??
      bounded.find((source) => source.kind === "implementation_plan" && source.threadId?.trim())?.threadId?.trim() ??
      bounded.find((source) => source.threadId?.trim())?.threadId?.trim();
    const previousSources = this.deps.listProjectBoardSources(boardId);
    const nextSources = projectBoardSourceRefreshSources({
      previousSources,
      sources: bounded,
      now,
      createId: randomUUID,
    });
    const refreshStats = projectBoardSourceRefreshStats({ previousSources, nextSources });
    const {
      preservedClassificationCount,
      newCount,
      changedCount,
      unchangedCount,
      removedCount,
    } = refreshStats;
    const transaction = this.db.transaction(() => {
      this.db.prepare("DELETE FROM project_board_sources WHERE board_id = ?").run(boardId);
      const insert = this.db.prepare(
        `INSERT INTO project_board_sources
        (id, board_id, source_kind, source_key, content_hash, change_state, title, summary, excerpt, path, thread_id, artifact_id, message_id,
         byte_size, mtime, classification_reason, classified_by, classification_confidence, authority_role, include_in_synthesis, relevance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const source of nextSources) {
        const row = projectBoardSourceRefreshStoreRow({ source, boardId, updatedAt: now });
        insert.run(
          row.id,
          row.board_id,
          row.source_kind,
          row.source_key,
          row.content_hash,
          row.change_state,
          row.title,
          row.summary,
          row.excerpt,
          row.path,
          row.thread_id,
          row.artifact_id,
          row.message_id,
          row.byte_size,
          row.mtime,
          row.classification_reason,
          row.classified_by,
          row.classification_confidence,
          row.authority_role,
          row.include_in_synthesis,
          row.relevance,
          row.created_at,
          row.updated_at,
        );
      }
      if (!board.source_thread_id && inferredSourceThreadId) {
        this.db.prepare("UPDATE project_boards SET source_thread_id = ?, updated_at = ? WHERE id = ?").run(inferredSourceThreadId, now, boardId);
      } else {
        this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardId);
      }
      this.deps.appendProjectBoardEvent({
        boardId,
        kind: "sources_refreshed",
        title: "Sources refreshed",
        summary: projectBoardSourceRefreshSummary({
          nextCount: nextSources.length,
          newCount,
          changedCount,
          unchangedCount,
          removedCount,
          preservedClassificationCount,
        }),
        entityKind: "project_board",
        entityId: boardId,
        metadata: projectBoardSourceRefreshEventMetadata({ previousSources, nextSources, stats: refreshStats }),
        createdAt: now,
      });
    });
    transaction();
    return this.deps.listProjectBoardSources(boardId);
  }

  getProjectBoardSource(sourceId: string): ProjectBoardSource {
    const row = this.db
      .prepare("SELECT * FROM project_board_sources WHERE id = ?")
      .get(sourceId) as ProjectBoardSourceStoreRow | undefined;
    if (!row) throw new Error(`Project board source not found: ${sourceId}`);
    return mapProjectBoardSourceRow(row);
  }

  updateProjectBoardSource(input: { sourceId: string; kind: ProjectBoardSourceKind; includeInSynthesis?: boolean }): ProjectBoardSource {
    const current = this.db
      .prepare("SELECT * FROM project_board_sources WHERE id = ?")
      .get(input.sourceId) as ProjectBoardSourceStoreRow | undefined;
    if (!current) throw new Error(`Project board source not found: ${input.sourceId}`);
    const previousSource = mapProjectBoardSourceRow(current);
    const now = new Date().toISOString();
    const update = projectBoardSourceUserClassificationUpdate({
      previousKind: current.source_kind,
      previousRelevance: current.relevance,
      kind: input.kind,
      includeInSynthesis: input.includeInSynthesis,
    });
    this.db
      .prepare(
        `UPDATE project_board_sources
         SET source_kind = ?, relevance = ?, classified_by = ?, classification_confidence = ?, classification_reason = ?,
             authority_role = ?, include_in_synthesis = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        update.kind,
        update.relevance,
        update.classifiedBy,
        update.classificationConfidence,
        update.classificationReason,
        update.authorityRole,
        update.includeInSynthesis ? 1 : 0,
        now,
        input.sourceId,
      );
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, current.board_id);
    const row = this.db.prepare("SELECT * FROM project_board_sources WHERE id = ?").get(input.sourceId) as ProjectBoardSourceStoreRow | undefined;
    if (!row) throw new Error(`Project board source not found after update: ${input.sourceId}`);
    const nextSource = mapProjectBoardSourceRow(row);
    if (current.source_kind !== update.kind || current.include_in_synthesis !== (update.includeInSynthesis ? 1 : 0)) {
      const sourceImpact = this.projectBoardSourceUpdateImpact(previousSource, nextSource);
      this.deps.appendProjectBoardEvent({
        boardId: current.board_id,
        kind: "source_updated",
        title: current.source_kind !== update.kind ? "Source reclassified" : "Source inclusion updated",
        summary:
          current.source_kind !== update.kind
            ? `${current.title} moved from ${current.source_kind} to ${update.kind}.`
            : `${current.title} ${update.includeInSynthesis ? "included in" : "excluded from"} project-board synthesis.`,
        entityKind: "project_board_source",
        entityId: current.id,
        metadata: {
          sourceId: current.id,
          from: current.source_kind,
          to: update.kind,
          includeInSynthesis: update.includeInSynthesis,
          sourceImpact,
        },
        createdAt: now,
      });
    }
    return nextSource;
  }

  applyProjectBoardSourceClassifications(boardId: string, inputs: ProjectBoardSourceClassificationInput[]): ProjectBoardSource[] {
    const board = this.db.prepare("SELECT id FROM project_boards WHERE id = ?").get(boardId) as { id: string } | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (inputs.length === 0) return this.deps.listProjectBoardSources(boardId);

    const currentSources = this.deps.listProjectBoardSources(boardId);
    const updates = projectBoardSourceClassificationUpdates(currentSources, inputs);
    if (updates.length === 0) return this.deps.listProjectBoardSources(boardId);

    const now = new Date().toISOString();
    const transaction = this.db.transaction(() => {
      const update = this.db.prepare(
        `UPDATE project_board_sources
         SET source_kind = ?, relevance = ?, classified_by = ?, classification_confidence = ?, classification_reason = ?,
             authority_role = ?, include_in_synthesis = ?, updated_at = ?
         WHERE id = ? AND board_id = ?`,
      );
      for (const item of updates) {
        update.run(
          item.kind,
          item.relevance,
          "ambient_pi",
          item.confidence,
          item.reason,
          item.authorityRole,
          item.includeInSynthesis ? 1 : 0,
          now,
          item.source.id,
          boardId,
        );
      }
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, boardId);
      const sourceKinds = projectBoardSourceKindCounts(updates);
      this.deps.appendProjectBoardEvent({
        boardId,
        kind: "source_updated",
        title: "Sources classified by Pi",
        summary: `Ambient/Pi classified ${updates.length} project source${updates.length === 1 ? "" : "s"} for board synthesis.`,
        entityKind: "project_board",
        entityId: boardId,
        metadata: {
          classifiedBy: "ambient_pi",
          classificationCount: updates.length,
          sourceIds: updates.map((item) => item.source.id),
          sourceKeys: updates.map((item) => item.source.sourceKey ?? projectBoardSourceKey(item.source)),
          sourceKinds,
          model: updates.map((item) => item.model).find(Boolean),
        },
        createdAt: now,
      });
    });
    transaction();
    return this.deps.listProjectBoardSources(boardId);
  }

  stageProjectBoardSourceDraftPiUpdates(input: StageProjectBoardSourceDraftPiUpdatesInput): ProjectBoardSummary {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
    const events = this.deps.listProjectBoardEvents(input.boardId, 200);
    const records: ProjectBoardSourceDraftRefreshRecord[] = [];
    const seenRecordKeys = new Set<string>();

    for (const event of events) {
      const impact = projectBoardSourceImpactMetadataFromEvent(event);
      if (!impact || !impact.targetedRefreshOptional) continue;
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
        if (!impact.targetedRefreshOptional) continue;
        const record: ProjectBoardSourceDraftRefreshRecord = { impact };
        const key = projectBoardSourceDraftRefreshRecordKey(record);
        if (seenRecordKeys.has(key)) continue;
        seenRecordKeys.add(key);
        records.push(record);
      }
    }

    if (records.length === 0) {
      throw new Error("No source impact records matched affected draft cards.");
    }

    const sources = this.deps.listProjectBoardSources(input.boardId);
    const sourceIds = [...new Set(records.flatMap((record) => record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId]))];
    const affectedDraftCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedDraftCardIds)),
    ];
    const affectedExecutableCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedExecutableCardIds)),
    ];
    const sourceImpactEventIds = records.map((record) => record.eventId).filter((id): id is string => Boolean(id));
    const note = projectBoardSourceDraftRefreshNote({
      sources: sources.filter((source) => sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: records.reduce((total, record) => total + record.impact.selectedObservationCount, 0),
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

    for (const cardId of affectedDraftCardIds) {
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
      const nextDescription = (suggestion?.description?.trim()
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
        : card.clarificationQuestions ?? [];
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
        sourceId: `source:${sourceIds.slice().sort().join("|") || "impact"}`,
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
          sourceImpactEventIds,
          sourceIds,
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
          sourceImpactEventIds,
          sourceIds,
          affectedDraftCardIds,
          affectedExecutableCardIds,
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
    const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
    const events = this.deps.listProjectBoardEvents(input.boardId, 200);
    const refreshedByEventAndCard = new Set<string>();
    for (const event of events) {
      const refresh = projectBoardSourceDraftRefreshEventMetadata(event);
      if (!refresh) continue;
      for (const eventId of refresh.sourceImpactEventIds) {
        for (const cardId of refresh.appliedCardIds) refreshedByEventAndCard.add(`${eventId}:${cardId}`);
      }
    }

    const records: ProjectBoardSourceDraftRefreshRecord[] = [];
    const seenRecordKeys = new Set<string>();
    for (const event of events) {
      const impact = projectBoardSourceImpactMetadataFromEvent(event);
      if (!impact || !impact.targetedRefreshOptional) continue;
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
        if (!impact.targetedRefreshOptional) continue;
        const record: ProjectBoardSourceDraftRefreshRecord = { impact };
        const key = projectBoardSourceDraftRefreshRecordKey(record);
        if (seenRecordKeys.has(key)) continue;
        seenRecordKeys.add(key);
        records.push(record);
      }
    }

    if (records.length === 0) {
      throw new Error("No source impact records matched affected draft cards.");
    }

    const sources = this.deps.listProjectBoardSources(input.boardId);
    const sourceIds = [...new Set(records.flatMap((record) => record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId]))];
    const affectedDraftCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedDraftCardIds)),
    ];
    const affectedExecutableCardIds = [
      ...new Set(records.flatMap((record) => record.impact.affectedExecutableCardIds)),
    ];
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const sourceImpactEventIds = records.map((record) => record.eventId).filter((id): id is string => Boolean(id));
    const note = projectBoardSourceDraftRefreshNote({
      sources: sources.filter((source) => sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: records.reduce((total, record) => total + record.impact.selectedObservationCount, 0),
    });
    const now = new Date().toISOString();

    for (const cardId of affectedDraftCardIds) {
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
      if (sourceImpactEventIds.length > 0 && sourceImpactEventIds.every((eventId) => refreshedByEventAndCard.has(`${eventId}:${card.id}`))) {
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
            sourceImpactEventIds,
            sourceIds,
            affectedDraftCardIds,
            affectedExecutableCardIds,
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
    const selectedSourceIds = new Set([input.sourceId, ...(input.sourceIds ?? [])].filter((id): id is string => Boolean(id?.trim())));
    const events = this.deps.listProjectBoardEvents(input.boardId, 200);
    const records: ProjectBoardSourceDraftRefreshRecord[] = [];
    const seenRecordKeys = new Set<string>();

    for (const event of events) {
      const impact = projectBoardSourceImpactMetadataFromEvent(event);
      if (!impact || !impact.nextRunFeedbackRecommended) continue;
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
        if (!impact.nextRunFeedbackRecommended) continue;
        const record: ProjectBoardSourceDraftRefreshRecord = { impact };
        const key = projectBoardSourceDraftRefreshRecordKey(record);
        if (seenRecordKeys.has(key)) continue;
        seenRecordKeys.add(key);
        records.push(record);
      }
    }

    if (records.length === 0) {
      throw new Error("No source impact records matched ticketized cards.");
    }

    const sources = this.deps.listProjectBoardSources(input.boardId);
    const sourceIds = [...new Set(records.flatMap((record) => record.impact.groupSourceIds.length > 0 ? record.impact.groupSourceIds : [record.impact.sourceId]))];
    const affectedDraftCardIds = [...new Set(records.flatMap((record) => record.impact.affectedDraftCardIds))];
    const affectedExecutableCardIds = [...new Set(records.flatMap((record) => record.impact.affectedExecutableCardIds))];
    const sourceImpactEventIds = records.map((record) => record.eventId).filter((id): id is string => Boolean(id));
    const appliedCardIds: string[] = [];
    const skippedCardIds: string[] = [];
    const feedback = projectBoardSourceImpactFeedbackText({
      sources: sources.filter((source) => sourceIds.includes(source.id)),
      impactRecordCount: records.length,
      selectedObservationCount: records.reduce((total, record) => total + record.impact.selectedObservationCount, 0),
    });
    const now = new Date().toISOString();

    for (const cardId of affectedExecutableCardIds) {
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
        projectBoardHasSourceImpactFeedback(card, sourceImpactEventIds, sourceIds)
      ) {
        skippedCardIds.push(cardId);
        continue;
      }
      this.deps.addProjectBoardCardRunFeedback({
        cardId: card.id,
        feedback,
        source: "source_impact",
        sourceImpactEventId: sourceImpactEventIds.length === 1 ? sourceImpactEventIds[0] : undefined,
        sourceImpactEventIds,
        sourceIds,
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
            sourceImpactEventIds,
            sourceIds,
            affectedDraftCardIds,
            affectedExecutableCardIds,
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

  projectBoardSourceUpdateImpact(
    previousSource: ProjectBoardSource,
    nextSource: ProjectBoardSource,
  ): ProjectBoardSourceUpdateImpactMetadata {
    return projectBoardSourceUpdateImpactMetadata({
      previousSource,
      nextSource,
      sources: this.deps.listProjectBoardSources(nextSource.boardId),
      cards: this.deps.listProjectBoardCards(nextSource.boardId),
    });
  }
}
