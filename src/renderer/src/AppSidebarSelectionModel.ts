import { useMemo } from "react";

import type {
  AutomationFolderSummary,
  AutomationThreadSummary,
  ProjectSummary,
  ThreadSummary,
  WorkflowAgentFolderSummary,
  WorkflowAgentThreadSummary,
} from "../../shared/types";
import {
  organizeSidebarProjects,
  type SidebarOrganizeSettings,
} from "./AppSidebar";

export type AppSidebarSelectionModel = {
  selectedAutomationFolder: AutomationFolderSummary | undefined;
  selectedAutomationThread: AutomationThreadSummary | undefined;
  selectedWorkflowAgentFolder: WorkflowAgentFolderSummary | undefined;
  selectedWorkflowAgentThread: WorkflowAgentThreadSummary | undefined;
  sidebarProjects: ProjectSummary[];
  sidebarThreads: ThreadSummary[];
};

export function sidebarThreadsForProjects(projects: ProjectSummary[]): ThreadSummary[] {
  return projects.flatMap((project) => project.threads);
}

export function selectedAutomationFolderForId(
  folders: AutomationFolderSummary[],
  selectedFolderId: string,
): AutomationFolderSummary | undefined {
  return folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
}

export function selectedAutomationThreadForId(
  folders: AutomationFolderSummary[],
  selectedThreadId: string | undefined,
): AutomationThreadSummary | undefined {
  if (!selectedThreadId) return undefined;
  return folders.flatMap((folder) => folder.threads).find((thread) => thread.id === selectedThreadId);
}

export function selectedWorkflowAgentFolderForId(
  folders: WorkflowAgentFolderSummary[],
  selectedFolderId: string,
): WorkflowAgentFolderSummary | undefined {
  return folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
}

export function selectedWorkflowAgentThreadForId(
  folders: WorkflowAgentFolderSummary[],
  selectedThreadId: string | undefined,
): WorkflowAgentThreadSummary | undefined {
  if (!selectedThreadId) return undefined;
  return folders.flatMap((folder) => folder.threads).find((thread) => thread.id === selectedThreadId);
}

export function appSidebarSelectionModel({
  activeThreadId,
  activeWorkspacePath,
  automationFolders,
  projects,
  selectedAutomationFolderId,
  selectedAutomationThreadId,
  selectedWorkflowAgentFolderId,
  selectedWorkflowAgentThreadId,
  sidebarOrganize,
  subagentUiEnabled,
  workflowAgentFolders,
}: {
  activeThreadId: string | undefined;
  activeWorkspacePath: string | undefined;
  automationFolders: AutomationFolderSummary[];
  projects: ProjectSummary[];
  selectedAutomationFolderId: string;
  selectedAutomationThreadId: string | undefined;
  selectedWorkflowAgentFolderId: string;
  selectedWorkflowAgentThreadId: string | undefined;
  sidebarOrganize: SidebarOrganizeSettings;
  subagentUiEnabled: boolean;
  workflowAgentFolders: WorkflowAgentFolderSummary[];
}): AppSidebarSelectionModel {
  const sidebarProjects = organizeSidebarProjects(
    projects,
    sidebarOrganize,
    subagentUiEnabled ? activeThreadId : undefined,
    activeWorkspacePath,
    { includeSubagentChildren: subagentUiEnabled },
  );
  return {
    selectedAutomationFolder: selectedAutomationFolderForId(automationFolders, selectedAutomationFolderId),
    selectedAutomationThread: selectedAutomationThreadForId(automationFolders, selectedAutomationThreadId),
    selectedWorkflowAgentFolder: selectedWorkflowAgentFolderForId(workflowAgentFolders, selectedWorkflowAgentFolderId),
    selectedWorkflowAgentThread: selectedWorkflowAgentThreadForId(workflowAgentFolders, selectedWorkflowAgentThreadId),
    sidebarProjects,
    sidebarThreads: sidebarThreadsForProjects(sidebarProjects),
  };
}

export function useAppSidebarSelectionModel(input: {
  activeThreadId: string | undefined;
  activeWorkspacePath: string | undefined;
  automationFolders: AutomationFolderSummary[];
  projects: ProjectSummary[];
  selectedAutomationFolderId: string;
  selectedAutomationThreadId: string | undefined;
  selectedWorkflowAgentFolderId: string;
  selectedWorkflowAgentThreadId: string | undefined;
  sidebarOrganize: SidebarOrganizeSettings;
  subagentUiEnabled: boolean;
  workflowAgentFolders: WorkflowAgentFolderSummary[];
}): AppSidebarSelectionModel {
  return useMemo(
    () => appSidebarSelectionModel(input),
    [
      input.activeThreadId,
      input.activeWorkspacePath,
      input.automationFolders,
      input.projects,
      input.selectedAutomationFolderId,
      input.selectedAutomationThreadId,
      input.selectedWorkflowAgentFolderId,
      input.selectedWorkflowAgentThreadId,
      input.sidebarOrganize,
      input.subagentUiEnabled,
      input.workflowAgentFolders,
    ],
  );
}
