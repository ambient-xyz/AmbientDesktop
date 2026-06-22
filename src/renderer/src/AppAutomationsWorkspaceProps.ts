import type { Dispatch, SetStateAction } from "react";

import type { DesktopState } from "../../shared/desktopTypes";
import type { WorkflowCompileProgress, WorkflowExplorationProgress } from "../../shared/workflowTypes";
import type { AutomationsWorkspaceProps } from "./AutomationsWorkspace";
import { automationPaneForSelectedThread } from "./AppAutomationSelectionControls";
import type { createAppAutomationFolderControls } from "./AppAutomationFolderControls";
import type { createAppAutomationSelectionControls } from "./AppAutomationSelectionControls";
import type { useAppAutomationShellState } from "./AppAutomationShellState";
import type { createAppPermissionActions } from "./AppPermissionActions";
import type { useAppWorkflowRuntimeState } from "./AppWorkflowRuntimeState";
import type { useAppWorkflowRecordingLibraryControls } from "./AppWorkflowRecordingLibraryControls";
import type { createAppWorkflowRecordingActions } from "./AppWorkflowRecordingActions";
import type { createAppWorkflowRecordingPlaybookActions } from "./AppWorkflowRecordingPlaybookActions";

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

type AppAutomationFolderControls = ReturnType<typeof createAppAutomationFolderControls>;
type AppAutomationSelectionControls = ReturnType<typeof createAppAutomationSelectionControls>;
type AppAutomationShellState = ReturnType<typeof useAppAutomationShellState>;
type AppPermissionActions = ReturnType<typeof createAppPermissionActions>;
type AppWorkflowRuntimeState = ReturnType<typeof useAppWorkflowRuntimeState>;
type AppWorkflowRecordingLibraryControls = ReturnType<typeof useAppWorkflowRecordingLibraryControls>;
type AppWorkflowRecordingActions = ReturnType<typeof createAppWorkflowRecordingActions>;
type AppWorkflowRecordingPlaybookActions = ReturnType<typeof createAppWorkflowRecordingPlaybookActions>;

type AppAutomationsWorkspacePreviewActions = Pick<
  AppAutomationsWorkspacePropsInput,
  "onOpenMediaModal" | "onPreviewLocalPath" | "onPreviewPath"
>;

export interface AppAutomationsWorkspacePropsForAppInput {
  automationFolderControls: Pick<AppAutomationFolderControls, "moveAutomationThread">;
  automationSelectionControls: Pick<
    AppAutomationSelectionControls,
    | "openAutomationRunThread"
    | "selectAutomationPane"
    | "selectAutomationThread"
    | "selectWorkflowAgentThread"
    | "selectWorkflowRecordingForLab"
  >;
  automationShellState: Pick<
    AppAutomationShellState,
    "automationFolders" | "setAutomationFolders" | "selectedAutomationPane" | "workflowAgentFolders" | "setWorkflowAgentFolders"
  >;
  permissionActions: Pick<AppPermissionActions, "revokePermissionGrant" | "revokePermissionGrantIds">;
  permissions: Pick<AppAutomationsWorkspacePropsInput, "permissionAudit" | "permissionGrantRevoking" | "permissionGrants">;
  previewActions: AppAutomationsWorkspacePreviewActions;
  projectActions: Pick<AppAutomationsWorkspacePropsInput, "onCreateProject" | "onDesktopStateChanged">;
  selected: Pick<
    AppAutomationsWorkspacePropsInput,
    "selectedFolder" | "selectedThread" | "selectedWorkflowAgentFolder" | "selectedWorkflowAgentThread" | "selectedWorkflowRecording"
  >;
  state: DesktopState;
  workflowRecordingActions: Pick<
    AppWorkflowRecordingActions,
    | "archiveWorkflowRecordingPlaybook"
    | "restoreWorkflowRecordingVersion"
    | "setWorkflowRecordingEnabled"
    | "startWorkflowRecording"
    | "unarchiveWorkflowRecordingPlaybook"
  >;
  workflowRecordingLibraryControls: Pick<
    AppWorkflowRecordingLibraryControls,
    "refreshWorkflowRecordingLibrary" | "setWorkflowLibraryIncludeArchived" | "workflowLibraryIncludeArchived" | "workflowRecordingLibrary"
  >;
  workflowRecordingPlaybookActions: Pick<AppWorkflowRecordingPlaybookActions, "editWorkflowRecordingPlaybookInChat">;
  workflowRuntimeState: Pick<
    AppWorkflowRuntimeState,
    | "orchestrationAutoRevision"
    | "orchestrationRevision"
    | "setWorkflowCompileProgress"
    | "setWorkflowExplorationProgressByThreadId"
    | "setWorkflowRevision"
    | "workflowCompileProgress"
    | "workflowDiscoveryProgress"
    | "workflowExplorationProgressByThreadId"
    | "workflowRevision"
  >;
}

