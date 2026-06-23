import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  projectBoardDeliverableManifestFromRun,
} from "../../shared/projectBoardDeliverables";
import type { ProjectBoardCard } from "../../shared/projectBoardTypes";
import type { OrchestrationRun } from "../../shared/workflowTypes";
import {
  projectBoardDependencyArtifactKey,
  projectBoardResolveInside,
  type ProjectBoardCardDependencyExecutionContext,
  type ProjectBoardDependencyArtifactImport,
  type ProjectBoardDependencyArtifactImportResult,
} from "./projectBoardMappers";

export interface ProjectStoreProjectBoardDependencyArtifactRepositoryDeps {
  getProjectBoardCardForOrchestrationTask(taskId: string): ProjectBoardCard | undefined;
  projectBoardCardDependencyExecutionContext(card: ProjectBoardCard): ProjectBoardCardDependencyExecutionContext | undefined;
  getOrchestrationRun(runId: string): OrchestrationRun;
}

export class ProjectStoreProjectBoardDependencyArtifactRepository {
  constructor(private readonly deps: ProjectStoreProjectBoardDependencyArtifactRepositoryDeps) {}

  async importProjectBoardDependencyArtifactsForTask(input: {
    taskId: string;
    workspacePath: string;
    createdAt?: string;
  }): Promise<ProjectBoardDependencyArtifactImportResult> {
    const card = this.deps.getProjectBoardCardForOrchestrationTask(input.taskId);
    const importedAt = input.createdAt ?? new Date().toISOString();
    const artifactRoot = join(input.workspacePath, ".ambient", "dependency-artifacts");
    const manifestPath = join(artifactRoot, "manifest.json");
    const emptyResult: ProjectBoardDependencyArtifactImportResult = {
      kind: "project_board_dependency_artifact_import_result",
      version: 1,
      dependentTaskId: input.taskId,
      workspacePath: input.workspacePath,
      artifactRoot,
      manifestPath,
      imports: [],
      pending: [],
      importedAt,
    };
    if (!card) return emptyResult;

    const context = this.deps.projectBoardCardDependencyExecutionContext(card);
    if (!context || (context.available.length === 0 && context.pending.length === 0)) return { ...emptyResult, boardId: card.boardId, dependentCardId: card.id };

    const result: ProjectBoardDependencyArtifactImportResult = {
      ...emptyResult,
      boardId: card.boardId,
      dependentCardId: card.id,
      pending: [...context.pending],
    };
    await mkdir(artifactRoot, { recursive: true });

    for (const entry of context.available) {
      if (!entry.latestRunId) {
        result.pending.push(`${entry.ref} (${entry.title}; no completed run artifact is available to import)`);
        continue;
      }
      const run = this.deps.getOrchestrationRun(entry.latestRunId);
      const sourceWorkspacePath = entry.workspacePath ?? run.workspacePath;
      if (!sourceWorkspacePath) {
        result.pending.push(`${entry.ref} (${entry.title}; source workspace is unavailable)`);
        continue;
      }
      const manifest = projectBoardDeliverableManifestFromRun(run, { cardId: entry.cardId, cardTitle: entry.title });
      const key = projectBoardDependencyArtifactKey(entry, run.id);
      const importPath = join(artifactRoot, key);
      const filesRoot = join(importPath, "files");
      const dependencyManifestPath = join(importPath, "manifest.json");
      const materialFiles: string[] = [];
      const skippedFiles: string[] = [];
      await mkdir(filesRoot, { recursive: true });

      for (const file of manifest.materialFiles) {
        const source = projectBoardResolveInside(sourceWorkspacePath, file.path);
        const destination = projectBoardResolveInside(filesRoot, file.path);
        try {
          const sourceStats = await stat(source);
          if (!sourceStats.isFile()) {
            skippedFiles.push(file.path);
            continue;
          }
          await mkdir(dirname(destination), { recursive: true });
          await copyFile(source, destination);
          materialFiles.push(file.path);
        } catch {
          skippedFiles.push(file.path);
        }
      }

      const imported: ProjectBoardDependencyArtifactImport = {
        kind: "project_board_dependency_artifact_import",
        version: 1,
        key,
        boardId: card.boardId,
        dependentCardId: card.id,
        dependentTaskId: input.taskId,
        dependencyRef: entry.ref,
        dependencyTitle: entry.title,
        dependencyCardId: entry.cardId,
        dependencyTaskId: entry.taskId ?? run.taskId,
        dependencyTaskIdentifier: entry.taskIdentifier,
        dependencyRunId: run.id,
        sourceWorkspacePath,
        importPath,
        filesRoot,
        manifestPath: dependencyManifestPath,
        declaredMaterialFiles: manifest.materialFiles.map((file) => file.path),
        materialFiles,
        skippedFiles,
        excludedFiles: manifest.excludedFiles.map((file) => file.path),
        changedFiles: entry.changedFiles,
        commands: entry.commands,
        manualChecks: entry.manualChecks,
        completed: entry.completed,
        proofSummary: entry.proofSummary,
        importedAt,
      };

      await writeFile(
        dependencyManifestPath,
        `${JSON.stringify(
          {
            ...imported,
            sourceDeliverableManifest: manifest,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      result.imports.push(imported);
    }

    await writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  }
}
