import type Database from "better-sqlite3";
import type { ProjectBoardEvent } from "../../shared/projectBoardTypes";
import type { ThreadSummary } from "../../shared/threadTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import {
  normalizeProjectBoardCardExecutionSessionPolicy,
  type ProjectBoardCardStoreRow,
} from "./projectBoardMappers";

export type ProjectBoardCardExecutionSessionEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardCardExecutionSessionRepositoryDeps {
  tryGetThread(threadId: string): ThreadSummary | undefined;
  createThread(title: string, workspacePath: string): ThreadSummary;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  appendProjectBoardEvent(input: ProjectBoardCardExecutionSessionEventInput): void;
}

export class ProjectStoreProjectBoardCardExecutionSessionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardExecutionSessionRepositoryDeps,
  ) {}

  ensureProjectBoardCardExecutionThreadForTask(input: { taskId: string; workspacePath: string }): ThreadSummary | undefined {
    const row = this.db
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(input.taskId) as ProjectBoardCardStoreRow | undefined;
    if (!row) return undefined;

    const policy = normalizeProjectBoardCardExecutionSessionPolicy(row.execution_session_policy);
    if (policy === "reuse_card_session" && row.execution_thread_id) {
      const existing = this.deps.tryGetThread(row.execution_thread_id);
      if (existing) return existing;
    }

    const task = this.deps.getOrchestrationTask(input.taskId);
    const previousThreadId = row.execution_thread_id ?? undefined;
    const thread = this.deps.createThread(`${task.identifier}: ${row.title}`, input.workspacePath);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE project_board_cards SET execution_thread_id = ?, execution_session_policy = ?, updated_at = ? WHERE id = ?")
      .run(thread.id, policy, now, row.id);
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, row.board_id);
    this.deps.appendProjectBoardEvent({
      boardId: row.board_id,
      kind: "card_execution_session_assigned",
      title: "Card execution session assigned",
      summary:
        policy === "reuse_card_session"
          ? `${row.title} will reuse one Pi session across retries and focus passes.`
          : `${row.title} will start fresh Pi context for each prepared run.`,
      entityKind: "project_board_card",
      entityId: row.id,
      metadata: { cardId: row.id, taskId: input.taskId, executionThreadId: thread.id, previousThreadId, executionSessionPolicy: policy },
      createdAt: now,
    });
    return thread;
  }
}
