import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  SubagentMailboxDeliveryState,
  SubagentParentMailboxEventSummary,
} from "../../shared/subagentTypes";
import { assertSubagentParentMailboxEventAttribution } from "../subagents/subagentInvariants";
import {
  mapSubagentParentMailboxEventRow,
  type SubagentParentMailboxEventRow,
} from "./projectStoreSubagentMappers";

export interface AppendSubagentParentMailboxEventInput {
  parentThreadId: string;
  parentRunId: string;
  parentMessageId?: string;
  type: string;
  payload: unknown;
  deliveryState?: SubagentMailboxDeliveryState;
  idempotencyKey?: string;
  createdAt?: string;
  deliveredAt?: string;
}

export interface UpdateSubagentParentMailboxEventDeliveryStateOptions {
  now?: string;
  deliveredAt?: string | null;
}

export interface UpdateSubagentParentMailboxPayloadInput {
  id: string;
  parentMessageId?: string | null;
  payload: unknown;
  idempotencyKey?: string | null;
  deliveryState?: SubagentMailboxDeliveryState;
  updatedAt: string;
}

export class ProjectStoreSubagentParentMailboxRepository {
  constructor(private readonly db: Database.Database) {}

  appendSubagentParentMailboxEvent(input: AppendSubagentParentMailboxEventInput): SubagentParentMailboxEventSummary {
    assertSubagentParentMailboxEventAttribution({
      parentRunId: input.parentRunId,
      type: input.type,
      payload: input.payload,
    });
    const existing = input.idempotencyKey
      ? this.findSubagentParentMailboxEventByIdempotencyKey(input.parentRunId, input.type, input.idempotencyKey)
      : undefined;
    if (existing) {
      if (input.parentMessageId && !existing.parentMessageId) {
        this.updateParentMessageId(existing.id, input.parentMessageId, input.createdAt ?? new Date().toISOString());
        return this.getSubagentParentMailboxEvent(existing.id);
      }
      return existing;
    }
    const id = randomUUID();
    const now = input.createdAt ?? new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO subagent_parent_mailbox_events
         (id, parent_thread_id, parent_run_id, parent_message_id, type, payload_json, delivery_state, idempotency_key, created_at, updated_at, delivered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.parentThreadId,
        input.parentRunId,
        input.parentMessageId ?? null,
        input.type,
        JSON.stringify(input.payload ?? null),
        input.deliveryState ?? "queued",
        input.idempotencyKey ?? null,
        now,
        now,
        input.deliveredAt ?? null,
      );
    return this.getSubagentParentMailboxEvent(id);
  }

  findSubagentParentMailboxEventByIdempotencyKey(
    parentRunId: string,
    type: string,
    idempotencyKey: string,
  ): SubagentParentMailboxEventSummary | undefined {
    const row = this.db
      .prepare("SELECT * FROM subagent_parent_mailbox_events WHERE parent_run_id = ? AND type = ? AND idempotency_key = ?")
      .get(parentRunId, type, idempotencyKey) as SubagentParentMailboxEventRow | undefined;
    return row ? mapSubagentParentMailboxEventRow(row) : undefined;
  }

  latestQueuedSubagentParentMailboxEvent(parentRunId: string, type: string): SubagentParentMailboxEventSummary | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM subagent_parent_mailbox_events
         WHERE parent_run_id = ? AND type = ? AND delivery_state = 'queued'
         ORDER BY updated_at DESC, created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(parentRunId, type) as SubagentParentMailboxEventRow | undefined;
    return row ? mapSubagentParentMailboxEventRow(row) : undefined;
  }

  listSubagentParentMailboxEventsForParentRun(parentRunId: string): SubagentParentMailboxEventSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_parent_mailbox_events WHERE parent_run_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentRunId) as SubagentParentMailboxEventRow[];
    return rows.map(mapSubagentParentMailboxEventRow);
  }

  listSubagentParentMailboxEventsForParentThread(parentThreadId: string): SubagentParentMailboxEventSummary[] {
    const rows = this.db
      .prepare("SELECT * FROM subagent_parent_mailbox_events WHERE parent_thread_id = ? ORDER BY created_at ASC, id ASC")
      .all(parentThreadId) as SubagentParentMailboxEventRow[];
    return rows.map(mapSubagentParentMailboxEventRow);
  }

  getSubagentParentMailboxEvent(id: string): SubagentParentMailboxEventSummary {
    const row = this.db.prepare("SELECT * FROM subagent_parent_mailbox_events WHERE id = ?").get(id) as SubagentParentMailboxEventRow | undefined;
    if (!row) throw new Error(`Sub-agent parent mailbox event not found: ${id}`);
    return mapSubagentParentMailboxEventRow(row);
  }

  updateSubagentParentMailboxEventDeliveryState(
    id: string,
    deliveryState: SubagentMailboxDeliveryState,
    options?: UpdateSubagentParentMailboxEventDeliveryStateOptions,
  ): SubagentParentMailboxEventSummary {
    const existing = this.getSubagentParentMailboxEvent(id);
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
        `UPDATE subagent_parent_mailbox_events
         SET delivery_state = ?, updated_at = ?, delivered_at = ?
         WHERE id = ?`,
      )
      .run(deliveryState, now, deliveredAt, id);
    return this.getSubagentParentMailboxEvent(id);
  }

  updateSubagentParentMailboxPayload(input: UpdateSubagentParentMailboxPayloadInput): SubagentParentMailboxEventSummary {
    this.db
      .prepare(
        `UPDATE subagent_parent_mailbox_events
         SET parent_message_id = COALESCE(parent_message_id, ?),
             payload_json = ?,
             idempotency_key = COALESCE(?, idempotency_key),
             delivery_state = COALESCE(?, delivery_state),
             updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.parentMessageId ?? null,
        JSON.stringify(input.payload ?? null),
        input.idempotencyKey ?? null,
        input.deliveryState ?? null,
        input.updatedAt,
        input.id,
      );
    return this.getSubagentParentMailboxEvent(input.id);
  }

  requeueSubagentParentMailboxPayload(input: {
    id: string;
    parentMessageId?: string | null;
    payload: unknown;
    updatedAt: string;
  }): SubagentParentMailboxEventSummary {
    this.db
      .prepare(
        `UPDATE subagent_parent_mailbox_events
         SET parent_message_id = COALESCE(parent_message_id, ?), payload_json = ?, delivery_state = 'queued', updated_at = ?, delivered_at = NULL
         WHERE id = ?`,
      )
      .run(input.parentMessageId ?? null, JSON.stringify(input.payload ?? null), input.updatedAt, input.id);
    return this.getSubagentParentMailboxEvent(input.id);
  }

  private updateParentMessageId(id: string, parentMessageId: string, updatedAt: string): void {
    this.db
      .prepare("UPDATE subagent_parent_mailbox_events SET parent_message_id = ?, updated_at = ? WHERE id = ?")
      .run(parentMessageId, updatedAt, id);
  }
}
