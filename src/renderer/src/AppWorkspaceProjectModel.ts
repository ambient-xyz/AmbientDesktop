import { useMemo } from "react";

import type {
  ContextUsageSnapshot,
  PlannerPlanArtifact,
  ProjectSummary,
} from "../../shared/types";
import { isSessionContextMissingError } from "./AppMessages";
import { isSessionContextMissing } from "./AppSessionRecovery";
import { isPreparedLocalTaskWorkspace } from "./workspaceUiModel";

export type AppWorkspaceProjectModel = {
  activeProject: ProjectSummary | undefined;
  activeWorkspaceIsPreparedLocalTask: boolean;
  errorNeedsSessionRecovery: boolean;
  latestDurablePlannerPlanArtifact: PlannerPlanArtifact | undefined;
  readyPlannerPlanArtifacts: PlannerPlanArtifact[];
  sessionContextMissing: boolean;
};

export function activeProjectForWorkspace(
  projects: ProjectSummary[] | undefined,
  workspacePath: string | undefined,
): ProjectSummary | undefined {
  if (!workspacePath) return undefined;
  return projects?.find((project) => project.path === workspacePath);
}

export function readyPlannerPlanArtifactsForWorkspace(
  artifacts: PlannerPlanArtifact[] | undefined,
): PlannerPlanArtifact[] {
  return (artifacts ?? []).filter((artifact) => artifact.status === "ready");
}

export function latestDurablePlannerPlanArtifactForWorkspace(
  artifacts: PlannerPlanArtifact[],
): PlannerPlanArtifact | undefined {
  return artifacts.find((artifact) => Boolean(artifact.durableArtifactPath));
}

export function activeWorkspaceIsPreparedLocalTaskWorkspace({
  activeWorkspacePath,
  workspacePath,
}: {
  activeWorkspacePath: string | undefined;
  workspacePath: string | undefined;
}): boolean {
  return Boolean(workspacePath && activeWorkspacePath && isPreparedLocalTaskWorkspace(workspacePath, activeWorkspacePath));
}

export function appWorkspaceRecoveryFlags({
  contextUsage,
  error,
}: {
  contextUsage: ContextUsageSnapshot | undefined;
  error: string | undefined;
}): {
  errorNeedsSessionRecovery: boolean;
  sessionContextMissing: boolean;
} {
  return {
    errorNeedsSessionRecovery: isSessionContextMissingError(error),
    sessionContextMissing: isSessionContextMissing(contextUsage),
  };
}

export function appWorkspaceProjectModel({
  activeWorkspacePath,
  contextUsage,
  error,
  plannerPlanArtifacts,
  projects,
  workspacePath,
}: {
  activeWorkspacePath: string | undefined;
  contextUsage: ContextUsageSnapshot | undefined;
  error: string | undefined;
  plannerPlanArtifacts: PlannerPlanArtifact[] | undefined;
  projects: ProjectSummary[] | undefined;
  workspacePath: string | undefined;
}): AppWorkspaceProjectModel {
  const readyPlannerPlanArtifacts = readyPlannerPlanArtifactsForWorkspace(plannerPlanArtifacts);
  const recovery = appWorkspaceRecoveryFlags({ contextUsage, error });
  return {
    activeProject: activeProjectForWorkspace(projects, workspacePath),
    activeWorkspaceIsPreparedLocalTask: activeWorkspaceIsPreparedLocalTaskWorkspace({
      activeWorkspacePath,
      workspacePath,
    }),
    ...recovery,
    latestDurablePlannerPlanArtifact: latestDurablePlannerPlanArtifactForWorkspace(readyPlannerPlanArtifacts),
    readyPlannerPlanArtifacts,
  };
}

export function useAppWorkspaceProjectModel(input: {
  activeWorkspacePath: string | undefined;
  contextUsage: ContextUsageSnapshot | undefined;
  error: string | undefined;
  plannerPlanArtifacts: PlannerPlanArtifact[] | undefined;
  projects: ProjectSummary[] | undefined;
  workspacePath: string | undefined;
}): AppWorkspaceProjectModel {
  return useMemo(
    () => appWorkspaceProjectModel(input),
    [
      input.activeWorkspacePath,
      input.contextUsage,
      input.error,
      input.plannerPlanArtifacts,
      input.projects,
      input.workspacePath,
    ],
  );
}
