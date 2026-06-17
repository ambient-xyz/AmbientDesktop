import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  SubagentPromptSnapshotSummary,
  SubagentToolScopeSnapshotSummary,
} from "../../shared/subagentTypes";
import {
  mapSubagentPromptSnapshotRow,
  mapSubagentToolScopeSnapshotRow,
  type SubagentPromptSnapshotRow,
  type SubagentToolScopeSnapshotRow,
} from "./projectStoreSubagentMappers";

export interface RecordSubagentPromptSnapshotInput {
  prompt: string;
  snapshot: unknown;
  createdAt?: string;
}

export interface RecordSubagentToolScopeSnapshotInput {
  scope: SubagentToolScopeSnapshotSummary["scope"];
  resolverInputs?: unknown;
  createdAt?: string;
}

export class ProjectStoreSubagentSnapshotRepository {
  constructor(private readonly db: Database.Database) {}

  recordSubagentPromptSnapshot(runId: string, input: RecordSubagentPromptSnapshotInput): SubagentPromptSnapshotSummary {
    const sequence = this.nextSequence("subagent_prompt_snapshots", runId);
    const createdAt = input.createdAt ?? new Date().toISOString();
    const promptSha256 = createHash("sha256").update(input.prompt).digest("hex");
    this.db
      .prepare(
        `INSERT INTO subagent_prompt_snapshots
         (run_id, sequence, created_at, prompt_sha256, prompt_preview, snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        sequence,
        createdAt,
        promptSha256,
        input.prompt.slice(0, 1200),
        JSON.stringify(input.snapshot ?? null),
      );
    const row = this.db
      .prepare("SELECT * FROM subagent_prompt_snapshots WHERE run_id = ? AND sequence = ?")
      .get(runId, sequence) as SubagentPromptSnapshotRow | undefined;
    if (!row) throw new Error(`Sub-agent prompt snapshot not found: ${runId}#${sequence}`);
    return mapSubagentPromptSnapshotRow(row);
  }

  listSubagentPromptSnapshots(runId: string): SubagentPromptSnapshotSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_prompt_snapshots WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId) as SubagentPromptSnapshotRow[];
    return rows.map(mapSubagentPromptSnapshotRow);
  }

  recordSubagentToolScopeSnapshot(runId: string, input: RecordSubagentToolScopeSnapshotInput): SubagentToolScopeSnapshotSummary {
    const sequence = this.nextSequence("subagent_tool_scope_snapshots", runId);
    const createdAt = input.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO subagent_tool_scope_snapshots
         (run_id, sequence, created_at, scope_json, resolver_inputs_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        runId,
        sequence,
        createdAt,
        JSON.stringify(input.scope),
        JSON.stringify(input.resolverInputs ?? null),
      );
    const row = this.db
      .prepare("SELECT * FROM subagent_tool_scope_snapshots WHERE run_id = ? AND sequence = ?")
      .get(runId, sequence) as SubagentToolScopeSnapshotRow | undefined;
    if (!row) throw new Error(`Sub-agent tool scope snapshot not found: ${runId}#${sequence}`);
    return mapSubagentToolScopeSnapshotRow(row);
  }

  listSubagentToolScopeSnapshots(runId: string): SubagentToolScopeSnapshotSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_tool_scope_snapshots WHERE run_id = ? ORDER BY sequence ASC")
      .all(runId) as SubagentToolScopeSnapshotRow[];
    return rows.map(mapSubagentToolScopeSnapshotRow);
  }

  private nextSequence(tableName: "subagent_prompt_snapshots" | "subagent_tool_scope_snapshots", runId: string): number {
    const row = this.db
      .prepare(`SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence FROM ${tableName} WHERE run_id = ?`)
      .get(runId) as { next_sequence?: number } | undefined;
    return row?.next_sequence ?? 1;
  }
}
