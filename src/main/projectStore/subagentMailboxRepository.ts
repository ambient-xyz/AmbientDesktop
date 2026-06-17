import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  SubagentMailboxDeliveryState,
  SubagentMailboxDirection,
  SubagentMailboxEventSummary,
} from "../../shared/subagentTypes";
import {
  mapSubagentMailboxEventRow,
  type SubagentMailboxEventRow,
} from "../projectStoreSubagentMappers";

export interface AppendSubagentMailboxEventInput {
  direction: SubagentMailboxDirection;
  type: string;
  payload: unknown;
  deliveryState?: SubagentMailboxDeliveryState;
  createdAt?: string;
  deliveredAt?: string;
}

export interface UpdateSubagentMailboxEventDeliveryStateOptions {
  now?: string;
  deliveredAt?: string | null;
}

export class ProjectStoreSubagentMailboxRepository {
  constructor(private readonly db: Database.Database) {}

  appendSubagentMailboxEvent(runId: string, input: AppendSubagentMailboxEventInput): SubagentMailboxEventSummary {
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO subagent_mailbox_events
         (id, run_id, direction, type, payload_json, delivery_state, created_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        runId,
        input.direction,
        input.type,
        JSON.stringify(input.payload ?? null),
        input.deliveryState ?? "queued",
        now,
        input.deliveredAt ?? null,
      );
    return this.getSubagentMailboxEvent(id);
  }

  listSubagentMailboxEvents(runId: string): SubagentMailboxEventSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_mailbox_events WHERE run_id = ? ORDER BY created_at ASC, id ASC")
      .all(runId) as SubagentMailboxEventRow[];
    return rows.map(mapSubagentMailboxEventRow);
  }

  getSubagentMailboxEvent(id: string): SubagentMailboxEventSummary {
    const row = this.db.prepare("SELECT * FROM subagent_mailbox_events WHERE id = ?").get(id) as SubagentMailboxEventRow | undefined;
    if (!row) throw new Error(`Sub-agent mailbox event not found: ${id}`);
    return mapSubagentMailboxEventRow(row);
  }

  updateSubagentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: UpdateSubagentMailboxEventDeliveryStateOptions,
  ): SubagentMailboxEventSummary {
    const existing = this.getSubagentMailboxEvent(id);
    const now = options?.now ?? new Date().toISOString();
    let deliveredAt = existing.deliveredAt ?? null;
    if (deliveryState === "queued") {
      deliveredAt = options?.deliveredAt === undefined ? null : options.deliveredAt;
    } else if (deliveryState === "delivered" || deliveryState === "consumed") {
      deliveredAt = options?.deliveredAt === undefined ? deliveredAt ?? now : options.deliveredAt;
    } else if (options?.deliveredAt !== undefined) {
      deliveredAt = options.deliveredAt;
    }
    if (existing.deliveryState === deliveryState && (existing.deliveredAt ?? null) === deliveredAt) {
      return existing;
    }
    this.db
      .prepare(
        `UPDATE subagent_mailbox_events
         SET delivery_state = ?, delivered_at = ?
         WHERE id = ?`,
      )
      .run(deliveryState, deliveredAt, id);
    return this.getSubagentMailboxEvent(id);
  }
}
