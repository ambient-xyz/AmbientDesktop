import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  SubagentMaturityEvidence,
  SubagentMaturityEvidenceKind,
  SubagentMaturityEvidenceStatus,
} from "../../shared/subagentMaturity";
import {
  mapSubagentMaturityEvidenceRow,
  normalizeOptionalString,
  normalizeSubagentMaturityEvidenceKind,
  normalizeSubagentMaturityEvidenceStatus,
  type SubagentMaturityEvidenceRow,
} from "../projectStoreSubagentMappers";

export interface SubagentMaturityEvidenceRunRef {
  id: string;
  parentRunId: string;
}

export interface RecordSubagentMaturityEvidenceInput {
  kind: SubagentMaturityEvidenceKind;
  status: SubagentMaturityEvidenceStatus;
  evidenceKey?: string;
  run?: SubagentMaturityEvidenceRunRef;
  parentRunId?: string;
  artifactPath?: string;
  reviewer?: string;
  notes?: string;
  details?: Record<string, unknown>;
  createdAt?: string;
}

export class ProjectStoreSubagentMaturityEvidenceRepository {
  constructor(private readonly db: Database.Database) {}

  recordSubagentMaturityEvidence(input: RecordSubagentMaturityEvidenceInput): SubagentMaturityEvidence {
    const kind = normalizeSubagentMaturityEvidenceKind(input.kind);
    const status = normalizeSubagentMaturityEvidenceStatus(input.status);
    const now = input.createdAt ?? new Date().toISOString();
    const evidenceKey = normalizeOptionalString(input.evidenceKey) ?? (input.run ? `${kind}:${input.run.id}` : undefined);
    const parentRunId = normalizeOptionalString(input.parentRunId) ?? input.run?.parentRunId;
    const existing = evidenceKey ? this.findSubagentMaturityEvidenceByKey(kind, evidenceKey) : undefined;
    const detailsJson = input.details === undefined ? null : JSON.stringify(input.details);
    if (existing) {
      this.db
        .prepare(
          `UPDATE subagent_maturity_evidence
           SET status = ?, run_id = ?, parent_run_id = ?, artifact_path = ?, reviewer = ?, notes = ?, details_json = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(
          status,
          input.run?.id ?? null,
          parentRunId ?? null,
          normalizeOptionalString(input.artifactPath) ?? null,
          normalizeOptionalString(input.reviewer) ?? null,
          normalizeOptionalString(input.notes) ?? null,
          detailsJson,
          now,
          existing.id,
        );
      return this.getSubagentMaturityEvidence(existing.id);
    }
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO subagent_maturity_evidence
         (id, kind, evidence_key, status, run_id, parent_run_id, artifact_path, reviewer, notes, details_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        kind,
        evidenceKey ?? null,
        status,
        input.run?.id ?? null,
        parentRunId ?? null,
        normalizeOptionalString(input.artifactPath) ?? null,
        normalizeOptionalString(input.reviewer) ?? null,
        normalizeOptionalString(input.notes) ?? null,
        detailsJson,
        now,
        now,
      );
    return this.getSubagentMaturityEvidence(id);
  }

  getSubagentMaturityEvidence(id: string): SubagentMaturityEvidence {
    const row = this.db
      .prepare("SELECT * FROM subagent_maturity_evidence WHERE id = ?")
      .get(id) as SubagentMaturityEvidenceRow | undefined;
    if (!row) throw new Error(`Sub-agent maturity evidence not found: ${id}`);
    return mapSubagentMaturityEvidenceRow(row);
  }

  listSubagentMaturityEvidence(kind?: SubagentMaturityEvidenceKind): SubagentMaturityEvidence[] {
    if (kind) {
      const normalizedKind = normalizeSubagentMaturityEvidenceKind(kind);
      const rows = this.db
        .prepare("SELECT * FROM subagent_maturity_evidence WHERE kind = ? ORDER BY created_at ASC, id ASC")
        .all(normalizedKind) as SubagentMaturityEvidenceRow[];
      return rows.map(mapSubagentMaturityEvidenceRow);
    }
    const rows = this.db
      .prepare("SELECT * FROM subagent_maturity_evidence ORDER BY created_at ASC, id ASC")
      .all() as SubagentMaturityEvidenceRow[];
    return rows.map(mapSubagentMaturityEvidenceRow);
  }

  private findSubagentMaturityEvidenceByKey(
    kind: SubagentMaturityEvidenceKind,
    evidenceKey: string,
  ): SubagentMaturityEvidence | undefined {
    const row = this.db
      .prepare("SELECT * FROM subagent_maturity_evidence WHERE kind = ? AND evidence_key = ?")
      .get(kind, evidenceKey) as SubagentMaturityEvidenceRow | undefined;
    return row ? mapSubagentMaturityEvidenceRow(row) : undefined;
  }
}
