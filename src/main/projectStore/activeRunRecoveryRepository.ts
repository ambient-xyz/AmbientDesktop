import type Database from "better-sqlite3";
import type { ChatMessage } from "../../shared/threadTypes";
import type { OrchestrationRun, OrchestrationTask } from "../../shared/workflowTypes";
import { mapOrchestrationRunRow, type OrchestrationRunRow } from "./orchestrationMappers";
import type { ProjectStoreOrchestrationTaskUpdateInput, UpdateProjectStoreOrchestrationRunInput } from "./orchestrationRepository";
import { RESTART_INTERRUPTED_LOCAL_TASK_ERROR, restartInterruptedRunProofOfWork } from "./projectStoreOrchestrationFacade";
import { parseMetadata } from "./projectStoreJson";
import type { MessageRow } from "./projectStoreThreadMappers";
import type { RunRecord, TerminalPersistedRunStatus } from "./runMappers";
import { INTERRUPTED_RUN_MESSAGE, interruptedMessageContent, interruptedMetadata, isRecoverableMessageMetadata } from "./runRecovery";

export interface ProjectStoreActiveRunRecoveryRepositoryDeps {
  finishRun(runId: string, status: TerminalPersistedRunStatus, errorMessage?: string): RunRecord;
  listActiveRuns(): RunRecord[];
  replaceMessage(messageId: string, content: string, metadata?: Record<string, unknown>): ChatMessage;
  updateOrchestrationRun(input: UpdateProjectStoreOrchestrationRunInput): OrchestrationRun;
  updateOrchestrationTask(input: ProjectStoreOrchestrationTaskUpdateInput): OrchestrationTask;
}

export class ProjectStoreActiveRunRecoveryRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreActiveRunRecoveryRepositoryDeps,
  ) {}

  interruptActiveRuns(reason = INTERRUPTED_RUN_MESSAGE): number {
    const activeRuns = this.deps.listActiveRuns();
    const interruptedMessageIds = new Set<string>();
    let interrupted = 0;

    for (const run of activeRuns) {
      this.deps.finishRun(run.id, "interrupted", reason);
      const row = this.db.prepare("SELECT * FROM messages WHERE id = ?").get(run.assistantMessageId) as MessageRow | undefined;
      if (row) {
        this.markMessageInterrupted(row, reason);
        interruptedMessageIds.add(row.id);
      }
      interrupted += 1;
    }

    const candidateMessages = this.db
      .prepare("SELECT * FROM messages WHERE role IN ('assistant', 'tool') AND metadata_json IS NOT NULL")
      .all() as MessageRow[];

    for (const message of candidateMessages) {
      if (interruptedMessageIds.has(message.id)) continue;
      const metadata = parseMetadata(message.metadata_json);
      if (isRecoverableMessageMetadata(metadata)) {
        this.markMessageInterrupted(message, reason);
        interrupted += 1;
      }
    }

    return interrupted;
  }

  stallActiveOrchestrationRuns(): number {
    const rows = this.db
      .prepare("SELECT * FROM orchestration_runs WHERE status IN ('claimed', 'preparing', 'running')")
      .all() as OrchestrationRunRow[];
    let stalled = 0;
    for (const row of rows) {
      const run = mapOrchestrationRunRow(row);
      const interruptedAt = new Date().toISOString();
      this.deps.updateOrchestrationRun({
        id: run.id,
        status: "stalled",
        error: RESTART_INTERRUPTED_LOCAL_TASK_ERROR,
        proofOfWork: restartInterruptedRunProofOfWork(run.proofOfWork, interruptedAt),
        finish: true,
        reviewProjectBoardProof: false,
      });
      try {
        this.deps.updateOrchestrationTask({ id: run.taskId, state: "needs_info" });
      } catch {
        // A dangling run should not block workspace startup.
      }
      stalled += 1;
    }
    return stalled;
  }

  private markMessageInterrupted(row: MessageRow, runMessage = INTERRUPTED_RUN_MESSAGE): void {
    const metadata = interruptedMetadata(parseMetadata(row.metadata_json));
    const content = interruptedMessageContent(row.content, row.role, runMessage);
    this.deps.replaceMessage(row.id, content, metadata);
  }
}
