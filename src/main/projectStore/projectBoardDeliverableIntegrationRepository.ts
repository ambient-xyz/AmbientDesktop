import type Database from "better-sqlite3";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  projectBoardDeliverableManifestFromRun,
  type ProjectBoardDeliverableIntegrationAction,
} from "../../shared/projectBoardDeliverables";
import type { ProjectBoardEvent, ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import { projectBoardResolveInside } from "./projectBoardMappers";

export type ProjectBoardDeliverableIntegrationEventInput = Omit<ProjectBoardEvent, "id" | "createdAt"> & {
  createdAt?: string;
};

export interface ProjectStoreProjectBoardDeliverableIntegrationRepositoryDeps {
  getProjectBoard(boardId: string): ProjectBoardSummary | undefined;
  getOrchestrationRun(runId: string): OrchestrationRun;
  appendProjectBoardEvent(input: ProjectBoardDeliverableIntegrationEventInput): void;
}

export class ProjectStoreProjectBoardDeliverableIntegrationRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardDeliverableIntegrationRepositoryDeps,
  ) {}

  async resolveProjectBoardDeliverableIntegration(input: {
    boardId: string;
    runId: string;
    action: ProjectBoardDeliverableIntegrationAction;
    reason?: string;
  }): Promise<void> {
    const board = this.deps.getProjectBoard(input.boardId);
    if (!board) throw new Error("Project board not found.");
    const run = this.deps.getOrchestrationRun(input.runId);
    const card = board.cards.find((candidate) => candidate.orchestrationTaskId === run.taskId);
    if (!card) throw new Error("Deliverable integration requires a project board card linked to the Local Task run.");
    const manifest = projectBoardDeliverableManifestFromRun(run, { cardId: card.id, cardTitle: card.title });
    const materialFiles = manifest.materialFiles.map((file) => file.path);
    if (input.action !== "defer" && materialFiles.length === 0) {
      throw new Error("No material deliverable files are available to integrate for this run.");
    }

    const now = new Date().toISOString();
    const reason = input.reason?.trim().slice(0, 1000);
    let exportPath: string | undefined;
    let appliedFiles: string[] = [];
    const skippedFiles: string[] = [];

    const copyMaterialFiles = async (destinationRoot: string): Promise<string[]> => {
      const copied: string[] = [];
      for (const file of manifest.materialFiles) {
        const source = projectBoardResolveInside(run.workspacePath, file.path);
        const destination = projectBoardResolveInside(destinationRoot, file.path);
        try {
          const sourceStats = await stat(source);
          if (!sourceStats.isFile()) {
            skippedFiles.push(file.path);
            continue;
          }
          await mkdir(dirname(destination), { recursive: true });
          await copyFile(source, destination);
          copied.push(file.path);
        } catch {
          skippedFiles.push(file.path);
        }
      }
      return copied;
    };

    if (input.action === "apply_to_root") {
      appliedFiles = await copyMaterialFiles(board.projectPath);
      if (appliedFiles.length === 0) throw new Error("No material deliverable files could be copied from the task workspace.");
    } else if (input.action === "export_bundle") {
      exportPath = join(board.projectPath, ".ambient", "project-board", "deliverable-bundles", run.id);
      await mkdir(exportPath, { recursive: true });
      appliedFiles = await copyMaterialFiles(join(exportPath, "files"));
      if (appliedFiles.length === 0) throw new Error("No material deliverable files could be exported from the task workspace.");
      await writeFile(
        join(exportPath, "manifest.json"),
        `${JSON.stringify({ ...manifest, integration: { action: input.action, exportedAt: now, filesRoot: join(exportPath, "files") } }, null, 2)}\n`,
        "utf8",
      );
    }

    const status =
      input.action === "apply_to_root" ? "integrated" : input.action === "export_bundle" ? "exported" : "deferred";
    this.deps.appendProjectBoardEvent({
      boardId: board.id,
      kind: "deliverable_integration_resolved",
      title:
        input.action === "apply_to_root"
          ? "Deliverables applied to project root"
          : input.action === "export_bundle"
            ? "Deliverables exported as artifact bundle"
            : "Deliverable integration deferred",
      summary:
        input.action === "defer"
          ? `${card.title} deliverables were deferred${reason ? `: ${reason}` : "."}`
          : `${appliedFiles.length} material deliverable file${appliedFiles.length === 1 ? "" : "s"} ${
              input.action === "apply_to_root" ? "applied to the project root" : "exported to an artifact bundle"
            }.`,
      entityKind: "orchestration_run",
      entityId: run.id,
      metadata: {
        action: input.action,
        status,
        boardId: board.id,
        cardId: card.id,
        taskId: run.taskId,
        runId: run.id,
        workspacePath: run.workspacePath,
        projectPath: board.projectPath,
        exportPath,
        reason,
        materialFiles,
        excludedFiles: manifest.excludedFiles.map((file) => file.path),
        appliedFiles,
        skippedFiles,
        commands: manifest.commands,
        commits: manifest.commits,
        dependencyImports: manifest.dependencyImports,
      },
      createdAt: now,
    });
    this.db.prepare("UPDATE project_boards SET updated_at = ? WHERE id = ?").run(now, board.id);
  }
}
