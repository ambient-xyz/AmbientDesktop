import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardCard,
  ProjectBoardEvent,
  ProjectBoardSource,
  ProjectBoardSourceKind,
} from "../../shared/projectBoardTypes";
import { projectBoardSourceKey } from "../projectBoardSourceIdentity";
import {
  mapProjectBoardSourceRow,
  normalizeProjectBoardSourceInputs,
  projectBoardSourceClassificationUpdates,
  projectBoardSourceKindCounts,
  projectBoardSourceRefreshEventMetadata,
  projectBoardSourceRefreshSources,
  projectBoardSourceRefreshStats,
  projectBoardSourceRefreshStoreRow,
  projectBoardSourceRefreshSummary,
  projectBoardSourceUpdateImpactMetadata,
  projectBoardSourceUserClassificationUpdate,
  type ProjectBoardSourceClassificationInput,
  type ProjectBoardSourceStoreRow,
  type ProjectBoardSourceUpdateImpactMetadata,
} from "./projectBoardMappers";

export type ProjectBoardSourceInput = Omit<ProjectBoardSource, "id" | "boardId" | "createdAt" | "updatedAt">;

export type ProjectBoardSourceEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardSourceRepositoryDeps {
  listProjectBoardSources(boardId: string): ProjectBoardSource[];
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
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
