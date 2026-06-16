import type Database from "better-sqlite3";
import type { ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";

export type ProjectBoardWorkflowEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface RecordProjectBoardWorkflowCreatedInput {
  boardId: string;
  workflowPath: string;
  workflowHash?: string;
  source: "auto_dispatch" | "manual_prepare" | "preparation" | "scheduled_preparation";
  workspaceStrategy?: "git-worktree" | "directory";
  autoDispatch?: boolean;
  maxConcurrentAgents?: number;
  createdAt?: string;
}

export interface ProjectStoreProjectBoardWorkflowRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  listProjectBoardEvents(boardId: string, limit?: number): ProjectBoardEvent[];
  appendProjectBoardEvent(input: ProjectBoardWorkflowEventInput): void;
}

export class ProjectStoreProjectBoardWorkflowRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardWorkflowRepositoryDeps,
  ) {}

  recordProjectBoardWorkflowCreated(input: RecordProjectBoardWorkflowCreatedInput): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const dedupeKey = [input.source, workflowPath].join(":");
    const latest = this.deps.listProjectBoardEvents(input.boardId, 1)[0];
    if (latest?.kind === "workflow_created" && latest.metadata?.dedupeKey === dedupeKey) {
      return { board, recorded: false };
    }

    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_created",
        title: "Default WORKFLOW.md created",
        summary: `Ambient created ${workflowPath} with ${input.workspaceStrategy ?? "default"} workspace strategy for Local Task dispatch.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          source: input.source,
          workflowPath,
          workflowHash: input.workflowHash,
          workspaceStrategy: input.workspaceStrategy,
          autoDispatch: input.autoDispatch,
          maxConcurrentAgents: input.maxConcurrentAgents,
          dedupeKey,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.deps.getProjectBoard(input.boardId) ?? board, recorded: true };
  }
}
