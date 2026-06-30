import type { ProjectBoardPlanningSnapshot, ProjectBoardPlanningSnapshotKind } from "../../shared/projectBoardTypes";

export interface ProjectStoreProjectBoardSynthesisRunRepositoryDeps {
  appendProjectBoardPlanningSnapshotForRun(runId: string, kind: ProjectBoardPlanningSnapshotKind): ProjectBoardPlanningSnapshot | undefined;
}
