import type Database from "better-sqlite3";
import type {
  ProjectBoardCard,
  ProjectBoardCardProofReview,
  ProjectBoardSummary,
} from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import type { UpdateProjectStoreOrchestrationRunInput } from "./orchestrationRepository";
import {
  evaluateProjectBoardCardProof,
  mergeProjectBoardTaskToolActionsForProof,
  projectBoardCardRowIsClosedDone,
  projectBoardProofOfWorkForRun,
  projectBoardProofReviewFromDraft,
  type ProjectBoardCardStoreRow,
} from "./projectBoardMappers";
import type { ProjectBoardEventInput, ProjectBoardProofReviewContext } from "./projectStoreFacadeHelpers";
import {
  projectBoardTaskToolActionDiagnostics,
  projectBoardTaskToolActionsFromProofOfWork,
  projectBoardTaskToolActionSummary,
  projectBoardTaskToolActionTitle,
  type ProjectBoardTaskToolAction,
  type ProjectBoardTaskToolActionTransport,
} from "./projectStoreProjectBoardFacade";

export interface ProjectStoreProjectBoardRunProgressRepositoryDeps {
  getOrchestrationRun(runId: string): OrchestrationRun;
  updateOrchestrationRun(input: UpdateProjectStoreOrchestrationRunInput): OrchestrationRun;
  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined;
  getProjectBoardCard(cardId: string): ProjectBoardCard;
  tryGetProjectBoardCard(cardId: string): ProjectBoardCard | undefined;
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  applyProjectBoardCardProofReview(input: {
    runId: string;
    review: ProjectBoardCardProofReview;
    requireCurrentReview?: boolean;
    allowStaleRun?: boolean;
  }): ProjectBoardCard | undefined;
  appendProjectBoardEvent(input: ProjectBoardEventInput): void;
}

export class ProjectStoreProjectBoardRunProgressRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardRunProgressRepositoryDeps,
  ) {}

  getProjectBoardProofReviewContextForRun(runId: string): ProjectBoardProofReviewContext | undefined {
    const run = this.deps.getOrchestrationRun(runId);
    const card = this.deps.getProjectBoardCardForOrchestrationTask(run.taskId);
    if (!card) return undefined;
    const draft = evaluateProjectBoardCardProof(card, run);
    const scopedRun = {
      ...run,
      proofOfWork: projectBoardProofOfWorkForRun(run.proofOfWork, run, card),
    };
    return {
      card,
      board: this.deps.getProjectBoard(card.boardId),
      run: scopedRun,
      deterministicReview: projectBoardProofReviewFromDraft({ ...draft, reviewer: "deterministic" }, scopedRun, new Date().toISOString()),
    };
  }

  recordProjectBoardCardRunProgressEvent(input: {
    boardId: string;
    cardId: string;
    runId: string;
    title: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.deps.appendProjectBoardEvent({
      boardId: input.boardId,
      kind: "card_run_progress",
      title: input.title,
      summary: input.summary,
      entityKind: "project_board_card",
      entityId: input.cardId,
      metadata: {
        ...(input.metadata ?? {}),
        cardId: input.cardId,
        runId: input.runId,
      },
    });
  }

  recordProjectBoardTaskToolAction(input: {
    runId: string;
    cardId: string;
    taskId?: string;
    action: ProjectBoardTaskToolAction;
    toolName?: string;
    source?: ProjectBoardTaskToolActionTransport;
  }): OrchestrationRun | undefined {
    const run = this.deps.getOrchestrationRun(input.runId);
    const card = this.deps.tryGetProjectBoardCard(input.cardId);
    if (!card) return undefined;
    const action = {
      ...input.action,
      runId: input.action.runId ?? run.id,
      cardId: input.action.cardId ?? card.id,
      taskId: input.action.taskId ?? input.taskId ?? run.taskId,
      metadata: {
        ...input.action.metadata,
        ...(input.source ? { transport: input.source } : {}),
        ...(input.toolName ? { toolName: input.toolName } : {}),
      },
    } as ProjectBoardTaskToolAction;
    const taskToolActions = mergeProjectBoardTaskToolActionsForProof([
      ...projectBoardTaskToolActionsFromProofOfWork(run.proofOfWork),
      action,
    ]);
    const taskActionDiagnostics = projectBoardTaskToolActionDiagnostics(taskToolActions);
    const updated = this.deps.updateOrchestrationRun({
      id: run.id,
      status: run.status,
      threadId: run.threadId,
      piSessionFile: run.piSessionFile ?? null,
      proofOfWork: {
        ...(run.proofOfWork ?? {}),
        taskToolActions,
        taskActionDiagnostics,
      },
      reviewProjectBoardProof: false,
    });
    this.recordProjectBoardCardRunProgressEvent({
      boardId: card.boardId,
      cardId: card.id,
      runId: run.id,
      title: projectBoardTaskToolActionTitle(action),
      summary: projectBoardTaskToolActionSummary(action),
      metadata: {
        source: input.source ?? "unknown",
        toolName: input.toolName ?? "",
        taskId: action.taskId ?? input.taskId ?? run.taskId,
        taskAction: {
          action: action.action,
          actionId: action.actionId,
          createdAt: action.createdAt,
          source: input.source ?? "unknown",
          toolName: input.toolName ?? "",
          terminal:
            action.action === "task_block" ||
            action.action === "task_complete" ||
            action.action === "task_create_followup" ||
            action.action === "task_report_proof" ||
            action.action === "task_report_handoff",
        },
        taskActionDiagnostics,
      },
    });
    return updated;
  }

  beginProjectBoardCardRun(input: { runId: string }): ProjectBoardCard | undefined {
    const run = this.deps.getOrchestrationRun(input.runId);
    const parent = this.db
      .prepare("SELECT * FROM project_board_cards WHERE orchestration_task_id = ? AND status != 'archived' ORDER BY updated_at DESC LIMIT 1")
      .get(run.taskId) as ProjectBoardCardStoreRow | undefined;
    if (!parent) return undefined;
    if (projectBoardCardRowIsClosedDone(parent)) return this.deps.getProjectBoardCard(parent.id);
    if (parent.status === "in_progress" && !parent.proof_review_json) return this.deps.getProjectBoardCard(parent.id);

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE project_board_cards SET status = ?, proof_review_json = NULL, updated_at = ? WHERE id = ?")
      .run("in_progress", now, parent.id);
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, parent.board_id);
    return this.deps.getProjectBoardCard(parent.id);
  }

  reviewProjectBoardCardProofForRun(run: OrchestrationRun): void {
    const context = this.getProjectBoardProofReviewContextForRun(run.id);
    if (!context) return;
    this.deps.applyProjectBoardCardProofReview({ runId: run.id, review: context.deterministicReview });
  }
}
