import type Database from "better-sqlite3";
import type { ProjectBoardCard, ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun, ResolveOrchestrationWorkflowImpactAction } from "../../shared/workflowTypes";

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

export interface RecordProjectBoardWorkflowRepairInput {
  boardId: string;
  action: "restore_generated_default" | "use_existing_anyway";
  workflowPath: string;
  workflowHash?: string;
  previousWorkflowHash?: string;
  backupPath?: string;
  status: "ready" | "missing" | "invalid";
  message?: string;
  createdAt?: string;
}

export interface RecordProjectBoardWorkflowSettingsUpdatedInput {
  boardId: string;
  workflowPath: string;
  workflowHash?: string;
  previousWorkflowHash?: string;
  backupPath?: string;
  changedFields: string[];
  diff?: string;
  status: "ready" | "missing" | "invalid";
  message?: string;
  createdAt?: string;
}

export interface RecordProjectBoardWorkflowRawUpdatedInput {
  boardId: string;
  workflowPath: string;
  workflowHash?: string;
  previousWorkflowHash?: string;
  backupPath?: string;
  changed: boolean;
  diff?: string;
  status: "ready" | "missing" | "invalid";
  message?: string;
  createdAt?: string;
}

export interface ResolveProjectBoardWorkflowImpactInput {
  boardId: string;
  action: ResolveOrchestrationWorkflowImpactAction;
  runIds: string[];
  workflowPath?: string;
  workflowHash?: string;
  createdAt?: string;
}

export interface ResolveProjectBoardWorkflowImpactResult {
  clearedRunIds: string[];
  skippedRuns: { runId: string; reason: string }[];
}

export interface UpdateWorkflowImpactOrchestrationRunInput {
  id: string;
  status: string;
  error?: string | null;
  proofOfWork?: Record<string, unknown>;
  finish?: boolean;
  reviewProjectBoardProof?: boolean;
}

export interface ProjectStoreProjectBoardWorkflowRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  listProjectBoardEvents(boardId: string, limit?: number): ProjectBoardEvent[];
  getOrchestrationRun(runId: string): OrchestrationRun;
  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined;
  updateOrchestrationRun(input: UpdateWorkflowImpactOrchestrationRunInput): OrchestrationRun;
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

  recordProjectBoardWorkflowRepair(input: RecordProjectBoardWorkflowRepairInput): { board: ProjectBoardSummary; recorded: boolean } {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const restored = input.action === "restore_generated_default";
    const title = restored ? "WORKFLOW.md restored to generated default" : "Invalid WORKFLOW.md kept after review";
    const summary = restored
      ? `Ambient backed up the existing workflow and restored a generated default at ${workflowPath}.`
      : `The existing workflow at ${workflowPath} was kept. Local Task preparation remains blocked until validation passes.`;

    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_repaired",
        title,
        summary,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          action: input.action,
          workflowPath,
          workflowHash: input.workflowHash,
          previousWorkflowHash: input.previousWorkflowHash,
          backupPath: input.backupPath,
          status: input.status,
          message: input.message,
          modelCallRequired: false,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.deps.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  recordProjectBoardWorkflowSettingsUpdated(input: RecordProjectBoardWorkflowSettingsUpdatedInput): {
    board: ProjectBoardSummary;
    recorded: boolean;
  } {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const changedFields = [...new Set(input.changedFields.map((field) => field.trim()).filter(Boolean))].sort();
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_settings_updated",
        title: "WORKFLOW.md settings updated",
        summary:
          changedFields.length > 0
            ? `Updated ${changedFields.join(", ")} in ${workflowPath}.`
            : `Reviewed ${workflowPath}; no guided workflow settings changed.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          workflowPath,
          workflowHash: input.workflowHash,
          previousWorkflowHash: input.previousWorkflowHash,
          backupPath: input.backupPath,
          changedFields,
          diff: input.diff,
          status: input.status,
          message: input.message,
          modelCallRequired: false,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.deps.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  recordProjectBoardWorkflowRawUpdated(input: RecordProjectBoardWorkflowRawUpdatedInput): {
    board: ProjectBoardSummary;
    recorded: boolean;
  } {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const workflowPath = input.workflowPath.trim();
    const transaction = this.db.transaction(() => {
      this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
      this.deps.appendProjectBoardEvent({
        boardId: input.boardId,
        kind: "workflow_raw_updated",
        title:
          input.status === "ready"
            ? input.changed
              ? "WORKFLOW.md raw edit saved"
              : "WORKFLOW.md raw edit reviewed"
            : "WORKFLOW.md raw edit rejected",
        summary:
          input.status === "ready"
            ? input.changed
              ? `Saved validated raw WORKFLOW.md changes to ${workflowPath}.`
              : `Reviewed ${workflowPath}; no raw workflow changes were saved.`
            : `Raw WORKFLOW.md edit was not saved because validation failed: ${input.message ?? "validation failed"}.`,
        entityKind: "project_board",
        entityId: input.boardId,
        metadata: {
          workflowPath,
          workflowHash: input.workflowHash,
          previousWorkflowHash: input.previousWorkflowHash,
          backupPath: input.backupPath,
          changed: input.changed,
          diff: input.diff,
          status: input.status,
          message: input.message,
          modelCallRequired: false,
          existingCardsRewritten: false,
        },
        createdAt: now,
      });
    });
    transaction();
    return { board: this.deps.getProjectBoard(input.boardId) ?? board, recorded: true };
  }

  resolveProjectBoardWorkflowImpact(input: ResolveProjectBoardWorkflowImpactInput): ResolveProjectBoardWorkflowImpactResult {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error(`Project board not found: ${input.boardId}`);
    const now = input.createdAt ?? new Date().toISOString();
    const runIds = [...new Set(input.runIds.map((runId) => runId.trim()).filter(Boolean))].slice(0, 100);
    if (runIds.length === 0) throw new Error("Workflow impact resolution requires at least one run id.");

    const clearedRunIds: string[] = [];
    const skippedRuns: { runId: string; reason: string }[] = [];
    const affectedRunIds: string[] = [];
    const affectedTaskIds: string[] = [];
    const affectedCardIds: string[] = [];
    const skippedReasons: Record<string, string> = {};

    for (const runId of runIds) {
      let run: OrchestrationRun;
      try {
        run = this.deps.getOrchestrationRun(runId);
      } catch {
        skippedRuns.push({ runId, reason: "run_not_found" });
        skippedReasons[runId] = "run_not_found";
        continue;
      }
      const card = this.deps.getProjectBoardCardForOrchestrationTask(run.taskId);
      if (!card || card.boardId !== input.boardId) {
        skippedRuns.push({ runId, reason: "run_not_linked_to_board" });
        skippedReasons[runId] = "run_not_linked_to_board";
        continue;
      }
      affectedRunIds.push(run.id);
      affectedTaskIds.push(run.taskId);
      affectedCardIds.push(card.id);

      if (input.action === "prepare_again") {
        if (run.status === "prepared" || run.status === "retry_queued") {
          this.deps.updateOrchestrationRun({
            id: run.id,
            status: "canceled",
            error: "Cleared so this Local Task can be prepared again under the current WORKFLOW.md.",
            proofOfWork: {
              ...(run.proofOfWork ?? {}),
              workflowImpact: {
                action: input.action,
                clearedAt: now,
                workflowPath: input.workflowPath,
                workflowHash: input.workflowHash,
                previousStatus: run.status,
              },
            },
            finish: true,
            reviewProjectBoardProof: false,
          });
          clearedRunIds.push(run.id);
          continue;
        }
        const reason = ["claimed", "preparing", "running"].includes(run.status) ? "run_active" : "run_not_blocking_preparation";
        skippedRuns.push({ runId: run.id, reason });
        skippedReasons[run.id] = reason;
      }
    }

    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, input.boardId);
    this.deps.appendProjectBoardEvent({
      boardId: input.boardId,
      kind: "workflow_impact_resolved",
      title: input.action === "prepare_again" ? "Workflow impact prepare-again selected" : "Workflow impact old preparation kept",
      summary:
        input.action === "prepare_again"
          ? `${clearedRunIds.length} stale prepared run${clearedRunIds.length === 1 ? "" : "s"} cleared; ${skippedRuns.length} skipped. Fresh preparation can now use the current WORKFLOW.md.`
          : `${affectedRunIds.length} prepared run${affectedRunIds.length === 1 ? "" : "s"} kept under existing preparation. Future preparation will use the current WORKFLOW.md.`,
      entityKind: "project_board",
      entityId: input.boardId,
      metadata: {
        action: input.action,
        workflowPath: input.workflowPath,
        workflowHash: input.workflowHash,
        affectedRunIds: [...new Set(affectedRunIds)],
        affectedTaskIds: [...new Set(affectedTaskIds)],
        affectedCardIds: [...new Set(affectedCardIds)],
        clearedRunIds,
        skippedRunIds: skippedRuns.map((skipped) => skipped.runId),
        skippedRuns,
        skippedReasons,
        modelCallRequired: false,
      },
      createdAt: now,
    });

    return { clearedRunIds, skippedRuns };
  }
}
