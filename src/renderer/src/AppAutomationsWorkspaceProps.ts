import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { WorkflowCompileProgress, WorkflowExplorationProgress } from "../../shared/workflowTypes";
import type { AutomationsWorkspaceProps } from "./AutomationsWorkspace";
import { automationPaneForSelectedThread } from "./AppAutomationSelectionControls";

type AdaptedAutomationsWorkspacePropKey =
  | "activePane"
  | "activeProjectName"
  | "activeProjectPath"
  | "activeThreadId"
  | "projects"
  | "permissionMode"
  | "model"
  | "thinkingLevel"
  | "workspacePath"
  | "onWorkflowExplorationProgressChanged"
  | "onWorkflowCompileProgressReset"
  | "onWorkflowRevisionChanged"
  | "onRefreshWorkflowRecordingLibrary";

type AutomationsWorkspaceStateProps = Omit<AutomationsWorkspaceProps, AdaptedAutomationsWorkspacePropKey>;

export type AppAutomationsWorkspacePropsInput = AutomationsWorkspaceStateProps & {
  refreshWorkflowRecordingLibrary: () => Promise<void>;
  selectedAutomationPane: AutomationsWorkspaceProps["activePane"];
  setWorkflowCompileProgress: Dispatch<SetStateAction<WorkflowCompileProgress[]>>;
  setWorkflowExplorationProgressByThreadId: Dispatch<SetStateAction<Record<string, WorkflowExplorationProgress | undefined>>>;
  setWorkflowRevision: Dispatch<SetStateAction<number>>;
  state: DesktopState;
};

export function createAppAutomationsWorkspaceProps({
  refreshWorkflowRecordingLibrary,
  selectedAutomationPane,
  setWorkflowCompileProgress,
  setWorkflowExplorationProgressByThreadId,
  setWorkflowRevision,
  state,
  ...props
}: AppAutomationsWorkspacePropsInput): AutomationsWorkspaceProps {
  return {
    ...props,
    activePane: automationPaneForSelectedThread(props.selectedThread, selectedAutomationPane),
    activeProjectName: state.workspace.name,
    activeProjectPath: state.workspace.path,
    activeThreadId: state.activeThreadId,
    projects: state.projects,
    permissionMode: state.settings.permissionMode,
    model: state.settings.model,
    thinkingLevel: state.settings.thinkingLevel,
    workspacePath: state.workspace.path,
    onWorkflowExplorationProgressChanged: (workflowThreadId, progress) =>
      setWorkflowExplorationProgressByThreadId((current) => ({ ...current, [workflowThreadId]: progress })),
    onWorkflowCompileProgressReset: () => setWorkflowCompileProgress([]),
    onWorkflowRevisionChanged: () => setWorkflowRevision((revision) => revision + 1),
    onRefreshWorkflowRecordingLibrary: () => refreshWorkflowRecordingLibrary(),
  };
}
