import type Database from "better-sqlite3";
import type {
  CopyProjectBoardSessionToThreadInput,
  ProjectBoardCard,
  ProjectBoardEvent,
} from "../../shared/projectBoardTypes";
import type { ChatMessage, ThreadSummary } from "../../shared/threadTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import { projectBoardRunStatusCanCopySession } from "./projectBoardMappers";

export type ProjectBoardSessionCopyEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectBoardSessionCopyMessageInput {
  threadId: string;
  role: ChatMessage["role"];
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectStoreProjectBoardSessionCopyRepositoryDeps {
  getProjectBoardCard(cardId: string): ProjectBoardCard;
  getOrchestrationRun(runId: string): OrchestrationRun;
  getWorkspacePath(): string;
  getThread(threadId: string): ThreadSummary;
  forkThread(threadId: string, workspacePath: string): ThreadSummary;
  updateThreadTitle(threadId: string, title: string): ThreadSummary;
  addMessage(input: ProjectBoardSessionCopyMessageInput): ChatMessage;
  appendProjectBoardEvent(input: ProjectBoardSessionCopyEventInput): void;
}

export class ProjectStoreProjectBoardSessionCopyRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardSessionCopyRepositoryDeps,
  ) {}

  copyProjectBoardSessionToThread(input: CopyProjectBoardSessionToThreadInput): ThreadSummary {
    const card = this.deps.getProjectBoardCard(input.cardId);
    if (!card.orchestrationTaskId) {
      throw new Error("Only ticketized project-board cards can copy Pi sessions into local threads.");
    }
    const run = this.deps.getOrchestrationRun(input.runId);
    if (run.taskId !== card.orchestrationTaskId) {
      throw new Error("This Pi session run does not belong to the selected board card.");
    }
    if (!run.threadId) {
      throw new Error("This Pi session run has no transcript thread to copy.");
    }
    if (!projectBoardRunStatusCanCopySession(run.status)) {
      throw new Error("Copy Session to Thread is available only after a Pi session is paused, stopped, failed, stalled, canceled, or completed.");
    }

    const sourceThread = this.deps.getThread(run.threadId);
    const fork = this.deps.forkThread(sourceThread.id, this.deps.getWorkspacePath());
    const title = `Session copy: ${card.title}`;
    this.deps.updateThreadTitle(fork.id, title);
    const now = new Date().toISOString();
    this.deps.addMessage({
      threadId: fork.id,
      role: "system",
      content:
        `Copied from project-board card "${card.title}" after run ${run.id} reached ${run.status}. ` +
        "This is a local project thread; the original Pi session remains attached to the board run.",
      metadata: {
        kind: "project_board_session_copy",
        cardId: card.id,
        boardId: card.boardId,
        runId: run.id,
        taskId: run.taskId,
        sourceThreadId: sourceThread.id,
        copiedAt: now,
      },
    });
    const copied = this.deps.getThread(fork.id);
    this.deps.appendProjectBoardEvent({
      boardId: card.boardId,
      kind: "card_run_handoff_created",
      title: "Pi session copied to local thread",
      summary: `${card.title} now has a local follow-up thread copied from its ${run.status} Pi session.`,
      entityKind: "orchestration_run",
      entityId: run.id,
      metadata: {
        cardId: card.id,
        taskId: run.taskId,
        runId: run.id,
        sourceThreadId: sourceThread.id,
        copiedThreadId: copied.id,
        copiedAt: now,
      },
      createdAt: now,
    });
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, card.boardId);
    return copied;
  }
}
