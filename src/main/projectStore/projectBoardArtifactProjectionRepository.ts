import type Database from "better-sqlite3";

import type { ProjectBoardSummary } from "../../shared/projectBoardTypes";
import type { ProjectBoardArtifactProjection } from "./projectStoreProjectBoardFacade";
import {
  applyProjectBoardArtifactProjectionToStore,
  type ProjectBoardArtifactProjectionApplyDeps,
} from "./projectBoardArtifactProjectionApplyWriter";

export type ProjectStoreProjectBoardArtifactProjectionRepositoryDeps = ProjectBoardArtifactProjectionApplyDeps;

export class ProjectStoreProjectBoardArtifactProjectionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreProjectBoardArtifactProjectionRepositoryDeps,
  ) {}

  applyProjectBoardArtifactProjection(projectPath: string, projection: ProjectBoardArtifactProjection): ProjectBoardSummary {
    return applyProjectBoardArtifactProjectionToStore(this.db, this.deps, projectPath, projection);
  }
}
