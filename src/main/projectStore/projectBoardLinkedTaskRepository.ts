import type Database from "better-sqlite3";
import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationTask } from "../../shared/workflowTypes";
import {
  projectBoardCardRowIsClosedDone,
  projectBoardClaimBlockedTaskIdsForRows,
  projectBoardClaimSummaryFromEvents,
  projectBoardStatusForTask,
  resolveProjectBoardTaskBlockers,
  type ProjectBoardCardStoreRow,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardLinkedTaskRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  listOrchestrationTasks(): OrchestrationTask[];
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
  listProjectBoardEvents(boardId: string): ProjectBoardEvent[];
  dependencyAwareProjectBoardCardTaskDescription(input: { card: ProjectBoardCard; budgetPolicy?: Record<string, unknown> }): string;
}

export class ProjectStoreProjectBoardLinkedTaskRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardLinkedTaskRepositoryDeps,
  ) {}

  refreshProjectBoardTaskDescriptionForTask(taskId: string): OrchestrationTask | undefined {
    const card = this.deps.getProjectBoardCardForOrchestrationTask(taskId);
    if (!card) return undefined;
    const task = this.deps.getOrchestrationTask(taskId);
    const description = this.projectBoardCardTaskDescription(card);
    if (task.description === description) return task;
    this.db
      .prepare("UPDATE orchestration_tasks SET description = ?, updated_at = ? WHERE id = ?")
      .run(description, new Date().toISOString(), task.id);
    return this.deps.getOrchestrationTask(task.id);
  }

  projectBoardClaimBlockedTaskIds(): string[] {
    const rows = this.db
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id IS NOT NULL AND status != 'archived'")
      .all() as ProjectBoardCardStoreRow[];
    const rowsByBoard = new Map<string, ProjectBoardCardStoreRow[]>();
    for (const row of rows) rowsByBoard.set(row.board_id, [...(rowsByBoard.get(row.board_id) ?? []), row]);
    const result: string[] = [];
    for (const [boardId, boardCards] of rowsByBoard) {
      const claims = projectBoardClaimSummaryFromEvents(this.deps.listProjectBoardEvents(boardId));
      result.push(...projectBoardClaimBlockedTaskIdsForRows(boardCards, claims));
    }
    return result;
  }

  syncProjectBoardCardsForLinkedTasks(): void {
    const rows = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE orchestration_task_id IS NOT NULL AND status != 'archived'`,
      )
      .all() as ProjectBoardCardStoreRow[];
    if (rows.length === 0) return;

    const tasks = this.deps.listOrchestrationTasks();
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const now = new Date().toISOString();
    const touchedBoardIds = new Set<string>();
    const updateCard = this.db.prepare("UPDATE project_board_cards SET status = ?, updated_at = ? WHERE id = ?");
    const updateBoard = this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?");
    const transaction = this.db.transaction(() => {
      for (const row of rows) {
        const task = tasksById.get(row.orchestration_task_id ?? "");
        if (!task) continue;
        if (projectBoardCardRowIsClosedDone(row)) continue;
        const status = projectBoardStatusForTask(task, tasks);
        if (status === row.status) continue;
        updateCard.run(status, now, row.id);
        touchedBoardIds.add(row.board_id);
      }
      for (const boardId of touchedBoardIds) {
        updateBoard.run(now, boardId);
      }
    });
    transaction();
  }

  projectBoardTaskHasClosedDoneCard(taskId: string): boolean {
    const rows = this.db
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived'")
      .all(taskId) as ProjectBoardCardStoreRow[];
    return rows.some(projectBoardCardRowIsClosedDone);
  }

  syncProjectBoardTaskBlockers(boardId: string): void {
    const cards = this.deps.listProjectBoardCards(boardId);
    const linkedCards = cards.filter((card) => card.orchestrationTaskId);
    if (linkedCards.length === 0) return;
    const tasks = this.deps.listOrchestrationTasks();
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const now = new Date().toISOString();
    const updateTask = this.db.prepare("UPDATE orchestration_tasks SET blocked_by_json = ?, updated_at = ? WHERE id = ?");
    const transaction = this.db.transaction(() => {
      for (const card of linkedCards) {
        const task = tasksById.get(card.orchestrationTaskId ?? "");
        if (!task) continue;
        const resolvedBlockers = resolveProjectBoardTaskBlockers(card, cards, tasks);
        if (JSON.stringify(resolvedBlockers) === JSON.stringify(task.blockedBy)) continue;
        updateTask.run(JSON.stringify(resolvedBlockers), now, task.id);
      }
    });
    transaction();
  }

  projectBoardCardTaskDescription(card: ProjectBoardCard): string {
    const board = this.deps.getProjectBoard(card.boardId);
    return this.deps.dependencyAwareProjectBoardCardTaskDescription({
      card,
      budgetPolicy: board?.charter?.budgetPolicy,
    });
  }
}
