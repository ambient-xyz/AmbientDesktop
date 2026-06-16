import type Database from "better-sqlite3";
import type { ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";

export type ProjectBoardExecutionReadinessEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface RecordProjectBoardExecutionReadinessBlockerInput {
  boardId: string;
  source: "auto_dispatch" | "manual_prepare";
  blocker: "missing_workflow" | "invalid_workflow" | "auto_dispatch_disabled" | "auto_dispatch_error" | "prepare_error";
  title: string;
  summary: string;
  workflowPath?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface ProjectStoreProjectBoardExecutionReadinessRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  listProjectBoardEvents(boardId: string, limit?: number): ProjectBoardEvent[];
  appendProjectBoardEvent(input: ProjectBoardExecutionReadinessEventInput): void;
}

export class ProjectStoreProjectBoardExecutionReadinessRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardExecutionReadinessRepositoryDeps,
  ) {}

  recordProjectBoardExecutionReadinessBlocker(
    input: RecordProjectBoardExecutionReadinessBlockerInput,
  ): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const error = input.error?.trim().slice(0, 1_000) || undefined;
    const dedupeKey = [
      input.source,
      input.blocker,
      input.workflowPath?.trim() || "",
      error ?? input.summary.trim().slice(0, 500),
    ].join(":");
    const latest = this.deps.listProjectBoardEvents(input.boardId, 1)[0];
    if (latest?.kind === "execution_readiness_blocked" && latest.metadata?.dedupeKey === dedupeKey) {
      return { board, recorded: false };
    }

    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "execution_readiness_blocked",
        title: input.title,
        summary: input.summary,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          ...input.metadata,
          source: input.source,
          blocker: input.blocker,
          workflowPath: input.workflowPath,
          error,
          dedupeKey,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.deps.getProjectBoard(input.boardId) ?? board, recorded: true };
  }
}