export function createAppAutomationsWorkspacePropsForApp({
  automationFolderControls,
  automationSelectionControls,
  automationShellState,
  permissionActions,
  permissions,
  previewActions,
  projectActions,
  selected,
  state,
  workflowRecordingActions,
  workflowRecordingLibraryControls,
  workflowRecordingPlaybookActions,
  workflowRuntimeState,
}: AppAutomationsWorkspacePropsForAppInput): AutomationsWorkspaceProps {
  return createAppAutomationsWorkspaceProps({
    folders: automationShellState.automationFolders,
    onArchiveWorkflowRecordingPlaybook: workflowRecordingActions.archiveWorkflowRecordingPlaybook,
    onCreateProject: projectActions.onCreateProject,
    onDesktopStateChanged: projectActions.onDesktopStateChanged,
    onEditWorkflowRecordingPlaybook: workflowRecordingPlaybookActions.editWorkflowRecordingPlaybookInChat,
    onFoldersChanged: automationShellState.setAutomationFolders,
    onMoveThread: automationFolderControls.moveAutomationThread,
    onOpenMediaModal: previewActions.onOpenMediaModal,
    onOpenRunThread: automationSelectionControls.openAutomationRunThread,
    onPreviewLocalPath: previewActions.onPreviewLocalPath,
    onPreviewPath: previewActions.onPreviewPath,
    onRestoreWorkflowRecordingVersion: workflowRecordingActions.restoreWorkflowRecordingVersion,
    onRevokePermissionGrant: permissionActions.revokePermissionGrant,
    onRevokePermissionGrantIds: permissionActions.revokePermissionGrantIds,
    onSelectPane: automationSelectionControls.selectAutomationPane,
    onSelectThread: automationSelectionControls.selectAutomationThread,
    onSelectWorkflowAgentThread: automationSelectionControls.selectWorkflowAgentThread,
    onSelectWorkflowRecordingPlaybook: automationSelectionControls.selectWorkflowRecordingForLab,
    onSetWorkflowRecordingEnabled: workflowRecordingActions.setWorkflowRecordingEnabled,
    onStartWorkflowRecording: workflowRecordingActions.startWorkflowRecording,
    onUnarchiveWorkflowRecordingPlaybook: workflowRecordingActions.unarchiveWorkflowRecordingPlaybook,
    onWorkflowAgentFoldersChanged: automationShellState.setWorkflowAgentFolders,
    orchestrationAutoRevision: workflowRuntimeState.orchestrationAutoRevision,
    orchestrationRevision: workflowRuntimeState.orchestrationRevision,
    permissionAudit: permissions.permissionAudit,
    permissionGrantRevoking: permissions.permissionGrantRevoking,
    permissionGrants: permissions.permissionGrants,
    refreshWorkflowRecordingLibrary: workflowRecordingLibraryControls.refreshWorkflowRecordingLibrary,
    selectedAutomationPane: automationShellState.selectedAutomationPane,
    selectedFolder: selected.selectedFolder,
    selectedThread: selected.selectedThread,
    selectedWorkflowAgentFolder: selected.selectedWorkflowAgentFolder,
    selectedWorkflowAgentThread: selected.selectedWorkflowAgentThread,
    selectedWorkflowRecording: selected.selectedWorkflowRecording,
    setWorkflowCompileProgress: workflowRuntimeState.setWorkflowCompileProgress,
    setWorkflowExplorationProgressByThreadId: workflowRuntimeState.setWorkflowExplorationProgressByThreadId,
    setWorkflowRevision: workflowRuntimeState.setWorkflowRevision,
    state,
    workflowAgentFolders: automationShellState.workflowAgentFolders,
    workflowCompileProgress: workflowRuntimeState.workflowCompileProgress,
    workflowDiscoveryProgress: workflowRuntimeState.workflowDiscoveryProgress,
    workflowExplorationProgressByThreadId: workflowRuntimeState.workflowExplorationProgressByThreadId,
    workflowLibraryIncludeArchived: workflowRecordingLibraryControls.workflowLibraryIncludeArchived,
    workflowRecordingLibrary: workflowRecordingLibraryControls.workflowRecordingLibrary,
    workflowRevision: workflowRuntimeState.workflowRevision,
    onWorkflowLibraryIncludeArchivedChange: workflowRecordingLibraryControls.setWorkflowLibraryIncludeArchived,
  });
}

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
