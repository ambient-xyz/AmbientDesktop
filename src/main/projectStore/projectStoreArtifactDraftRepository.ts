import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import {
  artifactDraftStateIsTerminal,
  defaultArtifactDraftRetention,
  defaultArtifactDraftValidationState,
  artifactDraftSchemaVersion,
  type ArtifactDraftEvent,
  type ArtifactDraftManifest,
  type ArtifactDraftSummary,
  type CreateArtifactDraftInput,
  type ListArtifactDraftOptions,
  type UpdateArtifactDraftStateInput,
} from "../../shared/artifactDrafts";
import {
  appendArtifactDraftEventLog,
  artifactDraftContentFileName,
  artifactDraftLayout,
  assertArtifactDraftId,
  ensureArtifactDraftLayout,
  readArtifactDraftManifest as readArtifactDraftManifestFile,
  removeArtifactDraftLayout,
  writeArtifactDraftManifestAtomic,
} from "../artifactDraftStore";
import { normalizeArtifactDraftTargetPath } from "./projectStoreFacadeHelpers";
import {
  mapArtifactDraftEventRow,
  mapArtifactDraftRow,
  normalizeArtifactDraftAssembly,
  normalizeArtifactDraftKind,
  normalizeArtifactDraftOrigin,
  normalizeArtifactDraftState,
  type ArtifactDraftEventRow,
  type ArtifactDraftRow,
} from "./projectStoreArtifactDraftMappers";

export class ProjectStoreArtifactDraftRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly workspacePath: string,
  ) {}

  async createArtifactDraft(input: CreateArtifactDraftInput): Promise<ArtifactDraftSummary> {
    const now = input.createdAt ?? new Date().toISOString();
    const id = assertArtifactDraftId(input.id ?? `draft_${randomUUID()}`);
    const kind = normalizeArtifactDraftKind(input.kind);
    const assembly = normalizeArtifactDraftAssembly(input.assembly);
    const origin = normalizeArtifactDraftOrigin(input.origin);
    const targetPath = normalizeArtifactDraftTargetPath(this.workspacePath, input.targetPath);
    const layout = artifactDraftLayout(this.workspacePath, id, artifactDraftContentFileName(kind, assembly));
    const retention = input.retention ?? defaultArtifactDraftRetention("created", now);
    const validationState = defaultArtifactDraftValidationState(input.validationState);
    const manifest: ArtifactDraftManifest = {
      schemaVersion: artifactDraftSchemaVersion,
      draftId: id,
      kind,
      assembly,
      targetPath,
      state: "created",
      origin,
      ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
      validationState,
      retention,
      paths: layout,
      createdAt: now,
      updatedAt: now,
    };

    await ensureArtifactDraftLayout(layout);
    await writeArtifactDraftManifestAtomic(manifest);
    this.db
      .prepare(
        `INSERT INTO artifact_drafts (
          id, workspace_path, target_path, kind, assembly, state, origin, source_run_id,
          root_path, manifest_path, content_path, validation_json, retention_json,
          created_at, updated_at, completed_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        this.workspacePath,
        targetPath,
        kind,
        assembly,
        "created",
        origin,
        input.sourceRunId ?? null,
        layout.rootPath,
        layout.manifestPath,
        layout.contentPath ?? null,
        JSON.stringify(validationState),
        JSON.stringify(retention),
        now,
        now,
        null,
        retention.retainUntil ?? null,
      );
    await this.appendArtifactDraftEvent({
      draftId: id,
      eventType: "created",
      summary: `Created artifact draft for ${targetPath}.`,
      metadata: { targetPath, kind, assembly, origin },
      createdAt: now,
    });
    return this.requireArtifactDraft(id);
  }

  getArtifactDraft(draftId: string): ArtifactDraftSummary | undefined {
    const row = this.db.prepare("SELECT * FROM artifact_drafts WHERE id = ?").get(draftId) as ArtifactDraftRow | undefined;
    return row ? this.mapArtifactDraft(row) : undefined;
  }

  requireArtifactDraft(draftId: string): ArtifactDraftSummary {
    const draft = this.getArtifactDraft(draftId);
    if (!draft) throw new Error(`Unknown artifact draft: ${draftId}`);
    return draft;
  }

  listArtifactDrafts(options: ListArtifactDraftOptions = {}): ArtifactDraftSummary[] {
    const rows = this.db.prepare("SELECT * FROM artifact_drafts ORDER BY updated_at DESC, created_at DESC").all() as ArtifactDraftRow[];
    const states = options.state
      ? new Set(Array.isArray(options.state) ? options.state : [options.state])
      : undefined;
    const now = new Date().toISOString();
    const filtered = rows
      .map((row) => this.mapArtifactDraft(row))
      .filter((draft) => !states || states.has(draft.state))
      .filter((draft) => options.includeExpired === true || !draft.retention.retainUntil || draft.retention.retainUntil > now);
    return filtered.slice(0, Math.max(1, Math.min(options.limit ?? 100, 500)));
  }

  async updateArtifactDraftState(input: UpdateArtifactDraftStateInput): Promise<ArtifactDraftSummary> {
    const previous = this.requireArtifactDraft(input.draftId);
    const { eventCount: _eventCount, ...previousManifest } = previous;
    const state = normalizeArtifactDraftState(input.state);
    const updatedAt = input.updatedAt ?? new Date().toISOString();
    const completedAt = artifactDraftStateIsTerminal(state) ? updatedAt : previous.completedAt;
    const validationState = input.validationState
      ? defaultArtifactDraftValidationState({ ...previous.validationState, ...input.validationState })
      : previous.validationState;
    const retention = input.retention ?? defaultArtifactDraftRetention(state, updatedAt);
    const manifest: ArtifactDraftManifest = {
      ...previousManifest,
      state,
      validationState,
      retention,
      updatedAt,
      ...(completedAt ? { completedAt } : {}),
    };
    await writeArtifactDraftManifestAtomic(manifest);
    this.db
      .prepare(
        `UPDATE artifact_drafts
         SET state = ?, validation_json = ?, retention_json = ?, updated_at = ?, completed_at = ?, expires_at = ?
         WHERE id = ?`,
      )
      .run(state, JSON.stringify(validationState), JSON.stringify(retention), updatedAt, completedAt ?? null, retention.retainUntil ?? null, previous.draftId);
    await this.appendArtifactDraftEvent({
      draftId: previous.draftId,
      eventType: input.eventType ?? `state_${state}`,
      summary: input.summary ?? `Artifact draft moved to ${state}.`,
      metadata: input.metadata ?? {},
      createdAt: updatedAt,
    });
    return this.requireArtifactDraft(previous.draftId);
  }

  async appendArtifactDraftEvent(input: {
    draftId: string;
    eventType: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): Promise<ArtifactDraftEvent> {
    const draft = this.requireArtifactDraft(input.draftId);
    const row = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) AS max_seq FROM artifact_draft_events WHERE draft_id = ?")
      .get(input.draftId) as { max_seq: number };
    const event: ArtifactDraftEvent = {
      id: randomUUID(),
      draftId: input.draftId,
      seq: row.max_seq + 1,
      eventType: input.eventType,
      createdAt: input.createdAt ?? new Date().toISOString(),
      summary: input.summary ?? "",
      metadata: input.metadata ?? {},
    };
    this.db
      .prepare(
        `INSERT INTO artifact_draft_events (id, draft_id, seq, event_type, created_at, summary, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(event.id, event.draftId, event.seq, event.eventType, event.createdAt, event.summary, JSON.stringify(event.metadata));
    await appendArtifactDraftEventLog(draft.paths.eventsPath, event);
    return event;
  }

  listArtifactDraftEvents(draftId: string): ArtifactDraftEvent[] {
    return (this.db
      .prepare("SELECT * FROM artifact_draft_events WHERE draft_id = ? ORDER BY seq ASC")
      .all(draftId) as ArtifactDraftEventRow[]).map((row) => mapArtifactDraftEventRow(row));
  }

  readArtifactDraftManifest(draftId: string): Promise<ArtifactDraftManifest> {
    return readArtifactDraftManifestFile(this.requireArtifactDraft(draftId).paths.manifestPath);
  }

  async pruneExpiredArtifactDrafts(nowIso = new Date().toISOString()): Promise<{ removedDraftIds: string[] }> {
    const rows = this.db
      .prepare(
        `SELECT * FROM artifact_drafts
         WHERE expires_at IS NOT NULL
           AND expires_at <= ?
           AND state IN ('committed', 'aborted')`,
      )
      .all(nowIso) as ArtifactDraftRow[];
    const removedDraftIds: string[] = [];
    for (const row of rows) {
      const draft = this.mapArtifactDraft(row);
      await removeArtifactDraftLayout(draft.paths);
      this.db.prepare("DELETE FROM artifact_draft_events WHERE draft_id = ?").run(draft.draftId);
      this.db.prepare("DELETE FROM artifact_drafts WHERE id = ?").run(draft.draftId);
      removedDraftIds.push(draft.draftId);
    }
    return { removedDraftIds };
  }

  private mapArtifactDraft(row: ArtifactDraftRow): ArtifactDraftSummary {
    const eventCountRow = this.db
      .prepare("SELECT COUNT(*) AS count FROM artifact_draft_events WHERE draft_id = ?")
      .get(row.id) as { count: number };
    return mapArtifactDraftRow(row, eventCountRow.count);
  }
}
