import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  ProjectBoardCard,
  ProjectBoardCardCandidateStatus,
  ProjectBoardCardStatus,
  ProjectBoardCardTestPlan,
  ProjectBoardPlanningSnapshot,
  ProjectBoardSummary,
  ProjectBoardSynthesisRun,
} from "../../shared/projectBoardTypes";
import type { CreateOrchestrationTaskInput, OrchestrationTask } from "../../shared/workflowTypes";
import type { OrchestrationTaskRow } from "./orchestrationMappers";
import type { ProjectBoardCardMutationEventInput } from "./projectBoardCardMutationEvents";
import {
  mapProjectBoardCardRow,
  normalizeTaskLabels,
  projectBoardCardBlockedByOpenUxMockGate,
  projectBoardClosedParentForRunFollowUp,
  projectBoardStatusForTask,
  resolveProjectBoardTaskBlockers,
  type ProjectBoardCardStoreRow,
  type ProjectBoardStoreRow,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardCardTicketizationRepositoryDeps {
  listOrchestrationTasks(): OrchestrationTask[];
  getActiveProjectBoard(): ProjectBoardSummary | undefined;
  getRunningProjectBoardSynthesisRun(boardId: string): ProjectBoardSynthesisRun | undefined;
  listProjectBoardCards(boardId: string): ProjectBoardCard[];
  latestStableProjectBoardPlanningSnapshot(boardId: string): { runId: string; snapshot: ProjectBoardPlanningSnapshot } | undefined;
  assertProjectBoardCardProofReady(card: ProjectBoardCard): void;
  assertProjectBoardCardClarificationsResolved(card: ProjectBoardCard): void;
  assertProjectBoardCardClaimAllowsLocalTicketization(card: ProjectBoardCard): void;
  assertProjectBoardRunFollowUpStillActionable(card: ProjectBoardCard): void;
  appendProjectBoardEvent(input: ProjectBoardCardMutationEventInput): void;
  syncProjectBoardTaskBlockers(boardId: string): void;
  syncProjectBoardCardsForLinkedTasks(): void;
  createOrchestrationTask(input: CreateOrchestrationTaskInput): OrchestrationTask;
  getOrchestrationTask(taskId: string): OrchestrationTask;
  mapOrchestrationTask(row: OrchestrationTaskRow): OrchestrationTask;
  projectBoardCardTaskDescription(card: ProjectBoardCard): string;
  assertProjectBoardUxMockGateOpen(card: ProjectBoardCard, boardCards: ProjectBoardCard[]): void;
}

export class ProjectStoreProjectBoardCardTicketizationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardCardTicketizationRepositoryDeps,
  ) {}

  attachLocalTaskToProjectBoard(input: { taskId: string; mode: "attach" | "evidence" }): ProjectBoardCard {
    const board = this.deps.getActiveProjectBoard();
    if (!board) throw new Error("Build a project board before attaching Local Tasks.");
    const task = this.deps.getOrchestrationTask(input.taskId);
    const existing = this.db
      .prepare(
        `SELECT * FROM project_board_cards
         WHERE board_id = ?
           AND (
             orchestration_task_id = ?
             OR (source_kind = 'local_task_import' AND source_id = ?)
           )
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(board.id, task.id, task.id) as ProjectBoardCardStoreRow | undefined;
    if (existing) return mapProjectBoardCardRow(existing, this.deps.listOrchestrationTasks());

    const now = new Date().toISOString();
    const id = randomUUID();
    const attachMode = input.mode === "attach";
    const allTasks = this.deps.listOrchestrationTasks();
    const status: ProjectBoardCardStatus = attachMode ? projectBoardStatusForTask(task, allTasks) : "draft";
    const candidateStatus: ProjectBoardCardCandidateStatus = attachMode ? "ready_to_create" : "evidence";
    const description =
      task.description?.trim() ||
      (attachMode ? "Existing Local Task attached to this project board." : "Existing Local Task imported as completed board evidence.");
    const acceptanceCriteria = attachMode
      ? [`Complete Local Task ${task.identifier}: ${task.title}`]
      : [`Record Local Task ${task.identifier} as evidence for already-scoped work.`];
    const testPlan: ProjectBoardCardTestPlan = attachMode
      ? { unit: [], integration: [], visual: [], manual: ["Review the existing Local Task proof before closing the board card."] }
      : { unit: [], integration: [], visual: [], manual: ["Review imported Local Task history as completed evidence."] };
    this.db
      .prepare(
        `INSERT INTO project_board_cards
        (id, board_id, title, description, status, candidate_status, priority, phase, labels_json, blocked_by_json,
         acceptance_criteria_json, test_plan_json, source_kind, source_id, source_thread_id, source_message_id, orchestration_task_id,
         created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        board.id,
        task.title,
        description,
        status,
        candidateStatus,
        task.priority ?? null,
        null,
        JSON.stringify(normalizeTaskLabels(["local-task", ...task.labels])),
        JSON.stringify(task.blockedBy),
        JSON.stringify(acceptanceCriteria),
        JSON.stringify(testPlan),
        "local_task_import",
        task.id,
        null,
        null,
        attachMode ? task.id : null,
        now,
        now,
      );
    this.touchBoard(board.id, now);
    this.deps.appendProjectBoardEvent({
      boardId: board.id,
      kind: attachMode ? "local_task_attached" : "local_task_imported_as_evidence",
      title: attachMode ? "Local Task attached" : "Local Task imported as evidence",
      summary: `${task.identifier}: ${task.title}`,
      entityKind: "orchestration_task",
      entityId: task.id,
      metadata: { taskId: task.id, identifier: task.identifier, mode: input.mode, cardId: id },
      createdAt: now,
    });
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(id);
  }

  approveProjectBoardCard(cardId: string): ProjectBoardCard {
    const current = this.getProjectBoardCard(cardId);
    if (current.status !== "draft" && current.status !== "blocked") return current;
    if (current.candidateStatus !== "ready_to_create") {
      throw new Error("Only ready-to-create board candidates can be approved.");
    }
    this.deps.assertProjectBoardCardProofReady(current);
    this.deps.assertProjectBoardCardClarificationsResolved(current);
    this.deps.assertProjectBoardCardClaimAllowsLocalTicketization(current);
    this.deps.assertProjectBoardRunFollowUpStillActionable(current);
    this.deps.assertProjectBoardUxMockGateOpen(current, this.deps.listProjectBoardCards(current.boardId));
    const now = new Date().toISOString();
    const taskId = current.orchestrationTaskId ?? this.createTaskForProjectBoardCard(current).id;
    this.db
      .prepare("UPDATE project_board_cards SET status = 'ready', orchestration_task_id = ?, updated_at = ? WHERE id = ?")
      .run(taskId, now, cardId);
    this.touchBoard(current.boardId, now);
    this.deps.appendProjectBoardEvent({
      boardId: current.boardId,
      kind: "card_ticketized",
      title: "Card ticketized",
      summary: `${current.title} was approved into a ready Local Task.`,
      entityKind: "project_board_card",
      entityId: current.id,
      metadata: { cardId: current.id, taskId, sourceKind: current.sourceKind, sourceId: current.sourceId },
      createdAt: now,
    });
    this.deps.syncProjectBoardTaskBlockers(current.boardId);
    this.deps.syncProjectBoardCardsForLinkedTasks();
    return this.getProjectBoardCard(cardId);
  }

  createReadyProjectBoardTasks(boardId: string): ProjectBoardCard[] {
    const board = this.db.prepare("SELECT * FROM project_boards WHERE id = ?").get(boardId) as ProjectBoardStoreRow | undefined;
    if (!board) throw new Error(`Project board not found: ${boardId}`);
    if (board.status === "archived") throw new Error("Archived project boards cannot create ready tasks.");
    if (board.status !== "active") throw new Error("Project board charter must be active before creating ready tasks.");
    const runningSynthesis = this.deps.getRunningProjectBoardSynthesisRun(boardId);
    if (runningSynthesis) {
      throw new Error("Project board planning is still running; wait for it to finish or pause before creating ready tasks.");
    }
    const boardCards = this.deps.listProjectBoardCards(boardId);
    const eligible = boardCards
      .filter((card) => card.status === "draft" && !card.orchestrationTaskId && card.candidateStatus === "ready_to_create")
      .filter((card) => !projectBoardCardBlockedByOpenUxMockGate(card, boardCards))
      .filter((card) => !projectBoardClosedParentForRunFollowUp(card, boardCards));
    if (eligible.length === 0) return [];
    eligible.forEach((card) => {
      this.deps.assertProjectBoardCardProofReady(card);
      this.deps.assertProjectBoardCardClarificationsResolved(card);
      // Asserted up front with the other gates: claim checks used to run per card
      // inside the (non-transactional) approve loop, so a claimed card mid-list threw
      // after earlier cards were already ticketized -- partial work plus an error.
      this.deps.assertProjectBoardCardClaimAllowsLocalTicketization(card);
    });
    const planningSnapshot = this.deps.latestStableProjectBoardPlanningSnapshot(boardId);
    const synthesisEligible = eligible.filter((card) => card.sourceKind === "board_synthesis");
    if (synthesisEligible.length > 0) {
      if (!planningSnapshot) {
        throw new Error("Board synthesis cards require a completed or paused planning snapshot before creating ready tasks.");
      }
      const snapshotCardIds = new Set(planningSnapshot.snapshot.cardIds);
      const missingSnapshotCards = synthesisEligible.filter((card) => !snapshotCardIds.has(card.id));
      if (missingSnapshotCards.length > 0) {
        throw new Error(
          `${missingSnapshotCards.length} ready synthesis card${missingSnapshotCards.length === 1 ? " is" : "s are"} not part of the latest stable planning snapshot; pause or complete planning before creating ready tasks.`,
        );
      }
    }
    const ticketized = eligible.map((card) => this.approveProjectBoardCard(card.id));
    this.deps.syncProjectBoardTaskBlockers(boardId);
    this.deps.syncProjectBoardCardsForLinkedTasks();
    const now = new Date().toISOString();
    this.deps.appendProjectBoardEvent({
      boardId,
      kind: "ready_tasks_created",
      title: "Ready tasks created",
      summary: `${ticketized.length} ready candidate card${ticketized.length === 1 ? "" : "s"} became Local Tasks.`,
      entityKind: "project_board",
      entityId: boardId,
      metadata: {
        cardIds: ticketized.map((card) => card.id),
        taskIds: ticketized.map((card) => card.orchestrationTaskId).filter(Boolean),
        ...(planningSnapshot
          ? {
              planningSnapshotId: planningSnapshot.snapshot.id,
              planningSnapshotRunId: planningSnapshot.runId,
              planningSnapshotKind: planningSnapshot.snapshot.kind,
              planningSnapshotFingerprint: planningSnapshot.snapshot.renderFingerprint,
              planningSnapshotCardIds: planningSnapshot.snapshot.cardIds,
            }
          : {}),
      },
      createdAt: now,
    });
    this.touchBoard(boardId, now);
    return ticketized.map((card) => this.getProjectBoardCard(card.id));
  }

  private createTaskForProjectBoardCard(card: ProjectBoardCard): OrchestrationTask {
    const sourceUrl = `project-board-card:${card.id}`;
    const existing = this.db
      .prepare(
        "SELECT * FROM orchestration_tasks WHERE source_kind = 'project_board_card' AND source_url = ? ORDER BY updated_at DESC LIMIT 1",
      )
      .get(sourceUrl) as OrchestrationTaskRow | undefined;
    if (existing) return this.deps.mapOrchestrationTask(existing);
    const description = this.deps.projectBoardCardTaskDescription(card);
    const boardCards = this.deps.listProjectBoardCards(card.boardId);
    const blockedBy = resolveProjectBoardTaskBlockers(card, boardCards, this.deps.listOrchestrationTasks());
    const task = this.deps.createOrchestrationTask({
      title: card.title,
      description,
      state: "ready",
      priority: card.priority,
      labels: normalizeTaskLabels(["project-board", ...card.labels]),
      blockedBy,
    });
    this.db
      .prepare("UPDATE orchestration_tasks SET source_kind = ?, source_url = ?, updated_at = ? WHERE id = ?")
      .run("project_board_card", sourceUrl, new Date().toISOString(), task.id);
    return this.deps.getOrchestrationTask(task.id);
  }

  private getProjectBoardCard(cardId: string): ProjectBoardCard {
    const row = this.db.prepare("SELECT * FROM project_board_cards WHERE id = ?").get(cardId) as ProjectBoardCardStoreRow | undefined;
    if (!row) throw new Error(`Project board card not found: ${cardId}`);
    return mapProjectBoardCardRow(row, this.deps.listOrchestrationTasks());
  }

  private touchBoard(boardId: string, updatedAt: string): void {
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(updatedAt, boardId);
  }
}
