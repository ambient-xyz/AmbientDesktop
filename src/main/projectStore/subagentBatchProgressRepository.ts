import type Database from "better-sqlite3";
import type { SubagentParentMailboxEventSummary } from "../../shared/subagentTypes";
import {
  createSubagentBatchProgressParentMailboxIdempotencyKey,
  createSubagentBatchProgressParentMailboxPayload,
  SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
  type SubagentBatchJobRecord,
} from "./projectStoreSubagentsFacade";
import { ProjectStoreSubagentParentMailboxRepository } from "./subagentParentMailboxRepository";

export class ProjectStoreSubagentBatchProgressRepository {
  constructor(private readonly db: Database.Database) {}

  upsertSubagentBatchProgressNotificationForRecord(record: SubagentBatchJobRecord, createdAt: string): SubagentParentMailboxEventSummary {
    const payload = createSubagentBatchProgressParentMailboxPayload(record);
    const idempotencyKey = createSubagentBatchProgressParentMailboxIdempotencyKey(record.plan.jobId);
    const parentMailboxRepository = this.parentMailboxes();
    const existing = parentMailboxRepository.findSubagentParentMailboxEventByIdempotencyKey(
      record.plan.parentRunId,
      SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
      idempotencyKey,
    );
    if (!existing) {
      return parentMailboxRepository.appendSubagentParentMailboxEvent({
        parentThreadId: record.plan.parentThreadId,
        parentRunId: record.plan.parentRunId,
        parentMessageId: record.plan.parentMessageId,
        type: SUBAGENT_BATCH_PROGRESS_PARENT_MAILBOX_TYPE,
        payload,
        idempotencyKey,
        createdAt,
      });
    }
    return parentMailboxRepository.requeueSubagentParentMailboxPayload({
      id: existing.id,
      parentMessageId: record.plan.parentMessageId,
      payload,
      updatedAt: createdAt,
    });
  }

  private parentMailboxes(): ProjectStoreSubagentParentMailboxRepository {
    return new ProjectStoreSubagentParentMailboxRepository(this.db);
  }
}
